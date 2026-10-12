

import { useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { processRequest } from '../api/requests.api';
import CostEstimateInput from './CostEstimateInput';
import SuccessModal from '../common/SuccessModal';
import styles from './BudgetVerificationModal.module.css';

export default function BudgetVerificationModal({ request, isOpen, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAttachSuccess, setShowAttachSuccess] = useState(false);
  const [attachedCount, setAttachedCount] = useState(0);
  const [pendingResult, setPendingResult] = useState(null);
  const [formData, setFormData] = useState({
    budgetAllocated: '',
    budgetSpent: '',
    budgetRemaining: '',
    finalBudgetStatus: '',
    comments: '',
    attachments: []
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Auto-calculate budget remaining when allocated or spent changes
    if (field === 'budgetAllocated' || field === 'budgetSpent') {
      const allocated = field === 'budgetAllocated' ? (value || 0) : (formData.budgetAllocated || 0);
      const spent = field === 'budgetSpent' ? (value || 0) : (formData.budgetSpent || 0);
      const remaining = allocated - spent;
      
      setFormData(prev => ({
        ...prev,
        budgetRemaining: remaining >= 0 ? remaining : 0
      }));
    }
  };

  const formatIndianNumber = (num) => {
    if (!num && num !== 0) return '0.00';
    return Number(num).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const handleFileUpload = (files) => {
    setFormData(prev => ({
      ...prev,
      attachments: [...prev.attachments, ...Array.from(files)]
    }));
  };

  const removeAttachment = (index) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.finalBudgetStatus) {
      setError('Please select a final budget status');
      return;
    }

    if (!formData.budgetAllocated || !formData.budgetSpent) {
      setError('Please enter budget allocated and spent amounts');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Prepare FormData for file upload support
      const submitData = new FormData();
      
      // Add form fields
      submitData.append('action', 'forwarded');
      submitData.append('budgetAllocated', formData.budgetAllocated);
      submitData.append('budgetSpent', formData.budgetSpent);
      submitData.append('budgetRemaining', formData.budgetRemaining);
      submitData.append('budgetAvailable', formData.finalBudgetStatus === 'available' ? 'true' : 'false');
      submitData.append('comments', formData.comments || 'Budget verification completed');
      
      // Add file attachments
      formData.attachments.forEach((file) => {
        submitData.append('attachments', file);
      });

      // Submit to backend
      const response = await processRequest(request._id || request.requestID, submitData);

      if (response.data.success) {
        if (formData.attachments.length > 0) {
          // Hold off handing control back to the parent until the user has
          // acknowledged the attachment — a toast alone is easy to miss.
          setAttachedCount(formData.attachments.length);
          setPendingResult(response.data.data);
          setShowAttachSuccess(true);
        } else {
          toast.success('Budget verification completed successfully!');
          setTimeout(() => {
            onSuccess(response.data.data);
          }, 1000);
        }
      }
    } catch (err) {
      console.error('Error processing budget verification:', err);
      const errorMsg = err.response?.data?.message ||
        err.message ||
        'Failed to complete budget verification';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      budgetAllocated: '',
      budgetSpent: '',
      budgetRemaining: '',
      finalBudgetStatus: '',
      comments: '',
      attachments: []
    });
    setError(null);
    onClose();
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
          {/* Modal Header */}
          <div className={styles.modalHeader}>
            <div className={styles.headerContent}>
              <h2 className={styles.modalTitle}>Budget Verification</h2>
              <p className={styles.modalSubtitle}>Current status: budget_check</p>
            </div>
            <button
              className={styles.closeButton}
              onClick={onClose}
              type="button"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>

          {/* Request Info Section */}
          <div className={styles.requestInfo}>
            <h3 className={styles.requestTitle}>{request.title}</h3>
            <div className={styles.requestDetails}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Requester</span>
                <span className={styles.detailValue}>{request.requester?.name || 'Unknown'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Cost Estimate</span>
                <span className={styles.detailValue}>₹{request.cost?.toLocaleString() || '0'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Purpose</span>
                <span className={styles.detailValue}>{request.description || 'No description provided'}</span>
              </div>
            </div>
          </div>

          {error && (
            <div className={styles.errorAlert}>
              <p className={styles.errorMessage}>{error}</p>
            </div>
          )}

          {/* Budget Verification Form */}
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.budgetSection}>
              <h4 className={styles.sectionTitle}>Budget Verification</h4>
              
              <div className={styles.budgetGrid}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>
                    Budget Allocated <span className={styles.required}>*</span>
                  </label>
                  <CostEstimateInput
                    value={formData.budgetAllocated}
                    onChange={(value) => handleInputChange('budgetAllocated', value)}
                    error={null}
                    className={styles.costInput}
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.label}>
                    Budget Spent <span className={styles.required}>*</span>
                  </label>
                  <CostEstimateInput
                    value={formData.budgetSpent}
                    onChange={(value) => handleInputChange('budgetSpent', value)}
                    error={null}
                    className={styles.costInput}
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.label}>Budget Remaining (Auto-calculated)</label>
                  <div className={styles.currencyInput}>
                    <span className={styles.currencySymbol}>₹</span>
                    <input
                      type="text"
                      value={formatIndianNumber(formData.budgetRemaining)}
                      readOnly
                      className={`${styles.input} ${styles.readOnly}`}
                      placeholder="Auto-calculated"
                    />
                    <span className={styles.currencyCode}>INR</span>
                  </div>
                  <p className={styles.helpText}>Automatically calculated as: Budget Allocated - Budget Spent</p>
                </div>
              </div>

              {/* Final Budget Status */}
              <div className={styles.statusSection}>
                <h5 className={styles.statusTitle}>Final Budget Status</h5>
                <div className={styles.radioGroup}>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="budgetStatus"
                      value="available"
                      checked={formData.finalBudgetStatus === 'available'}
                      onChange={(e) => handleInputChange('finalBudgetStatus', e.target.value)}
                      className={styles.radio}
                    />
                    <span className={styles.radioText}>Budget Available</span>
                  </label>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="budgetStatus"
                      value="not_available"
                      checked={formData.finalBudgetStatus === 'not_available'}
                      onChange={(e) => handleInputChange('finalBudgetStatus', e.target.value)}
                      className={styles.radio}
                    />
                    <span className={styles.radioText}>Budget Not Available</span>
                  </label>
                </div>
                <p className={styles.helpText}>Select the final budget status based on your verification.</p>
              </div>
            </div>

            {/* Document Attachments */}
            <div className={styles.attachmentsSection}>
              <h4 className={styles.sectionTitle}>Document Attachments</h4>
              
              <div className={styles.uploadArea}>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className={styles.fileInput}
                  id="budget-files"
                />
                <div className={styles.uploadButtons}>
                  <label htmlFor="budget-files" className={styles.uploadBtn}>
                    Upload File
                  </label>
                 
                </div>
                <div className={styles.fileInfo}>
                  <p className={styles.fileTypes}>Supported file types:</p>
                  <p className={styles.fileTypes}>Documents: PDF only</p>
                  <p className={styles.fileTypes}>PDF files only</p>
                </div>
              </div>

              {/* Attachment List */}
              {formData.attachments.length > 0 && (
                <div className={styles.attachmentsList}>
                  {formData.attachments.map((file, index) => (
                    <div key={index} className={styles.attachmentItem}>
                      <span className={styles.fileName}>{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        className={styles.removeBtn}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Section */}
            <div className={styles.actionSection}>
              <div className={styles.actionCard}>
                <div className={styles.actionIcon}>✓</div>
                <div className={styles.actionContent}>
                  <h5 className={styles.actionTitle}>Complete Budget Verification</h5>
                  <p className={styles.actionDesc}>Complete budget verification and forward to next step</p>
                </div>
              </div>
            </div>

            {/* Comments */}
            <div className={styles.commentsSection}>
              <h4 className={styles.sectionTitle}>Comments (Optional)</h4>
              <textarea
                value={formData.comments}
                onChange={(e) => handleInputChange('comments', e.target.value)}
                placeholder="Add any comments about the budget verification... (Optional)"
                className={styles.textarea}
                rows="4"
              />
              <p className={styles.helpText}>Comments are optional. You can leave this blank if no additional notes are needed.</p>
            </div>

            {/* Form Actions */}
            <div className={styles.formActions}>
              <button
                type="button"
                onClick={handleCancel}
                className={styles.cancelBtn}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={loading || !formData.finalBudgetStatus || !formData.budgetAllocated || !formData.budgetSpent}
              >
                {loading ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </form>
        </div>
      </div>
      
      <SuccessModal
        isOpen={showAttachSuccess}
        onClose={handleAttachSuccessClose}
        title="Document Attached"
        message={`${attachedCount} document${attachedCount > 1 ? 's' : ''} attached and budget verification completed successfully.`}
        buttonLabel="OK"
      />

      <Toaster position="top-right" />
    </>
  );
}