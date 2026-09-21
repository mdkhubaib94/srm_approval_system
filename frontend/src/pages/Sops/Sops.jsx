
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getSops, reindexSop } from '../../api/sops.api';
import { downloadFile } from '../../api/files.api';
import { openInNewTab } from '../../utils/safeOpen';
import LoadingScreen from '../../common/LoadingScreen';
import SopDetailModal from '../../components/SopDetailModal';
import styles from './Sops.module.css';
const SOP_VIEW_ROLES = ['REQUESTER', 'INSTITUTION_MANAGER', 'CHAIRMAN_OFFICE'];
const SOPS_PAGE_SIZE = 20;

const SopsPage = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [sops, setSops] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewingFileId, setViewingFileId] = useState(null);
  const [reindexingId, setReindexingId] = useState(null);
  const [selectedSop, setSelectedSop] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const canView = SOP_VIEW_ROLES.includes(user?.role);
  const canManage = user?.role === 'CHAIRMAN_OFFICE';

  const fetchSops = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const response = await getSops();
      setSops(response.data?.data || []);
    } catch (err) {
      console.error('Error fetching SOPs:', err);
      if (!silent) setError(err.response?.data?.message || 'Failed to fetch SOPs');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Without view access there's nothing to load — derived rather than set
  // from the effect below, so there's no direct setState in its body.
  const isLoading = canView ? loading : false;

  // Mount fetch is inlined rather than calling the shared fetchSops above —
  // referencing that useCallback directly from an effect is what trips
  // set-state-in-effect. The retry button and the polling interval below
  // both still call it directly, which is fine: neither is analyzed the same
  // way (a click handler isn't an effect body; the interval callback runs
  // detached, dispatched via setInterval rather than called inline).
  useEffect(() => {
    if (authLoading || !canView) return;

    const loadInitialSops = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getSops();
        setSops(response.data?.data || []);
      } catch (err) {
        console.error('Error fetching SOPs:', err);
        setError(err.response?.data?.message || 'Failed to fetch SOPs');
      } finally {
        setLoading(false);
      }
    };
    loadInitialSops();
  }, [authLoading, canView]);

  // While any SOP is being indexed, silently re-poll every 10s so the
  // status chips actually update when the background worker finishes.
  const hasIndexingInFlight = sops.some((s) =>
    ['pending', 'processing'].includes(s.docIndexStatus)
  );

  useEffect(() => {
    if (!hasIndexingInFlight) return;
    const interval = setInterval(() => fetchSops(true), 10_000);
    return () => clearInterval(interval);
  }, [hasIndexingInFlight, fetchSops]);

  // View the uploaded SOP document (streamed from GridFS as a blob)
  const handleViewDocument = async (attachment) => {
    if (!attachment?.fileId) return;
    try {
      setViewingFileId(attachment.fileId);
      const response = await downloadFile(attachment.fileId);
      const blob = new Blob([response.data], {
        type: attachment.mimetype || 'application/pdf',
      });
      const url = window.URL.createObjectURL(blob);
      openInNewTab(url);
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error('Error viewing SOP document:', err);
      alert('Failed to open the SOP document. Please try again.');
    } finally {
      setViewingFileId(null);
    }
  };

  const handleReindex = async (sopId) => {
    try {
      setReindexingId(sopId);
      await reindexSop(sopId);
      // Optimistically flip the status chip; the worker updates it server-side
      setSops((prev) =>
        prev.map((s) => (s._id === sopId ? { ...s, docIndexStatus: 'pending' } : s))
      );
    } catch (err) {
      console.error('Error re-indexing SOP:', err);
      alert(err.response?.data?.message || 'Failed to start re-indexing');
    } finally {
      setReindexingId(null);
    }
  };

  // AI indexing status chip (document text extraction + embedding)
  const renderIndexStatus = (sop) => {
    switch (sop.docIndexStatus) {
      case 'done':
        return (
          <span className={`${styles.indexChip} ${styles.indexDone}`}>
            AI Indexed{sop.extractionMethod === 'ocr' ? ' (OCR)' : ''}
          </span>
        );
      case 'pending':
      case 'processing':
        return (
          <span className={`${styles.indexChip} ${styles.indexPending}`}>
            AI indexing…
          </span>
        );
      case 'failed':
        return (
          <span
            className={`${styles.indexChip} ${styles.indexFailed}`}
            title={sop.docIndexError || 'Document indexing failed'}
          >
            Indexing failed
          </span>
        );
      case 'no_document':
        return null;
      default:
        return null;
    }
  };

  if (authLoading || isLoading) {
    return <LoadingScreen message={authLoading ? 'Authenticating...' : 'Loading SOPs...'} />;
  }

  if (!canView) {
    return (
      <div className={styles.container}>
        <div className={styles.errorBox}>
          <p>
            You do not have permission to view SOPs. Access is restricted to
            Requesters, Institution Managers, and the Chairman Office.
          </p>
        </div>
      </div>
    );
  }

  const filteredSops = sops.filter((sop) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      sop.referenceNumber?.toLowerCase().includes(q) ||
      sop.title?.toLowerCase().includes(q) ||
      sop.description?.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredSops.length / SOPS_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedSops = filteredSops.slice(
    (safePage - 1) * SOPS_PAGE_SIZE,
    (safePage - 1) * SOPS_PAGE_SIZE + SOPS_PAGE_SIZE
  );

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Standard Operating Procedures</h1>
            <p className={styles.subtitle}>
              {canManage
                ? 'Manage institutional SOPs and their reference documents'
                : 'Browse institutional SOPs and view their reference documents'}
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => navigate('/create-sop')}
              className={styles.createBtn}
            >
              + Create SOP
            </button>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className={styles.errorBox}>
          <p>{error}</p>
          <button onClick={fetchSops} className={styles.retryBtn}>
            Retry
          </button>
        </div>
      )}

      {/* Search */}
      <div className={styles.searchContainer}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          placeholder="Search by reference number, title, or description..."
          className={styles.searchInput}
        />
        <span className={styles.countBadge}>
          {filteredSops.length} SOP{filteredSops.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* SOPs List */}
      <div className={styles.sopsList}>
        {filteredSops.length > 0 ? (
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <div className={styles.colRef}>Reference No.</div>
              <div className={styles.colTitle}>Title</div>
              <div className={styles.colDescription}>Description</div>
              <div className={styles.colDate}>Added On</div>
              <div className={styles.colActions}>Document</div>
            </div>
            {paginatedSops.map((sop) => (
              <div
                key={sop._id}
                className={styles.tableRow}
                onClick={() => setSelectedSop(sop)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedSop(sop);
                  }
                }}
              >
                <div className={styles.colRef}>
                  <span className={styles.refBadge}>{sop.referenceNumber}</span>
                </div>
                <div className={styles.colTitle}>
                  <span className={styles.titleText}>{sop.title}</span>
                  {renderIndexStatus(sop)}
                </div>
                <div className={styles.colDescription}>
                  <span className={styles.descriptionText}>{sop.description}</span>
                </div>
                <div className={styles.colDate}>
                  <span className={styles.dateText}>
                    {new Date(sop.createdAt).toLocaleDateString('en-GB')}
                  </span>
                </div>
                <div className={styles.colActions}>
                  {sop.attachments?.length > 0 ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewDocument(sop.attachments[0]);
                      }}
                      className={styles.viewBtn}
                      disabled={viewingFileId === sop.attachments[0].fileId}
                    >
                      {viewingFileId === sop.attachments[0].fileId
                        ? 'Opening...'
                        : 'View SOP Document'}
                    </button>
                  ) : (
                    <span className={styles.noDocText}>No document</span>
                  )}
                  {canManage && ['failed', 'done'].includes(sop.docIndexStatus) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReindex(sop._id);
                      }}
                      className={styles.reindexBtn}
                      disabled={reindexingId === sop._id}
                      title="Re-run AI document indexing (text extraction / OCR + embeddings)"
                    >
                      {reindexingId === sop._id ? 'Starting...' : 'Re-index'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>
              {searchTerm
                ? 'No SOPs match your search.'
                : 'No SOPs have been added yet.'}
            </p>
            {searchTerm && (
              <button onClick={() => { setSearchTerm(''); setCurrentPage(1); }} className={styles.resetBtn}>
                Clear Search
              </button>
            )}
          </div>
        )}
        {filteredSops.length > 0 && totalPages > 1 && (
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
        {filteredSops.length > 0 && (
          <p className={styles.footerCounter}>
            Showing {paginatedSops.length ? (safePage - 1) * SOPS_PAGE_SIZE + 1 : 0}
            –{(safePage - 1) * SOPS_PAGE_SIZE + paginatedSops.length} of {filteredSops.length} SOPs
          </p>
        )}
      </div>

      <SopDetailModal
        sop={selectedSop}
        isOpen={!!selectedSop}
        onClose={() => setSelectedSop(null)}
        canManage={canManage}
        onViewDocument={handleViewDocument}
        viewingFileId={viewingFileId}
        onUpdated={(updatedSop) => {
          setSops((prev) => prev.map((s) => (s._id === updatedSop._id ? updatedSop : s)));
          setSelectedSop(updatedSop);
        }}
      />
    </div>
  );
};

export default SopsPage;
