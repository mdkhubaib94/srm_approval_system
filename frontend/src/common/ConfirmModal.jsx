

import styles from './ConfirmModal.module.css';

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Please Confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
}) {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={loading ? undefined : onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <div className={styles.iconWrapper}>
          <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h2 id="confirm-modal-title" className={styles.title}>{title}</h2>
        {message && <p className={styles.message}>{message}</p>}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={styles.confirmButton}
            onClick={onConfirm}
            disabled={loading}
            autoFocus
          >
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
