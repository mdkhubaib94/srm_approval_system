
import { useState } from 'react';
import toast from 'react-hot-toast';
import styles from '../components/ProcessRequestModal.module.css';

export default function RejectReasonModal({ isOpen, onClose, onConfirm, loading }) {
  const [reason, setReason] = useState('');
  const [comments, setComments] = useState('');

  const handleConfirm = () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    onConfirm(reason, comments);
    setReason('');
    setComments('');
  };

  const handleClose = () => {
    setReason('');
    setComments('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.confirmHeader}>
          <h3 className={styles.confirmTitle}>Rejection Reason Required</h3>
          <button
            className={styles.closeButton}
            onClick={handleClose}
            type="button"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        <div className={styles.confirmContent}>
          <p className={styles.confirmMessage}>
            Please provide a reason for rejecting this request. This will be recorded in the request history.
          </p>
          <div className={styles.formSection}>
            <label className={styles.label}>Rejection Reason *</label>
            <textarea
              className={styles.textarea}
              placeholder="Enter rejection reason..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          
        </div>

        <div className={styles.confirmActions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.confirmButton}
            onClick={handleConfirm}
            disabled={loading || !reason.trim()}
          >
            {loading ? 'Processing...' : 'Confirm Rejection'}
          </button>
        </div>
      </div>
    </div>
  );
}
