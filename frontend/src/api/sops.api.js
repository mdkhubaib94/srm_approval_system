import api from "./client";

export const getSops = () => api.get("/sops");

export const createSop = (formData) =>
  api.post("/sops", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const updateSop = (sopId, payload) => api.patch(`/sops/${sopId}`, payload);

export const reindexSop = (sopId) => api.post(`/sops/${sopId}/reindex`);

export const analyzeSop = (payload) => api.post("/sops/analyze", payload);
