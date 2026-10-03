
import React, { useState, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { saveIndentDetails as saveIndentDetailsApi, addIndentChangeLogRemark } from '../api/requests.api';
import { downloadIndentPdf } from '../utils/indentPdf';
import { parseMaterialsWorkbook, downloadMaterialsTemplate } from '../utils/loadXlsx';
import styles from './IndentInformation.module.css';
import { sameInstitution } from '../utils/institutionGroups';

const EMPTY_DRAFT = { productId: '', productName: '', productDescription: '', quantity: 1 };

const formatRequestType = (detailsModel) => {
  if (!detailsModel) return '';
  if (detailsModel === 'ITPurchaseDetail') return 'IT Purchase';
  return detailsModel.replace(/Detail$/, '').replace(/([A-Z])/g, ' $1').trim();
};

// Stable identity for rows: server rows have _id, local (pre-submit) rows get _localId
const rowKey = (row) => row?._id || row?._localId || row?.serialNumber;

const formatWhen = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatRoleLabel = (role) =>
  String(role || '')
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');

/** Turn one materialsChangeLog entry into a plain-English sentence. */
const describeChange = (entry) => {
  const who = entry.byName || formatRoleLabel(entry.role) || 'Someone';
  switch (entry.action) {
    case 'added':
      return `${who} added "${entry.rowLabel}"`;
    case 'deleted':
      return `${who} removed "${entry.rowLabel}"`;
    case 'imported':
      return `${who} imported "${entry.rowLabel}" from a spreadsheet`;
    case 'updated': {
      const fieldLabel =
        { productId: 'Product ID', productName: 'Product Name', productDescription: 'Description', quantity: 'Quantity' }[
          entry.field
        ] || entry.field;
      return `${who} changed ${fieldLabel} on "${entry.rowLabel}" from "${entry.oldValue || '—'}" to "${entry.newValue || '—'}"`;
    }
    default:
      return `${who} updated "${entry.rowLabel}"`;
  }
};

/**
 * Materials Requirement modal.
 *
 * localMode (create-request page): rows live only in parent state, no API
 * calls — the requester builds the table before the request exists at all,
 * either by typing rows in or importing an Excel/CSV file.
 *
 * View mode (requests/[id] page, allowAdd=false): rows are the persisted
 * indentDetails on the request's detail document. Once a request has been
 * submitted, only the role currently holding its stage may add, edit, delete
 * rows, import a spreadsheet, or leave a remark — never the requester, and
 * never a role the request has already moved past (see
 * requestController.updateIndentDetails / addIndentRemark). Everyone who can
 * view the request can read the rows, remarks, and edit history.
 */
export default function IndentInformation({
  request,
  currentUser,
  isOpen,
  onClose,
  onUpdated,
  localMode = false,
  initialRows = [],
  allowAdd = true,
}) {
  const [rows, setRows] = useState([]);
  const [changeLog, setChangeLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  // Inline add-row (always-present draft row, footer "+")
  const [draftRow, setDraftRow] = useState(null);

  // Inline full-row edit
  const [editingRowKey, setEditingRowKey] = useState(null);
  const [editRowDraft, setEditRowDraft] = useState(null);

  // Delete confirmation
  const [selectedRow, setSelectedRow] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Change log modal
  const [showChangeLog, setShowChangeLog] = useState(false);
  const [pendingEditRemark, setPendingEditRemark] = useState('');
  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [submittingRemark, setSubmittingRemark] = useState(false);

  const fileInputRef = useRef(null);

  // Requester only ever edits this table in localMode, while drafting a new
  // request — once it exists server-side, editing here is refused (see
  // updateIndentDetails). isRequester below is therefore just for display.
  const isRequester =
    !localMode &&
    currentUser?.role === 'REQUESTER' &&
    String(request?.requester?._id || request?.requester) === String(currentUser?.id);

  // The one role allowed to touch values on a live request: whoever currently
  // holds its stage, matching access.isStageHolder on the server.
  const isCurrentStageHolder =
    !localMode &&
    currentUser &&
    request?.status === 'PENDING' &&
    request?.stage === currentUser.role &&
    currentUser.role !== 'REQUESTER' &&
    (!['INSTITUTION_MANAGER', 'ACCOUNTANT', 'HEAD_OF_INSTITUTION'].includes(currentUser.role) ||
      sameInstitution(request?.institution, currentUser.institution, currentUser.role));

  // Full add/edit/delete/import rights: the requester while drafting, or the
  // current stage holder on a live request. Nobody else — including the
  // requester after submission — can change a single value here.
  const fullEditMode = localMode || isCurrentStageHolder;
  const showAddButton = allowAdd && fullEditMode;

  // Indent number is generated server-side when the request is created
  const displayIndentNumber = request?.details?.indentNumber;

  // Reset local form state whenever the modal opens or a different request is
  // opened. Adjusted directly during render (guarded by comparing against
  // the last-seen isOpen/request) rather than in an effect, per React's
  // "adjusting state when a prop changes" pattern.
  const [prevResetKey, setPrevResetKey] = useState([isOpen, request]);
  if (isOpen !== prevResetKey[0] || request !== prevResetKey[1]) {
    setPrevResetKey([isOpen, request]);
    if (isOpen) {
      setRows(localMode ? initialRows : request?.details?.indentDetails || []);
      setChangeLog(localMode ? [] : []);
      setError(null);
      setDraftRow(fullEditMode ? { ...EMPTY_DRAFT } : null);
      setEditingRowKey(null);
      setEditRowDraft(null);
      setSelectedRow(null);
      setShowDeleteConfirm(false);
      setShowChangeLog(false);
      setPendingEditRemark('');
      setShowRemarkModal(false);
    }
  }

  if (!isOpen) return null;

  const saveIndentDetails = async (updatedRows, successMsg) => {
    // Local mode: renumber and hand rows back to the parent — no API
    if (localMode) {
      const renumbered = updatedRows.map((row, index) => ({
        ...row,
        _localId: row._localId || `local-${Date.now()}-${index}`,
        serialNumber: index + 1,
        quantity: row.quantity != null && row.quantity !== '' ? Number(row.quantity) : 1,
      }));
      setRows(renumbered);
      onUpdated?.(renumbered);
      toast.success(successMsg);
      return true;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await saveIndentDetailsApi(request.requestID, updatedRows);
      if (response.data.success) {
        setRows(response.data.data);
        if (response.data.changeLog) setChangeLog(response.data.changeLog);
        onUpdated?.(response.data.data);
        toast.success(successMsg);
        return true;
      }
      return false;
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to update materials requirement';
      setError(msg);
      toast.error(msg);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ─── Inline add row (footer "+") ─────────────────────────────────────────
  // Returns whether the draft was actually saved, so the footer "Save" button
  // (which also closes the modal) knows whether it is safe to close.
  const saveDraftRow = async () => {
    if (!draftRow.productId.trim() && !draftRow.productName.trim()) {
      setError('Enter at least a Product ID or Product Name');
      return false;
    }
    const ok = await saveIndentDetails([...rows, draftRow], 'Item added successfully');
    if (ok) setDraftRow({ ...EMPTY_DRAFT });
    return ok;
  };

  // Footer "Save": commits whatever is in the draft row (if anything was
  // typed into it) and then closes the modal. An empty draft just closes —
  // "Save" is how you finish, not another way to add a row.
  const handleSaveAndClose = async () => {
    const hasDraftContent =
      draftRow && (draftRow.productId.trim() || draftRow.productName.trim());
    if (hasDraftContent) {
      const ok = await saveDraftRow();
      if (!ok) return;
    }
    onClose();
  };

  // ─── Import from Excel/CSV ───────────────────────────────────────────────
  const handleImportClick = () => fileInputRef.current?.click();

  const handleDownloadTemplate = async () => {
    try {
      await downloadMaterialsTemplate();
    } catch (err) {
      console.error('Failed to build materials template:', err);
      toast.error('Could not generate the template. Please try again.');
    }
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    try {
      setImporting(true);
      setError(null);
      const { rows: parsedRows, truncated, totalParsed } = await parseMaterialsWorkbook(file);

      if (parsedRows.length === 0) {
        setError(
          'No items could be read from that file. Make sure it has columns like Item Name, Description and Quantity.'
        );
        return;
      }

      const ok = await saveIndentDetails(
        [...rows, ...parsedRows],
        `Imported ${parsedRows.length} item${parsedRows.length === 1 ? '' : 's'} from ${file.name}`
      );
      if (ok && truncated) {
        toast(
          `Only the first ${parsedRows.length} of ${totalParsed} rows were imported. Split large sheets into smaller files.`,
          { icon: '⚠️', duration: 6000 }
        );
      }
    } catch (err) {
      console.error('Failed to import materials workbook:', err);
      setError('Could not read that file. Make sure it is a valid Excel (.xlsx/.xls) or CSV file.');
    } finally {
      setImporting(false);
    }
  };

  // ─── Delete ───────────────────────────────────────────────────────────────
  const requestDeleteRow = (row) => {
    setSelectedRow(row);
    setShowDeleteConfirm(true);
  };

  const closeDeleteConfirm = () => {
    setShowDeleteConfirm(false);
    setSelectedRow(null);
  };

  const handleDeleteRow = async () => {
    const updatedRows = rows.filter((r) => rowKey(r) !== rowKey(selectedRow));
    const ok = await saveIndentDetails(updatedRows, 'Item deleted successfully');
    if (ok) closeDeleteConfirm();
  };

  // ─── Inline full-row edit ─────────────────────────────────────────────────
  const startEditRow = (row) => {
    setEditingRowKey(rowKey(row));
    setEditRowDraft({ ...row });
    setError(null);
  };

  const cancelEditRow = () => {
    setEditingRowKey(null);
    setEditRowDraft(null);
  };

  const saveEditRow = async (row) => {
    if (!editRowDraft.productId.trim() && !editRowDraft.productName.trim()) {
      setError('Enter at least a Product ID or Product Name');
      return;
    }
    const updatedRows = rows.map((r) =>
      rowKey(r) === rowKey(row) ? { ...r, ...editRowDraft } : r
    );
    const ok = await saveIndentDetails(updatedRows, 'Item updated successfully');
    if (ok) {
      setEditingRowKey(null);
      setEditRowDraft(null);
      setPendingEditRemark('');
      setShowRemarkModal(true);
    }
  };

  const handleClose = () => {
    if (!loading) onClose();
  };

  // ─── Add Remark Modal (after edit) ────────────────────────────────────────
  const submitEditRemark = async () => {
    const text = pendingEditRemark.trim();
    if (!text) {
      setShowRemarkModal(false);
      return;
    }

    try {
      setSubmittingRemark(true);
      const response = await addIndentChangeLogRemark(request.requestID, text);
      if (response.data.success) {
        if (response.data.changeLog) setChangeLog(response.data.changeLog);
        toast.success('Change log entry added');
        setShowRemarkModal(false);
        setPendingEditRemark('');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to add change log entry';
      toast.error(msg);
    } finally {
      setSubmittingRemark(false);
    }
  };

  const closeRemarkModal = () => {
    setShowRemarkModal(false);
    setPendingEditRemark('');
  };

  // ─── Download as PDF ─────────────────────────────────────────────────────
  // Generated from the rows currently on screen, so an unsaved inline edit is
  // never silently baked into the document.
  const handleDownloadPdf = () => {
    const details = localMode
      ? [{ label: 'Prepared by', value: currentUser?.name }]
      : [
          { label: 'Request ID', value: request?.requestID },
          { label: 'Request Type', value: formatRequestType(request?.detailsModel) },
          { label: 'Institution', value: request?.institution },
          { label: 'Department', value: request?.department },
          { label: 'Requester', value: request?.requester?.name },
          { label: 'Status', value: request?.status },
          { label: 'Title', value: request?.title, full: true },
        ];

    try {
      downloadIndentPdf({
        indentNumber: displayIndentNumber,
        indentDate: request?.createdAt || new Date(),
        reference: request?.requestID,
        rows,
        details,
      });
      toast.success('PDF downloaded');
    } catch (err) {
      console.error('Failed to generate indent PDF:', err);
      toast.error('Could not generate the PDF. Please try again.');
    }
  };

  const columnCount = 6; // S.No, Product ID, Product Name, Description, Quantity, Actions

  return (
    <>
      <div className={styles.modalOverlay} onClick={handleClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <div>
              <h2 className={styles.modalTitle}>Materials Requirement</h2>
              {displayIndentNumber && (
                <p className={styles.indentNumber}>Indent No: {displayIndentNumber}</p>
              )}
            </div>
            <div className={styles.headerActions}>
              {fullEditMode && (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".xlsx,.xls,.csv"
                    onChange={handleImportFile}
                    className={styles.hiddenInput}
                  />
                  <button
                    type="button"
                    className={styles.downloadPdfButton}
                    onClick={handleDownloadTemplate}
                    disabled={loading || importing}
                    title="Download a blank Excel template with the right columns"
                  >
                    <svg className={styles.downloadPdfIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                    </svg>
                    Download Template
                  </button>
                  <button
                    type="button"
                    className={styles.downloadPdfButton}
                    onClick={handleImportClick}
                    disabled={loading || importing}
                    title="Add many items at once from an Excel or CSV file"
                  >
                    <svg className={styles.downloadPdfIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                    </svg>
                    {importing ? 'Importing…' : 'Import from Excel'}
                  </button>
                </>
              )}
              {!localMode && changeLog.length > 0 && (
                <button
                  type="button"
                  className={styles.downloadPdfButton}
                  onClick={() => setShowChangeLog(true)}
                  disabled={loading}
                  title="View change history and remarks"
                >
                  <svg className={styles.downloadPdfIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Change Logs
                </button>
              )}
              <button
                type="button"
                className={styles.downloadPdfButton}
                onClick={handleDownloadPdf}
                disabled={loading || rows.length === 0}
                title={
                  rows.length === 0
                    ? 'Add at least one item to download a PDF'
                    : 'Download the materials requirement as a PDF'
                }
              >
                <svg className={styles.downloadPdfIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                </svg>
                Download as PDF
              </button>
              <button
                className={styles.closeButton}
                onClick={handleClose}
                type="button"
                aria-label="Close modal"
                disabled={loading}
              >
                ✕
              </button>
            </div>
          </div>

          {!localMode && !fullEditMode && (
            <div className={styles.helpText}>
              {isRequester
                ? 'You can view the materials requirement, but only the team currently reviewing this request can change it.'
                : `Only ${formatRoleLabel(request?.stage)} can currently edit this table or add remarks.`}
            </div>
          )}

          {error && (
            <div className={styles.errorAlert}>
              <p className={styles.errorMessage}>{error}</p>
            </div>
          )}

          <div className={styles.body}>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>S.No</th>
                    <th className={styles.th}>Product ID</th>
                    <th className={styles.th}>Product Name</th>
                    <th className={`${styles.th} ${styles.thDescription}`}>Product Description</th>
                    <th className={styles.th}>Quantity</th>
                    <th className={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const key = rowKey(row);
                    const isRowEditing = editingRowKey === key;
                    const isEditingThisRow = fullEditMode && isRowEditing && editRowDraft;

                    if (isEditingThisRow) {
                      return (
                        <tr key={key} className={styles.trDraft}>
                          <td className={styles.td}>{row.serialNumber}</td>
                          <td className={styles.td}>
                            <input
                              type="text"
                              className={styles.rowInput}
                              placeholder="Product ID"
                              value={editRowDraft.productId}
                              onChange={(e) => setEditRowDraft({ ...editRowDraft, productId: e.target.value })}
                              disabled={loading}
                              autoFocus
                            />
                          </td>
                          <td className={styles.td}>
                            <input
                              type="text"
                              className={styles.rowInput}
                              placeholder="Product Name"
                              value={editRowDraft.productName}
                              onChange={(e) => setEditRowDraft({ ...editRowDraft, productName: e.target.value })}
                              disabled={loading}
                            />
                          </td>
                          <td className={styles.td}>
                            <textarea
                              className={styles.rowTextarea}
                              placeholder="Product Description"
                              value={editRowDraft.productDescription}
                              onChange={(e) => setEditRowDraft({ ...editRowDraft, productDescription: e.target.value })}
                              disabled={loading}
                              rows={2}
                            />
                          </td>
                          <td className={styles.td}>
                            <input
                              type="number"
                              min={1}
                              className={styles.rowInputSmall}
                              value={editRowDraft.quantity}
                              onChange={(e) => setEditRowDraft({ ...editRowDraft, quantity: e.target.value })}
                              disabled={loading}
                            />
                          </td>
                          <td className={styles.td}>
                            <div className={styles.rowActions}>
                              <button
                                type="button"
                                className={styles.saveRowButton}
                                onClick={() => saveEditRow(row)}
                                disabled={loading}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className={styles.cancelRowButton}
                                onClick={cancelEditRow}
                                disabled={loading}
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <React.Fragment key={key}>
                        <tr className={isRowEditing ? styles.trDraft : undefined}>
                          <td className={styles.td}>{row.serialNumber}</td>
                          <td className={styles.td}>{row.productId}</td>
                          <td className={styles.td}>{row.productName}</td>
                          <td className={styles.td}>{row.productDescription || '—'}</td>
                          <td className={styles.td}>{row.quantity}</td>
                          <td className={styles.td}>
                            {fullEditMode ? (
                              <div className={styles.rowActions}>
                                <button
                                  type="button"
                                  className={styles.iconEditButton}
                                  onClick={() => startEditRow(row)}
                                  disabled={loading}
                                  title="Edit item"
                                  aria-label="Edit item"
                                >
                                  <svg className={styles.actionIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  className={styles.iconDeleteButton}
                                  onClick={() => requestDeleteRow(row)}
                                  disabled={loading}
                                  title="Delete item"
                                  aria-label="Delete item"
                                >
                                  <svg className={styles.actionIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            ) : (
                              <span className={styles.noActionText}>—</span>
                            )}
                          </td>
                        </tr>

                      </React.Fragment>
                    );
                  })}

                  {/* Inline add-row — always present & editable when fullEditMode */}
                  {draftRow && !editRowDraft && (
                    <tr className={styles.trDraft}>
                      <td className={styles.td}>{rows.length + 1}</td>
                      <td className={styles.td}>
                        <input
                          type="text"
                          className={styles.rowInput}
                          placeholder="Product ID"
                          value={draftRow.productId}
                          onChange={(e) => setDraftRow({ ...draftRow, productId: e.target.value })}
                          disabled={loading}
                        />
                      </td>
                      <td className={styles.td}>
                        <input
                          type="text"
                          className={styles.rowInput}
                          placeholder="Product Name"
                          value={draftRow.productName}
                          onChange={(e) => setDraftRow({ ...draftRow, productName: e.target.value })}
                          disabled={loading}
                        />
                      </td>
                      <td className={styles.td}>
                        <textarea
                          className={styles.rowTextarea}
                          placeholder="Product Description"
                          value={draftRow.productDescription}
                          onChange={(e) => setDraftRow({ ...draftRow, productDescription: e.target.value })}
                          disabled={loading}
                          rows={2}
                        />
                      </td>
                      <td className={styles.td}>
                        <input
                          type="number"
                          min={1}
                          className={styles.rowInputSmall}
                          value={draftRow.quantity}
                          onChange={(e) => setDraftRow({ ...draftRow, quantity: e.target.value })}
                          disabled={loading}
                        />
                      </td>
                      <td className={styles.td}>
                        <span className={styles.noActionText}>New</span>
                      </td>
                    </tr>
                  )}

                  {rows.length === 0 && !draftRow && (
                    <tr>
                      <td colSpan={columnCount} className={styles.emptyRow}>
                        No items added yet.
                        {showAddButton ? ' Click the + button below, or import an Excel file, to add some.' : ''}
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Footer — "+" commits the draft row; Save (right) confirms & closes */}
                {showAddButton && !editRowDraft && (
                  <tfoot>
                    <tr>
                      <td colSpan={columnCount} className={styles.addFootCell}>
                        <div className={styles.footerBar}>
                          <button
                            type="button"
                            className={styles.addFooterButton}
                            onClick={saveDraftRow}
                            disabled={loading}
                            title="Add item"
                            aria-label="Add item"
                          >
                            <svg className={styles.addFooterIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className={styles.saveFooterButton}
                            onClick={handleSaveAndClose}
                            disabled={loading}
                            title="Save and close"
                          >
                            {loading ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {!localMode && changeLog.length > 0 && (
              <div className={styles.changeLogSection}>
                <h3 className={styles.changeLogTitle}>Change History</h3>
                <ul className={styles.changeLogList}>
                  {[...changeLog]
                    .sort((a, b) => new Date(b.at) - new Date(a.at))
                    .map((entry, i) => (
                      <li key={i} className={styles.changeLogItem}>
                        <div className={styles.changeLogHeader}>
                          <span className={styles.changeLogText}>{describeChange(entry)}</span>
                          <span className={styles.changeLogWhen}>{formatWhen(entry.at)}</span>
                        </div>
                        {entry.remark && (
                          <div className={styles.changeLogRemark}>
                            <strong>Note:</strong> {entry.remark}
                          </div>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Change Logs Modal */}
      {showChangeLog && !showRemarkModal && (
        <div className={styles.modalOverlay} onClick={() => !loading && setShowChangeLog(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Change History &amp; Remarks</h2>
              <button
                className={styles.closeButton}
                onClick={() => setShowChangeLog(false)}
                type="button"
                aria-label="Close modal"
                disabled={loading}
              >
                ✕
              </button>
            </div>
            <div className={styles.body}>
              {changeLog.length === 0 ? (
                <p className={styles.emptyText}>No changes recorded yet.</p>
              ) : (
                <ul className={styles.changeLogList}>
                  {[...changeLog]
                    .sort((a, b) => new Date(b.at) - new Date(a.at))
                    .map((entry, i) => (
                      <li key={i} className={styles.changeLogItem}>
                        <div className={styles.changeLogHeader}>
                          <span className={styles.changeLogText}>{describeChange(entry)}</span>
                          <span className={styles.changeLogWhen}>{formatWhen(entry.at)}</span>
                        </div>
                        {entry.remark && (
                          <div className={styles.changeLogRemark}>
                            <strong>Note:</strong> {entry.remark}
                          </div>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Remark Modal (after edit) */}
      {showRemarkModal && (
        <div className={styles.modalOverlay} onClick={() => !submittingRemark && closeRemarkModal()}>
          <div className={styles.detailModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Add Change Note</h2>
              <button
                className={styles.closeButton}
                onClick={closeRemarkModal}
                type="button"
                aria-label="Close modal"
                disabled={submittingRemark}
              >
                ✕
              </button>
            </div>
            <div className={styles.body}>
              <p className={styles.helpText}>
                Add a note explaining this change (optional). This will be visible in the change history.
              </p>
              <textarea
                className={styles.rowTextarea}
                placeholder="Enter your change note here..."
                rows={4}
                value={pendingEditRemark}
                onChange={(e) => setPendingEditRemark(e.target.value)}
                disabled={submittingRemark}
              />
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeRemarkModal}
                  disabled={submittingRemark}
                >
                  Skip
                </button>
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={submitEditRemark}
                  disabled={submittingRemark}
                >
                  {submittingRemark ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && selectedRow && (
        <div className={styles.modalOverlay} onClick={() => !loading && closeDeleteConfirm()}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Delete Item</h2>
              <button
                className={styles.closeButton}
                onClick={closeDeleteConfirm}
                type="button"
                aria-label="Close modal"
                disabled={loading}
              >
                ✕
              </button>
            </div>
            <div className={styles.body}>
              <p className={styles.confirmText}>
                Are you sure you want to delete{' '}
                <strong>
                  #{selectedRow.serialNumber} — {selectedRow.productName || selectedRow.productId}
                </strong>
                ? This cannot be undone.
              </p>
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeDeleteConfirm}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={handleDeleteRow}
                  disabled={loading}
                >
                  {loading ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toaster position="top-right" />
    </>
  );
}
