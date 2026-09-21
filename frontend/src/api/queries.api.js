import api from "./client";

export const getQueries = () => api.get("/queries");

export const getQueryById = (id) => api.get(`/queries/${id}`);

export const updateQuery = (id, payload) => api.patch(`/queries/${id}`, payload);

export const raiseQuery = (payload, config) => api.post("/queries", payload, config);
