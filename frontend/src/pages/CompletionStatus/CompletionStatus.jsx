

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getCompleted } from '../../api/completionStatus.api';
import LoadingScreen from '../../common/LoadingScreen';
import styles from './CompletionStatus.module.css';

const COMPLETION_PAGE_SIZE = 20;

const CompletionStatusPage = () => {
  const navigate = useNavigate();
  const { loading: authLoading } = useAuth();
  const [completedRequests, setCompletedRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Bumped by the retry button to re-run the effect below.
  const [reloadKey, setReloadKey] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (authLoading) return;

    const fetchCompletedRequests = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getCompleted();
        const data = response.data?.data || [];
        setCompletedRequests(data);
        setFilteredRequests(data);
      } catch (err) {
        console.error('Error fetching completed requests:', err);
        setError(err.response?.data?.message || 'Failed to fetch completed requests');
      } finally {
        setLoading(false);
      }
    };
    fetchCompletedRequests();
  }, [authLoading, reloadKey]);

  const retryFetch = () => setReloadKey((k) => k + 1);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
    if (tab === 'all') {
      setFilteredRequests(completedRequests);
    } else if (tab === 'pending') {
      setFilteredRequests(completedRequests.filter(c => c.completedStatus === false));
    } else if (tab === 'completed') {
      setFilteredRequests(completedRequests.filter(c => c.completedStatus === true));
    } else if (tab === 'overdue') {
      const now = new Date();
      setFilteredRequests(
        completedRequests.filter(
          c => !c.completedStatus && new Date(c.expectedCompletion) < now
        )
      );
    }
  };

  const handleRowClick = (completedId) => {
    navigate(`/completion-status/${completedId}`);
  };

  const getStatusBadge = (completed) => {
    if (completed.completedStatus) {
      return { text: 'COMPLETED', className: styles.statusCompleted };
    }
    
    const now = new Date();
    const expectedDate = new Date(completed.expectedCompletion);
    
    if (expectedDate < now) {
      return { text: 'OVERDUE', className: styles.statusOverdue };
    }
    
    return { text: 'PENDING', className: styles.statusPending };
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const getOverdueCount = () => {
    const now = new Date();
    return completedRequests.filter(
      c => !c.completedStatus && new Date(c.expectedCompletion) < now
    ).length;
  };

  if (authLoading || loading) {
    return <LoadingScreen message={authLoading ? 'Authenticating...' : 'Loading completion status...'} />;
  }

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / COMPLETION_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRequests = filteredRequests.slice(
    (safePage - 1) * COMPLETION_PAGE_SIZE,
    (safePage - 1) * COMPLETION_PAGE_SIZE + COMPLETION_PAGE_SIZE
  );

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Completion Status</h1>
        <p className={styles.subtitle}>Track completion status of approved requests</p>
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

      {/* Tabs */}
      <div className={styles.tabsContainer}>
        <button
          onClick={() => handleTabChange('all')}
          className={`${styles.tab} ${activeTab === 'all' ? styles.activeTab : ''}`}
        >
          All Requests
          <span className={styles.tabBadge}>{completedRequests.length}</span>
        </button>
        <button
          onClick={() => handleTabChange('pending')}
          className={`${styles.tab} ${activeTab === 'pending' ? styles.activeTab : ''}`}
        >
          Pending
          <span className={styles.tabBadge}>
            {completedRequests.filter(c => c.completedStatus === false).length}
          </span>
        </button>
        <button
          onClick={() => handleTabChange('completed')}
          className={`${styles.tab} ${activeTab === 'completed' ? styles.activeTab : ''}`}
        >
          Completed
          <span className={styles.tabBadge}>
            {completedRequests.filter(c => c.completedStatus === true).length}
          </span>
        </button>
        <button
          onClick={() => handleTabChange('overdue')}
          className={`${styles.tab} ${activeTab === 'overdue' ? styles.activeTab : ''}`}
        >
          Overdue
          <span className={styles.tabBadge}>{getOverdueCount()}</span>
        </button>
      </div>

      {/* Requests List */}
      <div className={styles.requestsList}>
        {filteredRequests.length > 0 ? (
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <div className={styles.colRequestID}>Request ID</div>
              <div className={styles.colTitle}>Title</div>
              <div className={styles.colInstitution}>Institution</div>
              <div className={styles.colExpected}>Expected Date</div>
              <div className={styles.colActual}>Completion Date</div>
              <div className={styles.colStatus}>Status</div>
            </div>
            {paginatedRequests.map((completed) => {
              const statusInfo = getStatusBadge(completed);
              return (
                <div 
                  key={completed._id} 
                  className={styles.tableRow}
                  onClick={() => handleRowClick(completed._id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={styles.colRequestID}>
                    <span className={styles.requestIDText}>
                      {completed.request?.requestID || 'N/A'}
                    </span>
                  </div>
                  <div className={styles.colTitle}>
                    <span className={styles.titleText}>
                      {completed.request?.title || 'Untitled Request'}
                    </span>
                  </div>
                  <div className={styles.colInstitution}>
                    <span className={styles.institutionText}>
                      {completed.request?.institution || 'N/A'}
                    </span>
                  </div>
                  <div className={styles.colExpected}>
                    <span className={styles.dateText}>
                      {formatDate(completed.expectedCompletion)}
                    </span>
                  </div>
                  <div className={styles.colActual}>
                    <span className={styles.dateText}>
                      {formatDate(completed.completionDate)}
                    </span>
                  </div>
                  <div className={styles.colStatus}>
                    <span className={`${styles.statusBadge} ${statusInfo.className}`}>
                      {statusInfo.text}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>
              No completed requests found for the selected filter.
            </p>
            <button
              onClick={() => handleTabChange('all')}
              className={styles.resetBtn}
            >
              View All Requests
            </button>
          </div>
        )}
        {filteredRequests.length > 0 && totalPages > 1 && (
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
        {filteredRequests.length > 0 && (
          <p className={styles.footerCounter}>
            Showing {paginatedRequests.length ? (safePage - 1) * COMPLETION_PAGE_SIZE + 1 : 0}
            –{(safePage - 1) * COMPLETION_PAGE_SIZE + paginatedRequests.length} of {filteredRequests.length} requests
          </p>
        )}
      </div>
    </div>
  );
};

export default CompletionStatusPage;
