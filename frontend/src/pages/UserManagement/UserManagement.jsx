
import { useState, useEffect } from "react";
import { getUsers, createUser, bulkCreateUsers, updateUser, deleteUser } from "../../api/users.api";
import { PencilSquareIcon, TrashIcon, UsersIcon } from "@heroicons/react/24/outline";
import ConfirmModal from "../../common/ConfirmModal";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../common/ProtectedRoute";
import NestedSelect from "../../common/NestedSelect";
import { parseUserWorkbook } from "../../utils/loadXlsx";
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
import styles from "./UserManagement.module.css";
// ─── Shared role metadata (mirrors backend rbac.js) ───────────────────────────

const ALL_ROLES = [
  "REQUESTER",
  "INSTITUTION_MANAGER",
  "ACCOUNTANT",
  "HEAD_OF_INSTITUTION",
  "CHAIRMAN_OFFICE",
  "HR_HEAD",
  "MMA",
  "MANAGER_DATA_MANAGEMENT",
  "AUDIT",
  "GM_FINANCE",
  "DIRECTOR_ADMISSIONS",
  "DIRECTOR_RESEARCH",
  "DEAN_ADMIN",
  "CHIEF_DIRECTOR",
  "CHAIRMAN",
];

const SCOPED_ROLES = [
  "REQUESTER",
  "INSTITUTION_MANAGER",
  "ACCOUNTANT",
  "HEAD_OF_INSTITUTION",
];

const INSTITUTIONS = [
  "SRMIST - E&T",
  "SRMIST - FSH",
  "SRMIST - Management",
  "SRMIST - SEAD",
  "EEC",
  "DENTAL",
  "SRM Nightingale School",
  "Others",
];

const ROLE_LABELS = {
  REQUESTER: "Head of Department (Requester)",
  INSTITUTION_MANAGER: "Institution Manager",
  ACCOUNTANT: "Accountant",
  HEAD_OF_INSTITUTION: "Head of Institution",
  CHAIRMAN_OFFICE: "Chairman Office",
  HR_HEAD: "HR Head",
  MMA: "MMA",
  MANAGER_DATA_MANAGEMENT: "Manager - Data Management",
  AUDIT: "Audit",
  GM_FINANCE: "GM Finance",
  DIRECTOR_ADMISSIONS: "Director - Admissions",
  DIRECTOR_RESEARCH: "Director - Research",
  DEAN_ADMIN: "Dean Admin",
  CHIEF_DIRECTOR: "Chief Director",
  CHAIRMAN: "Chairman",
};

const label = (r) => ROLE_LABELS[r] || r;
const isScoped = (r) => SCOPED_ROLES.includes(r);

const allowedRolesFor = (role) => {
  if (role === "CHAIRMAN") return [...ALL_ROLES];
  if (role === "HEAD_OF_INSTITUTION")
    return ["REQUESTER", "INSTITUTION_MANAGER", "ACCOUNTANT"];
  if (role === "CHAIRMAN_OFFICE" || role === "DEAN_ADMIN")
    return ALL_ROLES.filter((r) => r !== "CHAIRMAN" && r !== role);
  return [];
};

const departmentsForInstitution = (college) => {
  if (!college) return OTHER_DEPARTMENTS;
  if (college === "DENTAL") return DENTAL_DEPARTMENTS;
  if (college.includes("FSH")) return FSH_DEPARTMENTS;
  if (college.includes("Management")) return MANAGEMENT_DEPARTMENTS;
  if (college.includes("SEAD")) return SEAD_DEPARTMENTS;
  if (college === "EEC") return EEC_DEPARTMENTS;
  if (college === "SRM Nightingale School") return SRM_NIGHTINGALE_SCHOOL_DEPARTMENTS;
  if (college === "Others") return OTHER_DEPARTMENTS;
  if (college.includes("E&T")) return ENGINEERING_DEPARTMENTS;
  return OTHER_DEPARTMENTS;
};

// ─── Bulk upload card ──────────────────────────────────────────────────────────

