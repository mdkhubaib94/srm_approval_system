import { Suspense, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import PasswordInput from "../../common/PasswordInput";
import SRMRMP_Logo from "../../assets/SRMRMP_LOGO.png";
import { useAuth } from "../../context/AuthContext";

import styles from "./Login.module.css";

function LoginContent() {
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const message = searchParams.get("message");

  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await login(credential, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "An error occurred during login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>

        {/* Logo + Title */}
        <div className={styles.logoHeader}>
          <img
            src={SRMRMP_Logo}
            alt="SRM Logo"
            width={100}
            height={100}
            className={styles.logo}
          />

          <h2 className={styles.title}>
            SRM PRIME Approval System
          </h2>

          <p className={styles.subtitle}>
            Sign in to your account
          </p>
        </div>

        {/* Success message from signup redirect */}
        {message && (
          <div className={styles.successBox}>
            {message}
          </div>
        )}

        {/* Login Card */}
        <div className={styles.card}>

          {error && (
            <div className={styles.errorBox}>
              {error}
            </div>
          )}

          <form
            className={styles.form}
            onSubmit={handleSubmit}
          >

            <div>
              <label
                htmlFor="credential"
                className={styles.label}
              >
                Email or Employee ID
              </label>

              <input
                id="credential"
                type="text"
                required
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                placeholder="name@srmrmp.edu.in or EMP12345"
                className={styles.input}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className={styles.label}
              >
                Password
              </label>

              <PasswordInput
                id="password"
                value={password}
                onChange={setPassword}
                required
                placeholder="••••••••"
              />
            </div>

            <div className={styles.forgotBtnWrapper}>
              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                className={styles.forgotBtn}
              >
                Forgot your password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={styles.submitBtn}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>

          </form>

         

        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.loadingFallback}>
          Loading...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}