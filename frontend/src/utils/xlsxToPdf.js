// Converts an uploaded spreadsheet into a PDF rendering of its sheets.
//
// Attachments are stored — and served back — as PDFs only: the upload endpoint
// checks both the declared mime type and the leading %PDF- bytes, and never
// echoes a stored content type. Keeping spreadsheets out of GridFS preserves
// that, so the conversion happens here, at attach time, rather than on the way
// out. Requesters can still hand in the .xlsx they already have.

import { loadXlsx } from './loadXlsx';
import { createPdfDocument, drawTable, measureText } from './pdf';

const BRAND = 'SRM-RMP Approval System';

const INK = [0.07, 0.09, 0.15];
const MUTED = [0.42, 0.45, 0.5];
const RULE = [0.82, 0.84, 0.87];

// Guardrails so a 100k-row sheet cannot produce an unusable PDF. Anything
// dropped is stated on the page rather than silently omitted.
const MAX_ROWS_PER_SHEET = 1000;
const MAX_COLUMNS = 25;

const MIN_COLUMN_WIDTH = 34;
const MAX_COLUMN_WIDTH = 260;

export const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xlsm', '.xlsb', '.xls', '.csv'];

// Browsers are inconsistent about spreadsheet mime types (and Windows
// sometimes reports none at all), so the extension is the reliable signal.
export const SPREADSHEET_ACCEPT = [
  ...SPREADSHEET_EXTENSIONS,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
].join(',');

export const isSpreadsheetFile = (file) => {
  const name = (file?.name || '').toLowerCase();
  return SPREADSHEET_EXTENSIONS.some((ext) => name.endsWith(ext));
};

const stripExtension = (name) => name.replace(/\.[^.]+$/, '');

const looksNumeric = (value) => /^[-+(]?\s*(?:Rs\.|[$₹€£])?\s*[\d,]*\.?\d+\s*%?\)?$/.test(String(value).trim());

/** Drop trailing blank rows/columns and cap the grid at printable limits. */
const normalizeGrid = (grid) => {
  let columnCount = 0;
  for (const row of grid) {
    for (let i = row.length - 1; i >= 0; i -= 1) {
      if (String(row[i] ?? '').trim() !== '') {
        columnCount = Math.max(columnCount, i + 1);
        break;
      }
    }
  }

  const droppedColumns = Math.max(0, columnCount - MAX_COLUMNS);
  const width = Math.min(columnCount, MAX_COLUMNS);

  const rows = grid
    .map((row) => Array.from({ length: width }, (_, i) => String(row[i] ?? '').trim()))
    .filter((row) => row.some((cell) => cell !== ''));

  const droppedRows = Math.max(0, rows.length - MAX_ROWS_PER_SHEET);
  return { rows: rows.slice(0, MAX_ROWS_PER_SHEET), droppedRows, droppedColumns };
};

/**
 * Size columns to their content, then fit the result to the page: wide columns
 * are capped, narrow ones get a floor, and the remainder is shared out
 * proportionally so the table always spans the full text width.
 */
const computeColumnWidths = (rows, available, fontSize, paddingX) => {
  const count = rows[0]?.length || 1;
  // Measuring every cell of a 1000-row sheet is wasted work; a sample settles
  // the width just as well. Row 0 is the header, so measure it bold.
  const [headerRow, ...dataRows] = rows;
  const sample = dataRows.slice(0, 200);

  const desired = Array.from({ length: count }, (_, i) => {
    let widest = measureText(headerRow?.[i] ?? '', fontSize, 'bold');
    for (const row of sample) {
      widest = Math.max(widest, measureText(row[i] ?? '', fontSize, 'regular'));
    }
    return Math.min(widest + paddingX * 2, MAX_COLUMN_WIDTH);
  });

  const total = desired.reduce((sum, w) => sum + w, 0) || 1;
  const scaled = desired.map((w) => (w * available) / total);

  const floor = Math.min(MIN_COLUMN_WIDTH, available / count);
  const pinned = scaled.map((w) => (w < floor ? floor : null));
  const pinnedTotal = pinned.reduce((sum, w) => sum + (w ?? 0), 0);
  const flexDesired = scaled.reduce((sum, w, i) => sum + (pinned[i] === null ? w : 0), 0);
  const remaining = Math.max(0, available - pinnedTotal);

  return scaled.map((w, i) => {
    if (pinned[i] !== null) return pinned[i];
    return flexDesired > 0 ? (w * remaining) / flexDesired : remaining / count;
  });
};

