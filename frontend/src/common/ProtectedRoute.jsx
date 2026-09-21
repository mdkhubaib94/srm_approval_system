

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

import styles from "./ProtectedRoute.module.css";

/**
 * Wrap any page that requires authentication.
 * Redirects to /login while loading or if unauthenticated.
 */
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (!user) return null;

  return children;
}
