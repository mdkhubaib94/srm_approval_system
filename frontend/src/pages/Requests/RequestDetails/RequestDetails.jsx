

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getRequestById, routeRequest } from "../../../api/requests.api";
import { downloadFile } from "../../../api/files.api";
import { openInNewTab } from "../../../utils/safeOpen";
import {
  buildRequestAttachmentFilename,
  buildQueryAttachmentFilename,
} from "../../../utils/downloadNaming";
import { toast } from 'react-hot-toast';
import { useAuth } from "../../../context/AuthContext";
import { ErrorBoundary } from "../../../common/ErrorBoundary";
import ApprovalWorkflow from "../../../components/ApprovalWorkflow";
import ActionHistory from "../../../components/ActionHistory";
import ProcessRequestModal from "../../../components/ProcessRequestModal";
import BudgetVerificationModal from "../../../components/BudgetVerificationModal";
import RaiseQueryModal from "../../../components/RaiseQueryModal";
import QueryHistoryModal from "../../../components/QueryHistoryModal";
import LoadingScreen from "../../../common/LoadingScreen";
import RouteRequestModal from "../../../components/RouteRequestModal";
import SuccessModal from "../../../common/SuccessModal";
import styles from './RequestDetails.module.css';
import { formConfigs } from "../../../utils/formConfigs";
import { REQUEST_CATEGORY_LABELS, INDENT_CAPABLE_MODELS } from "../../../utils/types";
import { sameInstitution } from "../../../utils/institutionGroups";

