import api from "./client";

export const getMyProfile = () => api.get("/users/me");

export const updateMyProfile = (payload) => api.patch("/users/me", payload);

export const verifyMyPassword = (currentPassword) =>
  api.post("/users/me/verify-password", { currentPassword });

export const changeMyPassword = (currentPassword, newPassword) =>
  api.post("/users/me/change-password", { currentPassword, newPassword });
