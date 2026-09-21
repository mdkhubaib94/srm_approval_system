
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SRMRMP_Logo from "../assets/SRMRMP_LOGO.png";
import styles from "./OTPVerification.module.css";

export default function OTPVerification({
  email,
  type,
  onVerify,
  onResend,
  onBack,
}) {
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputRefs = useRef([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError("");

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (value && index === 5 && newOtp.every((digit) => digit !== "")) {
      handleVerify(newOtp.join(""));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, 6);

    if (!/^\d+$/.test(pastedData)) return;

    const newOtp = pastedData.split("").concat(Array(6).fill("")).slice(0, 6);
    setOtp(newOtp);

    const lastFilledIndex = newOtp.findIndex((digit) => digit === "");
    const focusIndex = lastFilledIndex === -1 ? 5 : lastFilledIndex;
    inputRefs.current[focusIndex]?.focus();

    if (pastedData.length === 6) {
      handleVerify(pastedData);
    }
  };

  const handleVerify = async (otpCode) => {
    setLoading(true);
    setError("");

    try {
      if (onVerify) {
        // Custom verification handler (for signup)
        await onVerify(otpCode);
      } else {
        // Backend calls are disabled in frontend-only mode. Simulate success.
        // For forgot-password, navigate to reset-password as if OTP verified.
        if (type === "forgot-password") {
          navigate(
            `/reset-password?email=${encodeURIComponent(email)}&otp=${otpCode}`,
          );
        } else {
          // No-op for other types when backend is disabled.
        }
      }
    } catch (err) {
      setError(
        (err && err.message) || "Something went wrong. Please try again.",
      );
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setResending(true);
    setError("");

    try {
      if (onResend) {
        // Custom resend handler (for signup)
        await onResend();
      } else {
        // Backend calls are disabled. Simulate resend success by resetting countdown.
      }

      setCountdown(60);
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch {
      setError("Failed to resend OTP. Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        <div className={styles.header}>
          <img
            src={SRMRMP_Logo}
            alt="SRM Logo"
            width={100}
            height={100}
            className={styles.logo}
            
          />
          <h1 className={styles.logoTitle}>
            SRM-RMP Approval System
          </h1>
        </div>

        <div className={styles.sectionHeader}>
          <h2 className={styles.subtitle}>
            Verify Your Email
          </h2>
          <p className={styles.instruction}>
            We've sent a 6-digit code to
            <br />
            <span className={styles.emailHighlight}>{email}</span>
          </p>
        </div>

        <div className={styles.card}>
          {error && (
            <div className={styles.errorBox}>
              <svg
                className={styles.errorIcon}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              {error}
            </div>
          )}

          <div className="mb-6">
            <label className={styles.label}>
              Enter OTP
            </label>
            <div className={styles.otpGrid}>
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  className={`${styles.otpInput} ${
                    error
                      ? styles.otpInputError
                      : digit
                        ? styles.otpInputFilled
                        : styles.otpInputEmpty
                  }`}
                  disabled={loading}
                />
              ))}
            </div>
          </div>

          {loading && (
            <div className={styles.verifyingFlex}>
              <div className={styles.spinner}></div>
              <p className={styles.verifyingText}>Verifying...</p>
            </div>
          )}

          <div className={styles.resendWrapper}>
            <p className={styles.resendPrompt}>
              Didn't receive the code?
            </p>
            {countdown > 0 ? (
              <p className={styles.resendCountdown}>
                Resend OTP in{" "}
                <span className={styles.countdownHighlight}>
                  {countdown}s
                </span>
              </p>
            ) : (
              <button
                onClick={handleResendOTP}
                disabled={resending}
                className={styles.resendBtn}
              >
                {resending ? "Sending..." : "Resend OTP"}
              </button>
            )}
          </div>

          <button
            onClick={onBack}
            disabled={loading}
            className={styles.backBtn}
          >
            Back to {type === "signup" ? "Signup" : "Login"}
          </button>

          <div className={styles.infoAlert}>
            <p className={styles.infoAlertText}>
              This code expires in 1 minute. Keep this window open while
              checking your email.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
