// Renames a stored attachment at download time only — the GridFS file, its
// fileId, and the original uploaded filename in the database are untouched.
// This only affects what the browser's save dialog suggests as a name.

const getExtension = (filename) => {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename || "");
  return match ? match[1] : "pdf";
};

/** Request-level attachment, e.g. requestID = "EECSE875", index 0 -> "EECSE875-1.pdf" */
export function buildRequestAttachmentFilename(requestID, index, originalFilename) {
  if (!requestID) return originalFilename;
  const ext = getExtension(originalFilename);
  return `${requestID}-${index + 1}.${ext}`;
}

/**
 * Query-reply attachment, scoped to its own query — index must be the
 * attachment's position within that specific query's own attachments array
 * (not its position in any merged/flattened list), so the same file gets the
 * same name whether downloaded from the query page or the request page.
 * e.g. requestID = "EECSE875", index 0 -> "EECSE875-Q1.pdf"
 */
export function buildQueryAttachmentFilename(requestID, index, originalFilename) {
  if (!requestID) return originalFilename;
  const ext = getExtension(originalFilename);
  return `${requestID}-Q${index + 1}.${ext}`;
}
