

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getCompletedById, setExpectedCompletion, submitActualCompletion } from '../../../api/completionStatus.api';
import { downloadFile } from '../../../api/files.api';
import { openInNewTab } from '../../../utils/safeOpen';
import { useAuth } from '../../../context/AuthContext';
import LoadingScreen from '../../../common/LoadingScreen';
import styles from './CompletionStatusDetails.module.css';

const ADMIN_ROLES = ['DIRECTOR_ADMIN', 'CHIEF_DIRECTOR', 'CHAIRMAN', 'CHAIRMAN_OFFICE'];

export default function CompletionDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user: currentUser, loading: authLoading } = useAuth();
  const [completed, setCompleted] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Form states
  const [expectedDate, setExpectedDate] = useState('');
  const [submittingExpected, setSubmittingExpected] = useState(false);
  
  const [completionStatus, setCompletionStatus] = useState('');
  const [actualCompletionDate, setActualCompletionDate] = useState('');
  const [reasonForPending, setReasonForPending] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [submittingCompletion, setSubmittingCompletion] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!currentUser) {
      navigate('/login');
      return;
    }

    if (!id) return;

    const fetchCompletedRequest = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await getCompletedById(id);

        if (!response.data?.data) {
          throw new Error('Completed request not found');
        }

        setCompleted(response.data.data);
      } catch (err) {
        console.error('Error fetching completed request:', err);
        const errorMessage =
          err.response?.status === 404
            ? 'Completed request not found'
            : err.response?.status === 403
              ? 'You do not have permission to view this completed request'
              : err.response?.status === 401
                ? 'Please log in to view this completed request'
                : err.message || 'Failed to load completed request';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };
    fetchCompletedRequest();
  }, [id, currentUser, authLoading, navigate]);

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
      let mimeType = 'application/octet-stream';
      
      if (ext === 'pdf') mimeType = 'application/pdf';
      else if (ext === 'txt') mimeType = 'text/plain';
      else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
      else if (ext === 'png') mimeType = 'image/png';
      
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

  const handleBackToList = () => {
    navigate('/completion-status');
  };

  const handleSubmitExpectedDate = async (e) => {
    e.preventDefault();
    
    if (!expectedDate) {
      toast.error('Please select an expected completion date');
      return;
    }
    
    try {
      setSubmittingExpected(true);
      const response = await setExpectedCompletion(id, {
        expectedCompletion: expectedDate
      });
      
      if (response.data?.data) {
        setCompleted(response.data.data);
        setExpectedDate('');
        toast.success('Expected completion date set successfully');
      }
    } catch (err) {
      console.error('Error updating expected date:', err);
      toast.error(err.response?.data?.message || 'Failed to update expected completion date');
    } finally {
      setSubmittingExpected(false);
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setAttachments(files);
  };

  const handleSubmitCompletion = async (e) => {
    e.preventDefault();

    // Once a reason for pending has already been recorded, the only action
    // left on this form is marking the request completed — the radio choice
    // is skipped entirely, so treat that as the status here too.
    const status = completed?.reasonForPending ? 'completed' : completionStatus;

    if (!status) {
      toast.error('Please select completion status');
      return;
    }

    if (status === 'completed' && !actualCompletionDate) {
      toast.error('Please select actual completion date');
      return;
    }

    if (status === 'not-completed' && !reasonForPending.trim()) {
      toast.error('Please provide a reason for pending status');
      return;
    }

    try {
      setSubmittingCompletion(true);

      const formData = new FormData();
      formData.append('completedStatus', status === 'completed');

      if (status === 'completed') {
        formData.append('completionDate', actualCompletionDate);
        // Attach files if any
        attachments.forEach((file) => {
          formData.append('attachments', file);
        });
      } else {
        formData.append('reasonForPending', reasonForPending);
        // Attach files for pending status too
        attachments.forEach((file) => {
          formData.append('attachments', file);
        });
      }
      
      const response = await submitActualCompletion(id, formData);
      
      if (response.data?.data) {
        setCompleted(response.data.data);
        setCompletionStatus('');
        setActualCompletionDate('');
        setReasonForPending('');
        setAttachments([]);
        toast.success('Completion status updated successfully');
      }
    } catch (err) {
      console.error('Error updating completion status:', err);
      toast.error(err.response?.data?.message || 'Failed to update completion status');
    } finally {
      setSubmittingCompletion(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStatusInfo = () => {
    if (!completed) return { text: 'Unknown', className: styles.statusDefault };
    
    if (completed.completedStatus) {
      return { text: 'COMPLETED', className: styles.statusCompleted };
    }
    
    const now = new Date();
    const expectedDate = new Date(completed.expectedCompletion);
    
    if (expectedDate < now) {
      return { text: 'OVERDUE', className: styles.statusOverdue };
    }
    
    return { text: 'PENDING', className: styles.statusPending };
  };

  const isRequester = () => {
    if (currentUser?.role === 'REQUESTER') return true;
    // A Head of Institution / Institution Manager acts like the requester only on
    // requests they created themselves.
    const createdAsOwnRole =
      (currentUser?.role === 'HEAD_OF_INSTITUTION' && completed?.request?.isHoiCreated === true) ||
      (currentUser?.role === 'INSTITUTION_MANAGER' && completed?.request?.isImCreated === true);
    return createdAsOwnRole && String(completed?.request?.requester?.id) === String(currentUser?.id);
  };

  const isAdminRole = () => {
    return ADMIN_ROLES.includes(currentUser?.role);
  };

  const canEditExpectedDate = () => {
    // REQUESTER and admin roles can set/edit expected date
    return isRequester() || isAdminRole();
  };

  const canUpdateCompletion = () => {
    // Only REQUESTER can update completion status and attach documents
    return isRequester();
  };

  const isReasonLocked = () => {
    // Once a reason for pending has been submitted it's a historical record,
    // not something to keep rewriting — the form drops to "mark completed" only.
    return Boolean(completed?.reasonForPending);
  };

  if (authLoading || loading) {
    return <LoadingScreen message={authLoading ? 'Authenticating...' : 'Loading completion details...'} />;
  }

  if (error || !completed) {
    return (
      <div className={styles.maxWidth}>
        <div className={styles.errorContainer}>
          <h3 className={styles.errorTitle}>Error</h3>
          <p className={styles.errorText}>{error || 'Completed request not found'}</p>
          <div className={styles.errorActions}>
            <button onClick={handleBackToList} className={styles.primaryBtn}>
              Go Back to List
            </button>
            <button onClick={() => navigate('/dashboard')} className={styles.secondaryBtn}>
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo();

  return (
    <div className={styles.maxWidth}>
      {/* Back Button */}
      <div className={styles.backButtonContainer}>
        <button onClick={handleBackToList} className={styles.backButton}>
          <svg className={styles.backIcon} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back to Completion Status
        </button>
      </div>

      {/* Completion Status Card */}
      <div className={styles.detailsCard}>
        {/* Header */}
        <div className={styles.cardHeader}>
          <div className={styles.headerContent}>
            <h3 className={styles.cardTitle}>
              {completed.request?.title || 'Untitled Request'}
            </h3>
            <span className={`${styles.statusBadge} ${statusInfo.className}`}>
              {statusInfo.text}
            </span>
          </div>
          <p className={styles.cardDescription}>
            Request ID: <span className={styles.requestID}>{completed.request?.requestID || 'N/A'}</span>
          </p>
        </div>

        {/* Details */}
        <div className={styles.cardContent}>
          <div className={styles.detailsGrid}>
            {/* Request Information */}
            <div className={styles.detailsSection}>
              <h4 className={styles.sectionTitle}>Request Information</h4>
              <div className={styles.infoGrid}>
                <div className={styles.infoRow}>
                  <dt className={styles.infoLabel}>Request ID</dt>
                  <dd className={styles.infoValue}>{completed.request?.requestID || 'N/A'}</dd>
                </div>
                <div className={styles.infoRow}>
                  <dt className={styles.infoLabel}>Title</dt>
                  <dd className={styles.infoValue}>{completed.request?.title || 'N/A'}</dd>
                </div>
                <div className={styles.infoRow}>
                  <dt className={styles.infoLabel}>Requester</dt>
                  <dd className={styles.infoValue}>
                    {completed.request?.requester?.name || 'Unknown'}
                  </dd>
                </div>
                <div className={styles.infoRow}>
                  <dt className={styles.infoLabel}>Institution</dt>
                  <dd className={styles.infoValue}>
                    {completed.request?.institution || 'N/A'}
                  </dd>
                </div>
                <div className={styles.infoRow}>
                  <dt className={styles.infoLabel}>Department</dt>
                  <dd className={styles.infoValue}>
                    {completed.request?.department || 'N/A'}
                  </dd>
                </div>
              </div>
              {/* View Original Request Button */}
              <div className={styles.viewRequestBtnContainer}>
                <button
                  onClick={() => navigate(`/requests/${completed.request?.requestID}`)}
                  className={styles.viewRequestBtn}
                  type="button"
                >
                  <svg className={styles.linkIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View Original Request
                </button>
              </div>
            </div>

            {/* Completion Dates */}
            <div className={styles.detailsSection}>
              <h4 className={styles.sectionTitle}>Completion Timeline</h4>
              
              {/* Expected Date - Show form if not set, otherwise show read-only */}
              {!completed.expectedCompletion ? (
                canEditExpectedDate() ? (
                  <form onSubmit={handleSubmitExpectedDate} className={styles.formContainer}>
                    <div className={styles.formGroup}>
                      <label htmlFor="expectedDate" className={styles.formLabel}>
                        Expected Completion Date *
                      </label>
                      <input
                        type="date"
                        id="expectedDate"
                        value={expectedDate}
                        onChange={(e) => setExpectedDate(e.target.value)}
                        onClick={(e) => e.target.showPicker?.()}
                        className={styles.dateInput}
                        required
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <div className={styles.formActions}>
                      <button
                        type="submit"
                        disabled={submittingExpected}
                        className={styles.submitBtn}
                      >
                        {submittingExpected ? 'Saving...' : 'Set Expected Date'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className={styles.infoMessage}>
                    Expected completion date not yet set. Please contact the requester or an administrator to set it.
                  </p>
                )
              ) : (
                <div className={styles.infoGrid}>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Expected Completion</dt>
                    <dd className={styles.infoValue}>
                      {formatDate(completed.expectedCompletion)}
                    </dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Actual Completion Date</dt>
                    <dd className={styles.infoValue}>
                      {formatDate(completed.completionDate)}
                    </dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Completion Status</dt>
                    <dd className={styles.infoValue}>
                      <span className={completed.completedStatus ? styles.completedBadge : styles.pendingBadge}>
                        {completed.completedStatus ? 'Completed' : 'Pending'}
                      </span>
                    </dd>
                  </div>
                </div>
              )}
            </div>

            {/* Show completion update form only for REQUESTER */}
            {!completed.completedStatus && canUpdateCompletion() && (
              <div className={styles.detailsSection}>
                <div className={styles.completionFormContainer}>
                  <h5 className={styles.formTitle}>
                    {isReasonLocked() ? 'Mark as Completed' : 'Update Completion Status'}
                  </h5>
                  {isReasonLocked() && (
                    <p className={styles.infoMessage}>
                      A reason for pending has already been recorded below and can no longer be edited.
                      Once the work is finished, submit the actual completion date here to mark it completed.
                    </p>
                  )}
                  <form onSubmit={handleSubmitCompletion} className={styles.formContainer}>
                    {!isReasonLocked() && (
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Completion Status *</label>
                        <div className={styles.radioGroup}>
                          <label className={styles.radioLabel}>
                            <input
                              type="radio"
                              name="completionStatus"
                              value="completed"
                              checked={completionStatus === 'completed'}
                              onChange={(e) => setCompletionStatus(e.target.value)}
                              className={styles.radioInput}
                            />
                            <span>Completed</span>
                          </label>
                          <label className={styles.radioLabel}>
                            <input
                              type="radio"
                              name="completionStatus"
                              value="not-completed"
                              checked={completionStatus === 'not-completed'}
                              onChange={(e) => setCompletionStatus(e.target.value)}
                              className={styles.radioInput}
                            />
                            <span>Not Completed</span>
                          </label>
                        </div>
                      </div>
                    )}

                    {(isReasonLocked() || completionStatus === 'completed') && (
                      <>
                        <div className={styles.formGroup}>
                          <label htmlFor="actualCompletionDate" className={styles.formLabel}>
                            Actual Completion Date *
                          </label>
                          <input
                            type="date"
                            id="actualCompletionDate"
                            value={actualCompletionDate}
                            onChange={(e) => setActualCompletionDate(e.target.value)}
                            onClick={(e) => e.target.showPicker?.()}
                            className={styles.dateInput}
                            required
                            max={new Date().toISOString().split('T')[0]}
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label htmlFor="attachments" className={styles.formLabel}>
                            Attachments (Optional)
                          </label>
                          <input
                            type="file"
                            id="attachments"
                            onChange={handleFileChange}
                            className={styles.fileInput}
                            multiple
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                          />
                          {attachments.length > 0 && (
                            <p className={styles.fileCount}>
                              {attachments.length} file(s) selected
                            </p>
                          )}
                        </div>
                      </>
                    )}

                    {completionStatus === 'not-completed' && (
                      <>
                        <div className={styles.formGroup}>
                          <label htmlFor="reasonForPending" className={styles.formLabel}>
                            Reason for Pending *
                          </label>
                          <textarea
                            id="reasonForPending"
                            value={reasonForPending}
                            onChange={(e) => setReasonForPending(e.target.value)}
                            className={styles.textArea}
                            rows="4"
                            placeholder="Please explain why the work is not yet completed..."
                            required
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label htmlFor="attachmentsPending" className={styles.formLabel}>
                            Supporting Documents (Optional)
                          </label>
                          <input
                            type="file"
                            id="attachmentsPending"
                            onChange={handleFileChange}
                            className={styles.fileInput}
                            multiple
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                          />
                          {attachments.length > 0 && (
                            <p className={styles.fileCount}>
                              {attachments.length} file(s) selected
                            </p>
                          )}
                        </div>
                      </>
                    )}

                    {(isReasonLocked() || completionStatus) && (
                      <div className={styles.formActions}>
                        <button
                          type="submit"
                          disabled={submittingCompletion}
                          className={styles.submitBtn}
                        >
                          {submittingCompletion ? 'Submitting...' : 'Submit'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCompletionStatus('');
                            setActualCompletionDate('');
                            setReasonForPending('');
                            setAttachments([]);
                          }}
                          className={styles.cancelBtn}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </form>
                </div>
              </div>
            )}

            {/* Reason for Pending - Visible to all */}
            {completed.reasonForPending && (
              <div className={styles.detailsSection}>
                <h4 className={styles.sectionTitle}>Reason for Pending</h4>
                <div className={styles.reasonBox}>
                  <p className={styles.reasonText}>{completed.reasonForPending}</p>
                </div>
              </div>
            )}

          
          </div>

          {/* Attachments Section - Visible to all, uploaded by REQUESTER */}
          {completed.attachments?.length > 0 && (
            <div className={styles.attachmentsSection}>
              <h4 className={styles.sectionTitle}>
                Attached Documents ({completed.attachments.length})
              </h4>
              <p className={styles.attachmentsNote}>
                {isRequester() ? 'Documents you uploaded' : 'Documents uploaded by the requester'}
              </p>
              <div className={styles.attachmentsList}>
                {completed.attachments.map((attachment, index) => (
                  <div key={attachment.fileId || index} className={styles.attachmentItem}>
                    <div className={styles.attachmentInfo}>
                      <span className={styles.attachmentName}>{attachment.filename}</span>
                      <span className={styles.attachmentDate}>
                        Uploaded: {new Date(attachment.uploadedAt).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                    <div className={styles.attachmentActions}>
                      <button
                        onClick={() => handleViewAttachment(attachment.fileId, attachment.filename)}
                        className={styles.viewBtn}
                        type="button"
                        title="View file"
                      >
                        <svg className={styles.viewIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        View
                      </button>
                      <button
                        onClick={() => handleDownloadAttachment(attachment.fileId, attachment.filename)}
                        className={styles.downloadBtn}
                        type="button"
                        title="Download file"
                      >
                        <svg className={styles.downloadIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
