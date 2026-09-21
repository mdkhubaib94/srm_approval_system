import api from "./client";

// Which role -> permission grants apply to the signed-in user (e.g. whether
// their role can see the "Download" option for attachments).
export const getMyPermissions = () => api.get("/permissions/mine");

// Admin-only: full role mapping for every known permission.
export const getPermissions = () => api.get("/permissions");

export const updatePermissionRoles = (key, roles) => api.put(`/permissions/${key}`, { roles });
