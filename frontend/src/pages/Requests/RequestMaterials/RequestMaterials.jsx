

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import { getRequestById, saveIndentDetails as saveIndentDetailsApi, addIndentChangeLogRemark } from "../../../api/requests.api";
import { useAuth } from "../../../context/AuthContext";
import { INDENT_CAPABLE_MODELS } from "../../../utils/types";
import { downloadIndentPdf } from "../../../utils/indentPdf";
import { canDownloadApprovalProof, buildApprovalData } from "../../../utils/approvalProof";
import LoadingScreen from "../../../common/LoadingScreen";
import styles from "./RequestMaterials.module.css";

import { sameInstitution } from "../../../utils/institutionGroups";
const rowKey = (row) => row?._id || row?.serialNumber;

const formatRequestType = (detailsModel) => {
  if (!detailsModel) return '';
  if (detailsModel === 'ITPurchaseDetail') return 'IT Purchase';
  return detailsModel.replace(/Detail$/, '').replace(/([A-Z])/g, ' $1').trim();
};

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
 * Materials Requirement — dedicated page.
 *
 * Used to be a modal (components/IndentInformation.jsx, still used as-is for
 * the create-request draft, where rows only live in local state before the
 * request exists). Once a request is real, the table can carry many rows and
 * benefits from real screen space, so it gets its own page instead — laid out
 * like a spreadsheet (sticky header, gridlines, generous rows) rather than a
 * cramped dialog.
 *
 * Permissions mirror requestController.updateIndentDetails /
 * addIndentRemark exactly: only the role currently holding the request's
 * stage may add, edit, delete, import, or leave a remark. The requester loses
 * that ability the moment the request is submitted — their one editing
 * window is the create-request draft.
 */
