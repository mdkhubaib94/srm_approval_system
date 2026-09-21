import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getFlaggedById, updateFlagged } from '../../../api/flagged.api';
import { useAuth } from '../../../context/AuthContext';
import ProtectedRoute from '../../../common/ProtectedRoute';
import ApprovalWorkflow from '../../../components/ApprovalWorkflow';
import ActionHistory from '../../../components/ActionHistory';
import LoadingScreen from '../../../common/LoadingScreen';
import styles from './FlaggedDetails.module.css';

function FlaggedDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user: currentUser, loading: authLoading } = useAuth();
  const [flagged, setFlagged] = useState(null);
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forwarding, setForwarding] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // A missing :id can't happen through normal routing — it's a defensive
  // check — so it's derived here rather than pushed into state from the
  // effect below.
  const invalidId = !id;

  useEffect(() => {
    if (authLoading || invalidId) return;

    if (!currentUser) {
      navigate('/login');
      return;
    }

    const fetchFlaggedDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('Fetching flagged details for ID:', id);
        const response = await getFlaggedById(id);
        console.log('Flagged API response:', response.data);

        if (!response.data || !response.data.data) {
          throw new Error('Flagged record not found');
        }

        const flaggedData = response.data.data;
        setFlagged(flaggedData);
        setRequest(flaggedData.request);
      } catch (err) {
        console.error('Error fetching flagged details:', err);
        console.error('Error response:', err.response?.data);
        const errorMessage =
          err.response?.status === 404
            ? 'Flagged record not found'
            : err.response?.status === 403
              ? 'You do not have permission to view this flagged record'
              : err.response?.status === 401
                ? 'Please log in to view this record'
                : err.response?.data?.message || err.message || 'Failed to load flagged record';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };
    fetchFlaggedDetails();
  }, [id, invalidId, currentUser, authLoading, navigate]);

  const handleBackToFlagged = () => {
    navigate('/flagged');
  };

  const handleViewRequest = () => {
    if (request?.requestID) {
      navigate(`/requests/${request.requestID}`);
    }
  };

  const handleResolveAndForward = async () => {
    try {
      setForwarding(true);
      setError(null);
      setSuccessMessage(null);
      setShowConfirmModal(false); // Close modal

      console.log('Resolving flag and forwarding request:', id);
      const response = await updateFlagged(id);
      console.log('Forward response:', response.data);

      if (response.data.success) {
        setSuccessMessage(response.data.message || 'Flag resolved and request forwarded successfully!');

        // Update local state with new data
        if (response.data.data) {
          setFlagged(response.data.data.flagged);
          setRequest(response.data.data.request);
        }

        // Redirect to flagged list after 2 seconds
        setTimeout(() => {
          navigate('/flagged');
        }, 2000);
      }
    } catch (err) {
      console.error('Error resolving flag and forwarding:', err);
      console.error('Error response:', err.response?.data);
      const errorMessage =
        err.response?.status === 404
          ? 'Flagged record not found'
          : err.response?.status === 403
            ? 'You do not have permission to resolve this flag'
            : err.response?.status === 400
              ? err.response?.data?.message || 'Cannot forward this request'
              : err.response?.data?.message || err.message || 'Failed to resolve flag and forward request';
      setError(errorMessage);
    } finally {
      setForwarding(false);
    }
  };

  const getWorkingHoursStatus = (hours) => {
    if (hours > 10) return { label: 'Critical', color: '#dc2626' };
    if (hours > 8) return { label: 'Exceeded', color: '#d97706' };
    return { label: 'Normal', color: '#059669' };
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (authLoading || (loading && !invalidId)) {
    return <LoadingScreen message={authLoading ? 'Authenticating...' : 'Loading flagged details...'} />;
  }

  if (invalidId || error || !flagged || !request) {
    return (
      <div className={styles.maxWidth}>
        <div className={styles.errorContainer}>
          <h3 className={styles.errorTitle}>Error</h3>
          <p className={styles.errorText}>
            {invalidId ? 'Invalid flagged record ID' : error || 'Flagged record not found'}
          </p>
          <div className={styles.errorActions}>
            <button onClick={handleBackToFlagged} className={styles.primaryBtn}>
              Back to Flagged
            </button>
            <button onClick={() => navigate('/dashboard')} className={styles.secondaryBtn}>
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hoursStatus = getWorkingHoursStatus(request.workingHrsTaken || 0);

  return (
    <div className={styles.maxWidth}>
      {/* Back Button */}
      <div className={styles.backButtonContainer}>
        <button onClick={handleBackToFlagged} className={styles.backButton}>
          <svg className={styles.backIcon} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back to Flagged
        </button>
      </div>

      {/* Alert Banner */}
      <div className={styles.alertBanner}>
        <svg className={styles.alertIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <h3 className={styles.alertTitle}>Flag Detected</h3>
          <p className={styles.alertMessage}>
            This request has exceeded the 8-hour processing time limit and requires immediate attention.
          </p>
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className={styles.successBanner}>
          <svg className={styles.successIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className={styles.successTitle}>Success!</h3>
            <p className={styles.successMessage}>{successMessage}</p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className={styles.errorBanner}>
          <svg className={styles.errorIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className={styles.errorTitle}>Error</h3>
            <p className={styles.errorMessage}>{error}</p>
          </div>
        </div>
      )}

      {/* Flagged Details Card */}
      <div className={styles.detailsCard}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>
            <svg className={styles.flagIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
            Flagged Request Details
          </h3>
          <span className={`${styles.statusBadge} ${flagged.flagResolved ? styles.resolved : styles.unresolved}`}>
            {flagged.flagResolved ? 'Resolved' : 'Active'}
          </span>
        </div>

        <div className={styles.cardContent}>
          {/* Flag Information */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Flag Information</h4>
            <div className={styles.infoGrid}>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Flag Status</dt>
                <dd className={styles.infoValue}>
                  <span className={`${styles.badge} ${flagged.flagResolved ? styles.badgeSuccess : styles.badgeDanger}`}>
                    {flagged.flagResolved ? 'Resolved' : 'Active'}
                  </span>
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Flagged Date</dt>
                <dd className={styles.infoValue}>{formatDate(flagged.createdAt)}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Flagged At Stage</dt>
                <dd className={styles.infoValue}>
                  <span className={styles.stageBadge}>
                    {flagged.flaggedStage?.replace(/_/g, ' ') || 'Unknown'}
                  </span>
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Responsible User</dt>
                <dd className={styles.infoValue}>
                  {flagged.flaggedAt && Array.isArray(flagged.flaggedAt) && flagged.flaggedAt.length > 0 ? (
                    <div className={styles.responsibleUsersList}>
                      {flagged.flaggedAt.map((user, index) => (
                        <div key={user._id || index} className={styles.userChip}>
                          <svg className={styles.userIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <div className={styles.userInfo}>
                            <span className={styles.userName}>{user.name || 'Unknown'}</span>
                            <span className={styles.userEmail}>{user.email || 'N/A'}</span>
                            {user.role && (
                              <span className={styles.userRole}>{user.role.replace(/_/g, ' ')}</span>
                            )}
                          </div>
                        </div>
                      ))}

                    </div>
                  ) : (
                    <span>No users assigned</span>
                  )}
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Working Hours</dt>
                <dd className={styles.infoValue}>
                  <span style={{ color: hoursStatus.color, fontWeight: 700, fontSize: '1.125rem' }}>
                    {request.workingHrsTaken?.toFixed(2) || '0.00'}h
                  </span>
                  <span className={styles.badge} style={{ backgroundColor: hoursStatus.color + '20', color: hoursStatus.color, marginLeft: '0.5rem' }}>
                    {hoursStatus.label}
                  </span>
                </dd>
              </div>
            </div>
          </div>

          {/* Request Information */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Request Information</h4>
            <div className={styles.infoGrid}>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Request ID</dt>
                <dd className={styles.infoValue}>
                  <span className={styles.requestId}>{request.requestID}</span>
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Title</dt>
                <dd className={styles.infoValue}>{request.title}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Current Stage</dt>
                <dd className={styles.infoValue}>
                  <span className={styles.stageBadge}>
                    {request.stage?.replace(/_/g, ' ')}
                  </span>
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Status</dt>
                <dd className={styles.infoValue}>
                  <span className={styles.badge}>{request.status}</span>
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Requester</dt>
                <dd className={styles.infoValue}>
                  {request.requester?.name} ({request.requester?.employeeID})
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Institution</dt>
                <dd className={styles.infoValue}>{request.institution}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Department</dt>
                <dd className={styles.infoValue}>{request.department}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Cost Estimate</dt>
                <dd className={styles.infoValue} style={{ color: '#16a34a', fontWeight: 600 }}>
                  ₹{request.cost?.toLocaleString() || '0'}
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Stage Arrived At</dt>
                <dd className={styles.infoValue}>{formatDate(request.stageArrivedAt)}</dd>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className={styles.actionButtons}>
            <button onClick={handleViewRequest} className={styles.secondaryBtn}>
              View Full Request Details
            </button>
            {!flagged.flagResolved && (
              <button
                onClick={() => setShowConfirmModal(true)}
                className={styles.primaryBtn}
                disabled={forwarding}
              >
                {forwarding ? (
                  <>
                    <div className={styles.buttonSpinner}></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <svg className={styles.buttonIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Resolve Flag & Forward to Next Stage
                  </>
                )}
              </button>
            )}
          </div>
          {!flagged.flagResolved && (
            <div className={styles.actionNote}>
              <svg className={styles.noteIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>
                Clicking this button will mark the flag as resolved, forward the request to the next approval stage,
                and reset the working hours timer. This action cannot be undone.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Approval Workflow */}
      <ApprovalWorkflow request={request} />

      {/* Action History */}
      <ActionHistory request={request} />

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className={styles.modalOverlay} onClick={() => setShowConfirmModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalIconWrapper}>
                <svg className={styles.modalIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className={styles.modalTitle}>Resolve Flag & Forward Request</h3>
              <button
                className={styles.modalClose}
                onClick={() => setShowConfirmModal(false)}
                aria-label="Close"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className={styles.modalBody}>
              <p className={styles.modalDescription}>
                Are you sure you want to proceed with this action? This will:
              </p>

              <div className={styles.modalActions}>
                <div className={styles.actionItem}>
                  <svg className={styles.actionIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Mark this flag as <strong>RESOLVED</strong></span>
                </div>
                <div className={styles.actionItem}>
                  <svg className={styles.actionIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <span>Forward the request to the <strong>NEXT STAGE</strong></span>
                </div>
                <div className={styles.actionItem}>
                  <svg className={styles.actionIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Reset the working hours timer to <strong>0</strong></span>
                </div>
              </div>

              <div className={styles.modalWarning}>
                <svg className={styles.warningIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p>This action cannot be undone.</p>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.modalCancelBtn}
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                className={styles.modalConfirmBtn}
                onClick={handleResolveAndForward}
              >
                <svg className={styles.buttonIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Yes, Resolve & Forward
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProtectedFlaggedDetailPage() {
  return (
    <ProtectedRoute>
      <FlaggedDetailPage />
    </ProtectedRoute>
  );
}
