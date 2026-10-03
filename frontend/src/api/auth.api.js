import api, { sessionApi } from "./client";

export const login = (email, password) => sessionApi.post("/login", { email, password });


export const logout = () => sessionApi.post("/logout");

export const forgotPassword = (email) => api.post("/auth/forgot-password", { email });

export const verifyResetOtp = (email, otp) => api.post("/auth/verify-reset-otp", { email, otp });

export const resendResetOtp = (email) => api.post("/auth/resend-reset-otp", { email });

export const resetPassword = (email, newPassword, resetToken) =>
  api.post("/auth/reset-password", { email, newPassword, resetToken });
