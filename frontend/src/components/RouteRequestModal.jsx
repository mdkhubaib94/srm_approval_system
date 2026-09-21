
import { useState } from 'react';
import toast from 'react-hot-toast';
import { REQUEST_CATEGORY_LABELS } from '../utils/types';
import styles from './ProcessRequestModal.module.css';

export default function RouteRequestModal({ isOpen, onClose, onSubmit, currentCategory, loading }) {
  const [selectedCategory, setSelectedCategory] = useState(currentCategory || '');

  // Reset selectedCategory whenever the modal (re)opens or the category it
  // opened with changes. Adjusted directly during render (guarded by
  // comparing against the last-seen isOpen/currentCategory) rather than in
  // an effect, per React's "adjusting state when a prop changes" pattern.
  const [prevResetKey, setPrevResetKey] = useState([isOpen, currentCategory]);
  if (isOpen !== prevResetKey[0] || currentCategory !== prevResetKey[1]) {
    setPrevResetKey([isOpen, currentCategory]);
    if (isOpen) {
      setSelectedCategory(currentCategory || '');
    }
  }

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedCategory) {
      toast.error('Please select an approval category');
      return;
    }

    await onSubmit(selectedCategory);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Route Request</h2>
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
              Choose the approval category for this request before routing it onward from the Head of Institution stage.
            </p>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.formSection}>
              <label className={styles.label}>Approval Category</label>
              <select
                className={styles.select}
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                disabled={loading}
              >
                <option value="">Select a category</option>
                {Object.entries(REQUEST_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.actionButtons}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`${styles.actionButton} ${styles.forwardButton}`}
                disabled={loading || !selectedCategory}
              >
                {loading ? 'Routing...' : 'Route Request'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
