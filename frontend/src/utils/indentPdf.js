// Renders request / indent information as a printable, official-looking PDF
// (letterhead, serif type, ruled sections, approval sign-off).

import {
  createPdfDocument,
  drawTable,
  downloadBlob,
  measureText,
  wrapText,
} from './pdf';
import { loadLogoJpeg } from './pdfLogo';

const ORGANISATION = 'SRM GROUP OF INSTITUTIONS';
const SYSTEM_NAME = 'SRM Prime Approval System';
const DEFAULT_HEADING = 'Materials Requirement';

// Serif family (Times) for an official-document look.
const REGULAR = 'times';
const BOLD = 'timesBold';
const FONTS = { regular: REGULAR, bold: BOLD };

const INK = [0.08, 0.08, 0.1];
const MUTED = [0.36, 0.36, 0.4];
const NAVY = [0.09, 0.16, 0.33];
const RULE = [0.75, 0.76, 0.8];
const SEAL = [0.08, 0.42, 0.22];

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

/**
 * Page header. The first page gets the full letterhead (logo, organisation
 * name, document title, double rule); continuation pages a compact version.
 */
const drawPageHeader = (doc, { continued = false, heading = DEFAULT_HEADING, logo = null } = {}) => {
  const title = heading.toUpperCase();
  const left = doc.margin;
  const right = doc.margin + doc.contentWidth;
  let y = doc.margin;

  if (continued) {
    doc.text(ORGANISATION, left, y + 10, { size: 10, font: BOLD, color: NAVY });
    const label = `${title} (CONTINUED)`;
    doc.text(label, right - measureText(label, 10, BOLD), y + 10, { size: 10, font: BOLD, color: MUTED });
    y += 18;
    doc.line(left, y, right, y, { color: NAVY, width: 1 });
    return y + 22;
  }

  const logoSize = 66;
  let textX = left;
  if (logo) {
    doc.image(logo, left, y, logoSize, logoSize);
    textX += logoSize + 18;
  }
  doc.text(ORGANISATION, textX, y + 30, { size: 24, font: BOLD, color: NAVY });
  doc.text(title, textX, y + 54, { size: 14, font: REGULAR, color: INK });
  y += logoSize + 12;

  // Double rule: heavy over light.
  doc.line(left, y, right, y, { color: NAVY, width: 2 });
  doc.line(left, y + 4, right, y + 4, { color: NAVY, width: 0.6 });
  return y + 26;
};

/**
 * Two-column label/value grid. Long values wrap within their column, and any
 * entry flagged `full` spans the whole content width.
 */
const drawDetails = (doc, details, startY, ctx = null) => {
  const labelWidth = ctx?.labelWidth ?? 84;
  const columnGap = 24;
  const columnWidth = (doc.contentWidth - columnGap) / 2;
  const valueWidth = columnWidth - labelWidth;
  const lineHeight = 14.5;

  let y = startY;
  let column = 0; // 0 = left, 1 = right
  let leftHeight = 0; // height taken by the left cell of a half-filled row

  for (const detail of details) {
    const value = detail.value == null || detail.value === '' ? '-' : String(detail.value);
    const spanFull = detail.full || measureText(value, 10.5, REGULAR) > valueWidth * 1.9;
    if (spanFull && column === 1) {
      // Close the current row before starting a full-width one.
      column = 0;
      y += leftHeight;
      leftHeight = 0;
    }

    const width = spanFull ? doc.contentWidth - labelWidth : valueWidth;
    const x = doc.margin + (column === 1 ? columnWidth + columnGap : 0);
    const lines = wrapText(value, width, 10.5, REGULAR);
    const labelLines = wrapText(detail.label, labelWidth - 8, 9.5, BOLD);
    const rowLines = Math.max(lines.length, labelLines.length);

    if (ctx && y + rowLines * lineHeight > ctx.bottom) {
      doc.addPage();
      y = drawPageHeader(doc, { continued: true, heading: ctx.heading });
      column = 0;
      leftHeight = 0;
    }

    labelLines.forEach((line, i) => {
      doc.text(line, x, y + i * lineHeight, { size: 9.5, font: BOLD, color: MUTED });
    });
    lines.forEach((line, i) => {
      doc.text(line, x + labelWidth, y + i * lineHeight, {
        size: 10.5,
        color: INK,
        font: detail.accent ? BOLD : REGULAR,
      });
    });

    const consumed = rowLines * lineHeight;
    if (spanFull) {
      y += consumed;
      column = 0;
    } else if (column === 0) {
      column = 1;
      leftHeight = consumed;
    } else {
      column = 0;
      // The row is as tall as the taller of its two cells.
      y += Math.max(consumed, leftHeight);
      leftHeight = 0;
    }
  }

  // A row left half-filled still occupies vertical space.
  if (column === 1) y += leftHeight;
  return y + 8;
};

/** Titled group of label/value rows, e.g. "Budget Details". */
const drawSection = (doc, section, startY, ctx) => {
  let y = startY;
  if (y + 60 > ctx.bottom) {
    doc.addPage();
    y = drawPageHeader(doc, { continued: true, heading: ctx.heading });
  }
  doc.text(section.title.toUpperCase(), doc.margin, y, { size: 11, font: BOLD, color: NAVY });
  y += 6;
  doc.line(doc.margin, y, doc.margin + doc.contentWidth, y, { color: NAVY, width: 0.7 });
  y += 16;
  return drawDetails(doc, section.details, y, ctx) + 8;
};

/**
 * Approval sign-off, right-aligned at the end of the document:
 * "Approved by <name> - <ROLE>" with the approval date and time beneath.
 */
