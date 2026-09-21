// Loads SheetJS (XLSX) on demand and returns window.XLSX.
// Injected once and cached; still no build-time dependency.
//
// Served from our own origin rather than a public CDN. This runs in every
// signed-in session that touches a spreadsheet — bulk user import (Head of
// Institution / Chairman / Dean) and attachment conversion on create-request —
// so a tampered CDN response would execute with those privileges, and the
// script tag carried no integrity hash to detect that.
//
// public/vendor/xlsx.full.min.js is SheetJS 0.20.3 (Apache-2.0). npm's `xlsx`
// package stops at 0.18.5, which is affected by CVE-2023-30533 (prototype
// pollution in XLSX.read) and CVE-2024-22363 (ReDoS) — both reachable from an
// uploaded spreadsheet. Patched builds ship only from cdn.sheetjs.com, hence
// vendoring the file. To update: download a newer
// https://cdn.sheetjs.com/xlsx-<version>/package/dist/xlsx.full.min.js
// over that file.

let xlsxPromise = null;

const XLSX_URL = "/vendor/xlsx.full.min.js";

export function loadXlsx() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("XLSX can only load in the browser"));
  }
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxPromise) return xlsxPromise;

  xlsxPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-xlsx-loader]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.XLSX));
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load spreadsheet library"))
      );
      return;
    }
    const script = document.createElement("script");
    script.src = XLSX_URL;
    script.async = true;
    script.dataset.xlsxLoader = "true";
    script.onload = () => {
      if (window.XLSX) resolve(window.XLSX);
      else reject(new Error("Spreadsheet library failed to initialise"));
    };
    script.onerror = () => {
      xlsxPromise = null;
      reject(new Error("Failed to load spreadsheet library"));
    };
    document.body.appendChild(script);
  });
  return xlsxPromise;
}

/**
 * Parse a .xlsx/.xls/.csv File into an array of { name, employeeID, email, phone }.
 * Header matching is case-insensitive and tolerant of common variants.
 */
export async function parseUserWorkbook(file) {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const pick = (obj, keys) => {
    for (const k of Object.keys(obj)) {
      const norm = k.toLowerCase().replace(/[\s_]/g, "");
      if (keys.includes(norm)) return obj[k];
    }
    return "";
  };

  return raw
    .map((r) => ({
      name: String(pick(r, ["name", "fullname"]) || "").trim(),
      employeeID: String(
        pick(r, ["employeeid", "empid", "employeeno", "id"]) || ""
      ).trim(),
      email: String(pick(r, ["email", "emailaddress", "mail"]) || "").trim(),
      phone: String(pick(r, ["phone", "phoneno", "mobile", "contact"]) || "").trim(),
      department: String(pick(r, ["department", "dept"]) || "").trim(),
    }))
    .filter((r) => r.name || r.employeeID || r.email);
}

// Rows a single import can add in one go. Generous enough for any real
// materials list a department would submit, small enough that a garbled file
// (or one that isn't actually a materials sheet) can't silently produce
// thousands of junk rows in the table.
const MAX_MATERIAL_ROWS = 500;

/**
 * Parse a .xlsx/.xls/.csv File of materials/indent line items into
 * { productId, productName, productDescription, quantity } rows, ready to
 * hand to IndentInformation's rows state.
 *
 * Header matching is case-insensitive and tolerant of common variants —
 * requesters name their columns however their own department always has
 * ("Item Code" vs "Product ID", "Qty" vs "Quantity", ...).
 */
export async function parseMaterialsWorkbook(file) {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const pick = (obj, keys) => {
    for (const k of Object.keys(obj)) {
      const norm = k.toLowerCase().replace(/[\s_.-]/g, "");
      if (keys.includes(norm)) return obj[k];
    }
    return "";
  };

  const toQuantity = (value) => {
    const num = Number(String(value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(num) && num > 0 ? num : 1;
  };

  const rows = raw
    .map((r) => ({
      productId: String(
        pick(r, ["productid", "itemid", "itemcode", "code", "materialcode", "partno", "partnumber"])
      ).trim(),
      productName: String(
        pick(r, ["productname", "itemname", "item", "material", "materialname", "name", "particulars"])
      ).trim(),
      productDescription: String(
        pick(r, [
          "productdescription",
          "description",
          "specification",
          "specifications",
          "desc",
          "details",
          "remarks",
        ])
      ).trim(),
      quantity: toQuantity(
        pick(r, ["quantity", "qty", "noofunits", "units", "count", "nos"])
      ),
    }))
    // Drop fully blank rows — a trailing blank line in the sheet, a stray
    // total row with nothing but a number, etc.
    .filter((r) => r.productId || r.productName || r.productDescription);

  const totalParsed = rows.length;
  return {
    rows: rows.slice(0, MAX_MATERIAL_ROWS),
    truncated: totalParsed > MAX_MATERIAL_ROWS,
    totalParsed,
  };
}

const MATERIALS_TEMPLATE_HEADERS = ["Product ID", "Product Name", "Product Description", "Quantity"];

// Sample rows so the sheet isn't a blank grid — non-technical users copy the
// pattern instead of guessing what belongs in each column. Cleared before
// typing real rows in, but harmless if left in and imported (they're just
// two more line items).
const MATERIALS_TEMPLATE_SAMPLE_ROWS = [
  ["LAB-001", "Digital Multimeter", "0-600V, auto-ranging, with carrying case", 5],
  ["LAB-002", "Lab Stool", "Adjustable height, cushioned seat", 20],
];

/**
 * Build and download a blank materials-requirement workbook whose headers
 * exactly match what parseMaterialsWorkbook looks for ("Product ID",
 * "Product Name", "Product Description", "Quantity") — so a sheet downloaded
 * here and re-uploaded via Import from Excel round-trips without any manual
 * remapping.
 */
export async function downloadMaterialsTemplate() {
  const XLSX = await loadXlsx();

  const sheetData = [MATERIALS_TEMPLATE_HEADERS, ...MATERIALS_TEMPLATE_SAMPLE_ROWS];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  // Comfortable column widths so the sample text isn't truncated on open.
  worksheet["!cols"] = [{ wch: 14 }, { wch: 26 }, { wch: 42 }, { wch: 10 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Materials");
  XLSX.writeFile(workbook, "Materials_Requirement_Template.xlsx");
}
