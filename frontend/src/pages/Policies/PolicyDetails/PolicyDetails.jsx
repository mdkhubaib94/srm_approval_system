import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { getPolicyById, updatePolicyStatus } from '../../../api/policies.api';
import { downloadFile } from '../../../api/files.api';
import { openInNewTab } from '../../../utils/safeOpen';
import { useAuth } from '../../../context/AuthContext';
import { ErrorBoundary } from '../../../common/ErrorBoundary';
import PolicyWorkflow from '../../../components/PolicyWorkflow';
import PolicyProcessModal from '../../../components/PolicyProcessModal';
import RaiseQueryModal from '../../../components/RaiseQueryModal';
import QueryHistoryModal from '../../../components/QueryHistoryModal';
import LoadingScreen from '../../../common/LoadingScreen';
import styles from './PolicyDetails.module.css';

export default function PolicyDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user: currentUser, loading: authLoading } = useAuth();
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [showRaiseQueryModal, setShowRaiseQueryModal] = useState(false);
  const [showQueryHistoryModal, setShowQueryHistoryModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      navigate('/login');
      return;
    }

    const fetchPolicy = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await getPolicyById(id);

        if (!response.data?.data) {
          throw new Error('Policy not found');
        }

        setPolicy(response.data.data);
      } catch (err) {
        console.error('Error fetching policy:', err);
        const errorMessage =
          err.response?.status === 404
            ? 'Policy not found'
            : err.response?.status === 403
              ? 'You do not have permission to view this policy'
              : err.response?.status === 401
                ? 'Please log in to view this policy'
                : err.message || 'Failed to load policy';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };
    fetchPolicy();
  }, [id, currentUser, authLoading, navigate, reloadKey]);

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
      alert('Failed to download file');
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
      alert('Failed to view file');
    }
  };

  const handleBackToPolicies = () => {
    navigate('/policies');
  };

  const canProcessPolicy = () => {
    if (!currentUser || !policy) return false;

    // Can't process if already approved or rejected
    if (policy.policyApprovalStatus !== 'PENDING') return false;

    // Only Chairman can approve/reject policies
    return currentUser.role === 'CHAIRMAN';
  };

  // Mirrors backend can_raise_policy_query: only the Chairman, and only
  // while the policy is still awaiting a decision.
  const canRaiseQuery = () => canProcessPolicy();

  const handleRaiseQuerySuccess = () => {
    setShowRaiseQueryModal(false);
    setReloadKey((k) => k + 1);
  };

  const handleApprovePolicy = async () => {
    if (submitting) return;

    try {
      setSubmitting(true);

      const response = await updatePolicyStatus(id, {
        policyApprovalStatus: 'APPROVED',
      });

      if (response.data.success) {
        toast.success('Policy approved successfully!');
        setPolicy(response.data.data);
      }
    } catch (err) {
      console.error('Error approving policy:', err);
      const errorMsg = err.response?.data?.message || 'Failed to approve policy';
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectPolicy = async (rejectedReason) => {
    if (submitting) return;

    try {
      setSubmitting(true);

      const response = await updatePolicyStatus(id, {
        policyApprovalStatus: 'REJECTED',
        rejectedReason,
      });

      if (response.data.success) {
        toast.success('Policy rejected successfully!');
        setPolicy(response.data.data);
        setShowProcessModal(false);
      }
    } catch (err) {
      console.error('Error rejecting policy:', err);
      const errorMsg = err.response?.data?.message || 'Failed to reject policy';
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return <LoadingScreen message={authLoading ? 'Authenticating...' : 'Loading policy details...'} />;
  }

  if (error || !policy) {
    return (
      <div className={styles.maxWidth}>
        <div className={styles.errorContainer}>
          <h3 className={styles.errorTitle}>Error</h3>
          <p className={styles.errorText}>{error || 'Policy not found'}</p>
          <div className={styles.errorActions}>
            <button onClick={handleBackToPolicies} className={styles.primaryBtn}>
              Go Back to Policies
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
          <button onClick={handleBackToPolicies} className={styles.backButton}>
            <svg className={styles.backIcon} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back to Policies
          </button>
        </div>

        {/* Policy Details Card */}
        <div className={styles.detailsCard}>
          {/* Header */}
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>{policy.title}</h3>
          </div>

          {/* Details */}
          <div className={styles.cardContent}>
            <div className={styles.detailsGrid}>
              {/* Policy Information */}
              <div className={styles.detailsSection}>
                <h4 className={styles.sectionTitle}>Policy Information</h4>
                <div className={styles.infoGrid}>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Requester</dt>
                    <dd className={styles.infoValue}>{policy.requester?.name || 'Unknown'}</dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Email</dt>
                    <dd className={styles.infoValue}>{policy.requester?.email || 'N/A'}</dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Role</dt>
                    <dd className={styles.infoValue}>
                      {policy.requester?.role?.replace(/_/g, ' ') || 'N/A'}
                    </dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Created</dt>
                    <dd className={styles.infoValue}>
                      {new Date(policy.createdAt).toLocaleString('en-GB')}
                    </dd>
                  </div>
                </div>
              </div>

              {/* Policy Description & Cost */}
              <div className={styles.detailsSection}>
                <h4 className={styles.sectionTitle}>Description & Cost</h4>
                <div className={styles.infoGrid}>
                  <div className={styles.infoRowFull}>
                    <dt className={styles.infoLabel}>Description</dt>
                    <dd className={styles.infoValue}>{policy.description}</dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Cost</dt>
                    <dd className={styles.infoValue}>{policy.cost}</dd>
                  </div>
                </div>
              </div>

              <div className={styles.detailsSection}>
                <h4 className={styles.sectionTitle}>Status Information</h4>
                <div className={styles.infoGrid}>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Approval Status</dt>
                    <dd className={styles.infoValue}>
                      <span
                        className={`${styles.statusBadge} ${
                          policy.policyApprovalStatus === 'APPROVED'
                            ? styles.statusApproved
                            : policy.policyApprovalStatus === 'REJECTED'
                              ? styles.statusRejected
                              : styles.statusPending
                        }`}
                      >
                        {policy.policyApprovalStatus}
                      </span>
                    </dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Last Updated</dt>
                    <dd className={styles.infoValue}>
                      {new Date(policy.updatedAt).toLocaleString('en-GB')}
                    </dd>
                  </div>
                  {policy.rejectedReason && (
                    <div className={styles.infoRowFull}>
                      <dt className={styles.infoLabel}>Rejection Reason</dt>
                      <dd className={styles.rejectionReason}>{policy.rejectedReason}</dd>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Attachments Section */}
            {policy.attachments?.length > 0 && (
              <div className={styles.attachmentsSection}>
                <h4 className={styles.sectionTitle}>Attachments ({policy.attachments.length})</h4>
                <div className={styles.attachmentsList}>
                  {policy.attachments.map((attachment, index) => (
                    <div key={attachment.fileId || index} className={styles.attachmentItem}>
                      <span className={styles.attachmentName}>{attachment.filename}</span>
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

            {/* Action Buttons - Chairman only */}
            {(canProcessPolicy() || canRaiseQuery() || policy.queries?.length > 0) && (
              <div className={styles.actionButtons}>
                {canProcessPolicy() && (
                  <button
                    onClick={() => setShowProcessModal(true)}
                    className={styles.primaryBtn}
                    type="button"
                    disabled={submitting}
                  >
                    Process Policy
                  </button>
                )}

                {canRaiseQuery() && (
                  <button
                    onClick={() => setShowRaiseQueryModal(true)}
                    className={styles.raiseQueryBtn}
                    type="button"
                  >
                    Raise Query
                  </button>
                )}

                {policy.queries?.length > 0 && (
                  <button
                    onClick={() => setShowQueryHistoryModal(true)}
                    className={styles.queryHistoryBtn}
                    type="button"
                  >
                    Query History ({policy.queries.length})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Policy Workflow */}
        <PolicyWorkflow policy={policy} />

        <PolicyProcessModal
          isOpen={showProcessModal}
          onClose={() => setShowProcessModal(false)}
          onApprove={() => {
            setShowProcessModal(false);
            handleApprovePolicy();
          }}
          onReject={(reason) => handleRejectPolicy(reason)}
          loading={submitting}
        />

        <RaiseQueryModal
          policy={policy}
          isOpen={showRaiseQueryModal}
          onClose={() => setShowRaiseQueryModal(false)}
          onSuccess={handleRaiseQuerySuccess}
        />

        <QueryHistoryModal
          isOpen={showQueryHistoryModal}
          onClose={() => setShowQueryHistoryModal(false)}
          queries={policy.queries || []}
        />
      </div>

      <Toaster position="top-right" />
    </ErrorBoundary>
  );
}
