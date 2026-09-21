import api from "./client";

export const getRequests = () => api.get("/requests");

export const getAllRequests = () => api.get("/requests/all");

export const getRequestById = (id) => api.get(`/requests/${id}`);

export const createRequest = (formData) =>
  api.post("/requests", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

/** Shared by ProcessRequestModal (all roles) and BudgetVerificationModal (ACCOUNTANT). */
export const processRequest = (requestId, formData) =>
  api.patch(`/requests/${requestId}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const routeRequest = (id, requestCategory) =>
  api.post(`/requests/${id}/route`, { requestCategory });

export const saveIndentDetails = (requestID, indentDetails) =>
  api.patch(`/requests/${requestID}/indent-details`, { indentDetails });

export const addIndentChangeLogRemark = (requestID, text) =>
  api.post(`/requests/${requestID}/indent-details/add-change-log-remark`, { text });
