import api from "./client";

export const getCompleted = () => api.get("/completed");

export const getCompletedById = (id) => api.get(`/completed/${id}`);

export const setExpectedCompletion = (id, payload) => api.patch(`/completed/${id}/expected`, payload);

export const submitActualCompletion = (id, formData) =>
  api.patch(`/completed/${id}/actual`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