// Helper to resolve nested object path values
const getNestedValue = (obj, path) => {
  if (!obj || !path) return null;
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

// Helper to render dynamic form field values beautifully
const renderFieldValue = (value, field) => {
  if (value === undefined || value === null || value === '') {
    return <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>—</span>;
  }

  if (field.type === 'boolean') {
    return (
      <span
        style={{
          display: 'inline-flex',
          padding: '0.125rem 0.5rem',
          borderRadius: '0.25rem',
          fontSize: '0.75rem',
          fontWeight: 600,
          backgroundColor: value ? '#dcfce7' : '#fee2e2',
          color: value ? '#15803d' : '#b91c1c'
        }}
      >
        {value ? 'Yes' : 'No'}
      </span>
    );
  }

  if (field.type === 'date') {
    try {
      return new Date(value).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return String(value);
    }
  }

  if (field.type === 'number') {
    const lowerName = field.name.toLowerCase();
    const isCurrency = lowerName.includes('cost') || 
                       lowerName.includes('fee') || 
                       lowerName.includes('spent') || 
                       lowerName.includes('provided') || 
                       lowerName.includes('balance') || 
                       lowerName.includes('expenditure') || 
                       lowerName.includes('receipts') ||
                       lowerName.includes('amount') || 
                       lowerName.includes('subsidy') ||
                       lowerName.includes('price') ||
                       lowerName.includes('variance');
                       
    if (isCurrency && typeof value === 'number') {
      return (
        <span style={{ fontWeight: 600 }}>
          ₹{value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </span>
      );
    }
    return typeof value === 'number' ? value.toLocaleString() : String(value);
  }

  return String(value);
};

export default function RequestDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user: currentUser, loading: authLoading } = useAuth();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showApprovalHistory, setShowApprovalHistory] = useState(true);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [showRaiseQueryModal, setShowRaiseQueryModal] = useState(false);
  const [showQueryHistoryModal, setShowQueryHistoryModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [showRouteSuccessModal, setShowRouteSuccessModal] = useState(false);
  const [routeChange, setRouteChange] = useState({ from: '', to: '' });

  // Bumped by handleRaiseQuerySuccess to re-run the effect below and refresh
  // request data, instead of holding an externally-callable fetch function.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // Wait for auth to load first
    if (authLoading) return;

    // If not authenticated after auth finishes loading, redirect to login
    if (!currentUser) {
      navigate('/login');
      return;
    }

    // Only fetch request after auth is loaded and user exists
    if (!id) return;

    const fetchRequest = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await getRequestById(id);

        if (!response.data) {
          throw new Error('Request not found');
        }

        setRequest(response.data);
      } catch (err) {
        console.error('Error fetching request:', err);
        const errorMessage =
          err.response?.status === 404
            ? 'Request not found'
            : err.response?.status === 403
              ? 'You do not have permission to view this request'
              : err.response?.status === 401
                ? 'Please log in to view this request'
                : err.message || 'Failed to load request';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };
    fetchRequest();
  }, [id, currentUser, authLoading, navigate, reloadKey]);

  const handleDownloadAttachment = async (fileId, filename) => {
    try {
      const response = await downloadFile(fileId);

      // Create blob URL from the response blob
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
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

      // Determine MIME type based on file extension
      const ext = filename.toLowerCase().split('.').pop();
      let mimeType = 'application/octet-stream';
      
      if (ext === 'pdf') mimeType = 'application/pdf';
      else if (ext === 'txt') mimeType = 'text/plain';
      else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
      else if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'doc' || ext === 'docx') mimeType = 'application/msword';
      
      // Create blob with proper MIME type
      const blob = new Blob([response.data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      openInNewTab(url);
      
      // Cleanup after a delay
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error('Error viewing file:', err);
      alert('Failed to view file');
    }
  };

  const handleBackToRequests = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/dashboard');
    }
  };

  const canProcessRequest = () => {
    if (!currentUser || !request) return false;

    // Don't allow processing if request is already rejected or approved
    if (request.status === 'REJECTED' || request.status === 'APPROVED') {
      return false;
    }

    const userRole = currentUser.role;
    const requestStage = request.stage;

    // For institution-scoped roles, also check institution match
    const INSTITUTION_SCOPED_STAGES = ['INSTITUTION_MANAGER', 'ACCOUNTANT', 'HEAD_OF_INSTITUTION'];
    if (INSTITUTION_SCOPED_STAGES.includes(userRole)) {
      return requestStage === userRole && sameInstitution(request.institution, currentUser.institution, userRole);
    }

    // All other roles map directly to a stage
    return requestStage === userRole;
  };

  const handleProcessRequestSuccess = (updatedRequest) => {
    // Update request data with the response
    setRequest(updatedRequest);
    setShowProcessModal(false);
  };

  const handleRaiseQuerySuccess = () => {
    // Close the modal
    setShowRaiseQueryModal(false);
    // Optionally refresh the request data
    setReloadKey((k) => k + 1);
  };

  const canRouteRequest = () => {
    if (!currentUser || !request) return false;
    return (
      currentUser.role === 'HEAD_OF_INSTITUTION' &&
      request.stage === 'HEAD_OF_INSTITUTION' &&
      request.status === 'PENDING' &&
      request.detailsModel === 'GeneralDetail' &&
      request.details?.generalCategory === 'Others'
    );
  };

  const handleRouteRequest = async (selectedCategory) => {
    if (!selectedCategory || routeLoading) return;

    try {
      setRouteLoading(true);
      const response = await routeRequest(id, selectedCategory);

      if (response.data.success) {
        const prevCategory = request.requestCategory;
        setRouteChange({
          from: REQUEST_CATEGORY_LABELS[prevCategory] || prevCategory || '—',
          to: REQUEST_CATEGORY_LABELS[selectedCategory] || selectedCategory,
        });
        setShowRouteModal(false);
        setRequest(response.data.data);
        setShowRouteSuccessModal(true);
      }
    } catch (err) {
      console.error('Error routing request:', err);
      const errorMsg = err.response?.data?.message || 'Failed to route request';
      toast.error(errorMsg);
    } finally {
      setRouteLoading(false);
    }
  };

  if (authLoading || loading) {
    return <LoadingScreen message={authLoading ? 'Authenticating...' : 'Loading request details...'} />;
  }

  if (error || !request) {
    return (
      <div className={styles.maxWidth}>
        <div className={styles.errorContainer}>
          <h3 className={styles.errorTitle}>Error</h3>
          <p className={styles.errorText}>{error || 'Request not found'}</p>
          <div className={styles.errorActions}>
            <button onClick={handleBackToRequests} className={styles.primaryBtn}>
              Go Back
            </button>
            <button onClick={() => navigate('/dashboard')} className={styles.secondaryBtn}>
              Go to Dashboard
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
          <button onClick={handleBackToRequests} className={styles.backButton}>
            <svg className={styles.backIcon} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back
          </button>
        </div>

        {/* Flagged Warning Banner */}
        {request.workingHrsTaken > 8 && (
          <div className={styles.flaggedBanner}>
            <svg className={styles.flaggedIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className={styles.flaggedContent}>
              <h3 className={styles.flaggedTitle}>⚠️ Request Flagged</h3>
              <p className={styles.flaggedMessage}>
                This request has been <strong>flagged</strong> due to exceeding the 8-hour processing time limit. 
                Current processing time: <span className={styles.flaggedHours}>{request.workingHrsTaken?.toFixed(2)} hours</span> at <strong>{request.stage?.replace(/_/g, ' ')}</strong>.
              </p>
              
            </div>
          </div>
        )}

        {/* Request Details Card */}
        <div className={styles.detailsCard}>
          {/* Header */}
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>{request.title}</h3>
            <p className={styles.cardDescription}>{request.description}</p>
          </div>

          {/* Details */}
          <div className={styles.cardContent}>
            <div className={styles.detailsGrid}>
              {/* Request Information */}
              <div className={styles.detailsSection}>
                <h4 className={styles.sectionTitle}>Request Information</h4>
                <div className={styles.infoGrid}>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>ID</dt>
                    <dd className={styles.infoValue}>{request.requestID}</dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Requester</dt>
                    <dd className={styles.infoValue}>{request.requester?.name || 'Unknown'}</dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Email</dt>
                    <dd className={styles.infoValue}>{request.requester?.email || 'N/A'}</dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Institution</dt>
                    <dd className={styles.infoValue}>{request.institution}</dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Department</dt>
                    <dd className={styles.infoValue}>
                      {request.department.replace(/^Department of\s*/i, '')}
                    </dd>
                  </div>
                </div>
              </div>

              {/* Status  Information */}
              <div className={styles.detailsSection}>
                <h4 className={styles.sectionTitle}>Status Information</h4>
                <div className={styles.infoGrid}>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Status</dt>
                    <dd className={styles.infoValue}>
                      <span className={styles.statusBadge}>{request.status}</span>
                    </dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Stage</dt>
                    <dd className={styles.infoValue}>{request.stage}</dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Category</dt>
                    <dd className={styles.infoValue}>
                      <span className={styles.categoryBadge}>
                        {REQUEST_CATEGORY_LABELS[request.requestCategory] ?? request.requestCategory ?? '—'}
                      </span>
                    </dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>Created</dt>
                    <dd className={styles.infoValue}>
                      {new Date(request.createdAt).toLocaleDateString('en-GB')}
                    </dd>
                  </div>
                </div>
              </div>

              {/* Management Information */}
              <div className={styles.detailsSection}>
                <h4 className={styles.sectionTitle}>Management Information</h4>
                <div className={styles.infoGrid}>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>SOP Available</dt>
                    <dd className={styles.infoValue}>
                      <span
                        className={styles.badge}
                        style={{
                          backgroundColor: request.SOPAvailable ? '#dcfce7' : '#fee2e2',
                          color: request.SOPAvailable ? '#166534' : '#991b1b'
                        }}
                      >
                        {request.SOPAvailable ? 'Yes' : 'No'}
                      </span>
                    </dd>
                  </div>
                  <div className={styles.infoRow}>
                    <dt className={styles.infoLabel}>SOP Reference</dt>
                    <dd className={styles.infoValue}>
                      {request.sopId?.referenceNumber || request.SOP || '—'}
                    </dd>
                  </div>
                  {request.sopId?.title && (
                    <div className={styles.infoRow}>
                      <dt className={styles.infoLabel}>Matched SOP</dt>
                      <dd className={styles.infoValue}>{request.sopId.title}</dd>
                    </div>
                  )}
                  {request.sopId?.attachments?.length > 0 && (
                    <div className={styles.infoRow}>
                      <dt className={styles.infoLabel}>SOP Document</dt>
                      <dd className={styles.infoValue}>
                        <button
                          onClick={() =>
                            handleViewAttachment(
                              request.sopId.attachments[0].fileId,
                              request.sopId.attachments[0].filename
                            )
                          }
                          className={styles.viewBtn}
                          type="button"
                          title="View the attached SOP document"
                        >
                          View SOP Document
                        </button>
                      </dd>
                    </div>
                  )}
                </div>
              </div>

              {/* Budget Details — Cost Estimate & Budget Available are visible to all
                  roles; allocation figures are hidden from Requester and Institution Manager */}
              {currentUser && (
                <div className={styles.detailsSection}>
                  <h4 className={styles.sectionTitle}>Budget Details</h4>
                  <div className={styles.infoGrid}>
                    <div className={styles.infoRow}>
                      <dt className={styles.infoLabel}>Cost Estimate</dt>
                      <dd className={styles.infoValue} style={{ color: '#16a34a', fontWeight: 600 }}>
                        ₹{request.cost ? request.cost.toLocaleString() : '0'}
                      </dd>
                    </div>
                    <div className={styles.infoRow}>
                      <dt className={styles.infoLabel}>Budget Available</dt>
                      <dd className={styles.infoValue}>
                        <span
                          className={styles.badge}
                          style={{
                            backgroundColor: request.budgetAvailable ? '#dcfce7' : '#fee2e2',
                            color: request.budgetAvailable ? '#166534' : '#991b1b'
                          }}
                        >
                          {request.budgetAvailable ? 'Yes' : 'No'}
                        </span>
                      </dd>
                    </div>
                    {!['REQUESTER', 'INSTITUTION_MANAGER'].includes(currentUser.role) && (
                    <>
                    <div className={styles.infoRow}>
                      <dt className={styles.infoLabel}>Budget Allocated</dt>
                      <dd className={styles.infoValue} style={{ color: '#2563eb', fontWeight: 600 }}>
                        {request.budgetAllocated 
                          ? `₹${Number(request.budgetAllocated).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '—'}
                      </dd>
                    </div>
                    <div className={styles.infoRow}>
                      <dt className={styles.infoLabel}>Budget Spent</dt>
                      <dd className={styles.infoValue} style={{ color: '#dc2626', fontWeight: 600 }}>
                        {request.budgetSpent 
                          ? `₹${Number(request.budgetSpent).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '—'}
                      </dd>
                    </div>
                    <div className={styles.infoRow}>
                      <dt className={styles.infoLabel}>Budget Remaining</dt>
                      <dd className={styles.infoValue} style={{ color: '#16a34a', fontWeight: 600 }}>
                        {request.budgetRemaining
                          ? `₹${Number(request.budgetRemaining).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '—'}
                      </dd>
                    </div>
                    </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Dynamic Request Details */}
            {request.detailsModel && request.details && formConfigs[request.detailsModel] && (
              <div className={styles.dynamicDetailsSection}>
                <h4 className={styles.dynamicSectionTitle}>
                  {request.detailsModel === 'ITPurchaseDetail' ? 'IT Purchase' : request.detailsModel.replace(/Detail$/, '').replace(/([A-Z])/g, ' $1').trim()} Form Details
                </h4>
                <div className={styles.dynamicInfoGrid}>
                  {formConfigs[request.detailsModel].map((field) => {
                    const value = getNestedValue(request.details, field.name);
                    const isLongText = field.type === 'textarea' || (typeof value === 'string' && value.length > 50);
                    return (
                      <div 
                        key={field.name} 
                        className={`${styles.dynamicInfoRow} ${isLongText ? styles.fullWidthRow : ''}`}
                      >
                        <div className={styles.dynamicInfoLabel}>{field.label}</div>
                        <div className={styles.dynamicInfoValue}>{renderFieldValue(value, field)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Attachments Section */}
            {request.attachments?.length > 0 && (
              <div className={styles.attachmentsSection}>
                <h4 className={styles.sectionTitle}>Attachments ({request.attachments.length})</h4>
                <div className={styles.attachmentsList}>
                  {request.attachments.map((attachment, index) => (
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
                          onClick={() =>
                            handleDownloadAttachment(
                              attachment.fileId,
                              buildRequestAttachmentFilename(request.requestID, index, attachment.filename)
                            )
                          }
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

            {/* Query Reply Attachments — documents attached when replying to a query on
                this request. Stored only on the Query document (see queryController.js
                updateQuery); the backend merges them into request.queryAttachments for
                display here rather than copying the file onto the request itself. */}
            {request.queryAttachments?.length > 0 && (
              <div className={styles.attachmentsSection}>
                <h4 className={styles.sectionTitle}>
                  Documents from Query Replies ({request.queryAttachments.length})
                </h4>
                <div className={styles.attachmentsList}>
                  {(() => {
                    // Numbered by position within each query's own attachments
                    // array (not this merged list) so a file downloads with the
                    // same name here as it does on that query's own page.
                    const seenPerQuery = {};
                    return request.queryAttachments.map((attachment, index) => {
                      const queryKey = String(attachment.queryId);
                      seenPerQuery[queryKey] = (seenPerQuery[queryKey] || 0) + 1;
                      const indexWithinQuery = seenPerQuery[queryKey] - 1;

                      return (
                        <div key={attachment.fileId || index} className={styles.attachmentItem}>
                          <div>
                            <span className={styles.attachmentName}>{attachment.filename}</span>
                            <div className={styles.attachmentMeta}>
                              Attached with reply from{' '}
                              <strong>{attachment.repliedBy?.name || 'Unknown'}</strong>
                              {attachment.repliedBy?.role ? ` (${attachment.repliedBy.role})` : ''}
                              {' — '}
                              <button
                                type="button"
                                className={styles.attachmentQueryLink}
                                onClick={() => navigate(`/queries/${attachment.queryId}`)}
                              >
                                view query
                              </button>
                            </div>
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
                              onClick={() =>
                                handleDownloadAttachment(
                                  attachment.fileId,
                                  buildQueryAttachmentFilename(request.requestID, indexWithinQuery, attachment.filename)
                                )
                              }
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
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* Route-first notice — OTHER request awaiting the HOI to assign a category */}
            {canRouteRequest() && request.requestCategory === 'OTHER' && (
              <div className={styles.routeNotice}>
                <svg className={styles.routeNoticeIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className={styles.routeNoticeText}>
                  This is an <strong>Other</strong> request. Use <strong>Route Request</strong> to assign it an
                  approval category before it can be forwarded.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className={styles.actionButtons}>
              {/* Materials Requirement now lives on its own spreadsheet-style page
                  rather than a modal — always reachable for an indent-capable
                  request type, even before the table has any rows, since the
                  current stage holder can add the first ones there. */}
              {INDENT_CAPABLE_MODELS.includes(request.detailsModel) && (
                <button
                  onClick={() => navigate(`/requests/${request.requestID}/materials`)}
                  className={styles.viewIndentBtn}
                  type="button"
                >
                  {request.details?.indentDetails?.length > 0
                    ? `Materials Requirement (${request.details.indentDetails.length})`
                    : 'Materials Requirement'}
                </button>
              )}

              {/* Route Request Button - HOI only */}
              {canRouteRequest() && (
                <button
                  onClick={() => setShowRouteModal(true)}
                  className={styles.routeBtn}
                  type="button"
                >
                  Route Request
                </button>
              )}

              {/* Process Request Button - Only show if user's role matches the request stage */}
              {canProcessRequest() && (
                <button
                  onClick={() => setShowProcessModal(true)}
                  className={styles.primaryBtn}
                  type="button"
                >
                  Process Request
                </button>
              )}
              
              {/* Raise Query Button - Show for all authenticated users */}
              {currentUser && canProcessRequest() && (
                <button
                  onClick={() => setShowRaiseQueryModal(true)}
                  className={styles.raiseQueryBtn}
                  type="button"
                >
                  Raise Query
                </button>
              )}

              {/* Query History Button - Only shown when queries actually exist on this request */}
              {request.queries?.length > 0 && (
                <button
                  onClick={() => setShowQueryHistoryModal(true)}
                  className={styles.queryHistoryBtn}
                  type="button"
                >
                  Query History ({request.queries.length})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Approval Workflow */}
        <ApprovalWorkflow request={request} />
        
        {/* Toggle History Button */}
        <div className={styles.historyToggleContainer}>
          <span className={styles.historyLabel}>
            {showApprovalHistory ? 'Hide' : 'Show'} History
          </span>
          <button
            onClick={() => setShowApprovalHistory(!showApprovalHistory)}
            className={styles.toggleSwitch}
            style={{
              backgroundColor: showApprovalHistory ? '#2563eb' : '#d1d5db'
            }}
            role="switch"
            aria-checked={showApprovalHistory}
            aria-label="Toggle approval history"
          >
            <span
              className={styles.toggleSwitchThumb}
              style={{
                transform: showApprovalHistory ? 'translateX(1.25rem)' : 'translateX(0.25rem)'
              }}
            />
          </button>
        </div>

        {/* Action History */}
        {showApprovalHistory && <ActionHistory request={request} />}

        {/* Process Request Modal - Different for ACCOUNTANT vs others */}
        {currentUser?.role === 'ACCOUNTANT' ? (
          <BudgetVerificationModal
            request={request}
            isOpen={showProcessModal}
            onClose={() => setShowProcessModal(false)}
            onSuccess={handleProcessRequestSuccess}
          />
        ) : (
          <ProcessRequestModal
            request={request}
            isOpen={showProcessModal}
            onClose={() => setShowProcessModal(false)}
            onSuccess={handleProcessRequestSuccess}
          />
        )}

        {/* Raise Query Modal */}
        <RaiseQueryModal
          request={request}
          isOpen={showRaiseQueryModal}
          onClose={() => setShowRaiseQueryModal(false)}
          onSuccess={handleRaiseQuerySuccess}
        />

        {/* Query History Modal */}
        <QueryHistoryModal
          isOpen={showQueryHistoryModal}
          onClose={() => setShowQueryHistoryModal(false)}
          queries={request.queries || []}
        />

        <RouteRequestModal
          isOpen={showRouteModal}
          onClose={() => setShowRouteModal(false)}
          onSubmit={handleRouteRequest}
          currentCategory={request.requestCategory}
          loading={routeLoading}
        />

        {/* Route Success Modal */}
        <SuccessModal
          isOpen={showRouteSuccessModal}
          onClose={() => setShowRouteSuccessModal(false)}
          title="Approval Category Changed"
          message={
            <>
              The approval category has been changed successfully.
              <br />
              <br />
              From: <strong>{routeChange.from}</strong>
              <br />
              To: <strong>{routeChange.to}</strong>
            </>
          }
        />

      </div>
    </ErrorBoundary>
  );
}