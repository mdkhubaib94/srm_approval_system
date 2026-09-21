
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PasswordInput from "../../common/PasswordInput";
import SRMRMP_Logo from "../../assets/SRMRMP_LOGO.png";
import OTPVerification from "../../common/OTPVerification";
import { useAuth } from "../../context/AuthContext";
import { sendSignupOtp, verifySignupOtp, resendSignupOtp } from "../../api/auth.api";
import styles from "./Signup.module.css";

// Self-signup is restricted to CHAIRMAN (see backend SELF_SIGNUP_ROLES) —
// every other role/account is created by an admin via User Management.
const SIGNUP_ROLE = "CHAIRMAN";

export default function SignupPage() {
  const [step, setStep] = useState("form"); // form, otp
  const [name, setName] = useState("");
  const [empId, setEmpId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const { register } = useAuth();

  const inputClass = styles.input;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      setError("Contact number must be exactly 10 digits");
      return;
    }

    setLoading(true);
    try {
      // Send OTP to email
      const response = await sendSignupOtp(email, name);

      if (response.data.success) {
        setStep("otp");
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
      // Verify OTP
      const verifyResponse = await verifySignupOtp(email, otpCode);

      if (verifyResponse.data.success) {
        // OTP verified, now create the account
        const phoneDigits = phone.replace(/\D/g, "");

        await register({
          name,
          employeeID: empId,
          email,
          phone: phoneDigits,
          password,
          role: SIGNUP_ROLE,
          institution: "COMMON",
        });

        navigate("/login?message=Account created successfully! Please sign in.");
      }
    } catch (err) {
      console.error("Error verifying OTP:", err);
      throw new Error(err.response?.data?.message || "Invalid OTP. Please try again.", { cause: err });
    }
  };

  const handleResendOTP = async () => {
    try {
      const response = await resendSignupOtp(email, name);

      if (response.data.success) {
        return Promise.resolve();
      }
    } catch (err) {
      console.error("Error resending OTP:", err);
      throw new Error(err.response?.data?.message || "Failed to resend OTP.", { cause: err });
    }
  };

  // OTP Verification Step
  if (step === "otp") {
    return (
      <OTPVerification
        email={email}
        type="signup"
        onVerify={handleVerifyOTP}
        onResend={handleResendOTP}
        onBack={() => setStep("form")}
      />
    );
  }

  // Registration Form Step
  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        {/* Logo */}
        <div className={styles.logoHeader}>
          <img src={SRMRMP_Logo} alt="SRM Logo" width={100} height={100} className={styles.logo}  />
          <h1 className={styles.title}>
            SRM-RMP Approval System
          </h1>
          <p className={styles.subtitle}>Create your account</p>
        </div>

        <div className={styles.card}>
          {error && (
            <div className={styles.errorBox}>
              {error}
            </div>
          )}

          <form className={styles.form} onSubmit={handleSubmit} autoComplete="off">
            {/* Full Name */}
            <div>
              <label className={styles.label}>Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* Employee ID */}
            <div>
              <label className={styles.label}>Employee ID *</label>
              <input
                type="text"
                required
                value={empId}
                onChange={(e) => setEmpId(e.target.value)}
                placeholder="Enter your employee ID"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* Email */}
            <div>
              <label className={styles.label}>Email Address *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@srmrmp.edu.in"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* Phone */}
            <div>
              <label className={styles.label}>Contact Number *</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* Password */}
            <div>
              <label className={styles.label}>Password *</label>
              <PasswordInput
                value={password}
                onChange={setPassword}
                required
                placeholder="Enter your password"
                autoComplete="new-password"
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label className={styles.label}>Confirm Password *</label>
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                required
                placeholder="Re-enter your password"
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={styles.submitBtn}
            >
              {loading ? "Sending OTP..." : "Create Account"}
            </button>
          </form>

          <div className={styles.footer}>
            <p className={styles.footerText}>
              Already have an account?{" "}
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
