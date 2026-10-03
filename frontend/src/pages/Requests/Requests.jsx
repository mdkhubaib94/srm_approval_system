import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getRequests } from '../../api/requests.api';
import LoadingScreen from '../../common/LoadingScreen';
import styles from './Requests.module.css';
import { sameInstitution } from "../../utils/institutionGroups";

const REQUESTS_PAGE_SIZE = 20;

// Owns its own page number so it resets automatically whenever the parent
// remounts it with a new `key` (i.e. whenever the active filter/stage changes).
function PaginatedRequestsTable({ requests, onRequestClick, getStatusClass, getRequestStatusClass }) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(requests.length / REQUESTS_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginated = useMemo(() => {
    const start = (safePage - 1) * REQUESTS_PAGE_SIZE;
    return requests.slice(start, start + REQUESTS_PAGE_SIZE);
  }, [requests, safePage]);

  return (
    <>
      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <div className={styles.colTitle}>Title</div>
          <div className={styles.colInstitution}>Institution/Department</div>
          <div className={styles.colStatus}>Stage</div>
          <div className={styles.colRequestStatus}>Status</div>
          <div className={styles.colDate}>Created Date</div>
        </div>
        {paginated.map((request) => (
          <div
            key={request._id}
            className={styles.tableRow}
            onClick={() => onRequestClick(request.requestID)}
            style={{ cursor: 'pointer' }}
          >
            <div className={styles.colTitle}>
              <span className={styles.titleText}>{request.title}</span>
            </div>
            <div className={styles.colInstitution}>
              <span className={styles.institutionText}>
                {request.institution} • {request.department}
              </span>
            </div>
            <div className={styles.colStatus}>
              <span className={`${styles.statusBadge} ${getStatusClass(request.stage)}`}>
                {request.stage?.replace(/_/g, ' ').toUpperCase() || 'UNKNOWN'}
              </span>
            </div>
            <div className={styles.colRequestStatus}>
              <span className={`${styles.statusBadge} ${getRequestStatusClass(request.status)}`}>
                {request.status?.toUpperCase() || 'UNKNOWN'}
              </span>
            </div>
            <div className={styles.colDate}>
              <span className={styles.dateText}>
                {new Date(request.createdAt).toLocaleDateString('en-GB')}
              </span>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className={styles.paginationBar}>
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className={styles.pageBtn}
          >
            Previous
          </button>
          <span className={styles.pageIndicator}>Page {safePage} of {totalPages}</span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className={styles.pageBtn}
          >
            Next
          </button>
        </div>
      )}

      <p className={styles.footerCounter}>
        Showing {paginated.length ? (safePage - 1) * REQUESTS_PAGE_SIZE + 1 : 0}
        –{(safePage - 1) * REQUESTS_PAGE_SIZE + paginated.length} of {requests.length} requests
      </p>
    </>
  );
}

const RequestsPageContent = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user: currentUser, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Bumped by the retry button to re-run the effect below.
  const [reloadKey, setReloadKey] = useState(0);

  // Derived straight from the URL — no separate state/effect needed to keep
  // these in sync with ?filter=/&stage=/&role=.
  const activeFilter = searchParams.get('filter') || 'all';
  const currentStage = searchParams.get('stage') || null;
  const currentRole = searchParams.get('role') || null;

  useEffect(() => {
    if (authLoading) return;

    const fetchRequests = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getRequests();
        const data = response.data?.data || [];
        setRequests(data);
      } catch (err) {
        console.error('Error fetching requests:', err);
        setError(err.response?.data?.message || 'Failed to fetch requests');
      } finally {
        setLoading(false);
      }
    };
    fetchRequests();
  }, [authLoading, reloadKey]);

  const retryFetch = () => setReloadKey((k) => k + 1);

  const canActOnRequest = useCallback((request, user) => {
    if (!user || !request) return false;

    // Don't allow processing if request is already rejected or approved
    if (request.status === 'REJECTED' || request.status === 'APPROVED') {
      return false;
    }

    const userRole = user.role;
    const requestStage = request.stage;

    // Requester role cannot act on any requests after creation
    if (userRole === 'REQUESTER') {
      return false;
    }

    // For institution-scoped roles, also check institution match
    const INSTITUTION_SCOPED_STAGES = ['INSTITUTION_MANAGER', 'ACCOUNTANT', 'HEAD_OF_INSTITUTION'];
    if (INSTITUTION_SCOPED_STAGES.includes(userRole)) {
      return requestStage === userRole && sameInstitution(request.institution, user.institution, userRole);
    }

    // All other roles map directly to a stage — match stage to role
    return requestStage === userRole;
  }, []);

  const filteredRequests = useMemo(() => {
    const filter = activeFilter;
    const stage = currentStage;

    if (filter === 'all') {
      let filtered = requests;
      if (stage) {
        filtered = filtered.filter((r) => r.stage === stage);
      }
      return filtered;
    } else if (filter === 'pending') {
      // For PENDING filter, show requests that the user can act on
      let filtered = requests.filter(
        (r) => r.status?.toUpperCase() === 'PENDING'
      );

      if (currentUser && currentUser.role !== 'REQUESTER') {
        filtered = filtered.filter((r) => canActOnRequest(r, currentUser));
      }

      if (stage) {
        filtered = filtered.filter((r) => r.stage === stage);
      }

      return filtered;
    } else {
      let filtered = requests.filter(
        (r) => r.status?.toUpperCase() === filter.toUpperCase()
      );

      if (stage) {
        filtered = filtered.filter((r) => r.stage === stage);
      }

      return filtered;
    }
  }, [requests, currentUser, canActOnRequest, activeFilter, currentStage]);

  const handleFilterChange = (filter) => {
    // Update URL without a stage parameter — activeFilter/currentStage are
    // derived from it, so no local state to update here.
    navigate(`/requests?filter=${filter}`);
  };

  const handleRequestClick = (requestID) => {
    navigate(`/requests/${requestID}`);
  };

  const getStatusClass = () => {
    return styles.statusPending;
  };

  const getRequestStatusClass = (status) => {
    switch (status?.toUpperCase()) {
      case 'APPROVED':
        return styles.statusApproved;
      case 'REJECTED':
        return styles.statusRejected;
      case 'PENDING':
        return styles.statusPending;
      case 'QUERY':
        return styles.statusDefault;
      default:
        return styles.statusUnknown;
    }
  };

  if (authLoading || loading) {
    return <LoadingScreen message={authLoading ? 'Authenticating...' : 'Loading requests...'} />;
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>All Requests</h1>
        <p className={styles.subtitle}>Manage and view all your requests</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className={styles.errorBox}>
          <p>{error}</p>
          <button onClick={retryFetch} className={styles.retryBtn}>
            Retry
          </button>
        </div>
      )}

      {/* Filter Buttons */}
      <div className={styles.filterContainer}>
        <button
          onClick={() => handleFilterChange('all')}
          className={`${styles.filterBtn} ${activeFilter === 'all' ? styles.active : ''}`}
        >
          All Requests
          <span className={styles.badge}>{requests.length}</span>
        </button>
        <button
          onClick={() => handleFilterChange('pending')}
          className={`${styles.filterBtn} ${activeFilter === 'pending' ? styles.active : ''}`}
        >
          Pending
          <span className={styles.badge}>
            {currentUser && currentUser.role !== 'REQUESTER'
              ? requests.filter((r) =>
                  r.status?.toUpperCase() === 'PENDING' && canActOnRequest(r, currentUser)
                ).length
              : requests.filter((r) => r.status?.toUpperCase() === 'PENDING').length
            }
          </span>
        </button>
        <button
          onClick={() => handleFilterChange('approved')}
          className={`${styles.filterBtn} ${activeFilter === 'approved' ? styles.active : ''}`}
        >
          Approved
          <span className={styles.badge}>
            {requests.filter((r) => r.status?.toUpperCase() === 'APPROVED').length}
          </span>
        </button>
        <button
          onClick={() => handleFilterChange('rejected')}
          className={`${styles.filterBtn} ${activeFilter === 'rejected' ? styles.active : ''}`}
        >
          Rejected
          <span className={styles.badge}>
            {requests.filter((r) => r.status?.toUpperCase() === 'REJECTED').length}
          </span>
        </button>
        {currentStage && (
          <div className={styles.stageInfo}>
            Filtered by stage: <strong>{currentStage}</strong>
            {currentRole && <span> ({currentRole})</span>}
            <button
              onClick={() => handleFilterChange(activeFilter)}
              className={styles.clearStageBtn}
              title="Clear stage filter"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Requests List */}
      <div className={styles.requestsList}>
        {filteredRequests.length > 0 ? (
          <PaginatedRequestsTable
            key={`${activeFilter}:${currentStage || ''}`}
            requests={filteredRequests}
            onRequestClick={handleRequestClick}
            getStatusClass={getStatusClass}
            getRequestStatusClass={getRequestStatusClass}
          />
        ) : (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>
              No requests found for the selected filter.
            </p>
            <button
              onClick={() => handleFilterChange('all')}
              className={styles.resetBtn}
            >
              View All Requests
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Wrapper component with Suspense boundary
const RequestsPage = () => {
  return (
    <Suspense fallback={<LoadingScreen message="Loading requests..." />}>
      <RequestsPageContent />
    </Suspense>
  );
};

export default RequestsPage;
