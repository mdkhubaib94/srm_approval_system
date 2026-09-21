
import { useState } from 'react';
import toast from 'react-hot-toast';
import { updateSop } from '../api/sops.api';
import styles from './SopDetailModal.module.css';

export default function SopDetailModal({
  sop,
  isOpen,
  onClose,
  canManage,
  onUpdated,
  onViewDocument,
  viewingFileId,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reset local form state whenever a different SOP is opened. Adjusted
  // directly during render (guarded by comparing against the last-seen sop)
  // rather than in an effect, per React's "adjusting state when a prop
  // changes" pattern.
  const [prevSop, setPrevSop] = useState(sop);
  if (sop !== prevSop) {
    setPrevSop(sop);
    if (sop) {
      setReferenceNumber(sop.referenceNumber || '');
      setTitle(sop.title || '');
      setDescription(sop.description || '');
      setIsEditing(false);
      setError(null);
    }
  }

  if (!isOpen || !sop) return null;

  const handleClose = () => {
    if (saving) return;
    setIsEditing(false);
    setError(null);
    onClose();
  };

  const handleEdit = () => setIsEditing(true);

  const handleCancelEdit = () => {
    setReferenceNumber(sop.referenceNumber || '');
    setTitle(sop.title || '');
    setDescription(sop.description || '');
    setError(null);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!referenceNumber.trim() || !title.trim() || !description.trim()) {
      setError('Reference number, title, and description are all required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const response = await updateSop(sop._id, {
        referenceNumber: referenceNumber.trim(),
        title: title.trim(),
        description: description.trim(),
      });

      if (response.data.success) {
        toast.success('SOP updated successfully');
        onUpdated?.(response.data.data);
        setIsEditing(false);
      }
    } catch (err) {
      console.error('Error updating SOP:', err);
      const errorMsg = err.response?.data?.message || err.message || 'Failed to update SOP';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const attachment = sop.attachments?.[0];

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{isEditing ? 'Edit SOP' : 'SOP Details'}</h2>
          <button
            className={styles.closeButton}
            onClick={handleClose}
            type="button"
            aria-label="Close modal"
            disabled={saving}
          >
            ✕
          </button>
        </div>

        {error && (
          <div className={styles.errorAlert}>
            <p className={styles.errorMessage}>{error}</p>
          </div>
        )}

        <div className={styles.form}>
          <div className={styles.formSection}>
            <label className={styles.label}>
              Reference No. {isEditing && <span className={styles.required}>*</span>}
            </label>
            {isEditing ? (
              <input
                type="text"
                className={styles.input}
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                disabled={saving}
                required
              />
            ) : (
              <p className={styles.readValue}>{sop.referenceNumber}</p>
            )}
          </div>

          <div className={styles.formSection}>
            <label className={styles.label}>
              Title {isEditing && <span className={styles.required}>*</span>}
            </label>
            {isEditing ? (
              <input
                type="text"
                className={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={saving}
                required
              />
            ) : (
              <p className={styles.readValue}>{sop.title}</p>
            )}
          </div>

          <div className={styles.formSection}>
            <label className={styles.label}>
              Description {isEditing && <span className={styles.required}>*</span>}
            </label>
            {isEditing ? (
              <textarea
                className={styles.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                disabled={saving}
                required
              />
            ) : (
              <p className={styles.readValue}>{sop.description}</p>
            )}
          </div>

          <div className={styles.formSection}>
            <label className={styles.label}>Added On</label>
            <p className={styles.readValue}>
              {sop.createdAt ? new Date(sop.createdAt).toLocaleDateString('en-GB') : '—'}
            </p>
          </div>

          <div className={styles.formSection}>
            <label className={styles.label}>Document</label>
            {attachment ? (
              <button
                type="button"
                onClick={() => onViewDocument?.(attachment)}
                className={styles.viewBtn}
                disabled={viewingFileId === attachment.fileId}
              >
                {viewingFileId === attachment.fileId ? 'Opening...' : 'View SOP Document'}
              </button>
            ) : (
              <p className={styles.readValue}>No document attached</p>
            )}
          </div>

          <div className={styles.formActions}>
            {isEditing ? (
              <>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.saveButton}
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button type="button" className={styles.cancelButton} onClick={handleClose}>
                  Close
                </button>
                {canManage && (
                  <button type="button" className={styles.editButton} onClick={handleEdit}>
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
