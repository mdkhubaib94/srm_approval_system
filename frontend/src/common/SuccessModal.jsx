
import styles from './SuccessModal.module.css';

export default function SuccessModal({
  isOpen,
  onClose,
  title = 'Success',
  message,
  buttonLabel = 'Done',
}) {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="success-modal-title"
      >
        <div className={styles.iconWrapper}>
          <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 id="success-modal-title" className={styles.title}>{title}</h2>
        {message && <p className={styles.message}>{message}</p>}

        <button type="button" className={styles.button} onClick={onClose} autoFocus>
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
