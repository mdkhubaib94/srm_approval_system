
import { useState } from 'react';
import RejectReasonModal from '../common/RejectReasonModal';
import styles from './ProcessRequestModal.module.css';

export default function PolicyProcessModal({ isOpen, onClose, onApprove, onReject, loading }) {
  const [showRejectModal, setShowRejectModal] = useState(false);

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.modalOverlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>Process Policy</h2>
            <button
              className={styles.closeButton}
              onClick={onClose}
              type="button"
              aria-label="Close modal"
              disabled={loading}
            >
              ✕
            </button>
          </div>

          <div className={styles.modalContent}>
            <div className={styles.infoBox}>
              <p className={styles.infoText}>
                Choose how you want to process this policy. Approval will update the policy status immediately, while rejection requires a reason.
              </p>
            </div>

            <div className={styles.actionButtons}>
              <button
                type="button"
                className={`${styles.actionButton} ${styles.rejectButton}`}
                onClick={() => setShowRejectModal(true)}
                disabled={loading}
              >
                Reject Policy
              </button>
              <button
                type="button"
                className={`${styles.actionButton} ${styles.approveButton}`}
                onClick={onApprove}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Approve Policy'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <RejectReasonModal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onConfirm={(reason, comments) => {
          setShowRejectModal(false);
          onReject(reason, comments);
        }}
        loading={loading}
      />
    </>
  );
}