export default function MaterialsRequirementPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user: currentUser, loading: authLoading } = useAuth();

  const [request, setRequest] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState(null);

  const [rows, setRows] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [changeLog, setChangeLog] = useState([]);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState(null);

  const [editingRowKey, setEditingRowKey] = useState(null);
  const [editRowDraft, setEditRowDraft] = useState(null);

  const [selectedRow, setSelectedRow] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [showChangeLog, setShowChangeLog] = useState(false);
  const [pendingEditRemark, setPendingEditRemark] = useState('');
  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [submittingRemark, setSubmittingRemark] = useState(false);


  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      navigate('/login');
      return;
    }
    if (!id) return;

    const fetchRequest = async () => {
      try {
        setPageLoading(true);
        setPageError(null);
        const response = await getRequestById(id);
        if (!response.data) throw new Error('Request not found');
        setRequest(response.data);
        setRows(response.data.details?.indentDetails || []);
        setChangeLog(response.data.details?.changeLog || []);
      } catch (err) {
        const message =
          err.response?.status === 404
            ? 'Request not found'
            : err.response?.status === 403
              ? 'You do not have permission to view this request'
              : err.response?.status === 401
                ? 'Please log in to view this request'
                : err.message || 'Failed to load the request';
        setPageError(message);
      } finally {
        setPageLoading(false);
      }
    };
    fetchRequest();
  }, [id, currentUser, authLoading, navigate]);

  const isRequester =
    currentUser?.role === 'REQUESTER' &&
    String(request?.requester?._id || request?.requester) === String(currentUser?.id);

  const isCurrentStageHolder =
    !!currentUser &&
    request?.status === 'PENDING' &&
    request?.stage === currentUser.role &&
    currentUser.role !== 'REQUESTER' &&
    (!['INSTITUTION_MANAGER', 'ACCOUNTANT', 'HEAD_OF_INSTITUTION'].includes(currentUser.role) ||
      sameInstitution(request?.institution, currentUser.institution, currentUser.role));

  const fullEditMode = isCurrentStageHolder;
  const displayIndentNumber = request?.details?.indentNumber;
  const columnCount = 6; // S.No, Product ID, Product Name, Description, Quantity, Actions

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.serialNumber, row.productId, row.productName].some((value) =>
        String(value ?? '').toLowerCase().includes(query)
      )
    );
  }, [rows, searchQuery]);

  const goBack = () => {
    if (request?.requestID) navigate(`/requests/${request.requestID}`);
    else navigate(-1);
  };

  const saveIndentDetails = async (updatedRows, successMsg) => {
    try {
      setSaving(true);
      setRowError(null);
      const response = await saveIndentDetailsApi(request.requestID, updatedRows);
      if (response.data.success) {
        setRows(response.data.data);
        if (response.data.changeLog) setChangeLog(response.data.changeLog);
        toast.success(successMsg);
        return true;
      }
      return false;
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to update materials requirement';
      setRowError(msg);
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  };

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

  const startEditRow = (row) => {
    setEditingRowKey(rowKey(row));
    setEditRowDraft({ ...row });
    setRowError(null);
  };

  const cancelEditRow = () => {
    setEditingRowKey(null);
    setEditRowDraft(null);
  };

  const saveEditRow = async (row) => {
    if (!editRowDraft.productId.trim() && !editRowDraft.productName.trim()) {
      setRowError('Enter at least a Product ID or Product Name');
      return;
    }
    const updatedRows = rows.map((r) => (rowKey(r) === rowKey(row) ? { ...r, ...editRowDraft } : r));
    const ok = await saveIndentDetails(updatedRows, 'Item updated successfully');
    if (ok) {
      setEditingRowKey(null);
      setEditRowDraft(null);
      setPendingEditRemark('');
      setShowRemarkModal(true);
    }
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

  const handleDownloadPdf = async ({ withApproval = false } = {}) => {
    const details = [
      { label: 'Request ID', value: request?.requestID },
      { label: 'Request Type', value: formatRequestType(request?.detailsModel) },
      { label: 'Institution', value: request?.institution },
      { label: 'Department', value: request?.department },
      { label: 'Requester', value: request?.requester?.name },
      { label: 'Status', value: request?.status },
      { label: 'Title', value: request?.title, full: true },
    ];

    try {
      await downloadIndentPdf({
        indentNumber: displayIndentNumber,
        indentDate: request?.createdAt || new Date(),
        reference: request?.requestID,
        rows,
        details,
        ...(withApproval && { approval: buildApprovalData(request), heading: 'Materials Requirement - Approved' }),
      });
      toast.success('PDF downloaded');
    } catch (err) {
      console.error('Failed to generate indent PDF:', err);
      toast.error('Could not generate the PDF. Please try again.');
    }
  };

  if (authLoading || pageLoading) {
    return <LoadingScreen message="Loading materials requirement..." />;
  }

  if (pageError || !request) {
    return (
      <div className={styles.pageError}>
        <p>{pageError || 'Request not found'}</p>
        <button type="button" className={styles.backButton} onClick={() => navigate('/requests')}>
          ← Back to Requests
        </button>
      </div>
    );
  }

  if (!INDENT_CAPABLE_MODELS.includes(request.detailsModel)) {
    return (
      <div className={styles.pageError}>
        <p>This request type does not have a materials requirement.</p>
        <button type="button" className={styles.backButton} onClick={goBack}>
          ← Back to Request
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Toaster position="top-right" />

      <div className={styles.topBar}>
        <button type="button" className={styles.backButton} onClick={goBack}>
          ← Back to Request {request.requestID}
        </button>

        <div className={styles.topBarTitle}>
          <h1 className={styles.pageTitle}>Materials Requirement</h1>
          <p className={styles.pageSubtitle}>
            {request.title} · {formatRequestType(request.detailsModel)}
            {displayIndentNumber && <> · Indent No: {displayIndentNumber}</>}
          </p>
        </div>

        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.toolbarButtonSecondary}
            onClick={() => setShowChangeLog(true)}
            disabled={saving}
            title="View change history and remarks"
          >
            Change Logs
          </button>
          <button
            type="button"
            className={styles.toolbarButtonPrimary}
            onClick={() => handleDownloadPdf()}
            disabled={saving || rows.length === 0}
          >
            Download as PDF
          </button>
          {canDownloadApprovalProof(request, currentUser) && (
            <button
              type="button"
              className={styles.toolbarButtonPrimary}
              onClick={() => handleDownloadPdf({ withApproval: true })}
              disabled={saving || rows.length === 0}
              title="PDF stamped with the approval details as proof of approval"
            >
              Download Approved Copy
            </button>
          )}
        </div>
      </div>

      {!fullEditMode && (
        <div className={styles.helpBanner}>
          {isRequester
            ? 'You can view the materials requirement, but only the team currently reviewing this request can change it.'
            : request.status === 'PENDING'
              ? `Only ${formatRoleLabel(request.stage)} can currently edit this table or add remarks.`
              : 'This request has been finalized, so its materials requirement can no longer be edited.'}
        </div>
      )}

      {rowError && <div className={styles.errorBanner}>{rowError}</div>}

      {rows.length > 0 && (
        <div className={styles.searchBar}>
          <svg className={styles.searchIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by S.No, Product ID, or Product Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className={styles.searchClearBtn}
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      )}

      <div className={styles.sheetWrapper}>
        <table className={styles.sheet}>
          <thead>
            <tr>
              <th className={`${styles.th} ${styles.thSerial}`}>S.No</th>
              <th className={styles.th}>Product ID</th>
              <th className={styles.th}>Product Name</th>
              <th className={`${styles.th} ${styles.thDescription}`}>Product Description</th>
              <th className={`${styles.th} ${styles.thQuantity}`}>Quantity</th>
              <th className={`${styles.th} ${styles.thActions}`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const key = rowKey(row);
              const isRowEditing = editingRowKey === key;
              const isEditingThisRow = fullEditMode && isRowEditing && editRowDraft;

              if (isEditingThisRow) {
                return (
                  <tr key={key} className={styles.rowEditing}>
                    <td className={styles.td}>{row.serialNumber}</td>
                    <td className={styles.td}>
                      <input
                        type="text"
                        className={styles.cellInput}
                        placeholder="Product ID"
                        value={editRowDraft.productId || ''}
                        disabled={true}
                      />
                    </td>
                    <td className={styles.td}>
                      <input
                        type="text"
                        className={styles.cellInput}
                        placeholder="Product Name"
                        value={editRowDraft.productName || ''}
                        disabled={true}
                      />
                    </td>
                    <td className={styles.td}>
                      <textarea
                        className={styles.cellTextarea}
                        placeholder="Product Description"
                        value={editRowDraft.productDescription || ''}
                        disabled={true}
                        rows={2}
                      />
                    </td>
                    <td className={styles.td}>
                      <input
                        type="number"
                        min={1}
                        className={`${styles.cellInputSmall} ${styles.editableField}`}
                        value={editRowDraft.quantity}
                        onChange={(e) => setEditRowDraft({ ...editRowDraft, quantity: e.target.value })}
                        disabled={saving}
                      />
                    </td>
                    <td className={styles.td}>
                      <div className={styles.rowActions}>
                        <button type="button" className={styles.saveBtn} onClick={() => saveEditRow(row)} disabled={saving}>
                          Save
                        </button>
                        <button type="button" className={styles.cancelBtn} onClick={cancelEditRow} disabled={saving}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <React.Fragment key={key}>
                  <tr className={isRowEditing ? styles.rowEditing : undefined}>
                    <td className={`${styles.td} ${styles.tdSerial}`}>{row.serialNumber}</td>
                    <td className={styles.td}>{row.productId}</td>
                    <td className={styles.td}>{row.productName}</td>
                    <td className={styles.td}>{row.productDescription || '—'}</td>
                    <td className={`${styles.td} ${styles.tdQuantity}`}>{row.quantity}</td>
                    <td className={styles.td}>
                      {fullEditMode ? (
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => startEditRow(row)}
                            disabled={saving}
                            title="Edit item"
                            aria-label="Edit item"
                          >
                            <svg className={styles.icon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                            onClick={() => requestDeleteRow(row)}
                            disabled={saving}
                            title="Delete item"
                            aria-label="Delete item"
                          >
                            <svg className={styles.icon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <span className={styles.mutedText}>—</span>
                      )}
                    </td>
                  </tr>

                </React.Fragment>
              );
            })}

            {filteredRows.length === 0 && rows.length > 0 && (
              <tr>
                <td colSpan={columnCount} className={styles.emptyRow}>
                  No items match &quot;{searchQuery}&quot;.
                </td>
              </tr>
            )}

            {rows.length === 0 && !fullEditMode && (
              <tr>
                <td colSpan={columnCount} className={styles.emptyRow}>
                  No items have been added to this request yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Change Logs Modal */}
      {showChangeLog && !showRemarkModal && (
        <div className={styles.modalOverlay} onClick={() => !saving && setShowChangeLog(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Change History &amp; Remarks</h2>
              <button
                className={styles.closeButton}
                onClick={() => setShowChangeLog(false)}
                type="button"
                aria-label="Close modal"
                disabled={saving}
              >
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              {changeLog.length === 0 ? (
                <p className={styles.emptyText}>No changes recorded yet.</p>
              ) : (
                <ul className={styles.changeLogList}>
                  {[...changeLog]
                    .sort((a, b) => new Date(b.at) - new Date(a.at))
                    .map((entry, i) => (
                      <li key={i} className={styles.changeLogItem}>
                        <div className={styles.changeLogMeta}>
                          <span className={styles.changeLogSerialAndId}>
                            S.No: {entry.serialNumber} | Product ID: {entry.productId || '—'}
                          </span>
                          <span className={styles.changeLogWhen}>{formatWhen(entry.at)}</span>
                        </div>
                        <div className={styles.changeLogHeader}>
                          <span className={styles.changeLogText}>{describeChange(entry)}</span>
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
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
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
            <div className={styles.modalBody}>
              <p className={styles.helpText}>
                Add a note explaining this change (optional). This will be visible in the change history.
              </p>
              <textarea
                className={styles.cellTextarea}
                placeholder="Enter your change note here..."
                rows={4}
                value={pendingEditRemark}
                onChange={(e) => setPendingEditRemark(e.target.value)}
                disabled={submittingRemark}
              />
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={closeRemarkModal}
                  disabled={submittingRemark}
                >
                  Skip
                </button>
                <button
                  type="button"
                  className={styles.confirmDeleteBtn}
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

      {showDeleteConfirm && selectedRow && (
        <div className={styles.modalOverlay} onClick={() => !saving && closeDeleteConfirm()}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.confirmTitle}>Delete Item</h2>
            <p className={styles.confirmText}>
              Are you sure you want to delete{' '}
              <strong>
                #{selectedRow.serialNumber} — {selectedRow.productName || selectedRow.productId}
              </strong>
              ? This cannot be undone.
            </p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.cancelBtn} onClick={closeDeleteConfirm} disabled={saving}>
                Cancel
              </button>
              <button type="button" className={styles.confirmDeleteBtn} onClick={handleDeleteRow} disabled={saving}>
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
