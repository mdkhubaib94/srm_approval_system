
import { useState, useMemo } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { raiseQuery } from '../api/queries.api';
import styles from './RaiseQueryModal.module.css';

export default function RaiseQueryModal({ request, policy, isOpen, onClose, onSuccess }) {
  const [query, setQuery] = useState('');
  const [queryReplyBy, setQueryReplyBy] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const entityLabel = policy ? 'Policy' : 'Request';

  // Reset queryReplyBy when the modal opens. Adjusted directly during render
  // (guarded by comparing against the last-seen isOpen) rather than in an
  // effect, per React's "adjusting state when a prop changes" pattern.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setQueryReplyBy('');
    }
  }

  // Extract unique users from action history
  const actionHistoryUsers = useMemo(() => {
    if (policy) {
      // Policies have no action history — the only person who can reply is
      // whoever submitted it (always HEAD_OF_INSTITUTION; see create_policy).
      if (!policy.requester?._id) return [];
      return [
        {
          _id: policy.requester._id,
          name: policy.requester.name || 'Unknown',
          email: policy.requester.email || '',
          role: policy.requester.role || 'HEAD_OF_INSTITUTION'
        }
      ];
    }

    if (!request?.actionHistory || request.actionHistory.length === 0) {
      return [];
    }

    // Get unique users based on their ID
    const uniqueUsersMap = new Map();

    request.actionHistory.forEach((action) => {
      if (action.actionBy && action.actionBy._id) {
        uniqueUsersMap.set(action.actionBy._id, {
          _id: action.actionBy._id,
          name: action.actionBy.name || 'Unknown',
          email: action.actionBy.email || '',
          role: action.actionBy.role || ''
        });
      }
    });

    return Array.from(uniqueUsersMap.values());
  }, [request, policy]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }

    if (!queryReplyBy) {
      setError('Please select a user to reply to this query');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await raiseQuery(
        policy
          ? { policy: policy._id, query: query.trim(), queryReplyBy: queryReplyBy }
          : { request: request._id, query: query.trim(), queryReplyBy: queryReplyBy }
      );

      if (response.data.success) {
        toast.success('Query raised successfully!');
        setQuery('');
        setQueryReplyBy('');
        
        // Close modal after a short delay
        setTimeout(() => {
          onSuccess(response.data.data);
        }, 1000);
      }
    } catch (err) {
      console.error('Error raising query:', err);
      const errorMsg = err.response?.data?.message ||
        err.message ||
        'Failed to raise query';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setQuery('');
      setQueryReplyBy('');
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.modalOverlay} onClick={handleClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>Raise Query</h2>
            <button
              className={styles.closeButton}
              onClick={handleClose}
              type="button"
              aria-label="Close modal"
              disabled={loading}
            >
              ✕
            </button>
          </div>

          {error && (
            <div className={styles.errorAlert}>
              <p className={styles.errorMessage}>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            {!policy && (
              <div className={styles.formSection}>
                <label className={styles.label}>
                  Request ID
                </label>
                <input
                  type="text"
                  className={styles.inputReadonly}
                  value={request?.requestID || ''}
                  readOnly
                  disabled
                />
              </div>
            )}

            <div className={styles.formSection}>
              <label className={styles.label}>
                {entityLabel} Title
              </label>
              <input
                type="text"
                className={styles.inputReadonly}
                value={(policy || request)?.title || ''}
                readOnly
                disabled
              />
            </div>

            <div className={styles.formSection}>
              <label className={styles.label}>
                Direct Query To <span className={styles.required}>*</span>
              </label>
              <select
                className={styles.select}
                value={queryReplyBy}
                onChange={(e) => setQueryReplyBy(e.target.value)}
                disabled={loading || actionHistoryUsers.length === 0}
                required
              >
                <option value="">
                  {policy ? 'Select the policy requester...' : 'Select a user from action history...'}
                </option>
                {actionHistoryUsers.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.role}

                  </option>
                ))}
              </select>
              {actionHistoryUsers.length === 0 && (
                <p className={styles.helpText}>
                  {policy
                    ? 'This policy has no identifiable requester to direct the query to.'
                    : "No users found in action history. This request hasn't been processed yet."}
                </p>
              )}
            </div>

            <div className={styles.formSection}>
              <label className={styles.label}>
                Your Query <span className={styles.required}>*</span>
              </label>
              <textarea
                className={styles.textarea}
                placeholder="Describe your query for additional information..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={6}
                disabled={loading}
                required
              />
              
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={loading || !query.trim() || !queryReplyBy}
              >
                {loading ? 'Submitting...' : 'Raise Query'}
              </button>
            </div>
          </form>
        </div>
      </div>
      
      <Toaster position="top-right" />
    </>
  );
}
