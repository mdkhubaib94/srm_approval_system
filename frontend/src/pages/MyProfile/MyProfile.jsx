
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getMyProfile, updateMyProfile } from "../../api/profile.api";
import ProtectedRoute from "../../common/ProtectedRoute";
import LoadingScreen from "../../common/LoadingScreen";
import styles from "./MyProfile.module.css";
const formatRole = (role) =>
  role === "REQUESTER" ? "HEAD OF DEPARTMENT" : (role || "").replace(/_/g, " ");

function MyProfileContent() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const isRequester = profile?.role === "REQUESTER";

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await getMyProfile();
        setProfile(data);
        setPhone(data.phone || "");
      } catch (e) {
        setErr(e.response?.data?.message || "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const { data } = await updateMyProfile({ phone });
      setProfile(data);
      setMsg("Profile updated successfully.");
    } catch (e) {
      setErr(e.response?.data?.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingScreen />;
  if (!profile) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBox}>{err || "Profile not found."}</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>My Profile</h1>
        <p className={styles.subtitle}>View your account details and manage your password.</p>
      </div>

      {msg && <div className={styles.successBox}>{msg}</div>}
      {err && <div className={styles.errorBox}>{err}</div>}

      <div className={styles.card}>
        <div className={styles.readGrid}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Name</span>
            <span className={styles.fieldValue}>{profile.name}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Employee ID</span>
            <span className={styles.fieldValue}>{profile.employeeID}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Email</span>
            <span className={styles.fieldValue}>{profile.email}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Role</span>
            <span className={styles.fieldValue}>{formatRole(profile.role)}</span>
          </div>
          {profile.institution && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Institution</span>
              <span className={styles.fieldValue}>{profile.institution}</span>
            </div>
          )}
          {isRequester && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Department</span>
              <span className={styles.fieldValue}>{profile.department || "—"}</span>
            </div>
          )}
        </div>

        <form className={styles.form} onSubmit={handleSave}>
          <div className={styles.formRow}>
            <label className={styles.label}>Phone</label>
            <input
              className={styles.input}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Enter phone number"
            />
          </div>

          <button type="submit" className={styles.saveBtn} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>

      <div className={styles.card}>
        <h2 className={styles.sectionTitle}>Password</h2>
        <p className={styles.help}>
          Reset your password via an OTP sent to your email ({profile.email}).
        </p>
        <button
          type="button"
          className={styles.resetBtn}
          onClick={() => navigate("/forgot-password")}
        >
          Reset Password
        </button>
      </div>
    </div>
  );
}

export default function MyProfilePage() {
  return (
    <ProtectedRoute>
      <MyProfileContent />
    </ProtectedRoute>
  );
}
