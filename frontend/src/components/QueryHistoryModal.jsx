

import { useNavigate } from "react-router-dom";
import styles from './QueryHistoryModal.module.css';

export default function QueryHistoryModal({ isOpen, onClose, queries = [] }) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleSelect = (queryId) => {
    onClose();
    navigate(`/queries/${queryId}`);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Query History ({queries.length})</h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            type="button"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className={styles.queryList}>
          {queries.map((q) => (
            <button
              key={q._id}
              type="button"
              className={styles.queryCard}
              onClick={() => handleSelect(q._id)}
            >
              <div className={styles.queryCardHeader}>
                <span
                  className={`${styles.statusBadge} ${
                    q.queryResolved ? styles.statusResolved : styles.statusPending
                  }`}
                >
                  {q.queryResolved ? 'Replied' : 'Pending'}
                </span>
                <span className={styles.queryDate}>
                  {new Date(q.createdAt).toLocaleDateString('en-GB')}
                </span>
              </div>

              <p className={styles.queryText}>{q.query}</p>

              <div className={styles.queryMeta}>
                Raised by <strong>{q.raisedBy?.name || 'Unknown'}</strong>
                {q.raisedBy?.role ? ` (${q.raisedBy.role})` : ''}
                {q.queryReplyBy?.name && (
                  <>
                    {' '}· Directed to <strong>{q.queryReplyBy.name}</strong>
                  </>
                )}
              </div>

              {q.queryResolved && q.queryReply && (
                <p className={styles.replyPreview}>
                  <strong>Reply:</strong> {q.queryReply}
                </p>
              )}

              {q.attachmentsCount > 0 && (
                <span className={styles.attachmentBadge}>
                  📎 {q.attachmentsCount} document{q.attachmentsCount > 1 ? 's' : ''}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
