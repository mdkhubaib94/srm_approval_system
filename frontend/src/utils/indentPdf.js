// Renders the Indent Information modal's contents as a printable PDF.

import {
  createPdfDocument,
  drawTable,
  downloadBlob,
  measureText,
  wrapText,
} from './pdf';

const BRAND = 'SRM-RMP Approval System';
const HEADING = 'Materials Requirement';

const INK = [0.07, 0.09, 0.15];
const MUTED = [0.42, 0.45, 0.5];
const ACCENT = [0.15, 0.39, 0.92];
const RULE = [0.82, 0.84, 0.87];

const formatDate = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatTimestamp = (date) =>
  `${formatDate(date)} at ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

// Filenames end up in Content-Disposition and on disk — keep them boring.
const safeFilenamePart = (value) =>
  String(value || '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/** Brand + heading block, repeated at the top of every page. */
const drawPageHeader = (doc, { continued = false } = {}) => {
  let y = doc.margin + 9;
  doc.text(BRAND, doc.margin, y, { size: 8.5, color: MUTED });
  y += 20;
  doc.text(continued ? `${HEADING} (continued)` : HEADING, doc.margin, y, {
    size: 17,
    font: 'bold',
    color: INK,
  });
  y += 10;
  doc.line(doc.margin, y, doc.margin + doc.contentWidth, y, { color: RULE, width: 0.9 });
  return y + 20;
};

/**
 * Two-column label/value grid. Long values wrap within their column, and any
 * entry flagged `full` spans the whole content width.
 */
const drawDetails = (doc, details, startY) => {
  const labelWidth = 78;
  const columnGap = 24;
  const columnWidth = (doc.contentWidth - columnGap) / 2;
  const valueWidth = columnWidth - labelWidth;
  const lineHeight = 13;

  let y = startY;
  let column = 0; // 0 = left, 1 = right

  for (const detail of details) {
    const value = detail.value == null || detail.value === '' ? '—' : String(detail.value);
    const spanFull = detail.full || measureText(value, 9) > valueWidth * 1.9;
    if (spanFull && column === 1) {
      // Close the current row before starting a full-width one.
      column = 0;
      y += lineHeight;
    }

    const width = spanFull ? doc.contentWidth - labelWidth : valueWidth;
    const x = doc.margin + (column === 1 ? columnWidth + columnGap : 0);
    const lines = wrapText(value, width, 9);

    doc.text(detail.label, x, y, { size: 8.5, font: 'bold', color: MUTED });
    lines.forEach((line, i) => {
      doc.text(line, x + labelWidth, y + i * lineHeight, {
        size: 9,
        color: detail.accent ? ACCENT : INK,
        font: detail.accent ? 'bold' : 'regular',
      });
    });

    const consumed = lines.length * lineHeight;
    if (spanFull) {
      y += consumed;
      column = 0;
    } else if (column === 0) {
      column = 1;
    } else {
      column = 0;
      y += consumed;
    }
  }

  // A row left half-filled still occupies vertical space.
  if (column === 1) y += lineHeight;
  return y + 8;
};

/**
 * Build the indent PDF.
 *
 * `details` is an ordered list of `{ label, value, full?, accent? }` shown
 * above the table; the caller assembles it so this module stays unaware of the
 * request schema.
 */
export function buildIndentPdf({ indentNumber, indentDate, rows = [], details = [] }) {
  const doc = createPdfDocument({ size: 'A4', orientation: 'portrait', margin: 40 });

  let y = drawPageHeader(doc);
  y = drawDetails(
    doc,
    [
      { label: 'Indent No.', value: indentNumber || 'Not yet generated', accent: Boolean(indentNumber) },
      { label: 'Date', value: formatDate(indentDate) },
      ...details,
    ],
    y
  );

  const columns = [
    { header: 'S.No', width: 42, align: 'center' },
    { header: 'Product ID', width: 90 },
    { header: 'Product Name', width: 130 },
    { header: 'Product Description', width: doc.contentWidth - 42 - 90 - 130 - 60 },
    { header: 'Quantity', width: 60, align: 'right' },
  ];

  const tableRows = rows.map((row, index) => [
    String(row.serialNumber ?? index + 1),
    row.productId || '—',
    row.productName || '—',
    row.productDescription || '—',
    String(row.quantity ?? ''),
  ]);

  // The footer band is reserved on every page, so the table stops above it.
  const bottom = doc.height - doc.margin - 24;

  if (tableRows.length === 0) {
    doc.text('No indent details have been added.', doc.margin, y + 12, { size: 9.5, color: MUTED });
  } else {
    y = drawTable(doc, {
      columns,
      rows: tableRows,
      y,
      fontSize: 9,
      bottom,
      onPageBreak: (d) => drawPageHeader(d, { continued: true }),
    });

    const totalQuantity = rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
    const summary = `Total line items: ${rows.length}      Total quantity: ${totalQuantity}`;
    if (y + 26 > bottom) {
      doc.addPage();
      y = drawPageHeader(doc, { continued: true });
    }
    doc.text(summary, doc.margin + doc.contentWidth - measureText(summary, 9, 'bold'), y + 16, {
      size: 9,
      font: 'bold',
      color: INK,
    });
  }

  // Footers last, so the page count is final.
  const generatedAt = `Generated on ${formatTimestamp(new Date())}`;
  doc.forEachPage((pageIndex, pageCount) => {
    const footerY = doc.height - doc.margin + 4;
    doc.line(doc.margin, footerY - 12, doc.margin + doc.contentWidth, footerY - 12, { color: RULE });
    doc.text(generatedAt, doc.margin, footerY, { size: 7.5, color: MUTED });
    const label = `Page ${pageIndex + 1} of ${pageCount}`;
    doc.text(label, doc.margin + doc.contentWidth - measureText(label, 7.5), footerY, {
      size: 7.5,
      color: MUTED,
    });
  });

  return doc.blob();
}

/** Build the indent PDF and hand it to the browser as a download. */
export function downloadIndentPdf(options) {
  const blob = buildIndentPdf(options);
  const stem = safeFilenamePart(options.indentNumber) || safeFilenamePart(options.reference) || 'details';
  downloadBlob(blob, `Indent-${stem}.pdf`);
  return blob;
}
