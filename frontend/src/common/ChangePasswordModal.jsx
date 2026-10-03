import { useState } from "react";
import ConfirmModal from "./ConfirmModal";
import PasswordInput from "./PasswordInput";
import styles from "./ChangePasswordModal.module.css";

const MIN_LENGTH = 8;

const errorText = (err, fallback) =>
  err.response?.data?.detail || err.response?.data?.message || fallback;

// Two flows share this modal:
//  - requireCurrent: a user changes their own password. Step 1 asks for the old
//    password and onVerifyCurrent must resolve only if it matches.
//  - otherwise: a manager sets someone else's password, straight to step 2.
// Step 2 asks for the new password twice, then a confirmation dialog runs
// onSubmit(currentPassword, newPassword).
export default function ChangePasswordModal({
  requireCurrent = false,
  subtitle,
  onVerifyCurrent,
  onSubmit,
  onClose,
  onDone,
}) {
  const [step, setStep] = useState(requireCurrent ? "current" : "new");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const verifyCurrent = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onVerifyCurrent(current);
      setStep("new");
    } catch (err) {
      setError(errorText(err, "Current password is incorrect."));
    } finally {
      setBusy(false);
    }
  };

  const askConfirm = (e) => {
    e.preventDefault();
    setError("");
    if (next.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters long.`);
      return;
    }
    if (next !== again) {
      setError("The two new passwords do not match.");
      return;
    }
    if (requireCurrent && next === current) {
      setError("New password must be different from the current password.");
      return;
    }
    setConfirming(true);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(current, next);
      setConfirming(false);
      // Show the success dialog; onDone runs when the user dismisses it.
      setSuccess(true);
    } catch (err) {
      setConfirming(false);
      setError(errorText(err, "Failed to change password."));
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <div className={styles.overlay} onMouseDown={onDone}>
        <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
          <h3 className={styles.title}>Password changed</h3>
          <p className={styles.subtitle}>The password was changed successfully.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primaryBtn} onClick={onDone} autoFocus>
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.overlay} onMouseDown={busy ? undefined : onClose}>
        <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
          <h3 className={styles.title}>Change password</h3>
          <p className={styles.subtitle}>
            {step === "current"
              ? "Enter your current password to continue."
              : subtitle || "Enter your new password twice."}
          </p>
          {error && <div className={styles.error}>{error}</div>}

          {step === "current" ? (
            <form className={styles.form} onSubmit={verifyCurrent}>
              <label className={styles.label}>
                Current password
                <PasswordInput value={current} onChange={setCurrent} required autoComplete="current-password" />
              </label>
              <div className={styles.actions}>
                <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={busy || !current}>
                  {busy ? "Checking…" : "Continue"}
                </button>
              </div>
            </form>
          ) : (
            <form className={styles.form} onSubmit={askConfirm}>
              <label className={styles.label}>
                New password
                <PasswordInput value={next} onChange={setNext} required autoComplete="new-password" />
              </label>
              <label className={styles.label}>
                Confirm new password
                <PasswordInput value={again} onChange={setAgain} required autoComplete="new-password" />
              </label>
              <div className={styles.actions}>
                <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={!next || !again}>
                  Change password
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={submit}
        title="Change password?"
        message={
          requireCurrent
            ? "Your password will be changed from the current password to the new one."
            : "This user's password will be replaced with the new one and they will be signed out everywhere."
        }
        confirmLabel="Yes, change it"
        loading={busy}
      />
    </>
  );
}
