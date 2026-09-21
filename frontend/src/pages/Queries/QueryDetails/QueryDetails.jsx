import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { getQueryById, updateQuery } from '../../../api/queries.api';
import { downloadFile } from '../../../api/files.api';
import { openInNewTab } from '../../../utils/safeOpen';
import { buildQueryAttachmentFilename } from '../../../utils/downloadNaming';
import { useAuth } from '../../../context/AuthContext';
import { ErrorBoundary } from '../../../common/ErrorBoundary';
import LoadingScreen from '../../../common/LoadingScreen';
import SuccessModal from '../../../common/SuccessModal';
import styles from './QueryDetails.module.css';

export default function QueryDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user: currentUser, loading: authLoading } = useAuth();
  const [query, setQuery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [queryReply, setQueryReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyFiles, setReplyFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showAttachSuccess, setShowAttachSuccess] = useState(false);
  const [attachedCount, setAttachedCount] = useState(0);
  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);

  const MAX_ATTACHMENTS = 10;
  const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      navigate('/login');
      return;
    }

    const fetchQuery = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await getQueryById(id);

        if (!response.data?.data) {
          throw new Error('Query not found');
        }

        const queryData = response.data.data;
        setQuery(queryData);
        setQueryReply(queryData.queryReply || '');
      } catch (err) {
        console.error('Error fetching query:', err);
        const errorMessage =
          err.response?.status === 404
            ? 'Query not found'
            : err.response?.status === 403
              ? 'You do not have permission to view this query'
              : err.response?.status === 401
                ? 'Please log in to view this query'
                : err.message || 'Failed to load query';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };
    fetchQuery();
  }, [id, currentUser, authLoading, navigate]);

  const processIncomingFiles = (picked) => {
    if (!picked.length || submitting) return;

    const accepted = [];
    for (const file of picked) {
      if (file.type !== 'application/pdf') {
        toast.error(`"${file.name}" is not a PDF and was skipped.`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        toast.error(`"${file.name}" exceeds the 10MB limit and was skipped.`);
        continue;
      }
      accepted.push(file);
    }

    if (!accepted.length) return;

    setReplyFiles((prev) => {
      const existingNames = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const deduped = accepted.filter((f) => !existingNames.has(`${f.name}-${f.size}`));
      const combined = [...prev, ...deduped];
      if (combined.length > MAX_ATTACHMENTS) {
        toast.error(`Only the first ${MAX_ATTACHMENTS} files are kept.`);
      }
      return combined.slice(0, MAX_ATTACHMENTS);
    });
  };

  const handleReplyFileChange = (e) => {
    const picked = Array.from(e.target.files || []);
    // Cleared up front so re-picking the same file still fires a change event.
    e.target.value = '';
    processIncomingFiles(picked);
  };

  const handleRemoveReplyFile = (index) => {
    setReplyFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDropzoneClick = () => {
    if (!submitting) fileInputRef.current?.click();
  };

  const handleDropzoneKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleDropzoneClick();
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    if (submitting) return;
    dragCounter.current += 1;
    if (e.dataTransfer?.types?.includes('Files')) setIsDragging(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (submitting) return;
    const dropped = Array.from(e.dataTransfer?.files || []);
    processIncomingFiles(dropped);
  };

  const handleDownloadAttachment = async (fileId, filename) => {
    try {
      const response = await downloadFile(fileId);

      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();

      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading file:', err);
      toast.error('Failed to download file');
    }
  };

  const handleViewAttachment = async (fileId, filename) => {
    try {
      const response = await downloadFile(fileId);

      const ext = filename.toLowerCase().split('.').pop();
      const mimeType = ext === 'pdf' ? 'application/pdf' : 'application/octet-stream';

      const blob = new Blob([response.data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      openInNewTab(url);

      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error('Error viewing file:', err);
      toast.error('Failed to view file');
    }
  };

  const handleSubmitReply = async (e) => {
    e.preventDefault();

    if (!queryReply.trim()) {
      toast.error('Please enter a reply');
      return;
    }

    try {
      setSubmitting(true);

      let payload;
      if (replyFiles.length > 0) {
        payload = new FormData();
        payload.append('queryReply', queryReply.trim());
        payload.append('queryResolved', 'true');
        replyFiles.forEach((file) => payload.append('attachments', file));
      } else {
        payload = {
          queryReply: queryReply.trim(),
          queryResolved: true
        };
      }

      const response = await updateQuery(id, payload);

      if (response.data.success) {
        // Update local state with the response
        setQuery(response.data.data);

        if (replyFiles.length > 0) {
          // Hold off redirecting until the user has acknowledged the
          // attachment — a toast alone is easy to miss.
          setAttachedCount(replyFiles.length);
          setShowAttachSuccess(true);
        } else {
          toast.success('Reply submitted successfully!');
          setTimeout(() => {
            navigate('/queries');
          }, 1500);
        }
      }
    } catch (err) {
      console.error('Error submitting reply:', err);
      const errorMsg = err.response?.data?.message ||
        err.message ||
        'Failed to submit reply';
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackToQueries = () => {
    navigate('/queries');
  };

  const handleAttachSuccessClose = () => {
    setShowAttachSuccess(false);
    navigate('/queries');
  };

  // Check if current user can reply to this query
  const canReplyToQuery = () => {
    if (!currentUser || !query) return false;

    // User can reply only if they are the queryReplyBy user
    const currentUserId = currentUser.id || currentUser._id;
    const queryReplyById = query.queryReplyBy?._id || query.queryReplyBy;

    return currentUserId === queryReplyById;
  };

  if (authLoading || loading) {
    return <LoadingScreen message={authLoading ? 'Authenticating...' : 'Loading query details...'} />;
  }

  if (error || !query) {
    return (
      <div className={styles.maxWidth}>
        <div className={styles.errorContainer}>
          <h3 className={styles.errorTitle}>Error</h3>
          <p className={styles.errorText}>{error || 'Query not found'}</p>
          <div className={styles.errorActions}>
            <button onClick={handleBackToQueries} className={styles.primaryBtn}>
              Go Back to Queries
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className={styles.maxWidth}>
        {/* Back Button */}
        <div className={styles.backButtonContainer}>
          <button onClick={handleBackToQueries} className={styles.backButton}>
            <svg className={styles.backIcon} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back to Queries
          </button>
        </div>

        {/* Query Details Card */}
        <div className={styles.detailsCard}>
          {/* Header */}
          <div className={styles.cardHeader}>
            <div className={styles.headerContent}>
              <h3 className={styles.cardTitle}>Query Details</h3>
              <span
                className={`${styles.statusBadge} ${
                  query.queryResolved ? styles.statusResolved : styles.statusPending
                }`}
              >
                {query.queryResolved ? 'Replied' : 'Pending'}
              </span>
            </div>
          </div>

          {/* Details */}
          <div className={styles.cardContent}>
            {/* Request or Policy Information */}
            {query.policy ? (
              <div className={styles.detailsSection}>
                <h4 className={styles.sectionTitle}>Related Policy</h4>
                <div className={styles.infoGrid}>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Policy Title</dt>
                    <dd className={styles.infoValue}>
                      <button
                        onClick={() => navigate(`/policies/${query.policy?._id}`)}
                        className={styles.linkButton}
                      >
                        {query.policy?.title || 'N/A'}
                      </button>
                    </dd>
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.detailsSection}>
                <h4 className={styles.sectionTitle}>Related Request</h4>
                <div className={styles.infoGrid}>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Request ID</dt>
                    <dd className={styles.infoValue}>
                      <button
                        onClick={() => navigate(`/requests/${query.request?.requestID}`)}
                        className={styles.linkButton}
                      >
                        {query.request?.requestID || 'N/A'}
                      </button>
                    </dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Request Title</dt>
                    <dd className={styles.infoValue}>{query.request?.title || 'N/A'}</dd>
                  </div>
                  {query.request?.description && (
                    <div className={styles.infoRow}>
                      <dt className={styles.infoLabel}>Description</dt>
                      <dd className={styles.infoValue}>{query.request.description}</dd>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Query Information */}
            <div className={styles.detailsSection}>
              <h4 className={styles.sectionTitle}>Query Information</h4>
              <div className={styles.infoGrid}>
                <div className={styles.infoRow}>
                  <dt className={styles.infoLabel}>Raised By</dt>
                  <dd className={styles.infoValue}>
                    {query.raisedBy?.name || 'Unknown'}
                  </dd>
                  <dt className={styles.infoLabel}>At Stage</dt>
                  <dd className={styles.infoValue}>
                      {query.raisedBy?.role ? ` ${query.raisedBy.role}` : ''}
                  </dd>
                </div>
                <div className={styles.infoRow}>
                  <dt className={styles.infoLabel}>Date Raised</dt>
                  <dd className={styles.infoValue}>
                    {new Date(query.createdAt).toLocaleString('en-GB')}
                  </dd>
                </div>
                <div className={styles.infoRowFull}>
                  <dt className={styles.infoLabel}>Query</dt>
                  <dd className={styles.queryTextBox}>{query.query}</dd>
                </div>
              </div>
            </div>

            {/* Attachments — documents attached with the reply, if any */}
            {query.attachments?.length > 0 && (
              <div className={styles.detailsSection}>
                <h4 className={styles.sectionTitle}>Attachments ({query.attachments.length})</h4>
                <div className={styles.attachmentsList}>
                  {query.attachments.map((attachment, index) => (
                    <div key={attachment.fileId || index} className={styles.attachmentItem}>
                      <span className={styles.attachmentName}>{attachment.filename}</span>
                      <div className={styles.attachmentActions}>
                        <button
                          onClick={() => handleViewAttachment(attachment.fileId, attachment.filename)}
                          className={styles.viewBtn}
                          type="button"
                          title="View file"
                        >
                          View
                        </button>
                        <button
                          onClick={() =>
                            handleDownloadAttachment(
                              attachment.fileId,
                              buildQueryAttachmentFilename(query.request?.requestID, index, attachment.filename)
                            )
                          }
                          className={styles.downloadBtn}
                          type="button"
                          title="Download file"
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reply Section */}
            <div className={styles.detailsSection}>
              <h4 className={styles.sectionTitle}>Query Reply</h4>

              {query.queryResolved ? (
                // Show existing reply if query is already resolved
                <div className={styles.infoGrid}>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Replied By</dt>
                    <dd className={styles.infoValue}>
                      {query.queryReplyBy?.name || 'Unknown'}
                      <span className={styles.userRole}>
                        {query.queryReplyBy?.role ? ` (${query.queryReplyBy.role})` : ''}
                      </span>
                    </dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Date Replied</dt>
                    <dd className={styles.infoValue}>
                      {new Date(query.updatedAt).toLocaleString('en-GB')}
                    </dd>
                  </div>
                  <div className={styles.infoRowFull}>
                    <dt className={styles.infoLabel}>Reply</dt>
                    <dd className={styles.queryTextBox}>{query.queryReply}</dd>
                  </div>
                </div>
              ) : canReplyToQuery() ? (
                // Show reply form if query is not resolved and user can reply
                <form onSubmit={handleSubmitReply} className={styles.replyForm}>
                  <div className={styles.formSection}>
                    <label className={styles.label}>
                      Your Reply <span className={styles.required}>*</span>
                    </label>
                    <textarea
                      className={styles.textarea}
                      placeholder="Enter your reply to this query..."
                      value={queryReply}
                      onChange={(e) => setQueryReply(e.target.value)}
                      rows={6}
                      disabled={submitting}
                      required
                    />
                    <p className={styles.hint}>
                      Your reply will be recorded as from: <strong>{currentUser?.name}</strong>
                    </p>
                  </div>

                  <div className={styles.formSection}>
                    <label className={styles.label}>Attach Supporting Document (optional)</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf"
                      multiple
                      onChange={handleReplyFileChange}
                      disabled={submitting}
                      className={styles.visuallyHiddenInput}
                      tabIndex={-1}
                    />
                    <div
                      className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ''} ${
                        submitting ? styles.dropzoneDisabled : ''
                      }`}
                      role="button"
                      tabIndex={submitting ? -1 : 0}
                      aria-disabled={submitting}
                      onClick={handleDropzoneClick}
                      onKeyDown={handleDropzoneKeyDown}
                      onDragEnter={handleDragEnter}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      <svg className={styles.dropzoneIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M12 12v9m0-9l-3 3m3-3l3 3" />
                      </svg>
                      <p className={styles.dropzoneText}>
                        {isDragging ? (
                          <strong>Drop your PDF{replyFiles.length ? 's' : ''} here</strong>
                        ) : (
                          <>
                            <strong>Click to browse   </strong> or drag &amp; drop a PDF here
                          </>
                        )}
                      </p>
                      <p className={styles.dropzoneHint}>
                        PDF only, up to 10MB each · shows up on this query and the related request
                      </p>
                    </div>

                    {replyFiles.length > 0 && (
                      <ul className={styles.selectedFilesList}>
                        {replyFiles.map((file, index) => (
                          <li key={`${file.name}-${index}`} className={styles.selectedFileItem}>
                            <svg className={styles.selectedFileIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m1 5H8a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className={styles.selectedFileName}>{file.name}</span>
                            <span className={styles.selectedFileSize}>{formatFileSize(file.size)}</span>
                            <button
                              type="button"
                              className={styles.removeFileBtn}
                              onClick={() => handleRemoveReplyFile(index)}
                              disabled={submitting}
                              aria-label={`Remove ${file.name}`}
                              title={`Remove ${file.name}`}
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className={styles.formActions}>
                    <button
                      type="button"
                      className={styles.cancelButton}
                      onClick={handleBackToQueries}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className={styles.submitButton}
                      disabled={submitting || !queryReply.trim()}
                    >
                      {submitting ? 'Submitting...' : 'Submit Reply '}
                    </button>
                  </div>
                </form>
              ) : (
                // Show read-only view if user cannot reply
                <div className={styles.noAccessMessage}>
                  <svg className={styles.noAccessIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className={styles.noAccessContent}>
                    <h5 className={styles.noAccessTitle}>Reply Restricted</h5>
                    <p className={styles.noAccessText}>
                      This query is directed to <strong>{query.queryReplyBy?.name || 'another user'}</strong>
                      {query.queryReplyBy?.role && ` (${query.queryReplyBy.role})`}.
                      Only they can reply to this query.
                    </p>
                    {query.queryReply && (
                      <div className={styles.pendingReplyBox}>
                        <dt className={styles.infoLabel}>Current Status</dt>
                        <dd className={styles.infoValue}>Waiting for reply from {query.queryReplyBy?.name || 'assigned user'}</dd>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <SuccessModal
        isOpen={showAttachSuccess}
        onClose={handleAttachSuccessClose}
        title="Document Attached"
        message={`${attachedCount} document${attachedCount > 1 ? 's' : ''} attached successfully. This query has now been replied to.`}
        buttonLabel="OK"
      />

      <Toaster position="top-right" />
    </ErrorBoundary>
  );
}
