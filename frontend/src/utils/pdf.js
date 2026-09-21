// Minimal, dependency-free PDF writer.
//
// Everything the app needs to print is a table of text: indent line items and
// converted spreadsheets. That needs a page model, Helvetica text, wrapping,
// and rules — not a full typesetting engine. Pulling in jsPDF (+ autotable)
// would add ~350KB to the bundle, or another vendored blob to keep patched
// alongside public/vendor/xlsx.full.min.js. This file has no supply chain.
//
// Only the two standard Type1 fonts (Helvetica, Helvetica-Bold) are used, so no
// font program has to be embedded — every PDF reader already has them. That
// also means text is limited to WinAnsi; sanitizeText() folds anything outside
// it down to a close ASCII equivalent.
//
// Coordinates are top-left origin with y growing downwards (like the DOM).
// PDF's bottom-left origin is an internal detail, converted on write.

// Advance widths (1/1000 em) for WinAnsiEncoding codes 32..126, from the
// Adobe Core 14 AFM metrics. Codes outside this range fall back to an average;
// they only appear in accented text and cost a little wrap accuracy.
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

const FALLBACK_WIDTH = { regular: 556, bold: 600 };

export const PAGE_SIZES = {
  A4: [595.28, 841.89],
  LETTER: [612, 792],
};

// Characters that routinely arrive from spreadsheets and rich-text fields but
// have no WinAnsi code point. Mapped rather than dropped so amounts and
// punctuation stay readable.
const CHAR_SUBSTITUTIONS = [
  [/[‘’‚‹›]/g, "'"], // curly single quotes, guillemets
  [/[“”„]/g, '"'],             // curly double quotes
  [/[‐-―−]/g, '-'],            // hyphens, en/em dash, minus
  [/…/g, '...'],
  [/₹/g, 'Rs.'],                         // rupee sign
  [/[•●▪]/g, '-'],             // bullets
  [/→/g, '->'],
  [/[\u00A0\u2007\u2009\u202F]/g, ' '],       // non-breaking / thin spaces
  [/✓/g, 'Yes'],                         // check mark
  [/\t/g, '    '],
];

/** Fold a string down to printable WinAnsi so it renders in a standard font. */
export function sanitizeText(value) {
  let text = value == null ? '' : String(value);
  for (const [pattern, replacement] of CHAR_SUBSTITUTIONS) {
    text = text.replace(pattern, replacement);
  }
  // Drop control characters (keeping newlines, which wrapText splits on), then
  // fold anything still outside WinAnsi's single-byte range.
  return text
    // eslint-disable-next-line no-control-regex -- stripping control chars is the point
    .replace(/[\u0000-\u0009\u000B\u000C-\u001F\u007F]/g, '')
    .replace(/[^\n\r -ÿ]/g, '?');
}

const widthTable = (font) => (font === 'bold' ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS);

/** Width of `text` in points at `size`. */
export function measureText(text, size, font = 'regular') {
  const clean = sanitizeText(text);
  const table = widthTable(font);
  const fallback = FALLBACK_WIDTH[font] ?? FALLBACK_WIDTH.regular;
  let total = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const code = clean.charCodeAt(i);
    total += code >= 32 && code <= 126 ? table[code - 32] : fallback;
  }
  return (total * size) / 1000;
}

/**
 * Greedy word wrap to `maxWidth`. Words longer than the line (long product
 * codes, URLs) are split mid-word rather than overflowing the cell.
 */