function BulkUploadCard({ role, institution, scoped, isHoi, onImported }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const withDepartment = role === "REQUESTER";
  const templateHref = withDepartment
    ? "/hod_upload_template.xlsx"
    : "/user_upload_template.xlsx";

  // Admin uploading a scoped role must pick an institution first.
  const blockedNoInstitution = scoped && !isHoi && !institution;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    setError("");
    setResult(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = await parseUserWorkbook(file);
      if (parsed.length === 0) {
        setError("No valid rows found. Please use the template.");
        setRows([]);
        return;
      }
      setRows(parsed);
    } catch (err) {
      setError(err.message || "Could not read the file.");
      setRows([]);
    }
  };

  const handleCreate = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const body = { role, rows };
      if (scoped && !isHoi) body.institution = institution;
      const { data } = await bulkCreateUsers(body);
      setResult(data);
      setRows([]);
      setFileName("");
      onImported?.();
    } catch (err) {
      setError(err.response?.data?.message || "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setRows([]);
    setFileName("");
    setResult(null);
    setError("");
  };

  return (
    <div className={styles.uploadBox}>
      <div className={styles.uploadHead}>
        <div className={styles.uploadTitle}>Bulk create via Excel</div>
        <div className={styles.uploadHint}>
          {withDepartment ? (
            <>
              Columns: <code>name</code>, <code>employeeID</code>, <code>email</code>,{" "}
              <code>phone</code>, <code>department</code>. Rows without a department are skipped.
            </>
          ) : (
            <>
              Columns: <code>name</code>, <code>employeeID</code>, <code>email</code>,{" "}
              <code>phone</code>.
            </>
          )}{" "}
          Default password <code>123456</code>.
        </div>
      </div>

      {blockedNoInstitution && (
        <div className={styles.warn}>Select an institution above before uploading.</div>
      )}

      <div className={styles.uploadRow}>
        <label className={`${styles.fileBtn} ${blockedNoInstitution ? styles.disabled : ""}`}>
          Choose .xlsx file
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            disabled={blockedNoInstitution}
            onChange={handleFile}
          />
        </label>
        <a className={styles.templateLink} href={templateHref} download>
          Download template
        </a>
        {fileName && <span className={styles.fileName}>{fileName}</span>}
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {rows.length > 0 && (
        <div className={styles.preview}>
          <div className={styles.previewHead}>
            {rows.length} row{rows.length > 1 ? "s" : ""} ready
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th><th>Name</th><th>Employee ID</th><th>Email</th><th>Phone</th>
                  {withDepartment && <th>Department</th>}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{r.name}</td>
                    <td>{r.employeeID}</td>
                    <td>{r.email}</td>
                    <td>{r.phone}</td>
                    {withDepartment && (
                      <td className={!r.department ? styles.reason : ""}>
                        {r.department || "missing — will skip"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && (
              <div className={styles.moreNote}>…and {rows.length - 50} more</div>
            )}
          </div>
          <div className={styles.actionsRow}>
            <button className={styles.primaryBtn} onClick={handleCreate} disabled={busy}>
              {busy ? "Creating…" : `Create ${rows.length} user${rows.length > 1 ? "s" : ""}`}
            </button>
            <button className={styles.ghostBtn} onClick={clear} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className={styles.result}>
          <div className={styles.resultSummary}>
            Created <strong>{result.createdCount}</strong> · Skipped{" "}
            <strong>{result.skippedCount}</strong> of {result.total}
          </div>
          {result.skipped?.length > 0 && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Row</th><th>Employee ID</th><th>Email</th><th>Reason skipped</th></tr>
                </thead>
                <tbody>
                  {result.skipped.map((s, i) => (
                    <tr key={i}>
                      <td>{s.row}</td>
                      <td>{s.employeeID}</td>
                      <td>{s.email}</td>
                      <td className={styles.reason}>{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create / edit user modal ────────────────────────────────────────────────

function UserFormModal({ mode, initial, roleOptions, isHoi, deptInstitution, onClose, onSaved }) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState({
    name: initial?.name || "",
    employeeID: initial?.employeeID || "",
    email: initial?.email || "",
    phone: initial?.phone || "",
    role: isEdit ? initial.role : roleOptions[0],
    institution: initial?.institution || "",
    department: initial?.department || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const scoped = isScoped(form.role);
  const showInstitution = scoped && !isHoi;
  const showDepartment = form.role === "REQUESTER";
  const deptSource = isHoi ? deptInstitution : form.institution || initial?.institution;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (isEdit) {
        const body = { name: form.name, email: form.email, phone: form.phone };
        if (showInstitution) body.institution = form.institution;
        if (showDepartment) body.department = form.department;
        const { data } = await updateUser(initial._id, body);
        onSaved(data);
      } else {
        const body = {
          name: form.name,
          employeeID: form.employeeID,
          email: form.email,
          phone: form.phone,
          role: form.role,
        };
        if (showInstitution) body.institution = form.institution;
        if (showDepartment) body.department = form.department;
        const { data } = await createUser(body);
        onSaved(data);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>{isEdit ? "Edit user" : "Add user"}</h3>
        {error && <div className={styles.errorBox}>{error}</div>}
        <form onSubmit={submit} className={styles.modalForm}>
          <label className={styles.mLabel}>Name
            <input className={styles.input} value={form.name}
              onChange={(e) => set("name", e.target.value)} required />
          </label>

          <label className={styles.mLabel}>Employee ID
            <input className={styles.input} value={form.employeeID}
              onChange={(e) => set("employeeID", e.target.value)}
              disabled={isEdit} required />
          </label>

          <label className={styles.mLabel}>Email
            <input className={styles.input} type="email" value={form.email}
              onChange={(e) => set("email", e.target.value)} required />
          </label>

          <label className={styles.mLabel}>Phone
            <input className={styles.input} value={form.phone}
              onChange={(e) => set("phone", e.target.value)} />
          </label>

          {!isEdit && roleOptions.length > 1 && (
            <label className={styles.mLabel}>Role
              <select className={styles.input} value={form.role}
                onChange={(e) => set("role", e.target.value)}>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>{label(r)}</option>
                ))}
              </select>
            </label>
          )}

          {showInstitution && (
            <label className={styles.mLabel}>Institution
              <select className={styles.input} value={form.institution}
                onChange={(e) => set("institution", e.target.value)} required>
                <option value="">Select institution</option>
                {INSTITUTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </label>
          )}

          {showDepartment && (
            <div className={styles.mLabel}>Department
              <NestedSelect
                value={form.department}
                onChange={(v) => set("department", v)}
                options={departmentsForInstitution(deptSource)}
                placeholder="Select department"
              />
            </div>
          )}

          {!isEdit && (
            <p className={styles.note}>Default password: <code>123456</code></p>
          )}

          <div className={styles.actionsRow}>
            <button type="submit" className={styles.primaryBtn} disabled={busy}>
              {busy ? "Saving…" : isEdit ? "Save changes" : "Create user"}
            </button>
            <button type="button" className={styles.ghostBtn} onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Users table ───────────────────────────────────────────────────────────────

function UsersTable({ users, onEdit, onDelete }) {
  if (users.length === 0) {
    return <div className={styles.empty}>No users found.</div>;
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th><th>Employee ID</th><th>Email</th><th>Phone</th>
            <th>Role</th><th>Institution</th><th>Department</th>
            <th className={styles.actionsHead}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u._id}>
              <td>{u.name}</td>
              <td>{u.employeeID}</td>
              <td>{u.email}</td>
              <td>{u.phone || "—"}</td>
              <td>{label(u.role)}</td>
              <td>{u.institution || "—"}</td>
              <td>{u.department || "—"}</td>
              <td>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.editBtn}
                    onClick={() => onEdit(u)}
                    aria-label={`Edit ${u.name}`}
                  >
                    <PencilSquareIcon className={styles.actionIcon} aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => onDelete(u)}
                    aria-label={`Delete ${u.name}`}
                  >
                    <TrashIcon className={styles.actionIcon} aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Manage-users modal (large, scrollable) ─────────────────────────────────────

function ManageUsersModal({ users, loading, roleFilter, setRoleFilter, allowed, onEdit, onDelete, onClose, deleteError }) {
  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.modalWide} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.wideHead}>
          <h3 className={styles.modalTitle}>Manage users</h3>
          <button className={styles.closeX} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className={styles.wideToolbar}>
          <label className={styles.filterLabel}>
            Filter by role:
            <select className={styles.inputSm} value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All</option>
              {allowed.map((r) => <option key={r} value={r}>{label(r)}</option>)}
            </select>
          </label>
          <span className={styles.count}>{users.length} user{users.length === 1 ? "" : "s"}</span>
        </div>
        {deleteError && <div className={styles.inlineError}>{deleteError}</div>}
        <div className={styles.wideBody}>
          {loading ? (
            <div className={styles.empty}>Loading…</div>
          ) : (
            <UsersTable users={users} onEdit={onEdit} onDelete={onDelete} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const HOI_TABS = [
  { role: "REQUESTER", label: "HOD / Requester" },
  { role: "ACCOUNTANT", label: "Accountant" },
  { role: "INSTITUTION_MANAGER", label: "Institution Manager" },
];

function UserManagementContent() {
  const { user } = useAuth();

  const managerRoles = ["HEAD_OF_INSTITUTION", "CHAIRMAN_OFFICE", "DEAN_ADMIN", "CHAIRMAN"];
  const isHoi = user?.role === "HEAD_OF_INSTITUTION";
  const allowed = allowedRolesFor(user?.role);

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const [selectedRole, setSelectedRole] = useState(allowed[0] || "");
  const [selectedInstitution, setSelectedInstitution] = useState("");
  const [hoiTab, setHoiTab] = useState("REQUESTER");
  const [modal, setModal] = useState(null); // {mode, initial, presetRole}
  const [showManage, setShowManage] = useState(false);
  const [error, setError] = useState("");

  // Bumped by refresh() to re-run the effect below with the same roleFilter,
  // instead of holding an externally-callable fetch function (which the
  // compiler can't memoize safely — see set-state-in-effect).
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      setError("");
      try {
        const q = roleFilter ? `?role=${encodeURIComponent(roleFilter)}` : "";
        const { data } = await getUsers(q);
        setUsers(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load users.");
        setUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [roleFilter, reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);

  // Delete is confirmed through ConfirmModal rather than window.confirm so the
  // dialog matches the rest of the app and can show the in-flight/failed state.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const requestDelete = (u) => {
    setDeleteError("");
    setDeleteTarget(u);
  };

  const cancelDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteUser(deleteTarget._id);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      setDeleteError(err.response?.data?.message || "Delete failed.");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  if (!managerRoles.includes(user?.role)) {
    return (
      <div className={styles.page}>
        <div className={styles.errorBox}>You do not have access to User Management.</div>
      </div>
    );
  }

  const selectedScoped = isScoped(selectedRole);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>User Management</h1>
        <p className={styles.subtitle}>
          {isHoi
            ? `Create and manage users for your institution (${user?.institution || "—"}).`
            : "Create and manage user accounts."}
        </p>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {/* Creation area */}
      {isHoi ? (
        <section className={styles.card}>
          <div className={styles.tabs}>
            {HOI_TABS.map((t) => (
              <button
                key={t.role}
                className={`${styles.tab} ${hoiTab === t.role ? styles.tabActive : ""}`}
                onClick={() => setHoiTab(t.role)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className={styles.tabPanel}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Create {label(hoiTab)}</h2>
              <button className={styles.smallBtn}
                onClick={() => setModal({ mode: "create", presetRole: hoiTab })}>
                + Add single
              </button>
            </div>
            <BulkUploadCard
              key={hoiTab}
              role={hoiTab}
              institution={null}
              scoped
              isHoi
              onImported={refresh}
            />
          </div>
        </section>
      ) : (
        <section className={styles.card}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Create users</h2>
            <button className={styles.smallBtn} onClick={() => setModal({ mode: "create" })}>
              + Add single
            </button>
          </div>
          <div className={styles.selectRow}>
            <label className={styles.mLabel}>Role
              <select className={styles.input} value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}>
                {allowed.map((r) => <option key={r} value={r}>{label(r)}</option>)}
              </select>
            </label>
            {selectedScoped && (
              <label className={styles.mLabel}>Institution
                <select className={styles.input} value={selectedInstitution}
                  onChange={(e) => setSelectedInstitution(e.target.value)}>
                  <option value="">Select institution</option>
                  {INSTITUTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </label>
            )}
          </div>
          <BulkUploadCard
            key={`${selectedRole}-${selectedInstitution}`}
            role={selectedRole}
            institution={selectedInstitution}
            scoped={selectedScoped}
            isHoi={false}
            onImported={refresh}
          />
        </section>
      )}

      {/* Manage existing users */}
      <section className={styles.manageCard}>
        <div className={styles.manageCardMain}>
          <span className={styles.manageCardIcon} aria-hidden="true">
            <UsersIcon className={styles.manageCardIconSvg} />
          </span>
          <div className={styles.manageCardText}>
            <h2 className={styles.manageCardTitle}>Existing users</h2>
            <p className={styles.manageCardNote}>
              {isHoi
                ? `Accounts in ${user?.institution || "your institution"}.`
                : "Accounts you are able to administer."}{" "}
              Click on the button to open the manager to view, edit or remove them.
            </p>
          </div>
        </div>

        <button className={styles.manageBtn} onClick={() => setShowManage(true)}>
          Manage users
          <span className={styles.manageBtnArrow} aria-hidden="true">→</span>
        </button>
      </section>

      {showManage && (
        <ManageUsersModal
          users={users}
          loading={loadingUsers}
          roleFilter={roleFilter}
          setRoleFilter={setRoleFilter}
          allowed={allowed}
          onEdit={(u) => setModal({ mode: "edit", initial: u })}
          onDelete={requestDelete}
          deleteError={deleteError}
          onClose={() => setShowManage(false)}
        />
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        danger
        title="Delete this user?"
        message={
          deleteTarget
            ? `${deleteTarget.name} (${deleteTarget.email}) will be permanently removed. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete user"
        cancelLabel="Keep user"
        loading={deleting}
      />

      {modal && (
        <UserFormModal
          mode={modal.mode}
          initial={modal.initial}
          isHoi={isHoi}
          deptInstitution={user?.institution}
          roleOptions={modal.presetRole ? [modal.presetRole] : allowed}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

export default function UserManagementPage() {
  return (
    <ProtectedRoute>
      <UserManagementContent />
    </ProtectedRoute>
  );
}
