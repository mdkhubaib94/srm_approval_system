import { useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import ProtectedRoute from "../../common/ProtectedRoute";
import { useAuth } from "../../context/AuthContext";
import { getAllRequests } from "../../api/requests.api";
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
import styles from "./Workflow.module.css";
// ── Constants ─────────────────────────────────────────────────────────────────

const STAGES = [
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

const STAGE_LABELS = {
  REQUESTER: "Requester",
  INSTITUTION_MANAGER: "Institution Manager",
  ACCOUNTANT: "Accountant",
  HEAD_OF_INSTITUTION: "Head of Institution",
  CHAIRMAN_OFFICE: "Chairman Office",
  HR_HEAD: "HR Head",
  MMA: "MMA",
  MANAGER_DATA_MANAGEMENT: "Manager - Data Management",
  AUDIT: "Audit",
  GM_FINANCE: "GM Finance",
  DIRECTOR_ADMISSIONS: "Director Admissions",
  DIRECTOR_RESEARCH: "Director Research",
  DEAN_ADMIN: "Dean Admin",
  CHIEF_DIRECTOR: "Chief Director",
  CHAIRMAN: "Chairman",
};

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

// Flatten engineering departments (handle nested structure)
const flattenEngineeringDepts = (depts) => {
  const flattened = [];
  depts.forEach((dept) => {
    if (typeof dept === "string") {
      flattened.push(dept);
    } else if (dept.subOptions) {
      // Add parent label
      flattened.push(dept.label);
      // Add all sub-options
      dept.subOptions.forEach((sub) => flattened.push(sub.value));
    }
  });
  return flattened;
};

// Map institutions to their predefined departments
const INSTITUTION_DEPARTMENTS = {
  "SRMIST - E&T": flattenEngineeringDepts(ENGINEERING_DEPARTMENTS),
  "SRMIST - FSH": FSH_DEPARTMENTS,
  "SRMIST - Management": MANAGEMENT_DEPARTMENTS,
  "SRMIST - SEAD": SEAD_DEPARTMENTS,
  "EEC": EEC_DEPARTMENTS,
  "DENTAL": DENTAL_DEPARTMENTS,
  "SRM Nightingale School": SRM_NIGHTINGALE_SCHOOL_DEPARTMENTS,
  "Others": OTHER_DEPARTMENTS,
  "COMMON": ["Common"],
};

const DATE_RANGES = [
  { label: "All Time", value: "ALL" },
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
  { label: "Custom Range", value: "CUSTOM" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const stageMeta = (stage) => {
  return { label: STAGE_LABELS[stage] || stage, classes: "bg-yellow-100 text-yellow-700" };
};

const fmt = (dateStr) =>
  dateStr
    ? new Date(dateStr).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const isWithinDays = (dateStr, days) => {
  if (!dateStr) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return new Date(dateStr) >= cutoff;
};

// ── Request table row ────────────────────────────────────────────────────────

function RequestTableRow({ request }) {
  const navigate = useNavigate();
  const { label, classes } = stageMeta(request.stage);

  const handleClick = () => {
    navigate(`/requests/${request.requestID}`);
  };

  return (
    <div className={styles.tableRow} onClick={handleClick} role="button" tabIndex={0} aria-label={`View request: ${request.title}`}>
      <div className={styles.colTitle}>
        <span className={styles.titleText}>{request.title}</span>
      </div>
      <div className={styles.colInstitution}>
        <span className={styles.institutionText}>
          {request.institution} • {request.department}
        </span>
      </div>
      <div className={styles.colStatus}>
        <span className={`${styles.statusBadge} ${classes}`}>
          {label}
        </span>
      </div>
      <div className={styles.colDate}>
        <span className={styles.dateText}>
          {fmt(request.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WorkflowPage() {
  const { accessToken, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterStage, setFilterStage] = useState("ALL");
  const [filterInstitution, setFilterInstitution] = useState("ALL");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [filterDate, setFilterDate] = useState("ALL");
const [filterFlagged, setFilterFlagged] = useState("ALL");
  const [filterSop, setFilterSop] = useState("ALL"); // ALL | AVAILABLE | NOT_AVAILABLE
  const [filterBudget, setFilterBudget] = useState("ALL"); // ALL | BUDGETED | NON_BUDGETED
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Bumped by the retry button to re-run the effect below.
  const [reloadKey, setReloadKey] = useState(0);

  // No token means there's nothing to fetch — derived rather than set from
  // the effect below, so there's no direct setState in its body.
  const isLoading = accessToken ? loading : false;

  useEffect(() => {
    if (authLoading || !accessToken) return;

    const fetchRequests = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await getAllRequests();
        setRequests(data);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load requests");
      } finally {
        setLoading(false);
      }
    };
    fetchRequests();
  }, [authLoading, accessToken, reloadKey]);

  const retryFetch = () => setReloadKey((k) => k + 1);

  const clearFilters = () => {
    setSearch("");
    setFilterStatus("ALL");
    setFilterStage("ALL");
    setFilterInstitution("ALL");
    setFilterDepartment("");
    setFilterDate("ALL");
    setCustomFrom("");
    setCustomTo("");
setFilterFlagged("ALL");
    setFilterSop("ALL");
    setFilterBudget("ALL");
    setCurrentPage(1);
  };

  const hasActiveFilters =
    search || filterStatus !== "ALL" || filterStage !== "ALL" || filterFlagged !== "ALL" ||
    filterInstitution !== "ALL" || filterDepartment || filterDate !== "ALL" ||
    filterSop !== "ALL" || filterBudget !== "ALL";

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.title?.toLowerCase().includes(q) &&
          !r.requestID?.toLowerCase().includes(q) &&
          !r.department?.toLowerCase().includes(q) &&
          !r.institution?.toLowerCase().includes(q)
        ) return false;
      }

      if (filterStatus !== "ALL" && r.status !== filterStatus) return false;
      if (filterStage !== "ALL" && r.stage !== filterStage) return false;
      if (filterInstitution !== "ALL" && r.institution !== filterInstitution) return false;
      if (filterDepartment && r.department !== filterDepartment) return false;
if (filterFlagged !== "ALL") {
  const isFlagged = r.workinghrstaken && r.workinghrstaken > 8;
  if (filterFlagged === "FLAGGED" && !isFlagged) return false;
  if (filterFlagged === "UNFLAGGED" && isFlagged) return false;
}

      if (filterSop !== "ALL") {
        if (filterSop === "AVAILABLE" && r.SOPAvailable !== true) return false;
        if (filterSop === "NOT_AVAILABLE" && r.SOPAvailable !== false) return false;
      }
      if (filterBudget !== "ALL") {
        const isNonBudgeted = r.requestCategory === "NON_BUDGETED";
        if (filterBudget === "NON_BUDGETED" && !isNonBudgeted) return false;
        if (filterBudget === "BUDGETED" && isNonBudgeted) return false;
      }

      if (filterDate !== "ALL" && filterDate !== "CUSTOM") {
        if (!isWithinDays(r.createdAt, Number(filterDate))) return false;
      }
      if (filterDate === "CUSTOM") {
        const d = new Date(r.createdAt);
        if (customFrom && d < new Date(customFrom)) return false;
        if (customTo && d > new Date(customTo + "T23:59:59")) return false;
      }

      return true;
    });
  }, [requests, search, filterStatus, filterStage, filterInstitution, filterDepartment, filterDate, customFrom, customTo, filterFlagged, filterSop, filterBudget]);

  const counts = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((r) => r.status === "PENDING").length,
    approved: requests.filter((r) => r.status === "APPROVED").length,
    rejected: requests.filter((r) => r.status === "REJECTED").length,
  }), [requests]);

  const sopBudgetCounts = useMemo(() => ({
    sopAvailable: requests.filter((r) => r.SOPAvailable === true).length,
    sopNotAvailable: requests.filter((r) => r.SOPAvailable === false).length,
    budgeted: requests.filter((r) => r.requestCategory !== "NON_BUDGETED").length,
    nonBudgeted: requests.filter((r) => r.requestCategory === "NON_BUDGETED").length,
  }), [requests]);

  // Pagination
  const PAGE_SIZE = 20;
  const [currentPage, setCurrentPage] = useState(1);

  const toggleSopFilter = (value) => {
    setFilterSop((prev) => (prev === value ? "ALL" : value));
    setCurrentPage(1);
  };
  const toggleBudgetFilter = (value) => {
    setFilterBudget((prev) => (prev === value ? "ALL" : value));
    setCurrentPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  return (
    <ProtectedRoute>
      <div className={styles.container}>

        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Workflow</h1>
            <p className={styles.pageSubtitle}>Track all requests across every stage</p>
          </div>
          <button
            onClick={retryFetch}
            disabled={isLoading}
            className={styles.refreshBtn}
          >
            <ArrowPathIcon className={`${styles.refreshIcon} ${isLoading ? styles.refreshIconSpin : ""}`} />
            Refresh
          </button>
        </div>

        {/* Summary pills */}
        <div className={styles.summaryPills}>
          {[
            { label: "Total", value: counts.total, colorClass: styles.summaryCardBlue },
            { label: "Pending", value: counts.pending, colorClass: styles.summaryCardYellow },
            { label: "Approved", value: counts.approved, colorClass: styles.summaryCardGreen },
            { label: "Rejected", value: counts.rejected, colorClass: styles.summaryCardRed },
          ].map(({ label, value, colorClass }) => (
            <div key={label} className={`${styles.summaryCard} ${colorClass}`}>
              <p className={styles.summaryVal}>{value}</p>
              <p className={styles.summaryLabel}>{label}</p>
            </div>
          ))}
        </div>

        {/* Summary pills — SOP & Budget filters */}
        <div className={styles.summaryPills}>
          {[
            {
              label: "SOP Available",
              value: sopBudgetCounts.sopAvailable,
              colorClass: styles.summaryCardTeal,
              active: filterSop === "AVAILABLE",
              onClick: () => toggleSopFilter("AVAILABLE"),
            },
            {
              label: "SOP Not Available",
              value: sopBudgetCounts.sopNotAvailable,
              colorClass: styles.summaryCardOrange,
              active: filterSop === "NOT_AVAILABLE",
              onClick: () => toggleSopFilter("NOT_AVAILABLE"),
            },
            {
              label: "Budgeted",
              value: sopBudgetCounts.budgeted,
              colorClass: styles.summaryCardIndigo,
              active: filterBudget === "BUDGETED",
              onClick: () => toggleBudgetFilter("BUDGETED"),
            },
            {
              label: "Non-Budgeted",
              value: sopBudgetCounts.nonBudgeted,
              colorClass: styles.summaryCardPink,
              active: filterBudget === "NON_BUDGETED",
              onClick: () => toggleBudgetFilter("NON_BUDGETED"),
            },
          ].map(({ label, value, colorClass, active, onClick }) => (
            <div
              key={label}
              className={`${styles.summaryCard} ${colorClass} ${styles.summaryCardClickable} ${active ? styles.summaryCardActive : ""}`}
              onClick={onClick}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
            >
              <p className={styles.summaryVal}>{value}</p>
              <p className={styles.summaryLabel}>{label}</p>
            </div>
          ))}
        </div>

        {/* ── Filter bar ── */}
        <div className={styles.filterCard}>
          {/* Row 1: search + clear */}
          <div className={styles.filterRow1}>
            <div className={styles.filterSearchWrapper}>
              <MagnifyingGlassIcon className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search by title, ID, department, institution…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className={styles.filterSearchInput}
              />
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className={styles.clearFilterBtn}
              >
                <XMarkIcon className={styles.clearIcon} /> Clear all
              </button>
            )}
          </div>

          {/* Row 2: dropdowns */}
          <div className={styles.filterRow2}>
            {/* Status */}
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
              className={styles.filterSelect}
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="FLAGGED">Flagged</option>
              <option value="QUERY">Query</option>
            </select>

            {/* Stage */}
            <select
              value={filterStage}
              onChange={(e) => { setFilterStage(e.target.value); setCurrentPage(1); }}
              className={styles.filterSelect}
            >
              <option value="ALL">All Stages</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
{/* Flagged filter */}
<select
  value={filterFlagged}
  onChange={(e) => { setFilterFlagged(e.target.value); setCurrentPage(1); }}
  className={styles.filterSelect}