export function wrapText(text, maxWidth, size, font = 'regular') {
  const clean = sanitizeText(text);
  if (!clean.trim()) return [''];
  if (maxWidth <= 0) return [clean];

  const lines = [];
  for (const paragraph of clean.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measureText(candidate, size, font) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // The word alone may still not fit — break it into chunks.
      let chunk = '';
      for (const char of word) {
        if (chunk && measureText(chunk + char, size, font) > maxWidth) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      line = chunk;
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

const num = (value) => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isFinite(rounded) ? String(rounded) : '0';
};

// PDF string literals: backslash-escape the delimiters, octal-escape anything
// non-ASCII so the serialized file stays one byte per character (which keeps
// xref offsets equal to string indices).
const escapePdfString = (text) => {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const code = text.charCodeAt(i);
    if (char === '\\' || char === '(' || char === ')') out += `\\${char}`;
    else if (code < 32 || code > 126) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += char;
  }
  return out;
};

/**
 * Create a document. Draw calls target the current page; `blob()` serializes it.
 */
export function createPdfDocument({
  size = 'A4',
  orientation = 'portrait',
  margin = 40,
} = {}) {
  const [shortSide, longSide] = PAGE_SIZES[size] || PAGE_SIZES.A4;
  const width = orientation === 'landscape' ? longSide : shortSide;
  const height = orientation === 'landscape' ? shortSide : longSide;

  const pages = [];
  let current = null;

  const addPage = () => {
    current = { ops: [] };
    pages.push(current);
    return current;
  };
  addPage();

  const push = (op) => current.ops.push(op);
  // Flip top-down y into PDF's bottom-up space.
  const flip = (y) => height - y;

  const doc = {
    width,
    height,
    margin,
    contentWidth: width - margin * 2,
    contentBottom: height - margin,

    get pageCount() {
      return pages.length;
    },
    get pageIndex() {
      return pages.indexOf(current);
    },

    addPage() {
      addPage();
      return doc;
    },

    /** Re-target drawing at an existing page — used for footer passes. */
    setPage(index) {
      if (index >= 0 && index < pages.length) current = pages[index];
      return doc;
    },

    /** Draw `value` with its baseline at `y`. */
    text(value, x, y, { size: fontSize = 10, font = 'regular', color = [0, 0, 0] } = {}) {
      const clean = sanitizeText(value);
      if (!clean) return doc;
      const fontRef = font === 'bold' ? '/F2' : '/F1';
      push(
        `BT ${num(color[0])} ${num(color[1])} ${num(color[2])} rg ${fontRef} ${num(fontSize)} Tf ` +
          `1 0 0 1 ${num(x)} ${num(flip(y))} Tm (${escapePdfString(clean)}) Tj ET`
      );
      return doc;
    },

    line(x1, y1, x2, y2, { width: lineWidth = 0.5, color = [0.8, 0.8, 0.8] } = {}) {
      push(
        `${num(color[0])} ${num(color[1])} ${num(color[2])} RG ${num(lineWidth)} w ` +
          `${num(x1)} ${num(flip(y1))} m ${num(x2)} ${num(flip(y2))} l S`
      );
      return doc;
    },

    rect(x, y, w, h, { fill, stroke, lineWidth = 0.5 } = {}) {
      const ops = [];
      if (fill) ops.push(`${num(fill[0])} ${num(fill[1])} ${num(fill[2])} rg`);
      if (stroke) ops.push(`${num(stroke[0])} ${num(stroke[1])} ${num(stroke[2])} RG ${num(lineWidth)} w`);
      ops.push(`${num(x)} ${num(flip(y + h))} ${num(w)} ${num(h)} re`);
      ops.push(fill && stroke ? 'B' : fill ? 'f' : 'S');
      push(ops.join(' '));
      return doc;
    },

    /** Run `callback(pageIndex, pageCount)` with each page targeted in turn. */
    forEachPage(callback) {
      const total = pages.length;
      const restore = doc.pageIndex;
      for (let i = 0; i < total; i += 1) {
        doc.setPage(i);
        callback(i, total);
      }
      doc.setPage(restore);
      return doc;
    },

    blob() {
      return new Blob([serialize()], { type: 'application/pdf' });
    },
  };

  // ─── Serialization ──────────────────────────────────────────────────────
  // Objects 1..4 are fixed (catalog, page tree, two fonts); each page then
  // contributes a page object and a content stream.
  const serialize = () => {
    const objects = [];
    const pageObjectIds = pages.map((_, i) => 5 + i * 2);

    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push(
      `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
    );
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    pages.forEach((page, i) => {
      const contentsId = pageObjectIds[i] + 1;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(width)} ${num(height)}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentsId} 0 R >>`
      );
      const stream = page.ops.join('\n');
      objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });

    let file = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach((body, i) => {
      offsets.push(file.length);
      file += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xrefOffset = file.length;
    file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      file += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }
    file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    // Every character is <= 0xFF by construction, so a latin1 copy is exact.
    const bytes = new Uint8Array(file.length);
    for (let i = 0; i < file.length; i += 1) bytes[i] = file.charCodeAt(i) & 0xff;
    return bytes;
  };

  return doc;
}

/**
 * Draw a bordered, wrapping, page-breaking table.
 *
 * `columns` are `{ header, width, align, font }`; widths are in points and
 * should sum to the available content width. Returns the y just below the last
 * row so callers can keep laying out.
 */
