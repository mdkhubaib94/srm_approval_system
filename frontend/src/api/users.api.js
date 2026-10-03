import api from "./client";

export const getUsers = (queryString = "") => api.get(`/users${queryString}`);

export const createUser = (payload) => api.post("/users", payload);

export const bulkCreateUsers = (payload) => api.post("/users/bulk", payload);

export const updateUser = (id, payload) => api.patch(`/users/${id}`, payload);

export const deleteUser = (id) => api.delete(`/users/${id}`);

export const setUserPassword = (id, newPassword) => api.post(`/users/${id}/password`, { newPassword });