>
  <option value="ALL">All</option>
   <option value="FLAGGED">Flagged (&gt;8 hrs)</option>
  <option value="UNFLAGGED">Unflagged (≤8 hrs)</option>
</select>

            {/* SOP filter */}
            <select
              value={filterSop}
              onChange={(e) => { setFilterSop(e.target.value); setCurrentPage(1); }}
              className={styles.filterSelect}
            >
              <option value="ALL">SOP: All</option>
              <option value="AVAILABLE">SOP Available</option>
              <option value="NOT_AVAILABLE">SOP Not Available</option>
            </select>

            {/* Budget filter */}
            <select
              value={filterBudget}
              onChange={(e) => { setFilterBudget(e.target.value); setCurrentPage(1); }}
              className={styles.filterSelect}
            >
              <option value="ALL">Budget: All</option>
              <option value="BUDGETED">Budgeted</option>
              <option value="NON_BUDGETED">Non-Budgeted</option>
            </select>

            {/* Institution */}
            <select
              value={filterInstitution}
              onChange={(e) => { setFilterInstitution(e.target.value); setFilterDepartment(""); setCurrentPage(1); }}
              className={styles.filterSelect}
            >
              <option value="ALL">All Institutions</option>
              {INSTITUTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>

            {/* Department — only when institution is selected */}
            {filterInstitution !== "ALL" && (
              <select
                value={filterDepartment}
                onChange={(e) => { setFilterDepartment(e.target.value); setCurrentPage(1); }}
                className={styles.filterSelect}
              >
                <option value="">All Departments</option>
                {(INSTITUTION_DEPARTMENTS[filterInstitution] || []).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}

            {/* Date range */}
            <select
              value={filterDate}
              onChange={(e) => { setFilterDate(e.target.value); setCurrentPage(1); }}
              className={styles.filterSelect}
            >
              {DATE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>

            {/* Custom date pickers */}
            {filterDate === "CUSTOM" && (
              <>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => { setCustomFrom(e.target.value); setCurrentPage(1); }}
                  className={styles.filterDateInput}
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => { setCustomTo(e.target.value); setCurrentPage(1); }}
                  className={styles.filterDateInput}
                />
              </>
            )}
          </div>
        </div>

        {/* ── Request grid ── */}
        {isLoading ? (
          <div className={styles.loadingFlex}>
            <div className={styles.loadingSpinner} />
            <p className={styles.loadingText}>Loading requests…</p>
          </div>
        ) : error ? (
          <div className={styles.errorFlex}>
            <ExclamationTriangleIcon className={styles.errorIcon} />
            <p className={styles.errorText}>{error}</p>
            <button onClick={retryFetch} className={styles.errorRetryBtn}>
              Try Again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyFlex}>
            <ClockIcon className={styles.emptyIcon} />
            <p className={styles.emptyText}>
              {requests.length === 0 ? "No requests found." : "No requests match your filters."}
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className={styles.emptyClearBtn}>Clear filters</button>
            )}
          </div>
        ) : (
          <div className={styles.requestsList}>
            <div className={styles.table}>
              <div className={styles.tableHeader}>
                <div className={styles.colTitle}>Title</div>
                <div className={styles.colInstitution}>Institution/Department</div>
                <div className={styles.colStatus}>Stage</div>
                <div className={styles.colDate}>Created Date</div>
              </div>
              {paginated.map((r) => (
                <RequestTableRow key={r._id} request={r} />
              ))}
            </div>
          </div>
        )}

        {!isLoading && !error && filtered.length > 0 && totalPages > 1 && (
          <div className={styles.paginationBar}>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className={styles.pageBtn}
            >
              Previous
            </button>
            <span className={styles.pageIndicator}>
              Page {safePage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className={styles.pageBtn}
            >
              Next
            </button>
          </div>
        )}

        {!isLoading && !error && requests.length > 0 && (
          <p className={styles.footerCounter}>
            Showing {paginated.length ? (safePage - 1) * PAGE_SIZE + 1 : 0}
            –{(safePage - 1) * PAGE_SIZE + paginated.length} of {filtered.length} requests
            {filtered.length !== requests.length ? ` (filtered from ${requests.length})` : ""}
          </p>
        )}
      </div>
    </ProtectedRoute>
  );
}

