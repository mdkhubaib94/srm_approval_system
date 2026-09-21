
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { forgotPassword, verifyResetOtp, resendResetOtp, resetPassword } from "../../api/auth.api";
import SRMRMP_Logo from "../../assets/SRMRMP_LOGO.png";
import OTPVerification from "../../common/OTPVerification";
import PasswordInput from "../../common/PasswordInput";
import styles from "./ForgotPassword.module.css";
export default function ForgotPasswordPage() {
  const [step, setStep] = useState("email"); // email, otp, reset
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const navigate = useNavigate();

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await forgotPassword(email);
      
      if (response.data.success) {
        setSuccess("OTP sent successfully! Check your email.");
        setTimeout(() => {
          setStep("otp");
          setSuccess("");
        }, 1500);
      }
    } catch (err) {
      console.error("Error sending OTP:", err);
      setError(err.response?.data?.message || "Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (otpCode) => {
    try {
      const response = await verifyResetOtp(email, otpCode);

      if (response.data.success) {
        setResetToken(response.data.resetToken);
        setStep("reset");
      }
    } catch (err) {
      console.error("Error verifying OTP:", err);
      throw new Error(err.response?.data?.message || "Invalid OTP. Please try again.", { cause: err });
    }
  };

  const handleResendOTP = async () => {
    try {
      const response = await resendResetOtp(email);
      
      if (response.data.success) {
        return Promise.resolve();
      }
    } catch (err) {
      console.error("Error resending OTP:", err);
      throw new Error(err.response?.data?.message || "Failed to resend OTP.", { cause: err });
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Validation
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const response = await resetPassword(email, newPassword, resetToken);

      if (response.data.success) {
        setSuccess("Password reset successfully! Redirecting to login...");
        setTimeout(() => {
          navigate("/login");
        }, 2000);
      }
    } catch (err) {
      console.error("Error resetting password:", err);
      setError(err.response?.data?.message || "Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // OTP Verification Step
  if (step === "otp") {
    return (
      <OTPVerification
        email={email}
        type="forgot-password"
        onVerify={handleVerifyOTP}
        onResend={handleResendOTP}
        onBack={() => setStep("email")}
      />
    );
  }

  // Reset Password Step
  if (step === "reset") {
    return (
      <div className={styles.container}>
        <div className={styles.wrapper}>
          <div className={styles.logoHeader}>
            <img
              src={SRMRMP_Logo}
              alt="SRM Logo"
              width={100}
              height={100}
              className={styles.logo}
            />
            <h1 className={styles.title}>SRM PRIME Approval System</h1>
          </div>

          <div className={styles.textCenter}>
            <h2 className={styles.heading2}>Reset Your Password</h2>
            <p className={styles.subtitle}>Enter your new password below</p>
          </div>

          <div className={styles.card}>
            {error && <div className={styles.errorBox}>{error}</div>}
            {success && <div className={styles.successBox}>{success}</div>}

            <form className={styles.form} onSubmit={handleResetPassword}>
              <div>
                <label htmlFor="newPassword" className={styles.label}>
                  New Password
                </label>
                <PasswordInput
                  id="newPassword"
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="Enter new password"
                  required
                />
                <p className={styles.helpText}>
                  Password must be at least 8 characters long
                </p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className={styles.label}>
                  Confirm Password
                </label>
                <PasswordInput
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Confirm new password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className={styles.submitBtn}
              >
                {loading ? "Resetting Password..." : "Reset Password"}
              </button>
            </form>

            <div className={styles.footer}>
              <p className={styles.footerText}>
                Remember your password?{" "}
                <button
                  onClick={() => navigate("/login")}
                  className={styles.linkBtn}
                >
                  Sign in
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Email Input Step (default)
  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        <div className={styles.logoHeader}>
          <img
            src={SRMRMP_Logo}
            alt="SRM Logo"
            width={100}
            height={100}
            className={styles.logo}
            
          />
          <h1 className={styles.title}>SRM PRIME Approval System</h1>
        </div>

        <div className={styles.textCenter}>
          <h2 className={styles.heading2}>Forgot Password?</h2>
          <p className={styles.subtitle}>
            Enter your email address and we'll send you an OTP to reset your
            password
          </p>
        </div>

        <div className={styles.card}>
          {error && <div className={styles.errorBox}>{error}</div>}
          {success && <div className={styles.successBox}>{success}</div>}

          <form className={styles.form} onSubmit={handleSendOTP}>
            <div>
              <label htmlFor="email" className={styles.label}>
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@srmrmp.edu.in"
                className={styles.input}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={styles.submitBtn}
            >
              {loading ? "Sending OTP..." : "Send OTP"}
            </button>
          </form>

          <div className={styles.footer}>
            <p className={styles.footerText}>
              Remember your password?{" "}
              <button
                onClick={() => navigate("/login")}
                className={styles.linkBtn}
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
