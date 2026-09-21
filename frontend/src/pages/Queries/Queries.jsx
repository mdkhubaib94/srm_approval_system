
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getQueries } from '../../api/queries.api';
import LoadingScreen from '../../common/LoadingScreen';
import styles from './Queries.module.css';
// Disable static generation for this page

const QUERIES_PAGE_SIZE = 20;

// Owns its own page number so it resets automatically whenever the parent
// remounts it with a new `key` (i.e. whenever the active tab/filter changes).
function PaginatedQueriesTable({ queries, onQueryClick }) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(queries.length / QUERIES_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginated = useMemo(() => {
    const start = (safePage - 1) * QUERIES_PAGE_SIZE;
    return queries.slice(start, start + QUERIES_PAGE_SIZE);
  }, [queries, safePage]);

  return (
    <>
      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <div className={styles.colRequest}>Title</div>
          <div className={styles.colQuery}>Query</div>
          <div className={styles.colRaisedBy}>Raised By</div>
          <div className={styles.colDate}>Date</div>
          <div className={styles.colStatus}>Query Status</div>
        </div>
        {paginated.map((query) => (
          <div
            key={query._id}
            className={styles.tableRow}
            onClick={() => onQueryClick(query._id)}
          >
            <div className={styles.colRequest}>
              <span className={styles.queryTypeBadge}>
                {query.policy ? 'Policy' : 'Request'}
              </span>
              <span className={styles.requestTitle}>
                {query.request?.title || query.policy?.title || 'Untitled'}
              </span>
            </div>
            <div className={styles.colQuery}>
              <span className={styles.queryText}>
                {query.query.length > 80
                  ? `${query.query.substring(0, 80)}...`
                  : query.query}
              </span>
            </div>
            <div className={styles.colRaisedBy}>
              <span className={styles.userName}>{query.raisedBy?.name || 'Unknown'}</span>
              <span className={styles.userRole}>{query.raisedBy?.role || ''}</span>
            </div>
            <div className={styles.colDate}>
              <span className={styles.dateText}>
                {new Date(query.createdAt).toLocaleDateString('en-GB')}
              </span>
            </div>
            <div className={styles.colStatus}>
              <span
                className={`${styles.statusBadge} ${
                  query.queryResolved ? styles.statusResolved : styles.statusPending
                }`}
              >
                {query.queryResolved ? 'Replied' : 'Pending'}
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
        Showing {paginated.length ? (safePage - 1) * QUERIES_PAGE_SIZE + 1 : 0}
        –{(safePage - 1) * QUERIES_PAGE_SIZE + paginated.length} of {queries.length} queries
      </p>
    </>
  );
}

const QueriesPageContent = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [queries, setQueries] = useState([]);
  const [activeTab, setActiveTab] = useState('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Bumped by the retry button to re-run the effect below.
  const [reloadKey, setReloadKey] = useState(0);

  // Derived straight from the URL — no separate state/effect needed to keep
  // it in sync with `?filter=myqueries`.
  const filterType = searchParams.get('filter') === 'myqueries' ? 'myqueries' : 'all';

  useEffect(() => {
    if (authLoading) return;

    const fetchQueries = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getQueries();
        const data = response.data?.data || [];
        setQueries(data);
      } catch (err) {
        console.error('Error fetching queries:', err);
        setError(err.response?.data?.message || 'Failed to fetch queries');
      } finally {
        setLoading(false);
      }
    };
    fetchQueries();
  }, [authLoading, reloadKey]);

  const retryFetch = () => setReloadKey((k) => k + 1);

  const filteredQueries = useMemo(() => {
    let filtered = queries;

    // First filter by resolved/unresolved
    if (activeTab === 'active') {
      filtered = filtered.filter((q) => !q.queryResolved);
    } else {
      filtered = filtered.filter((q) => q.queryResolved);
    }

    // Then filter by "my queries" if needed
    if (filterType === 'myqueries' && user) {
      const currentUserId = user?.id || user?._id;
      filtered = filtered.filter((q) => {
        const queryReplyById = q.queryReplyBy?._id || q.queryReplyBy;
        return currentUserId && queryReplyById && String(currentUserId) === String(queryReplyById);
      });
    }

    return filtered;
  }, [activeTab, queries, filterType, user]);

  const handleQueryClick = (queryId) => {
    navigate(`/queries/${queryId}`);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  const handleFilterTypeChange = (type) => {
    // Update URL to reflect the filter — filterType itself is derived from it.
    if (type === 'myqueries') {
      navigate('/queries?filter=myqueries');
    } else {
      navigate('/queries');
    }
  };

  if (authLoading || loading) {
    return <LoadingScreen message={authLoading ? 'Authenticating...' : 'Loading queries...'} />;
  }

  const activeCount = queries.filter((q) => !q.queryResolved).length;
  const historyCount = queries.filter((q) => q.queryResolved).length;

  // Calculate "my queries" counts
  const currentUserId = user?.id || user?._id;
  const myActiveCount = queries.filter((q) => {
    if (q.queryResolved) return false;
    const queryReplyById = q.queryReplyBy?._id || q.queryReplyBy;
    return currentUserId && queryReplyById && String(currentUserId) === String(queryReplyById);
  }).length;

  const myHistoryCount = queries.filter((q) => {
    if (!q.queryResolved) return false;
    const queryReplyById = q.queryReplyBy?._id || q.queryReplyBy;
    return currentUserId && queryReplyById && String(currentUserId) === String(queryReplyById);
  }).length;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Queries</h1>
        <p className={styles.subtitle}>View and manage all queries</p>
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

      {/* Filter Type Buttons */}
      <div className={styles.filterTypeContainer}>
        <button
          onClick={() => handleFilterTypeChange('all')}
          className={`${styles.filterTypeBtn} ${filterType === 'all' ? styles.active : ''}`}
        >
          All Queries
        </button>
        <button
          onClick={() => handleFilterTypeChange('myqueries')}
          className={`${styles.filterTypeBtn} ${filterType === 'myqueries' ? styles.active : ''}`}
        >
          My Queries
          <span className={styles.myQueriesBadge}>{myActiveCount}</span>
        </button>
      </div>

      {/* Tab Buttons */}
      <div className={styles.tabContainer}>
        <button
          onClick={() => handleTabChange('active')}
          className={`${styles.tabBtn} ${activeTab === 'active' ? styles.active : ''}`}
        >
          Active Queries
          <span className={styles.badge}>
            {filterType === 'myqueries' ? myActiveCount : activeCount}
          </span>
        </button>
        <button
          onClick={() => handleTabChange('history')}
          className={`${styles.tabBtn} ${activeTab === 'history' ? styles.active : ''}`}
        >
          Query History
          <span className={styles.badge}>
            {filterType === 'myqueries' ? myHistoryCount : historyCount}
          </span>
        </button>
      </div>

      {/* Queries List */}
      <div className={styles.queriesList}>
        {filteredQueries.length > 0 ? (
          <PaginatedQueriesTable
            key={`${activeTab}:${filterType}`}
            queries={filteredQueries}
            onQueryClick={handleQueryClick}
          />
        ) : (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>
              {filterType === 'myqueries' 
                ? (activeTab === 'active' 
                    ? 'No queries assigned to you for reply.' 
                    : 'No queries you\'ve already replied to.')
                : (activeTab === 'active'
                    ? 'No active queries found.'
                    : 'No query history found.')}
            </p>
            {activeTab === 'history' && (
              <button
                onClick={() => handleTabChange('active')}
                className={styles.resetBtn}
              >
                View Active Queries
              </button>
            )}
            {filterType === 'myqueries' && (
              <button
                onClick={() => handleFilterTypeChange('all')}
                className={styles.resetBtn}
              >
                View All Queries
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Wrapper component with Suspense boundary
const QueriesPage = () => {
  return (
    <Suspense fallback={<LoadingScreen message="Loading queries..." />}>
      <QueriesPageContent />
    </Suspense>
  );
};

export default QueriesPage;
