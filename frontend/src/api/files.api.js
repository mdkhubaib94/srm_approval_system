import api from "./client";

/** Downloads/previews an uploaded file as a blob (attachments, SOP docs, query replies, etc.). */
export const downloadFile = (fileId) =>
  api.get(`/uploads/files/${fileId}`, { responseType: "blob" });
