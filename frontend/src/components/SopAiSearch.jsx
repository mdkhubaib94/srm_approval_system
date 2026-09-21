
import { useState, useEffect, useRef } from "react";
import { getSops, analyzeSop } from "../api/sops.api";
import { downloadFile } from "../api/files.api";
import { openInNewTab } from "../utils/safeOpen";
import styles from "./SopAiSearch.module.css";

/**
 * AI-powered SOP matcher for the Create Request form.
 *
 * Sends the draft request's title + description to POST /sops/analyze,
 * which vectorizes the text locally on the server and cosine-matches it
 * against every SOP's stored embedding. The best match (above threshold)
 * is auto-selected; the user retains full manual override control via
 * radio buttons and a dropdown of all available SOPs.
 *
 * Props:
 * - title, description: current draft request text
 * - category: the derived approval category label (extra matching signal)
 * - requestType: the selected request type label (e.g. "Maintenance")
 * - generalCategory: the general category, when the type is General
 * - selectedSop: the currently attached SOP object (or null)
 * - onSopChange(sop|null): notify parent (autofills the reference field)
 * - children: the SOP reference <input> — rendered with the AI Search
 *   button at its side
 */
export default function SopAiSearch({
  title,
  description,
  category,
  requestType,
  generalCategory,
  selectedSop,
  onSopChange,
  children,
}) {
  const [allSops, setAllSops] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null); // last /sops/analyze response
  const [error, setError] = useState(null);
  const [hasMatchingSop, setHasMatchingSop] = useState(null); // radio state
  const [viewingDocId, setViewingDocId] = useState(null); // fileId currently opening

  // Searchable manual picker
  const [manualQuery, setManualQuery] = useState("");
  const [showManualList, setShowManualList] = useState(false);
  const manualRef = useRef(null);

  // Close the manual dropdown when clicking outside it
  useEffect(() => {
    const onClickOutside = (e) => {
      if (manualRef.current && !manualRef.current.contains(e.target)) {
        setShowManualList(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Load all SOPs once for the manual override dropdown
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await getSops();
        if (!cancelled) setAllSops(response.data?.data || []);
      } catch (err) {
        // Non-blocking: the dropdown just stays empty
        console.error("Failed to load SOPs for AI search:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleAiSearch = async () => {
    setError(null);

    const q = `${title || ""}${description || ""}`.trim();
    if (!q) {
      setError("Enter a request title and purpose first, then run AI search.");
      return;
    }

    try {
      setAnalyzing(true);
      const response = await analyzeSop({
        title: title || "",
        description: description || "",
        category: category || "",
        requestType: requestType || "",
        generalCategory: generalCategory || "",
      });
      const result = response.data;
      setAnalysis(result);

      if (result.hasMatchingSop && result.sop) {
        setHasMatchingSop(true);
        onSopChange(result.sop); // autofill reference number + attach SOP
      } else {
        setHasMatchingSop(false);
        onSopChange(null);
      }
    } catch (err) {
      console.error("SOP AI analysis failed:", err);
      setError(err.response?.data?.message || "AI search failed. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRadioChange = (value) => {
    setHasMatchingSop(value);
    if (!value) {
      onSopChange(null);
    }
  };

  // Select an SOP from the searchable manual picker
  const handleManualPick = (sop) => {
    setHasMatchingSop(true);
    onSopChange(sop); // autofills reference number + attaches the document
    setManualQuery(sop.title);
    setShowManualList(false);
  };

  // Open any SOP's attached document in a new tab
  const viewDocument = async (sop, e) => {
    if (e) e.stopPropagation();
    const attachment = sop?.attachments?.[0];
    if (!attachment?.fileId) return;
    try {
      setViewingDocId(attachment.fileId);
      const response = await downloadFile(attachment.fileId);
      const blob = new Blob([response.data], {
        type: attachment.mimetype || "application/pdf",
      });
      const url = window.URL.createObjectURL(blob);
      openInNewTab(url);
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error("Error viewing SOP document:", err);
      setError("Failed to open the SOP document.");
    } finally {
      setViewingDocId(null);
    }
  };

  // Filter SOPs by title (and reference number) for the manual picker
  const q = manualQuery.trim().toLowerCase();
  const filteredSops = q
    ? allSops.filter(
        (s) =>
          s.title?.toLowerCase().includes(q) ||
          s.referenceNumber?.toLowerCase().includes(q)
      )
    : allSops;

  const scorePercent = (score) =>
    score != null ? `${Math.round(score * 100)}%` : null;

  // The green "selected SOP" card — reused just under the radio (after AI
  // search) or standalone (manual selection without analysis).
  const selectedCard = selectedSop ? (
    <div className={styles.matchCard}>
      <div className={styles.matchInfo}>
        <div className={styles.matchHeader}>
          <span className={styles.refBadge}>{selectedSop.referenceNumber}</span>
          {analysis?.sop?._id === selectedSop._id && analysis?.score != null && (
            <span className={styles.scoreBadge}>
              AI match · {scorePercent(analysis.score)} similar
              {analysis.matchedVia === "document" && " · via document content"}
            </span>
          )}
        </div>
        <p className={styles.matchTitle}>{selectedSop.title}</p>
        {analysis?.sop?._id === selectedSop._id &&
          analysis?.matchedVia === "document" &&
          analysis?.matchedSnippet && (
            <p className={styles.snippetText}>
              Matched section{analysis.matchedPage ? ` (page ${analysis.matchedPage})` : ""}:
              {" "}&ldquo;{analysis.matchedSnippet}&rdquo;
            </p>
          )}
      </div>
      <div className={styles.matchActions}>
        {selectedSop.attachments?.length > 0 && (
          <button
            type="button"
            onClick={(e) => viewDocument(selectedSop, e)}
            className={styles.viewDocBtn}
            disabled={viewingDocId === selectedSop.attachments[0].fileId}
          >
            {viewingDocId === selectedSop.attachments[0].fileId
              ? "Opening..."
              : "View SOP Document"}
          </button>
        )}
        <button
          type="button"
          onClick={() => handleRadioChange(false)}
          className={styles.clearBtn}
        >
          Remove
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className={styles.wrapper}>
      {/* Reference input + AI Search button side by side */}
      <div className={styles.fieldRow}>
        {children}
        <button
          type="button"
          onClick={handleAiSearch}
          className={styles.aiSearchBtn}
          disabled={analyzing}
          title="Semantically match this request's title & purpose against all SOP descriptions"
        >
          {analyzing ? (
            <>
              <span className={styles.spinner} /> Analyzing...
            </>
          ) : (
            <>
              <svg
                className={styles.aiIcon}
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 2l1.9 4.6L18.5 8.5 13.9 10.4 12 15l-1.9-4.6L5.5 8.5l4.6-1.9L12 2z" />
                <path d="M19 14l.9 2.1 2.1.9-2.1.9L19 20l-.9-2.1-2.1-.9 2.1-.9L19 14z" />
              </svg>
              AI Search
            </>
          )}
        </button>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      {/* Analysis outcome */}
      {analysis && (
        <div className={styles.resultBox}>
          {/* hasMatchingSop radio toggle — user has ultimate override power */}
          <div className={styles.radioGroup}>
            <span className={styles.radioLabel}>Matching SOP available?</span>
            <label className={styles.radioOption}>
              <input
                type="radio"
                name="hasMatchingSop"
                checked={hasMatchingSop === true}
                onChange={() => handleRadioChange(true)}
              />
              Yes
            </label>
            <label className={styles.radioOption}>
              <input
                type="radio"
                name="hasMatchingSop"
                checked={hasMatchingSop === false}
                onChange={() => handleRadioChange(false)}
              />
              No
            </label>
          </div>

          {/* Selected/matched SOP — green box, right under "SOP available" */}
          {selectedCard}

          {analysis.hasMatchingSop === false && hasMatchingSop === false && (
            <p className={styles.noMatchText}>
              No SOP passed the similarity threshold
              {analysis.score != null && (
                <> (best score: {scorePercent(analysis.score)})</>
              )}
              . You can still select one from the candidates below.
            </p>
          )}

          {/* Top candidates shortlist — click to select */}
          {analysis.topMatches?.length > 0 && (
            <div className={styles.matchesList}>
              <span className={styles.matchesLabel}>Top candidates:</span>
              {analysis.topMatches.map((m) => {
                const isSelected = selectedSop?._id === m._id;
                const fullSop = allSops.find((s) => s._id === m._id);
                const hasDoc = fullSop?.attachments?.length > 0;
                const opening = hasDoc && viewingDocId === fullSop.attachments[0].fileId;
                const pick = () => {
                  if (fullSop) {
                    setHasMatchingSop(true);
                    onSopChange(fullSop);
                  }
                };
                return (
                  <div
                    key={m._id}
                    role="button"
                    tabIndex={0}
                    onClick={pick}
                    onKeyDown={(e) => { if (e.key === "Enter") pick(); }}
                    className={`${styles.matchRow} ${isSelected ? styles.matchRowActive : ""}`}
                    title={`${m.referenceNumber} — click to select`}
                  >
                    <span className={styles.matchRowScore}>{scorePercent(m.score)}</span>
                    <span className={styles.matchRowRef}>{m.referenceNumber}</span>
                    <span className={styles.matchRowTitle}>{m.title}</span>
                    {hasDoc && (
                      <button
                        type="button"
                        className={styles.manualViewBtn}
                        onClick={(e) => viewDocument(fullSop, e)}
                        disabled={opening}
                      >
                        {opening ? "Opening..." : "View"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Selected SOP card when chosen manually (no AI analysis run) */}
      {!analysis && selectedCard}

      {/* Manual selection — searchable by title */}
      {allSops.length > 0 && (
        <div className={styles.manualBlock} ref={manualRef}>
          <span className={styles.manualLabel}>Or select an SOP manually</span>
          <div className={styles.manualCombo}>
            <input
              type="text"
              className={styles.manualInput}
              placeholder="Search SOP by title or reference number..."
              value={manualQuery}
              onChange={(e) => {
                setManualQuery(e.target.value);
                setShowManualList(true);
              }}
              onFocus={() => setShowManualList(true)}
            />
            {manualQuery && (
              <button
                type="button"
                className={styles.manualClear}
                onClick={() => {
                  setManualQuery("");
                  setShowManualList(true);
                }}
                aria-label="Clear search"
              >
                ×
              </button>
            )}

            {showManualList && (
              <div className={styles.manualDropdown}>
                {filteredSops.length === 0 ? (
                  <div className={styles.manualEmpty}>No SOPs match “{manualQuery}”.</div>
                ) : (
                  filteredSops.slice(0, 50).map((sop) => {
                    const isSelected = selectedSop?._id === sop._id;
                    const hasDoc = sop.attachments?.length > 0;
                    const opening =
                      hasDoc && viewingDocId === sop.attachments[0].fileId;
                    return (
                      <div
                        key={sop._id}
                        className={`${styles.manualOption} ${isSelected ? styles.manualOptionActive : ""}`}
                        onClick={() => handleManualPick(sop)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleManualPick(sop);
                        }}
                      >
                        <div className={styles.manualOptionText}>
                          <span className={styles.manualOptionTitle}>{sop.title}</span>
                          <span className={styles.manualOptionRef}>{sop.referenceNumber}</span>
                        </div>
                        {hasDoc && (
                          <button
                            type="button"
                            className={styles.manualViewBtn}
                            onClick={(e) => viewDocument(sop, e)}
                            disabled={opening}
                          >
                            {opening ? "Opening..." : "View"}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