export function drawTable(doc, {
  columns,
  rows,
  x = doc.margin,
  y,
  fontSize = 9,
  headerFontSize = 9,
  paddingX = 6,
  paddingY = 5,
  lineGap = 1.35,
  headerFill = [0.94, 0.95, 0.97],
  headerColor = [0.16, 0.19, 0.25],
  borderColor = [0.82, 0.84, 0.87],
  zebraFill = [0.975, 0.98, 0.99],
  bottom = doc.contentBottom,
  onPageBreak,
}) {
  const lineHeight = fontSize * lineGap;
  const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);

  const columnX = [];
  columns.reduce((offset, col) => {
    columnX.push(offset);
    return offset + col.width;
  }, x);

  const drawCells = (cells, top, rowHeight, { font, color, size }) => {
    cells.forEach((lines, i) => {
      const col = columns[i];
      const cellFont = font || col.font || 'regular';
      lines.forEach((line, lineIndex) => {
        // First baseline sits one ascender below the cell's top padding.
        const baseline = top + paddingY + size * 0.8 + lineIndex * lineHeight;
        let textX = columnX[i] + paddingX;
        if (col.align === 'right') {
          textX = columnX[i] + col.width - paddingX - measureText(line, size, cellFont);
        } else if (col.align === 'center') {
          textX = columnX[i] + (col.width - measureText(line, size, cellFont)) / 2;
        }
        doc.text(line, textX, baseline, { size, font: cellFont, color });
      });
    });
    // Vertical rules + closing horizontal rule.
    columnX.forEach((cellX) => doc.line(cellX, top, cellX, top + rowHeight, { color: borderColor }));
    doc.line(x + tableWidth, top, x + tableWidth, top + rowHeight, { color: borderColor });
    doc.line(x, top + rowHeight, x + tableWidth, top + rowHeight, { color: borderColor });
  };

  const drawHeader = (top) => {
    const cells = columns.map((col) =>
      wrapText(col.header ?? '', col.width - paddingX * 2, headerFontSize, 'bold')
    );
    const rowHeight = Math.max(...cells.map((lines) => lines.length)) * lineHeight + paddingY * 2;
    doc.rect(x, top, tableWidth, rowHeight, { fill: headerFill });
    doc.line(x, top, x + tableWidth, top, { color: borderColor });
    drawCells(cells, top, rowHeight, { font: 'bold', color: headerColor, size: headerFontSize });
    return top + rowHeight;
  };

  let cursorY = drawHeader(y);
  // Whether any data row has been drawn since the last header. A row that does
  // not fit is moved to a fresh page — but only once, otherwise a row taller
  // than a whole page would loop forever.
  let pageHasRows = false;

  const breakPage = () => {
    doc.addPage();
    cursorY = drawHeader(onPageBreak ? onPageBreak(doc) : doc.margin);
    pageHasRows = false;
  };

  rows.forEach((row, rowIndex) => {
    const cells = columns.map((col, i) =>
      wrapText(row[i] ?? '', col.width - paddingX * 2, fontSize, col.font || 'regular')
    );
    const totalLines = Math.max(...cells.map((lines) => lines.length));

    // Rows are drawn a slice of lines at a time, so a cell too tall for one
    // page continues on the next instead of being clipped away.
    let drawnLines = 0;
    while (drawnLines < totalLines) {
      const needed = (totalLines - drawnLines) * lineHeight + paddingY * 2;
      if (needed > bottom - cursorY && pageHasRows) breakPage();

      const available = bottom - cursorY;
      const sliceLines =
        needed > available
          ? Math.max(1, Math.floor((available - paddingY * 2) / lineHeight))
          : totalLines - drawnLines;
      const sliceHeight = sliceLines * lineHeight + paddingY * 2;
      const slice = cells.map((lines) => lines.slice(drawnLines, drawnLines + sliceLines));

      if (zebraFill && rowIndex % 2 === 1) {
        doc.rect(x, cursorY, tableWidth, sliceHeight, { fill: zebraFill });
      }
      drawCells(slice, cursorY, sliceHeight, { color: [0.07, 0.09, 0.15], size: fontSize });
      cursorY += sliceHeight;
      drawnLines += sliceLines;
      pageHasRows = true;

      if (drawnLines < totalLines) breakPage();
    }
  });

  return cursorY;
}

/** Trigger a browser download of `blob` as `filename`. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
