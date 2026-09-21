
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../common/ProtectedRoute";
import { createSop } from "../../api/sops.api";
import { openInNewTab } from "../../utils/safeOpen";
import { useFormDraft } from "../../utils/useFormDraft";
import toast, { Toaster } from 'react-hot-toast';
import LoadingScreen from "../../common/LoadingScreen";
import ConfirmModal from "../../common/ConfirmModal";
import styles from "./CreateSop.module.css";
export default function CreateSopPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const { user, loading } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [formData, setFormData] = useState({
    referenceNumber: "",
    title: "",
    description: "",
  });
  const [selectedFiles, setSelectedFiles] = useState([]);

  // ---- Draft persistence -------------------------------------------------
  // Keeps a half-filled SOP in localStorage so navigating away or refreshing
  // does not discard it. The PDF cannot be serialised and must be re-attached.
  const EMPTY_FORM = { referenceNumber: "", title: "", description: "" };
  const userId = user?.id || user?._id;
  const {
    restoredDraft,
    ready: draftReady,
    draftRestored,
    save: saveDraft,
    clear: clearDraft,
    dismissNotice: dismissDraftNotice,
  } = useFormDraft(userId ? `create-sop:${userId}` : null);

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
    const isEmpty =
      !formData.referenceNumber && !formData.title && !formData.description;
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

  // Preview the attached PDF in a new tab before submitting
  const handleViewFile = (file) => {
    const url = URL.createObjectURL(file);
    openInNewTab(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSubmitting) return;

    setError(null);

    if (!formData.referenceNumber.trim()) {
      setError("SOP reference number is required");
      return;
    }

    if (!formData.title.trim()) {
      setError("SOP title is required");
      return;
    }

    if (formData.title.trim().length < 5) {
      setError("SOP title must be at least 5 characters");
      return;
    }

    if (!formData.description.trim()) {
      setError("SOP description is required");
      return;
    }

    if (selectedFiles.length === 0) {
      setError("Please attach the SOP document (PDF)");
      return;
    }

    setShowConfirmModal(true);
  };

  const performSubmit = async () => {
    if (isSubmitting) return;

    setShowConfirmModal(false);
    setIsSubmitting(true);

    try {
      const submitData = new FormData();
      submitData.append("referenceNumber", formData.referenceNumber.trim());
      submitData.append("title", formData.title.trim());
      submitData.append("description", formData.description.trim());

      selectedFiles.forEach((file) => {
        submitData.append("attachments", file);
      });

      const response = await createSop(submitData);

      const result = response.data;

      if (result.success) {
        clearDraft();
        toast.success("SOP created successfully");
        setRedirecting(true);
        navigate("/sops");
      }
    } catch (err) {
      console.error("Submission error:", err);
      const errMsg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        "Failed to create SOP";
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

  // Only CHAIRMAN_OFFICE can create SOPs
  if (user?.role !== "CHAIRMAN_OFFICE") {
    return (
      <ProtectedRoute>
        <div className={styles.container}>
          <div className={styles.errorBox}>
            <h2 className={styles.errorTitle}>Access Denied</h2>
            <p className={styles.errorText}>
              Only the Chairman Office can create SOPs.
            </p>
            <button
              onClick={() => navigate("/sops")}
              className={styles.backBtn}
            >
              Go to SOPs
            </button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <h1 className={styles.title}>Create New SOP</h1>
        <p className={styles.subtitle}>
          Add a Standard Operating Procedure with its reference document.
          The description is used by the AI search to match SOPs to requests,
          so make it detailed and specific.
        </p>

        {draftRestored && (
          <div className={styles.draftBanner}>
            <div>
              <p className={styles.draftBannerTitle}>Unsaved draft restored</p>
              <p className={styles.draftBannerText}>
                We brought back what you had filled in earlier. Please re-attach
                the SOP document — files cannot be saved in a draft.
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
            {/* SOP Reference Number */}
            <div className={styles.colSpan2}>
              <label className={styles.label}>
                SOP Reference Number<span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                name="referenceNumber"
                value={formData.referenceNumber}
                onChange={handleInputChange}
                placeholder="e.g. MO/SOP/2026/014"
                className={styles.input}
                required
              />
            </div>

            {/* SOP Title */}
            <div className={styles.colSpan2}>
              <label className={styles.label}>
                SOP Title<span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="Enter SOP title (min 5 characters)"
                className={styles.input}
                required
              />
            </div>

            {/* Description */}
            <div className={styles.colSpan2}>
              <label className={styles.label}>
                Description<span className={styles.required}>*</span>
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={5}
                placeholder="Describe what this SOP covers — scope, applicable scenarios, and key procedures. This text powers the AI semantic matching."
                className={styles.input}
                required
              />
            </div>

            {/* Document Attachment */}
            <div className={styles.colSpan2}>
              <div className={styles.attachmentsHeader}>
                <label className={styles.label}>
                  SOP Document (PDF)<span className={styles.required}>*</span>
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className={styles.hiddenInput}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={styles.addDocumentBtn}
                >
                  + Attach Document
                </button>
              </div>

              <ul className={styles.attachmentsList}>
                {selectedFiles.map((file, i) => (
                  <li key={i} className={styles.attachmentsItem}>
                    <span className={styles.fileName}>{file.name}</span>
                    <div className={styles.fileActions}>
                      <button
                        type="button"
                        onClick={() => handleViewFile(file)}
                        className={styles.viewFileBtn}
                        title="Preview this document in a new tab"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(i)}
                        className={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
                {selectedFiles.length === 0 && (
                  <li className={styles.emptyPlaceholder}>
                    No document attached
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
              {isSubmitting ? "Creating..." : "Create SOP"}
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation before creating the SOP */}
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={performSubmit}
        title="Create New SOP"
        message="Are you sure you want to create this SOP? It will become visible to requesters and institution managers, and available for AI matching on new requests."
        confirmLabel="Confirm & Create"
        cancelLabel="Cancel"
        loading={isSubmitting}
      />

      {/* Creating-SOP loading overlay */}
      {(isSubmitting || redirecting) && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingBox}>
            <div className={styles.spinner} />
            <p className={styles.loadingText}>
              {redirecting ? 'SOP created! Redirecting...' : 'Creating SOP...'}
            </p>
            <p className={styles.loadingSubText}>
              {redirecting
                ? 'Taking you to the SOP list.'
                : 'Generating AI embedding — please wait, do not close this page.'}
            </p>
          </div>
        </div>
      )}

      <Toaster position="top-right" />
    </ProtectedRoute>
  );
}
