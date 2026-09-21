import api from "./client";

export const getPolicies = () => api.get("/policies");

export const getPolicyById = (id) => api.get(`/policies/${id}`);

export const createPolicy = (formData) =>
  api.post("/policies", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const updatePolicyStatus = (id, payload) => api.patch(`/policies/${id}`, payload);
