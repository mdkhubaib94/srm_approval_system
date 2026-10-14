import styles from './LoadingModal.module.css';

export default function LoadingModal({ isOpen, message = 'Please wait…' }) {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div
        className={styles.modal}
        role="alertdialog"
        aria-modal="true"
        aria-busy="true"
        aria-live="polite"
        aria-label={message}
      >
        <div className={styles.spinner} />
        <p className={styles.message}>{message}</p>
      </div>
    </div>
  );
}
