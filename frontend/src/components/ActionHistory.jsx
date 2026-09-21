import { useState } from 'react';
import styles from './ActionHistory.module.css';

const getActionBadgeClass = (action) => {
  const actionLower = action?.toLowerCase() || '';
  if (actionLower === 'approved' || actionLower === 'forwarded') {
    return styles.badgeSuccess;
  } else if (actionLower === 'rejected') {
    return styles.badgeError;
  } else if (actionLower === 'queried') {
    return styles.badgeWarning;
  }
  return styles.badgeDefault;
};

const getActionDisplayName = (action) => {
  if (!action || typeof action !== 'string') return 'Unknown';
  return action
    .split('_')
    .map(word => word && word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : '')
    .filter(word => word.length > 0)
    .join(' ');
};

export default function ActionHistory({ request }) {
  const [isExpanded] = useState(true);

  if (!request?.actionHistory || request.actionHistory.length === 0) {
    return null;
  }

  const sortedHistory = [...request.actionHistory].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        
          <div className={styles.titleContainer}>
            <h3 className={styles.title}>Action History</h3>
            <p className={styles.description}>
              {sortedHistory.length} action{sortedHistory.length !== 1 ? 's' : ''}
            </p>
          </div>
          
        
      </div>

      {isExpanded && (
        <div className={styles.content}>
          <div className={styles.timeline}>
            <ul className={styles.historyList}>
              {sortedHistory.map((action, index) => (
                <li key={index} className={styles.historyItem}>
                  <div className={styles.itemWrapper}>
                    {/* Action Badge */}
                    <div className={styles.badgeContainer}>
                      <div className={`${styles.badge} ${getActionBadgeClass(action.action)}`}>
                        <span>{action.action && typeof action.action === 'string' ? action.action.charAt(0).toUpperCase() : '?'}</span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className={styles.itemContent}>
                      {/* Header: Action, Actor, Timestamp */}
                      <div className={styles.itemHeader}>
                        <div className={styles.actionInfo}>
                          <span className={`${styles.actionBadge} ${getActionBadgeClass(action.action)}`}>
                            {getActionDisplayName(action.action)}
                          </span>
                          <span className={styles.byText}>by</span>
                          <span className={styles.actorName}>
                            {action.actionBy?.name || 'Unknown'}
                          </span>
                        </div>
                        <div className={styles.timestamp}>
                          {new Date(action.timestamp).toLocaleString('en-GB')}
                        </div>
                      </div>

                      {/* Comments */}
                      {action.comments && (
                        <div className={styles.detailRow}>
                          <span className={styles.label}>Comments:</span>
                          <span className={styles.value}>{action.comments}</span>
                        </div>
                      )}

                      {/* Role (if available) */}
                      {action.actionBy?.role && (
                        <div className={styles.detailRow}>
                          <span className={styles.label}>Role:</span>
                          <span className={styles.value}>
                            {typeof action.actionBy.role === 'string'
                              ? action.actionBy.role
                                  .split('_')
                                  .map(word => word && word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : '')
                                  .filter(word => word.length > 0)
                                  .join(' ')
                              : action.actionBy.role}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}

              {/* Current Status Item */}
              <li className={styles.historyItem}>
                <div className={styles.itemWrapper}>
                  <div className={styles.badgeContainer}>
                    <div className={styles.badgeCurrentStatus}>
                      <svg
                        className={styles.checkIcon}
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className={styles.itemContent}>
                    <div className={styles.itemHeader}>
                      <span className={`${styles.actionBadge} ${styles.badgeCurrentStatus}`}>
                        Current Status
                      </span>
                      <div className={styles.timestamp}>Now</div>
                    </div>
                    <div className={styles.detailRow}>
                      <p className={styles.currentStatusText}>
                        This request is currently at the{' '}
                        <span className={styles.stageName}>{request.stage}</span>.
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
