

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import InstitutionManagerForm from './InstitutionManagerForm';
import HeadOfInstitutionForm from './HeadOfInstitutionForm';
import ChairmanForm from './ChairmanForm';
import ReviewOnlyForm from './ReviewOnlyForm';
import styles from './ProcessRequestModal.module.css';

export default function GeneralProcessingForm({
  request,
  onSubmit,
  onCancel,
  onRejectClick,
  loading
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [formData, setFormData] = useState({
    // Role-specific fields
    SOPAvailable: request.SOPAvailable,
    SOP: request.SOP || '',
    budgetAvailable: request.budgetAvailable,
    // Only the Chairman's decision finalizes a request; sending APPROVED from
    // any other role makes the backend refuse an ordinary forward.
    ...(user?.role === 'CHAIRMAN' && { statusUpdate: 'APPROVED' })
  });

  const handleCommentsChange = (e) => {
    setComments(e.target.value);
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    setAttachments(prev => [...prev, ...files]);
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // An OTHER request must be routed to a real approval category by the HOI
  // before it can be forwarded (the backend rejects an un-routed forward).
  const mustRouteFirst =
    user?.role === 'HEAD_OF_INSTITUTION' &&
    request.stage === 'HEAD_OF_INSTITUTION' &&
    request.requestCategory === 'OTHER';

  const handleForward = (e) => {
    e.preventDefault();
    if (mustRouteFirst) return;
    const payload = {
      action: 'forwarded',
      comments,
      attachments,
      ...formData
    };
    onSubmit(payload);
  };

  const handleApprove = (e) => {
    e.preventDefault();
    const payload = {
      action: 'approved',
      comments,
      attachments,
      ...formData
    };
    onSubmit(payload);
  };

  const handleRoleSpecificChange = (updates) => {
    setFormData({ ...formData, ...updates });
  };

  const renderRoleSpecificForm = () => {
    switch (user?.role) {
      case 'INSTITUTION_MANAGER':
        return (
          <InstitutionManagerForm
            request={request}
            formData={formData}
            onChange={handleRoleSpecificChange}
          />
        );
      case 'HEAD_OF_INSTITUTION':
        return (
          <HeadOfInstitutionForm
            formData={formData}
            onChange={handleRoleSpecificChange}
          />
        );
      case 'CHAIRMAN':
        return (
          <ChairmanForm
            formData={formData}
            onChange={handleRoleSpecificChange}
          />
        );
      case 'ACCOUNTANT':
      case 'CHAIRMAN_OFFICE':
      case 'HR_HEAD':
      case 'MMA':
      case 'MANAGER_DATA_MANAGEMENT':
      case 'AUDIT':
      case 'GM_FINANCE':
      case 'DIRECTOR_ADMISSIONS':
      case 'DIRECTOR_RESEARCH':
      case 'DIRECTOR_ADMIN':
      case 'CHIEF_DIRECTOR':
        return (
          <ReviewOnlyForm
            role={user?.role}
          />
        );
      default:
        return null;
    }
  };

  return (
    <form className={styles.form}>
      {/* Comments Section - Universal for all roles */}
      <div className={styles.formSection}>
        <label className={styles.label}>Comments</label>
        <textarea
          className={styles.textarea}
          placeholder="Add any comments or notes about this request..."
          value={comments}
          onChange={handleCommentsChange}
          rows={4}
        />
      </div>

      {/* Document Attachments Section - Universal for all roles */}
      <div className={styles.formSection}>
        <label className={styles.label}>Attach Documents (Optional)</label>
        <div className={styles.uploadArea}>
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
            onChange={handleFileUpload}
            className={styles.fileInput}
            id="document-attachments"
          />
          <label htmlFor="document-attachments" className={styles.uploadLabel}>
            <svg className={styles.uploadIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className={styles.uploadText}>Click to upload or drag and drop</span>
            <span className={styles.uploadSubtext}>Attach PDF file</span>
          </label>
        </div>

        {/* Attachment List */}
        {attachments.length > 0 && (
          <div className={styles.attachmentsList}>
            <p className={styles.attachmentsTitle}>Selected Files ({attachments.length}):</p>
            {attachments.map((file, index) => (
              <div key={index} className={styles.attachmentItem}>
                <div className={styles.attachmentInfo}>
                  <svg className={styles.fileIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileSize}>({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className={styles.removeButton}
                  title="Remove file"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Role-Specific Form Component */}
      {renderRoleSpecificForm()}

      {/* Form Actions */}
      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </button>
        {user?.role === 'CHAIRMAN' ? (
          <>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.rejectButton}`}
              onClick={onRejectClick}
              disabled={loading}
            >
              ✕ Reject Request
            </button>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.approveButton}`}
              onClick={handleApprove}
              disabled={loading}
            >
              ✓ Approve Request
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.rejectButton}`}
              onClick={onRejectClick}
              disabled={loading}
            >
              ✕ Reject Request
            </button>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.forwardButton}`}
              onClick={handleForward}
              disabled={loading || mustRouteFirst}
              title={mustRouteFirst ? 'Route this request to an approval category first' : undefined}
            >
              → Forward Request
            </button>
          </>
        )}

      </div>

      {mustRouteFirst && (
        <p className={styles.routeFirstHint}>
          Close this dialog and use <strong>Route Request</strong> to assign an approval category
          before forwarding.
        </p>
      )}
    </form>
  );
}
