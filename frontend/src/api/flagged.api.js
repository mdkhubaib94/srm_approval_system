import api from "./client";

export const getFlagged = (showResolved = false) =>
  api.get(showResolved ? "/flagged?showResolved=true" : "/flagged");

export const getFlaggedById = (id) => api.get(`/flagged/${id}`);

export const updateFlagged = (id, payload) => api.patch(`/flagged/${id}`, payload);