const drawApproval = (doc, approval, startY, ctx) => {
  let y = startY;
  if (y + 80 > ctx.bottom) {
    doc.addPage();
    y = drawPageHeader(doc, { continued: true, heading: ctx.heading });
  }
  const right = doc.margin + doc.contentWidth;
  const who = approval.approvedBy
    ? `${approval.approvedBy.name || 'Unknown'} - ${String(approval.approvedBy.role || '').toUpperCase()}`
    : '';
  const lines = [
    { text: 'APPROVED', size: 15, font: BOLD, color: SEAL },
    { text: `Approved by ${who}`, size: 11.5, font: BOLD, color: INK },
    {
      text: `Approved on ${approval.approvedAt ? formatTimestamp(new Date(approval.approvedAt)) : '-'}`,
      size: 10.5,
      font: REGULAR,
      color: MUTED,
    },
  ];
  const boxWidth = Math.max(...lines.map((l) => measureText(l.text, l.size, l.font))) + 8;
  doc.line(right - boxWidth, y, right, y, { color: INK, width: 0.9 });
  y += 18;
  lines.forEach((l) => {
    doc.text(l.text, right - measureText(l.text, l.size, l.font), y, l);
    y += l.size + 6;
  });
  return y;
};

/**
 * Build the PDF.
 *
 * `details` is an ordered list of `{ label, value, full?, accent? }` shown
 * above the table; the caller assembles it so this module stays unaware of the
 * request schema. `sections` ([{ title, details }]) switches to full-document
 * mode, and `approval` adds the right-aligned sign-off.
 */
export function buildIndentPdf({
  indentNumber,
  indentDate,
  rows = [],
  details = [],
  sections = null,
  heading = DEFAULT_HEADING,
  approval = null,
  logo = null,
}) {
  const doc = createPdfDocument({ size: 'A4', orientation: 'portrait', margin: 44 });

  // The footer band is reserved on every page, so content stops above it.
  const bottom = doc.height - doc.margin - 24;
  const ctx = { bottom, heading, labelWidth: sections ? 124 : undefined };

  let y = drawPageHeader(doc, { heading, logo });
  if (sections) {
    // Full-document mode: caller supplies every section; the table (if any)
    // follows under its own title.
    for (const section of sections) y = drawSection(doc, section, y, ctx);
    if (rows.length > 0) {
      y = drawSection(
        doc,
        {
          title: 'Materials Requirement',
          details: [{ label: 'Indent No.', value: indentNumber || 'Not yet generated', accent: Boolean(indentNumber) }],
        },
        y,
        ctx
      );
    }
  } else {
    y = drawDetails(
      doc,
      [
        { label: 'Indent No.', value: indentNumber || 'Not yet generated', accent: Boolean(indentNumber) },
        { label: 'Date', value: formatDate(indentDate) },
        ...details,
      ],
      y
    );
  }

  const columns = [
    { header: 'S.No', width: 42, align: 'center' },
    { header: 'Product ID', width: 90 },
    { header: 'Product Name', width: 130 },
    { header: 'Product Description', width: doc.contentWidth - 42 - 90 - 130 - 60 },
    { header: 'Quantity', width: 60, align: 'right' },
  ];

  const tableRows = rows.map((row, index) => [
    String(row.serialNumber ?? index + 1),
    row.productId || '-',
    row.productName || '-',
    row.productDescription || '-',
    String(row.quantity ?? ''),
  ]);

  if (tableRows.length === 0) {
    if (!sections) {
      doc.text('No indent details have been added.', doc.margin, y + 12, { size: 10.5, color: MUTED, font: REGULAR });
    }
  } else {
    y = drawTable(doc, {
      columns,
      rows: tableRows,
      y,
      fontSize: 10,
      headerFontSize: 10,
      fonts: FONTS,
      headerFill: [0.9, 0.92, 0.96],
      headerColor: NAVY,
      borderColor: RULE,
      zebraFill: [0.975, 0.975, 0.98],
      bottom,
      onPageBreak: (d) => drawPageHeader(d, { continued: true, heading }),
    });

    const totalQuantity = rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
    const summary = `Total line items: ${rows.length}      Total quantity: ${totalQuantity}`;
    if (y + 26 > bottom) {
      doc.addPage();
      y = drawPageHeader(doc, { continued: true, heading });
    }
    doc.text(summary, doc.margin + doc.contentWidth - measureText(summary, 10, BOLD), y + 16, {
      size: 10,
      font: BOLD,
      color: INK,
    });
    y += 16;
  }

  if (approval) {
    drawApproval(doc, approval, y + 34, ctx);
  }

  // Footers last, so the page count is final.
  const generatedAt = `${SYSTEM_NAME}  |  Generated on ${formatTimestamp(new Date())}`;
  doc.forEachPage((pageIndex, pageCount) => {
    const footerY = doc.height - doc.margin + 4;
    doc.line(doc.margin, footerY - 12, doc.margin + doc.contentWidth, footerY - 12, { color: RULE });
    doc.text(generatedAt, doc.margin, footerY, { size: 8.5, font: REGULAR, color: MUTED });
    const label = `Page ${pageIndex + 1} of ${pageCount}`;
    doc.text(label, doc.margin + doc.contentWidth - measureText(label, 8.5, REGULAR), footerY, {
      size: 8.5,
      font: REGULAR,
      color: MUTED,
    });
  });

  return doc.blob();
}

/** Build the PDF and hand it to the browser as a download. */
export async function downloadIndentPdf(options) {
  const blob = buildIndentPdf({ ...options, logo: await loadLogoJpeg() });
  const stem = safeFilenamePart(options.indentNumber) || safeFilenamePart(options.reference) || 'details';
  const prefix = options.approval ? 'Approved' : 'Indent';
  downloadBlob(blob, `${prefix}-${stem}.pdf`);
  return blob;
}
