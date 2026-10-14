
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createRequest } from "../../api/requests.api";
import { appendStagedFiles } from "../../api/files.api";
import { openInNewTab } from "../../utils/safeOpen";
import { getApiErrorMessage } from "../../utils/apiError";
import { REQUEST_CATEGORY_LABELS, DETAILS_MODEL_DEFAULT_CATEGORY, GENERAL_CATEGORY_DEFAULT_CATEGORY, INDENT_CAPABLE_MODELS } from "../../utils/types";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../common/ProtectedRoute";
import InstitutionSelect from "../../common/InstitutionSelect";
import NestedSelect from "../../common/NestedSelect";
import LoadingScreen from "../../common/LoadingScreen";
import CostEstimateInput from "../../components/CostEstimateInput";
import IndentInformation from "../../components/IndentInformation";
import ConfirmModal from "../../common/ConfirmModal";
import SopAiSearch from "../../components/SopAiSearch";
import { useFormDraft } from "../../utils/useFormDraft";
import {
  SPREADSHEET_ACCEPT,
  isSpreadsheetFile,
  spreadsheetToPdfFile,
} from "../../utils/xlsxToPdf";
import { downloadMaterialsTemplate } from "../../utils/loadXlsx";
import styles from "./CreateRequest.module.css";
import { formConfigs } from "../../utils/formConfigs";
import {
  DENTAL_DEPARTMENTS,
  ENGINEERING_DEPARTMENTS,
  FSH_DEPARTMENTS,
  EEC_DEPARTMENTS,
  MANAGEMENT_DEPARTMENTS,
  SEAD_DEPARTMENTS,
  SRM_NIGHTINGALE_SCHOOL_DEPARTMENTS,
  OTHER_DEPARTMENTS,
} from "../../utils/constants";

// Everything is stored and served as a PDF (see utils/xlsxToPdf.js), so a
// spreadsheet is converted here, at attach time, and the PDF is what gets
// uploaded, viewed and downloaded.
const FILE_ACCEPT = `application/pdf,${SPREADSHEET_ACCEPT}`;

// Mirrors MAX_FILES_PER_REQUEST in backend/app/files/validation.py.
const MAX_ATTACHMENTS = 20;

const CreateRequestSchema = z.object({
  title: z
    .string()
    .min(5, { message: "Title must be at least 5 characters" })
    .trim(),
  purpose: z
    .string()
    .min(10, { message: "Purpose must be at least 10 characters" })
    .trim(),
  costEstimate: z
    .number()
    .nonnegative({ message: "Cost estimate cannot be negative" })
    .optional(),
  college: z.string().min(1, { message: "Institution is required" }),
  department: z.string().min(1, { message: "Department is required" }),
  detailsModel: z.string().min(1, { message: "Request Type is required" }),
  attachments: z
    .array(z.any())
    .min(1, { message: "At least one document is required" })
    .max(MAX_ATTACHMENTS, {
      message: `You can attach at most ${MAX_ATTACHMENTS} documents per request. Please remove some documents.`,
    }),
}).passthrough();

// True when the user has actually typed/selected something worth keeping
const hasDraftContent = (value) => {
  if (value == null || value === "" || value === false) return false;
  if (Array.isArray(value)) return value.some(hasDraftContent);
  if (typeof value === "object") return Object.values(value).some(hasDraftContent);
  return true;
};

const formatRequestTypeLabel = (key) =>
  key
    .replace(/Detail$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^Mou$/, "MoU")
    .replace(/^ITPurchase$/, "IT Purchase")
    .replace(/^Unexpected Expense$/, "Non Budgeted and Unexpected Expenses");

const removeNumberArrows = `
  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type="number"] {
    -moz-appearance: textfield;
  }
`;

