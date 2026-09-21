
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getFlagged } from '../../api/flagged.api';
import LoadingScreen from '../../common/LoadingScreen';
import styles from './Flagged.module.css';

const FLAGGED_PAGE_SIZE = 20;

const FlaggedPage = () => {
  const navigate = useNavigate();
  const { loading: authLoading } = useAuth();
  const [flaggedRequests, setFlaggedRequests] = useState([]);
  const [filteredFlagged, setFilteredFlagged] = useState([]);
  const [activeFilter, setActiveFilter] = useState('unresolved');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Bumped by the retry button to re-run the effect below.
  const [reloadKey, setReloadKey] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (authLoading) return;

    const fetchFlaggedRequests = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch unresolved flags by default
        const response = await getFlagged();
        const data = response.data?.data || [];
        setFlaggedRequests(data);
        setFilteredFlagged(data);
      } catch (err) {
        console.error('Error fetching flagged requests:', err);
        setError(err.response?.data?.message || 'Failed to fetch flagged requests');
      } finally {
        setLoading(false);
      }
    };
    fetchFlaggedRequests();
  }, [authLoading, reloadKey]);

  const retryFetch = () => setReloadKey((k) => k + 1);

  const handleFilterChange = async (filter) => {
    setActiveFilter(filter);
    setCurrentPage(1);

    if (filter === 'all') {
      // Fetch all flags (resolved + unresolved)
      try {
        setLoading(true);
        const response = await getFlagged(true);
        const data = response.data?.data || [];
        setFlaggedRequests(data);
        setFilteredFlagged(data);
      } catch (err) {
        console.error('Error fetching all flagged requests:', err);
        setError(err.response?.data?.message || 'Failed to fetch flagged requests');
      } finally {
        setLoading(false);
      }
    } else if (filter === 'unresolved') {
      // Fetch unresolved flags only
      try {
        setLoading(true);
        const response = await getFlagged();
        const data = response.data?.data || [];
        setFlaggedRequests(data);
        setFilteredFlagged(data);
      } catch (err) {
        console.error('Error fetching unresolved flagged requests:', err);
        setError(err.response?.data?.message || 'Failed to fetch flagged requests');
      } finally {
        setLoading(false);
      }
    } else if (filter === 'resolved') {
      // Filter from already fetched data
      const filtered = flaggedRequests.filter(f => f.flagResolved === true);
      setFilteredFlagged(filtered);
    }
  };

  const handleFlaggedClick = (flaggedId) => {
    navigate(`/flagged/${flaggedId}`);
  };

  const getWorkingHoursColor = (hours) => {
    if (hours > 10) return styles.criticalHours;
    if (hours > 8) return styles.warningHours;
    return styles.normalHours;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  if (authLoading || loading) {
    return <LoadingScreen message={authLoading ? 'Authenticating...' : 'Loading flagged requests...'} />;
  }

  const totalPages = Math.max(1, Math.ceil(filteredFlagged.length / FLAGGED_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedFlagged = filteredFlagged.slice(
    (safePage - 1) * FLAGGED_PAGE_SIZE,
    (safePage - 1) * FLAGGED_PAGE_SIZE + FLAGGED_PAGE_SIZE
  );

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>
          <svg className={styles.flagIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
          </svg>
          Flagged Requests
        </h1>
        <p className={styles.subtitle}>Monitor SLA breaches and take action</p>
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
          onClick={() => handleFilterChange('unresolved')}
          className={`${styles.filterBtn} ${activeFilter === 'unresolved' ? styles.active : ''}`}
        >
          <svg className={styles.filterIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Active Flags
          <span className={styles.badge}>
            {flaggedRequests.filter(f => !f.flagResolved).length}
          </span>
        </button>
        <button
          onClick={() => handleFilterChange('all')}
          className={`${styles.filterBtn} ${activeFilter === 'all' ? styles.active : ''}`}
        >
          All Flags
          <span className={styles.badge}>{flaggedRequests.length}</span>
        </button>
      </div>

      {/* Flagged Requests List */}
      <div className={styles.flaggedList}>
        {filteredFlagged.length > 0 ? (
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <div className={styles.colRequestId}>Request ID</div>
              <div className={styles.colTitle}>Title</div>
              <div className={styles.colStage}>Stage</div>
              <div className={styles.colInstitution}>Institution</div>
              <div className={styles.colHours}>Working Hours</div>
              <div className={styles.colFlagged}>Flagged Date</div>
              <div className={styles.colStatus}>Status</div>
            </div>
            {paginatedFlagged.map((flagged) => (
              <div 
                key={flagged._id} 
                className={styles.tableRow}
                onClick={() => handleFlaggedClick(flagged._id)}
                style={{ cursor: 'pointer' }}
              >
                <div className={styles.colRequestId}>
                  <span className={styles.requestIdText}>
                    {flagged.request?.requestID || 'N/A'}
                  </span>
                </div>
                <div className={styles.colTitle}>
                  <span className={styles.titleText}>
                    {flagged.request?.title || 'Unknown'}
                  </span>
                </div>
                <div className={styles.colStage}>
                  <span className={styles.stageBadge}>
                    {flagged.request?.stage?.replace(/_/g, ' ') || 'UNKNOWN'}
                  </span>
                </div>
                <div className={styles.colInstitution}>
                  <span className={styles.institutionText}>
                    {flagged.request?.institution || 'N/A'}
                  </span>
                </div>
                <div className={styles.colHours}>
                  <span className={getWorkingHoursColor(flagged.request?.workingHrsTaken || 0)}>
                    {flagged.request?.workingHrsTaken?.toFixed(1) || '0.0'}h
                  </span>
                </div>
                <div className={styles.colFlagged}>
                  <span className={styles.dateText}>
                    {formatDate(flagged.createdAt)}
                  </span>
                </div>
                <div className={styles.colStatus}>
                  <span className={`${styles.statusBadge} ${flagged.flagResolved ? styles.resolved : styles.unresolved}`}>
                    {flagged.flagResolved ? 'Resolved' : 'Active'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <svg className={styles.emptyIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className={styles.emptyText}>
              {activeFilter === 'unresolved' 
                ? 'No active flags found. All requests are within SLA!'
                : 'No flagged requests found for the selected filter.'}
            </p>
            <button
              onClick={() => handleFilterChange('all')}
              className={styles.resetBtn}
            >
              View All Flags
            </button>
          </div>
        )}
        {filteredFlagged.length > 0 && totalPages > 1 && (
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
        {filteredFlagged.length > 0 && (
          <p className={styles.footerCounter}>
            Showing {paginatedFlagged.length ? (safePage - 1) * FLAGGED_PAGE_SIZE + 1 : 0}
            –{(safePage - 1) * FLAGGED_PAGE_SIZE + paginatedFlagged.length} of {filteredFlagged.length} flagged requests
          </p>
        )}
      </div>
    </div>
  );
};

export default FlaggedPage;
