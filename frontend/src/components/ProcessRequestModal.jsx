
import { useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { processRequest } from '../api/requests.api';
import { appendStagedFiles } from '../api/files.api';
import { getApiErrorMessage } from '../utils/apiError';
import GeneralProcessingForm from './GeneralProcessingForm';
import RejectReasonModal from '../common/RejectReasonModal';
import SuccessModal from '../common/SuccessModal';
import styles from './ProcessRequestModal.module.css';

export default function ProcessRequestModal({ request, isOpen, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showAttachSuccess, setShowAttachSuccess] = useState(false);
  const [attachedCount, setAttachedCount] = useState(0);
  const [pendingResult, setPendingResult] = useState(null);

  const handleSubmit = async (formData) => {
    await submitRequest(formData);
  };

  const handleConfirmReject = async (reason, comments) => {
    const formData = {
      action: 'rejected',
      rejectedReason: reason,
      comments: comments || ''
    };
    setShowRejectModal(false);
    await submitRequest(formData);
  };

  const submitRequest = async (formData) => {
    try {
      setLoading(true);
      setError(null);

      // Prepare FormData for file upload support
      const submitData = new FormData();
      
      // Add all form fields
      submitData.append('action', formData.action);
      submitData.append('comments', formData.comments || '');
      
      if (formData.action === 'rejected') {
        submitData.append('rejectedReason', formData.rejectedReason);
      }

      // Role-specific fields - convert booleans to strings for FormData
      if (formData.SOPAvailable !== undefined) {
        submitData.append('SOPAvailable', String(formData.SOPAvailable));
      }
      if (formData.SOP !== undefined) {
        submitData.append('SOP', formData.SOP);
      }
      if (formData.sopId !== undefined) {
        // Empty string tells the backend to clear the linked SOP
        submitData.append('sopId', formData.sopId || '');
      }
      if (formData.budgetAvailable !== undefined) {
        submitData.append('budgetAvailable', String(formData.budgetAvailable));
      }
      if (formData.statusUpdate !== undefined) {
        submitData.append('statusUpdate', formData.statusUpdate);
      }

      // Handle attachments array from GeneralProcessingForm
      // Documents are uploaded one per request first, so the action itself
      // carries only ids and no body is large enough to hit a proxy limit (413).
      await appendStagedFiles(submitData, formData.attachments || []);

      const requestRef = request._id || request.requestID;
      const response = await processRequest(requestRef, submitData);

      if (response.data.success) {
        if (formData.attachments && formData.attachments.length > 0) {
          // Hold off handing control back to the parent until the user has
          // acknowledged the attachment — a toast alone is easy to miss.
          setAttachedCount(formData.attachments.length);
          setPendingResult(response.data.data);
          setShowAttachSuccess(true);
        } else {
          // Show toast notification based on action
          const actionMessages = {
            'forwarded': 'Request forwarded successfully!',
            'approved': 'Request approved successfully!',
            'rejected': 'Request rejected successfully!'
          };
          const message = actionMessages[formData.action] || 'Request processed successfully!';
          toast.success(message);

          // Close modal and update parent
          setTimeout(() => {
            onSuccess(response.data.data);
          }, 1000);
        }
      }
    } catch (err) {
      console.error('Error processing request:', err);
      const errorMsg = getApiErrorMessage(err, 'Failed to process request');
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleAttachSuccessClose = () => {
    setShowAttachSuccess(false);
    onSuccess(pendingResult);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.modalOverlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>Process Request</h2>
            <button
              className={styles.closeButton}
              onClick={onClose}
              type="button"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>

          {error && (
            <div className={styles.errorAlert}>
              <p className={styles.errorMessage}>{error}</p>
            </div>
          )}

          <div className={styles.modalContent}>
            <GeneralProcessingForm
              request={request}
              onSubmit={handleSubmit}
              onCancel={onClose}
              onRejectClick={() => setShowRejectModal(true)}
              loading={loading}
            />
          </div>
        </div>
      </div>

      <RejectReasonModal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onConfirm={handleConfirmReject}
        loading={loading}
      />

      <SuccessModal
        isOpen={showAttachSuccess}
        onClose={handleAttachSuccessClose}
        title="Document Attached"
        message={`${attachedCount} document${attachedCount > 1 ? 's' : ''} attached and request processed successfully.`}
        buttonLabel="OK"
      />

      <Toaster position="top-right" />
    </>
  );
}