export default function CreateRequestPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const { user, loading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // Entries are { file, convertedFrom }: `file` is always a PDF; `convertedFrom`
  // holds the original spreadsheet's name when it was converted on attach.
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [convertingFiles, setConvertingFiles] = useState([]);
  const [indentRows, setIndentRows] = useState([]);
  const [showIndentModal, setShowIndentModal] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingData, setPendingData] = useState(null);
  const [matchedSop, setMatchedSop] = useState(null); // SOP attached via AI search / manual pick

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors },
    trigger,
    reset,
    getValues,
    setError: setFieldError,
  } = useForm({
    resolver: zodResolver(CreateRequestSchema),
    mode: "onBlur",
    reValidateMode: "onBlur",
    shouldFocusError: false,
    defaultValues: {
      attachments: [],
      costEstimate: undefined,
      college: "",
      department: "",
      detailsModel: "",
      requestCategory: "",
      sopReference: "",
    },
  });

  const college = watch("college");
  const detailsModel = watch("detailsModel");
  const generalCategory = watch("generalCategory");
  const requestCategory = watch("requestCategory");
  const availableInOtherDept = watch("crossDepartmentAvailability.availableInOtherDept");
  const durationDays = watch("durationDays");
  const isMultiDaySeminar = detailsModel === "SeminarHostingDetail" && Number(durationDays) > 1;
  const dynamicFields = formConfigs[detailsModel] || [];

  // ---- Draft persistence -------------------------------------------------
  // Keeps a half-filled form in localStorage so navigating away or refreshing
  // does not discard everything the requester has typed. Attachments are File
  // objects and cannot be serialised, so they must be re-selected.
  const userId = user?.id || user?._id;
  const {
    restoredDraft,
    ready: draftReady,
    draftRestored,
    save: saveDraft,
    clear: clearDraft,
    dismissNotice: dismissDraftNotice,
  } = useFormDraft(userId ? `create-request:${userId}` : null);

  const [draftApplied, setDraftApplied] = useState(false);
  // Set while restoring so the "request type changed" effect below does not
  // wipe the indent rows we are putting back.
  const skipIndentResetRef = useRef(false);
  const indentRowsRef = useRef(indentRows);
  indentRowsRef.current = indentRows;
  const matchedSopRef = useRef(matchedSop);
  matchedSopRef.current = matchedSop;

  useEffect(() => {
    if (draftApplied || !draftReady) return;
    if (restoredDraft?.values) {
      if (restoredDraft.indentRows?.length) skipIndentResetRef.current = true;
      reset({ ...restoredDraft.values, attachments: [] });
      if (restoredDraft.indentRows?.length) setIndentRows(restoredDraft.indentRows);
      if (restoredDraft.matchedSop) setMatchedSop(restoredDraft.matchedSop);
    }
    setDraftApplied(true);
  }, [restoredDraft, draftReady, draftApplied, reset]);

  const persistDraft = useCallback(() => {
    const { attachments, ...values } = getValues();
    const rows = indentRowsRef.current;
    const sop = matchedSopRef.current;
    // Never store an empty draft — it would show a pointless "draft restored"
    // notice on the next visit.
    if (!hasDraftContent(values) && !rows?.length && !sop) {
      clearDraft();
      return;
    }
    saveDraft({ values, indentRows: rows, matchedSop: sop });
  }, [getValues, saveDraft, clearDraft]);

  // Save whenever a form field changes
  useEffect(() => {
    if (!draftApplied) return;
    const subscription = watch(() => persistDraft());
    return () => subscription.unsubscribe();
  }, [watch, draftApplied, persistDraft]);

  // Save whenever state held outside react-hook-form changes
  useEffect(() => {
    if (!draftApplied) return;
    persistDraft();
  }, [indentRows, matchedSop, draftApplied, persistDraft]);

  const discardDraft = () => {
    clearDraft();
    reset({
      attachments: [],
      costEstimate: undefined,
      college: "",
      department: "",
      detailsModel: "",
      requestCategory: "",
      sopReference: "",
    });
    setIndentRows([]);
    setMatchedSop(null);
    setSelectedFiles([]);
  };
  // ------------------------------------------------------------------------

  // Clear indent rows when the request type changes
  useEffect(() => {
    if (skipIndentResetRef.current) {
      skipIndentResetRef.current = false;
      return;
    }
    setIndentRows([]);
  }, [detailsModel]);

  // Auto-populate requestCategory when the user picks a detailsModel
  useEffect(() => {
    if (!detailsModel) return;
    // GeneralDetail: category is driven by generalCategory, not detailsModel
    if (detailsModel === "GeneralDetail") {
      setValue("requestCategory", "", { shouldValidate: false });
      return;
    }
    const suggested = DETAILS_MODEL_DEFAULT_CATEGORY[detailsModel];
    if (suggested) {
      setValue("requestCategory", suggested, { shouldValidate: true });
    }
  }, [detailsModel, setValue]);

  // For GeneralDetail: auto-populate requestCategory based on the selected generalCategory
  useEffect(() => {
    if (detailsModel !== "GeneralDetail" || !generalCategory) return;
    const suggested = GENERAL_CATEGORY_DEFAULT_CATEGORY[generalCategory];
    if (suggested) {
      setValue("requestCategory", suggested, { shouldValidate: true });
    }
  }, [generalCategory, detailsModel, setValue]);

  // Filter department options based on college
  let departmentOptions = ENGINEERING_DEPARTMENTS;
  if (college === "DENTAL") {
    departmentOptions = DENTAL_DEPARTMENTS;
  } else if (college?.includes("FSH")) {
    departmentOptions = FSH_DEPARTMENTS;
  } else if (college?.includes("Management")) {
    departmentOptions = MANAGEMENT_DEPARTMENTS;
  } else if (college?.includes("SEAD")) {
    departmentOptions = SEAD_DEPARTMENTS;
  } else if (college === "EEC") {
    departmentOptions = EEC_DEPARTMENTS;
  } else if (college === "SRM Nightingale School") {
    departmentOptions = SRM_NIGHTINGALE_SCHOOL_DEPARTMENTS;
  } else if (college === "Others") {
    departmentOptions = OTHER_DEPARTMENTS;
  } else if (college?.includes("E&T")) {
    departmentOptions = ENGINEERING_DEPARTMENTS;
  }


  // Log form validation errors for debugging
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      console.log("Form errors updated:", errors);
    }
  }, [errors]);

  const onSubmit = async (data) => {
    if (isSubmitting) {
      console.log("[DEBUG] Submission blocked: already processing");
      return;
    }

    console.log("[DEBUG] Form submission attempt:", {
      data,
      selectedFiles: selectedFiles.length,
    });

    setError(null);
    let hasErrors = false;

    // Manual validation checks
    if (!data.title || data.title.trim().length < 5) {
      setFieldError("title", {
        type: "manual",
        message: "Title must be at least 5 characters",
      });
      hasErrors = true;
    }

    if (!data.purpose || data.purpose.trim().length < 10) {
      setFieldError("purpose", {
        type: "manual",
        message: "Purpose must be at least 10 characters",
      });
      hasErrors = true;
    }

    if (data.costEstimate !== undefined && data.costEstimate !== null && Number(data.costEstimate) < 0) {
      setFieldError("costEstimate", {
        type: "manual",
        message: "Cost estimate cannot be negative",
      });
      hasErrors = true;
    }

    if (!data.college || !data.college.trim()) {
      setFieldError("college", {
        type: "manual",
        message: "College is required",
      });
      hasErrors = true;
    }

    if (!data.department || !data.department.trim()) {
      setFieldError("department", {
        type: "manual",
        message: "Department is required",
      });
      hasErrors = true;
    }

    if (selectedFiles.length === 0) {
      setFieldError("attachments", {
        type: "manual",
        message: "At least one document is required",
      });
      hasErrors = true;
    }

    // No manual checks needed for dynamic fields because standard HTML required attributes will block submission
    // However, custom React Hook Form logic might not trigger focus smoothly without mapping, 
    // but the schema validation handles the primary fields.

    if (hasErrors) {
      console.log("[DEBUG] Validation failed, showing errors");
      setError("Please fix all highlighted errors before submitting.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // All validations passed — ask the requester to confirm before submitting.
    setPendingData(data);
    setShowConfirmModal(true);
  };

  const performSubmit = async () => {
    const data = pendingData;
    if (!data || isSubmitting) return;

    setShowConfirmModal(false);
    console.log("[DEBUG] All validations passed, proceeding with API call");
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("title", data.title.trim());
      formData.append("description", data.purpose.trim());
      formData.append("costEstimate", String(data.costEstimate ?? 0));
      formData.append("department", data.department);
      formData.append("detailsModel", data.detailsModel);
      // requestCategory is intentionally not sent — the backend derives it
      // from detailsModel (+ generalCategory) and ignores any client value.
      if (data.sopReference && data.sopReference.trim()) {
        formData.append("SOP", data.sopReference.trim());
      }
      // Attach the matched/selected SOP document to the request
      if (matchedSop?._id) {
        formData.append("sopId", matchedSop._id);
      }

      // Reconstruct nested payload for detailsPayload
      const detailsPayload = {};
      const getNestedValue = (obj, path) => {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
      };

      dynamicFields.forEach((field) => {
        let value = getNestedValue(data, field.name);
        
        // Convert string to number if field type is number
        if (field.type === 'number' && typeof value === 'string') {
          value = value === '' ? undefined : Number(value);
        }
        
        // Ensure booleans are true/false rather than missing
        if (field.type === 'boolean') {
          value = !!value; 
        }
        
        if (value !== undefined && value !== '') {
          // Handle nested fields (e.g. historicalMetrics.industrialVisitsCount)
          if (field.name.includes('.')) {
            const parts = field.name.split('.');
            if (!detailsPayload[parts[0]]) detailsPayload[parts[0]] = {};
            detailsPayload[parts[0]][parts[1]] = value;
          } else {
            detailsPayload[field.name] = value;
          }
        }
      });

      // Attach indent line items for indent-capable request types
      if (INDENT_CAPABLE_MODELS.includes(data.detailsModel) && indentRows.length > 0) {
        detailsPayload.indentDetails = indentRows.map((row, index) => ({
          serialNumber: index + 1,
          productId: row.productId,
          productName: row.productName,
          productDescription: row.productDescription,
          quantity: Number(row.quantity) || 1,
        }));
      }

      formData.append("detailsPayload", JSON.stringify(detailsPayload));

      // Documents are uploaded one per request first, so the create call
      // carries only ids and no body is large enough to hit a proxy limit
      // (413). Staged ids are remembered per file, so a retry after a failed
      // submit does not re-upload anything.
      await appendStagedFiles(formData, selectedFiles.map(({ file }) => file));

      const response = await createRequest(formData);
      const result = response.data;
      console.log("[DEBUG] Request created successfully:", result.requestID);

      clearDraft();
      setRedirecting(true);
      navigate(`/requests/${result.requestID}`);
    } catch (err) {
      console.error("[DEBUG] Submission error:", err);
      setError(getApiErrorMessage(err));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onInvalid = (fieldErrors) => {
    console.log("[DEBUG] React-hook-form validation errors:", fieldErrors);
    setError("Please fix all highlighted errors before submitting.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const commitAttachments = (entries) => {
    setSelectedFiles((prev) => {
      const updated = [...prev, ...entries];
      setValue("attachments", updated, { shouldValidate: true });
      return updated;
    });
  };

  const handleFileChange = async (e) => {
    const picked = Array.from(e.target.files || []);
    // The input is cleared up front so re-picking the same file still fires.
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!picked.length) return;

    // PDFs are matched on mime type — the same check the backend enforces, so a
    // file it would reject is caught here instead. Spreadsheets go by extension
    // because browsers report their mime type inconsistently.
    const pdfs = [];
    const spreadsheets = [];
    const rejected = [];
    for (const file of picked) {
      if (file.type === "application/pdf") pdfs.push(file);
      else if (isSpreadsheetFile(file)) spreadsheets.push(file);
      else rejected.push(file);
    }

    // Enforce the per-request document cap here so users hear about it when they
    // pick files, not after a failed upload. Spreadsheets count too — each one
    // becomes a PDF attachment.
    const remaining = Math.max(0, MAX_ATTACHMENTS - selectedFiles.length);
    const accepted = picked.filter((f) => !rejected.includes(f)).length;
    const overflow = Math.max(0, accepted - remaining);
    if (overflow > 0) {
      let slots = remaining;
      const keep = (list) =>
        list.filter(() => {
          if (slots <= 0) return false;
          slots -= 1;
          return true;
        });
      const keptPdfs = keep(pdfs);
      const keptSheets = keep(spreadsheets);
      pdfs.splice(0, pdfs.length, ...keptPdfs);
      spreadsheets.splice(0, spreadsheets.length, ...keptSheets);
    }

    const messages = [];
    if (rejected.length) {
      messages.push(
        `Only PDF and Excel files are allowed. Skipped: ${rejected.map((f) => f.name).join(", ")}`
      );
    }
    if (overflow > 0) {
      messages.push(
        `A maximum of ${MAX_ATTACHMENTS} documents can be attached per request. ` +
          (remaining === 0
            ? "Remove a document before adding more."
            : `Only ${remaining} more could be added, so ${overflow} ${overflow === 1 ? "file was" : "files were"} not added.`)
      );
    }
    setError(messages.length ? messages.join(" ") : null);

    if (pdfs.length) {
      commitAttachments(pdfs.map((file) => ({ file, convertedFrom: null })));
    }
    if (!spreadsheets.length) return;

    setConvertingFiles(spreadsheets.map((f) => f.name));
    try {
      // Converted one at a time: the PDF writer is synchronous, so running
      // several in parallel would just block the main thread for longer.
      const failures = [];
      for (const spreadsheet of spreadsheets) {
        try {
          const pdf = await spreadsheetToPdfFile(spreadsheet);
          commitAttachments([{ file: pdf, convertedFrom: spreadsheet.name }]);
        } catch (err) {
          console.error("Failed to convert %s:", spreadsheet.name, err);
          failures.push(`${spreadsheet.name} (${err.message})`);
        }
      }
      if (failures.length) {
        setError(`Could not convert to PDF: ${failures.join("; ")}`);
      }
    } finally {
      setConvertingFiles([]);
    }
  };

  // Materials list template — headers match parseMaterialsWorkbook exactly,
  // so a sheet built from this and re-imported never needs remapping.
  const handleDownloadMaterialsTemplate = async () => {
    try {
      await downloadMaterialsTemplate();
    } catch (err) {
      console.error("Failed to build materials template:", err);
      setError("Could not generate the materials template. Please try again.");
    }
  };

  const handleRemoveFile = (i) => {
    setSelectedFiles((prev) => {
      const updated = prev.filter((_, idx) => idx !== i);
      setValue("attachments", updated, { shouldValidate: true });
      return updated;
    });
  };

  // Lets the requester check a converted spreadsheet before submitting.
  const handlePreviewFile = (entry) => {
    const url = URL.createObjectURL(entry.file);
    openInNewTab(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const renderDynamicField = (field) => (
    <div key={field.name} className={field.type === "textarea" ? styles.colSpan2 : ""}>
      <label className={styles.label}>
        {field.label} {field.required && <span className="text-red-600">*</span>}
      </label>
      {field.type === "select" ? (
        <select {...register(field.name, { required: field.required })} className={styles.input}>
          <option value="">Select...</option>
          {field.options?.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea {...register(field.name, { required: field.required })} className={styles.input} rows={3} />
      ) : field.type === "boolean" ? (
        <div style={{ display: 'flex', alignItems: 'center', height: '40px' }}>
          <input type="checkbox" {...register(field.name)} style={{ width: '20px', height: '20px' }} />
        </div>
      ) : (
        <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          {...register(field.name, { required: field.required })}
          className={styles.input}
          step={field.type === 'number' ? "any" : undefined}
        />
      )}
    </div>
  );

  const isCrossDeptDetailField = (field) =>
    field.name.startsWith("crossDepartmentAvailability.") &&
    field.name !== "crossDepartmentAvailability.availableInOtherDept" &&
    field.name !== "crossDepartmentAvailability.requirementAndClearance";

  if (loading) {
    return <LoadingScreen />;
  }



  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <style>{removeNumberArrows}</style>

        <h1 className={styles.title}>Create New Request</h1>
        <p className={styles.subtitle}>
          Fill in the details for your new request
        </p>

        {draftRestored && (
          <div className={styles.draftBanner}>
            <div>
              <p className={styles.draftBannerTitle}>Unsaved draft restored</p>
              <p className={styles.draftBannerText}>
                We brought back what you had filled in earlier. Please re-attach
                your documents — files cannot be saved in a draft.
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

        {Object.keys(errors).length > 0 && (
          <div className={styles.errorBox}>
            <p className={styles.errorBoxTitle}>Validation Errors:</p>
            <ul className={styles.errorList}>
              {Object.entries(errors).map(([field, err]) => (
                <li key={field}>
                  <span className={styles.errorField}>{field}</span>: {err?.message || "Invalid value"}
                </li>
              ))}
            </ul>
          </div>
        )}

        <form
          onSubmit={handleSubmit(onSubmit, onInvalid)}
          className={styles.form}
        >
          <div className={styles.gridLayout}>
            <div className={styles.colSpan2}>
              <label
                className={`${styles.label} ${errors.title ? styles.labelError : ""}`}
              >
                Title<span className="text-red-600">*</span>
              </label>
              <input
                {...register("title")}
                placeholder="Enter request title (min 5 characters)"
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value.length > 0 && value.length < 5) {
                    setFieldError("title", {
                      type: "manual",
                      message: "Title must be at least 5 characters",
                    });
                  }
                }}
                className={`${styles.input} ${errors.title ? styles.inputError : ""}`}
              />
              {errors.title && (
                <p className={styles.errorText}>
                  {errors.title.message}
                </p>
              )}
            </div>

            <div className={styles.colSpan2}>
              <label
                className={`${styles.label} ${errors.purpose ? styles.labelError : ""}`}
              >
                Purpose<span className="text-red-600">*</span>
              </label>
              <textarea
                rows={3}
                {...register("purpose")}
                placeholder="Explain the purpose of this request (min 10 characters)"
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value.length > 0 && value.length < 10) {
                    setFieldError("purpose", {
                      type: "manual",
                      message: "Purpose must be at least 10 characters",
                    });
                  }
                }}
                className={`${styles.input} ${errors.purpose ? styles.inputError : ""}`}
              />
              {errors.purpose && (
                <p className={styles.errorText}>
                  {errors.purpose.message}
                </p>
              )}
            </div>

            <div className={styles.colSpan2}>
              <label
                className={`${styles.label} ${errors.costEstimate ? styles.labelError : ""}`}
              >
                Cost Estimate <span style={{ fontWeight: 400, color: '#6b7280' }}>(Optional)</span>
              </label>
              <Controller
                control={control}
                name="costEstimate"
                render={({ field: { value, onChange } }) => (
                  <CostEstimateInput
                    value={value}
                    onChange={(newValue) => {
                      onChange(newValue);
                      trigger("costEstimate");
                    }}
                    error={errors.costEstimate?.message}
                  />
                )}
              />
            </div>

            <div>
              <label
                className={`${styles.blockLabel} ${errors.college ? styles.blockLabelError : ""}`}
              >
                Institution<span className="text-red-600">*</span>
              </label>
              <Controller
                control={control}
                name="college"
                render={({ field: { value, onChange } }) => (
                  <InstitutionSelect
                    value={value}
                    onChange={(newValue) => {
                      onChange(newValue);
                      trigger("college");
                    }}
                    error={errors.college?.message}
                  />
                )}
              />
            </div>

            <div>
              <label
                className={`${styles.blockLabel} ${errors.department ? styles.blockLabelError : ""}`}
              >
                Department<span className="text-red-600">*</span>
              </label>
              <Controller
                control={control}
                name="department"
                render={({ field: { value, onChange } }) => (
                  <NestedSelect
                    value={value}
                    onChange={(newValue) => {
                      onChange(newValue);
                      trigger("department");
                    }}
                    options={departmentOptions}
                    placeholder="Select Department"
                    searchable
                    error={errors.department?.message}
                    disabled={!college}
                  />
                )}
              />
            </div>

            <div className={styles.colSpan2} style={{ marginBottom: '1.5rem' }}>
              <label className={`${styles.blockLabel} ${errors.detailsModel ? styles.blockLabelError : ""}`}>
                Request Type<span className="text-red-600">*</span>
              </label>
              <select {...register("detailsModel")} className={styles.input}>
                <option value="">Select Request Type...</option>
                {Object.keys(formConfigs).map(key => (
                  <option key={key} value={key}>{formatRequestTypeLabel(key)}</option>
                ))}
              </select>
            </div>

            {/* General Category — shown inline right after Request Type when General is selected */}
            {detailsModel === "GeneralDetail" && (
              <div className={styles.colSpan2} style={{ marginBottom: '1.5rem' }}>
                <label className={styles.blockLabel}>
                  General Category<span className="text-red-600">*</span>
                </label>
                <select {...register("generalCategory", { required: true })} className={styles.input}>
                  <option value="">Select General Category...</option>
                  {formConfigs.GeneralDetail.find(f => f.name === "generalCategory")?.options?.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Selecting this will auto-fill the approval category below.
                </p>
              </div>
            )}

            {/* Event/Expense Name — shown inline only when General Category is "Others" (optional) */}
            {detailsModel === "GeneralDetail" && generalCategory === "Others" && (
              <div className={styles.colSpan2} style={{ marginBottom: '1.5rem' }}>
                <label className={styles.blockLabel}>
                  Event/Expense Name <span style={{ fontWeight: 400, color: '#6b7280' }}>(Optional)</span>
                </label>
                <input
                  type="text"
                  {...register("eventName")}
                  className={styles.input}
                />
              </div>
            )}

            <div className={styles.colSpan2} style={{ marginBottom: '1.5rem' }}>
              <label className={styles.blockLabel}>
                Approval Category
              </label>
              <input
                type="text"
                readOnly
                disabled
                value={
                  requestCategory
                    ? REQUEST_CATEGORY_LABELS[requestCategory] || requestCategory
                    : detailsModel === "GeneralDetail"
                      ? "Select a General Category above"
                      : "Select a Request Type above"
                }
                className={styles.input}
                style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
              />
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Determined automatically by the selected request type and cannot be changed.
              </p>
            </div>

            <div className={styles.colSpan2} style={{ marginBottom: '1.5rem' }}>
              <label className={styles.blockLabel}>
                SOP Reference (Optional)
              </label>
              <SopAiSearch
                title={watch("title")}
                description={watch("purpose")}
                category={requestCategory ? (REQUEST_CATEGORY_LABELS[requestCategory] || requestCategory) : ""}
                requestType={detailsModel ? formatRequestTypeLabel(detailsModel) : ""}
                generalCategory={detailsModel === "GeneralDetail" ? (generalCategory || "") : ""}
                selectedSop={matchedSop}
                onSopChange={(sop) => {
                  setMatchedSop(sop);
                  setValue("sopReference", sop ? sop.referenceNumber : "");
                }}
              >
                <input
                  type="text"
                  {...register("sopReference")}
                  placeholder="Enter SOP reference, or use AI Search to find one"
                  className={styles.input}
                />
              </SopAiSearch>
            </div>

            {/* Render Dynamic Fields — skip generalCategory/eventName for GeneralDetail (rendered inline above),
                skip cross-department detail fields (rendered conditionally below), and skip the
                SeminarHosting "To Date" field when the event is a single day */}
            {dynamicFields
              .filter(field => !(detailsModel === "GeneralDetail" && (field.name === "generalCategory" || field.name === "eventName")))
              .filter(field => !isCrossDeptDetailField(field))
              .filter(field => !(detailsModel === "SeminarHostingDetail" && field.name === "schedule.to" && !isMultiDaySeminar))
              .map(field =>
                detailsModel === "SeminarHostingDetail" && field.name === "schedule.from"
                  ? { ...field, label: isMultiDaySeminar ? "From Date" : "Date" }
                  : field
              )
              .map(renderDynamicField)}

            {/* Cross-Department Details — shown only for Equipment/IT Purchase when "Available in Other Dept?" is checked */}
            {(detailsModel === "EquipmentPurchaseDetail" || detailsModel === "ITPurchaseDetail") && availableInOtherDept && (
              <>
                <div className={styles.colSpan2} style={{ marginTop: '0.5rem' }}>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                    Provide details of the equipment already available in the other department:
                  </p>
                </div>
                {dynamicFields
                  .filter(isCrossDeptDetailField)
                  .map(renderDynamicField)}
              </>
            )}



            <div className={styles.colSpan2}>
              <div className={styles.attachmentsHeader}>
                <label
                  className={`${styles.label} ${errors.attachments ? styles.labelError : ""}`}
                >
                  Document Attachments <span className="text-red-600">*</span>
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept={FILE_ACCEPT}
                  multiple
                  onChange={handleFileChange}
                  className={styles.hiddenInput}
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {INDENT_CAPABLE_MODELS.includes(detailsModel) && (
                    <button
                      type="button"
                      onClick={() => setShowIndentModal(true)}
                      className={styles.addDocumentBtn}
                    >
                      {indentRows.length > 0
                        ? `Materials Requirement (${indentRows.length})`
                        : '+ Add Materials Requirement'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={convertingFiles.length > 0}
                    className={styles.addDocumentBtn}
                  >
                    + Add Document
                  </button>
                </div>
              </div>

              <p className={styles.attachmentsHint}>
                
                  <>
                    PDF or Excel (.xlsx, .xls, .csv). Excel files are converted to PDF when
                    attached, so every document is viewed and downloaded as a PDF.
                  </>
              
              </p>

              {INDENT_CAPABLE_MODELS.includes(detailsModel) && (
                <p className={styles.attachmentsHint}>
                  Importing your materials list?{" "}
                  <button
                    type="button"
                    onClick={handleDownloadMaterialsTemplate}
                    className={styles.previewBtn}
                  >
                    Download the materials template
                  </button>
                  {" "}and fill it in using the same column headers (Product ID,
                  Product Name, Product Description, Quantity) — only a sheet in
                  that format will import correctly inside Materials Requirement.
                </p>
              )}

              {errors.attachments && (
                <p className={styles.errorText}>
                  {errors.attachments.message}
                </p>
              )}

              <ul
                className={`${styles.attachmentsList} ${errors.attachments ? styles.attachmentsListError : ""}`}
              >
                {selectedFiles.map((entry, i) => (
                  <li
                    key={`${entry.file.name}-${i}`}
                    className={styles.attachmentsItem}
                  >
                    <div className={styles.fileInfo}>
                      <span className={styles.fileName}>
                        {entry.file.name}
                      </span>
                      {entry.convertedFrom && (
                        <span className={styles.convertedNote}>
                          Converted from {entry.convertedFrom}
                        </span>
                      )}
                    </div>
                    <div className={styles.fileActions}>
                      <button
                        type="button"
                        onClick={() => handlePreviewFile(entry)}
                        className={styles.previewBtn}
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
                {convertingFiles.map((name) => (
                  <li key={`converting-${name}`} className={styles.convertingItem}>
                    Converting {name} to PDF...
                  </li>
                ))}
                {selectedFiles.length === 0 && convertingFiles.length === 0 && !errors.attachments && (
                  <li className={styles.emptyPlaceholder}>
                    No documents uploaded
                  </li>
                )}
                {selectedFiles.length === 0 && convertingFiles.length === 0 && errors.attachments && (
                  <li className={styles.emptyPlaceholderError}>
                    Please upload at least one PDF or Excel file
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className={styles.buttonGroup}>
            <button
              type="button"
              onClick={() => navigate(-1 )}
              className={styles.cancelBtn}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || convertingFiles.length > 0}
              className={styles.submitBtn}
            >
              {isSubmitting
                ? "Creating..."
                : convertingFiles.length > 0
                  ? "Converting attachments..."
                  : "Create Request"}
            </button>
          </div>
        </form>

        {/* Creating-request loading overlay */}
        {(isSubmitting || redirecting) && (
          <div className={styles.loadingOverlay}>
            <div className={styles.loadingBox}>
              <div className={styles.spinner} />
              <p className={styles.loadingText}>
                {redirecting ? 'Request created! Redirecting...' : 'Creating Request...'}
              </p>
              <p className={styles.loadingSubText}>
                {redirecting
                  ? 'Taking you to your request.'
                  : 'Please wait, do not close or refresh this page.'}
              </p>
            </div>
          </div>
        )}

        {/* Indent Information (local mode — rows submitted with the request) */}
        <IndentInformation
          localMode
          currentUser={user}
          isOpen={showIndentModal}
          onClose={() => setShowIndentModal(false)}
          initialRows={indentRows}
          onUpdated={setIndentRows}
        />

        {/* Confirmation before submitting the request */}
        <ConfirmModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={performSubmit}
          title="Submit Request for Approval"
          message="Are you sure you want to submit this request? Once submitted, it will enter the approval workflow and can no longer be edited."
          confirmLabel="Confirm & Submit"
          cancelLabel="Cancel"
          loading={isSubmitting}
        />
      </div>
    </ProtectedRoute>
  );
}