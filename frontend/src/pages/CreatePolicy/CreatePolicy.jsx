
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../common/ProtectedRoute";
import { createPolicy } from "../../api/policies.api";
import { useFormDraft } from "../../utils/useFormDraft";
import toast, { Toaster } from 'react-hot-toast';
import LoadingScreen from "../../common/LoadingScreen";
import CostEstimateInput from "../../components/CostEstimateInput";
import ConfirmModal from "../../common/ConfirmModal";
import styles from "./CreatePolicy.module.css";
import { appendStagedFiles } from "../../api/files.api";
import { getApiErrorMessage } from "../../utils/apiError";
export default function CreatePolicyPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const { user, loading } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    cost: "",
  });
  const [selectedFiles, setSelectedFiles] = useState([]);

  // ---- Draft persistence -------------------------------------------------
  // Keeps a half-filled policy in localStorage so navigating away or
  // refreshing does not discard it. PDF attachments cannot be serialised and
  // must be re-selected.
  const EMPTY_FORM = { title: "", description: "", cost: "" };
  const userId = user?.id || user?._id;
  const {
    restoredDraft,
    ready: draftReady,
    draftRestored,
    save: saveDraft,
    clear: clearDraft,
    dismissNotice: dismissDraftNotice,
  } = useFormDraft(userId ? `create-policy:${userId}` : null);

  const [draftApplied, setDraftApplied] = useState(false);

  // Apply the restored draft exactly once, as soon as it's ready. Adjusted
  // directly during render — guarded by draftApplied itself, which flips to
  // true the first time this runs — rather than in an effect, per React's
  // "adjusting state when a prop changes" pattern.
  if (!draftApplied && draftReady) {
    setDraftApplied(true);
    if (restoredDraft) {
      setFormData({ ...EMPTY_FORM, ...restoredDraft });
    }
  }

  useEffect(() => {
    if (!draftApplied) return;
    const isEmpty = !formData.title && !formData.description && !formData.cost;
    if (isEmpty) {
      clearDraft();
      return;
    }
    saveDraft(formData);
  }, [formData, draftApplied, saveDraft, clearDraft]);

  const discardDraft = () => {
    clearDraft();
    setFormData(EMPTY_FORM);
    setSelectedFiles([]);
  };
  // ------------------------------------------------------------------------

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (!files?.length) return;

    const validFiles = Array.from(files).filter(
      (f) => f.type === "application/pdf"
    );

    if (validFiles.length !== files.length) {
      setError("Only PDF documents are allowed.");
      return;
    }

    setError(null);
    setSelectedFiles((prev) => [...prev, ...validFiles]);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSubmitting) return;

    setError(null);

    // Validate required fields
    if (!formData.title.trim()) {
      setError("Policy title is required");
      return;
    }

    if (formData.title.trim().length < 5) {
      setError("Policy title must be at least 5 characters");
      return;
    }

    if (!formData.description.trim()) {
      setError("Policy description is required");
      return;
    }

    // All validations passed — ask the Head of Institution to confirm before creating.
    setShowConfirmModal(true);
  };

  const performSubmit = async () => {
    if (isSubmitting) return;

    setShowConfirmModal(false);
    setIsSubmitting(true);

    try {
      const submitData = new FormData();
      submitData.append("title", formData.title.trim());
      submitData.append("description", formData.description.trim());
      submitData.append("cost", formData.cost || "");

      // Documents are uploaded one per request first; the form carries only ids.
      await appendStagedFiles(submitData, selectedFiles);

      const response = await createPolicy(submitData);

      const result = response.data;

      if (result.success) {
        clearDraft();
        setRedirecting(true);
        navigate(`/policies/${result.data._id}`);
      }
    } catch (err) {
      console.error("Submission error:", err);
      const errMsg = getApiErrorMessage(err, "Failed to create policy");
      setError(errMsg);
      toast.error(errMsg);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  // Only HEAD_OF_INSTITUTION can create policies
  if (user?.role !== "HEAD_OF_INSTITUTION") {
    return (
      <ProtectedRoute>
        <div className={styles.container}>
          <div className={styles.errorBox}>
            <h2 className={styles.errorTitle}>Access Denied</h2>
            <p className={styles.errorText}>
              Only Head of Institution can create policies.
            </p>
            <button
              onClick={() => navigate("/policies")}
              className={styles.backBtn}
            >
              Go to Policies
            </button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <h1 className={styles.title}>Create New Policy</h1>
        <p className={styles.subtitle}>
          Submit a new policy for review and approval
        </p>

        {draftRestored && (
          <div className={styles.draftBanner}>
            <div>
              <p className={styles.draftBannerTitle}>Unsaved draft restored</p>
              <p className={styles.draftBannerText}>
                We brought back what you had filled in earlier. Please re-attach
                your PDF documents — files cannot be saved in a draft.
              </p>
            </div>
            <div className={styles.draftBannerActions}>
              <button
                type="button"
                onClick={dismissDraftNotice}
                className={styles.draftDismissBtn}
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={discardDraft}
                className={styles.draftDiscardBtn}
              >
                Discard draft
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className={styles.errorBox}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.gridLayout}>
            {/* Policy Title */}
            <div className={styles.colSpan2}>
              <label className={styles.label}>
                Policy Title<span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="Enter policy title (min 5 characters)"
                className={styles.input}
                required
              />
            </div>

            {/* Description */}
            <div className={styles.colSpan2}>
              <label className={styles.label}>Description<span className={styles.required}>*</span></label>
              <textarea name="description" value={formData.description} onChange={handleInputChange} rows={4} className={styles.input} required />
            </div>

            {/* Cost */}
            <div>
              <label className={styles.label}>Cost</label>
              <CostEstimateInput
                value={formData.cost}
                onChange={(newValue) =>
                  setFormData((prev) => ({ ...prev, cost: newValue }))
                }
              />
            </div>

            {/* Document Attachments */}
            <div className={styles.colSpan2}>
              <div className={styles.attachmentsHeader}>
                <label className={styles.label}>
                  Policy Documents (PDF)
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="application/pdf"
                  multiple
                  onChange={handleFileChange}
                  className={styles.hiddenInput}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={styles.addDocumentBtn}
                >
                  + Add Document
                </button>
              </div>

              <ul className={styles.attachmentsList}>
                {selectedFiles.map((file, i) => (
                  <li key={i} className={styles.attachmentsItem}>
                    <span className={styles.fileName}>{file.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(i)}
                      className={styles.removeBtn}
                    >
                      Remove
                    </button>
                  </li>
                ))}
                {selectedFiles.length === 0 && (
                  <li className={styles.emptyPlaceholder}>
                    No documents uploaded
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className={styles.buttonGroup}>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className={styles.cancelBtn}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={styles.submitBtn}
            >
              {isSubmitting ? "Creating..." : "Create Policy"}
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation before creating the policy */}
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={performSubmit}
        title="Create New Policy"
        message="Are you sure you want to create this policy? Once created, it will be submitted for review and approval."
        confirmLabel="Confirm & Create"
        cancelLabel="Cancel"
        loading={isSubmitting}
      />

      {/* Creating-policy loading overlay */}
      {(isSubmitting || redirecting) && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingBox}>
            <div className={styles.spinner} />
            <p className={styles.loadingText}>
              {redirecting ? 'Policy created! Redirecting...' : 'Creating Policy...'}
            </p>
            <p className={styles.loadingSubText}>
              {redirecting
                ? 'Taking you to your policy.'
                : 'Please wait, do not close or refresh this page.'}
            </p>
          </div>
        </div>
      )}

      <Toaster position="top-right" />
    </ProtectedRoute>
  );
}
