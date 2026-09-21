
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getPolicies } from '../../api/policies.api';
import LoadingScreen from '../../common/LoadingScreen';
import styles from './Policies.module.css';

const POLICIES_PAGE_SIZE = 20;

const PoliciesPage = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Bumped by the retry button to re-run the effect below.
  const [reloadKey, setReloadKey] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Check if user has full access to policies
  const hasFullAccess = ["HEAD_OF_INSTITUTION", "DEAN_ADMIN", "CHAIRMAN"].includes(user?.role);

  useEffect(() => {
    if (authLoading) return;

    const fetchPolicies = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getPolicies();
        const data = response.data?.data || [];
        setPolicies(data);
      } catch (err) {
        console.error('Error fetching policies:', err);
        setError(err.response?.data?.message || 'Failed to fetch policies');
      } finally {
        setLoading(false);
      }
    };
    fetchPolicies();
  }, [authLoading, reloadKey]);

  const retryFetch = () => setReloadKey((k) => k + 1);

  const filteredPolicies = useMemo(() => {
    if (activeFilter === 'all') return policies;
    return policies.filter((p) => p.policyApprovalStatus?.toUpperCase() === activeFilter.toUpperCase());
  }, [activeFilter, policies]);

  const totalPages = Math.max(1, Math.ceil(filteredPolicies.length / POLICIES_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedPolicies = useMemo(() => {
    const start = (safePage - 1) * POLICIES_PAGE_SIZE;
    return filteredPolicies.slice(start, start + POLICIES_PAGE_SIZE);
  }, [filteredPolicies, safePage]);

  const handlePolicyClick = (policyId) => {
    if (hasFullAccess) {
      // Full access users can view and act on policies
      navigate(`/policies/${policyId}`);
    } else {
      // Read-only users get a message or limited view
      alert('You can only view policy information. Policy management is restricted to HOI, Dean Admin, and Chairman.');
    }
  };

  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
    setCurrentPage(1);
  };

  if (authLoading || loading) {
    return <LoadingScreen message={authLoading ? 'Authenticating...' : 'Loading policies...'} />;
  }

  const pendingCount = policies.filter((p) => p.policyApprovalStatus === 'PENDING').length;
  const approvedCount = policies.filter((p) => p.policyApprovalStatus === 'APPROVED').length;
  const rejectedCount = policies.filter((p) => p.policyApprovalStatus === 'REJECTED').length;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Policies</h1>
        <p className={styles.subtitle}>
          {hasFullAccess 
            ? "Manage and review institutional policies" 
            : "View institutional policies (read-only access)"}
        </p>
        {!hasFullAccess && (
          <div className={styles.accessNotice}>
            <p>ℹ️ You have read-only access. Policy management is restricted to HOI, Dean Admin, and Chairman.</p>
          </div>
        )}
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
          All Policies
          <span className={styles.badge}>{policies.length}</span>
        </button>
        <button
          onClick={() => handleFilterChange('pending')}
          className={`${styles.filterBtn} ${activeFilter === 'pending' ? styles.active : ''}`}
        >
          Pending
          <span className={styles.badge}>{pendingCount}</span>
        </button>
        <button
          onClick={() => handleFilterChange('approved')}
          className={`${styles.filterBtn} ${activeFilter === 'approved' ? styles.active : ''}`}
        >
          Approved
          <span className={styles.badge}>{approvedCount}</span>
        </button>
        <button
          onClick={() => handleFilterChange('rejected')}
          className={`${styles.filterBtn} ${activeFilter === 'rejected' ? styles.active : ''}`}
        >
          Rejected
          <span className={styles.badge}>{rejectedCount}</span>
        </button>
      </div>

      {/* Policies List */}
      <div className={styles.policiesList}>
        {filteredPolicies.length > 0 ? (
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <div className={styles.colTitle}>Title</div>
              <div className={styles.colDescription}>Description</div>
              <div className={styles.colRequester}>Requester</div>
              <div className={styles.colCost}>Cost</div>
              <div className={styles.colStatus}>Status</div>
              <div className={styles.colDate}>Created Date</div>
            </div>
            {paginatedPolicies.map((policy) => (
              <div
                key={policy._id}
                className={styles.tableRow}
                onClick={() => handlePolicyClick(policy._id)}
              >
                <div className={styles.colTitle}>
                  <span className={styles.titleText}>{policy.title}</span>
                </div>
                <div className={styles.colDescription}>
                  <span className={styles.descriptionText}>{policy.description}</span>
                </div>
                <div className={styles.colRequester}>
                  <span className={styles.requesterName}>{policy.requester?.name || 'Unknown'}</span>
                  <span className={styles.requesterRole}>{policy.requester?.role || ''}</span>
                </div>
                <div className={styles.colCost}>
                  <span className={styles.costText}>{policy.cost}</span>
                </div>
                <div className={styles.colStatus}>
                  <span
                    className={`${styles.statusBadge} ${
                      policy.policyApprovalStatus === 'APPROVED'
                        ? styles.statusApproved
                        : policy.policyApprovalStatus === 'REJECTED'
                          ? styles.statusRejected
                          : styles.statusPending
                    }`}
                  >
                    {policy.policyApprovalStatus}
                  </span>
                </div>
                <div className={styles.colDate}>
                  <span className={styles.dateText}>
                    {new Date(policy.createdAt).toLocaleDateString('en-GB')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {filteredPolicies.length > 0 && totalPages > 1 && (
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
        {filteredPolicies.length > 0 && (
          <p className={styles.footerCounter}>
            Showing {paginatedPolicies.length ? (safePage - 1) * POLICIES_PAGE_SIZE + 1 : 0}
            –{(safePage - 1) * POLICIES_PAGE_SIZE + paginatedPolicies.length} of {filteredPolicies.length} policies
          </p>
        )}
        {filteredPolicies.length === 0 && (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>
              No policies found for the selected filter.
            </p>
            <button
              onClick={() => handleFilterChange('all')}
              className={styles.resetBtn}
            >
              View All Policies
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PoliciesPage;
