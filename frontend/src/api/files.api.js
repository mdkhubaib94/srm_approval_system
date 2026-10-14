import api from "./client";

/** Downloads/previews an uploaded file as a blob (attachments, SOP docs, query replies, etc.). */
export const downloadFile = (fileId) =>
  api.get(`/uploads/files/${fileId}`, { responseType: "blob" });

// File -> staged file id. A retry after a failed submit reuses ids instead of
// uploading every document again.
const stagedIds = new WeakMap();

/**
 * Upload documents one per request ahead of the real form submit. A single
 * multipart body carrying every file is what trips proxy size limits (413);
 * staging keeps every request small, and the final submit then carries only
 * ids. Rejects with the axios error of the file that failed.
 */
export const stageFiles = async (files) => {
  const ids = [];
  for (const file of files) {
    if (!stagedIds.has(file)) {
      const body = new FormData();
      body.append("attachments", file);
      const { data } = await api.post("/uploads/stage", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      stagedIds.set(file, data.fileId);
    }
    ids.push(stagedIds.get(file));
  }
  return ids;
};

/** Stage `files` and record their ids on `formData` for the backend to attach. */
export const appendStagedFiles = async (formData, files) => {
  if (!files.length) return;
  formData.append("attachmentFileIds", JSON.stringify(await stageFiles(files)));
};
