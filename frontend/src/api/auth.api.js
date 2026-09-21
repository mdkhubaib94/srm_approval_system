import api, { sessionApi } from "./client";

export const login = (email, password) => sessionApi.post("/login", { email, password });

export const register = (payload) => api.post("/auth/register", payload);

export const logout = () => sessionApi.post("/logout");

export const forgotPassword = (email) => api.post("/auth/forgot-password", { email });

export const verifyResetOtp = (email, otp) => api.post("/auth/verify-reset-otp", { email, otp });

export const resendResetOtp = (email) => api.post("/auth/resend-reset-otp", { email });

export const resetPassword = (email, newPassword, resetToken) =>
  api.post("/auth/reset-password", { email, newPassword, resetToken });

export const sendSignupOtp = (email, name) => api.post("/auth/send-signup-otp", { email, name });

export const verifySignupOtp = (email, otp) => api.post("/auth/verify-signup-otp", { email, otp });

export const resendSignupOtp = (email, name) => api.post("/auth/resend-signup-otp", { email, name });