const drawSheetHeader = (doc, { sourceName, sheetName, continued }) => {
  let y = doc.margin + 9;
  doc.text(BRAND, doc.margin, y, { size: 8.5, color: MUTED });
  y += 19;
  doc.text(sourceName, doc.margin, y, { size: 14, font: 'bold', color: INK });
  y += 14;
  const subtitle = continued ? `Sheet: ${sheetName} (continued)` : `Sheet: ${sheetName}`;
  doc.text(subtitle, doc.margin, y, { size: 9, color: MUTED });
  y += 8;
  doc.line(doc.margin, y, doc.margin + doc.contentWidth, y, { color: RULE, width: 0.9 });
  return y + 16;
};

/**
 * Render every non-empty sheet of `file` into a single PDF Blob.
 * The first row of each sheet is treated as its header row.
 */
export async function spreadsheetToPdfBlob(file) {
  const XLSX = await loadXlsx();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });

  const sheets = workbook.SheetNames.map((name) => {
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      raw: false, // use each cell's display format, so dates and currency read correctly
      defval: '',
      blankrows: false,
    });
    return { name, ...normalizeGrid(grid) };
  }).filter((sheet) => sheet.rows.length > 0);

  if (sheets.length === 0) {
    const error = new Error(`"${file.name}" has no readable data.`);
    error.code = 'EMPTY_SPREADSHEET';
    throw error;
  }

  // One orientation for the whole document, chosen by the widest sheet.
  const widestSheet = Math.max(...sheets.map((sheet) => sheet.rows[0].length));
  const orientation = widestSheet > 4 ? 'landscape' : 'portrait';
  const fontSize = widestSheet > 12 ? 6.5 : widestSheet > 8 ? 7.5 : 8.5;
  const paddingX = widestSheet > 12 ? 3 : 5;

  const doc = createPdfDocument({ size: 'A4', orientation, margin: 34 });
  const sourceName = file.name;
  const bottom = doc.height - doc.margin - 22;

  sheets.forEach((sheet, sheetIndex) => {
    if (sheetIndex > 0) doc.addPage();
    let y = drawSheetHeader(doc, { sourceName, sheetName: sheet.name, continued: false });

    const [headerRow, ...dataRows] = sheet.rows;
    const widths = computeColumnWidths(sheet.rows, doc.contentWidth, fontSize, paddingX);

    const columns = headerRow.map((header, i) => {
      const values = dataRows.map((row) => row[i]).filter((cell) => cell !== '');
      const numeric = values.length > 0 && values.filter(looksNumeric).length / values.length > 0.7;
      return {
        header: header || ' ',
        width: widths[i],
        align: numeric ? 'right' : 'left',
      };
    });

    y = drawTable(doc, {
      columns,
      rows: dataRows,
      y,
      fontSize,
      headerFontSize: fontSize,
      paddingX,
      paddingY: 4,
      bottom,
      onPageBreak: (d) => drawSheetHeader(d, { sourceName, sheetName: sheet.name, continued: true }),
    });

    const notes = [];
    if (sheet.droppedRows > 0) {
      notes.push(`${sheet.droppedRows} further row(s) not shown — only the first ${MAX_ROWS_PER_SHEET} are printed.`);
    }
    if (sheet.droppedColumns > 0) {
      notes.push(`${sheet.droppedColumns} further column(s) not shown — only the first ${MAX_COLUMNS} are printed.`);
    }
    notes.forEach((note, i) => {
      doc.text(note, doc.margin, y + 14 + i * 11, { size: 7.5, font: 'bold', color: [0.72, 0.25, 0.05] });
    });
  });

  const origin = `Converted from ${sourceName}`;
  doc.forEachPage((pageIndex, pageCount) => {
    const footerY = doc.height - doc.margin + 4;
    doc.line(doc.margin, footerY - 11, doc.margin + doc.contentWidth, footerY - 11, { color: RULE });
    doc.text(origin, doc.margin, footerY, { size: 7, color: MUTED });
    const label = `Page ${pageIndex + 1} of ${pageCount}`;
    doc.text(label, doc.margin + doc.contentWidth - measureText(label, 7), footerY, { size: 7, color: MUTED });
  });

  return doc.blob();
}

/**
 * Convert a spreadsheet File into a PDF File, ready to upload in place of the
 * original.
 */
export async function spreadsheetToPdfFile(file) {
  const blob = await spreadsheetToPdfBlob(file);
  return new File([blob], `${stripExtension(file.name)}.pdf`, {
    type: 'application/pdf',
    lastModified: file.lastModified,
  });
}
