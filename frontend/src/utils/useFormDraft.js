

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "srm-draft:";
// Drafts older than this are treated as stale and dropped on read.
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Persists an in-progress form to localStorage so navigating away (or an
 * accidental refresh / tab close) does not lose what the user typed.
 *
 * File objects cannot be serialised — callers must strip attachments before
 * calling save() and prompt the user to re-attach them.
 *
 * @param {string|null} key  Unique per form + user, e.g. `create-request:<userId>`.
 *                           Pass null while the user is still loading to defer reading.
 * @param {{ debounceMs?: number }} [options]
 */
export function useFormDraft(key, { debounceMs = 400 } = {}) {
  const storageKey = key ? `${STORAGE_PREFIX}${key}` : null;

  // Payload read from storage on mount — null when there is nothing to restore.
  const [restoredDraft, setRestoredDraft] = useState(null);
  // True once the initial read has happened; callers must not save before this,
  // otherwise the empty initial form state would overwrite the stored draft.
  const [ready, setReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  const timerRef = useRef(null);
  const storageKeyRef = useRef(storageKey);

  // Keep the ref in sync after each commit rather than writing it during
  // render — render must stay pure, and save()/clear() only ever run later
  // from event handlers, by which point this has already flushed.
  useEffect(() => {
    storageKeyRef.current = storageKey;
  }, [storageKey]);

  // Read the draft for the current key. `Date.now()` makes this impure, so
  // unlike the render-time adjustments elsewhere in this codebase, it has to
  // stay in an effect rather than run during render.
  useEffect(() => {
    const restoreForKey = () => {
      if (!storageKey) {
        setRestoredDraft(null);
        setDraftRestored(false);
        setReady(false);
        return;
      }

      let nextRestoredDraft = null;
      let nextDraftRestored = false;

      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          const savedAt = parsed?.savedAt;
          if (typeof savedAt === "number" && Date.now() - savedAt <= DRAFT_TTL_MS) {
            nextRestoredDraft = parsed.data ?? null;
            nextDraftRestored = parsed.data != null;
          } else {
            window.localStorage.removeItem(storageKey);
          }
        }
      } catch {
        // Corrupt or unreadable draft — discard it rather than blocking the form.
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          /* storage unavailable (private mode / quota) — nothing to clean up */
        }
      }

      setRestoredDraft(nextRestoredDraft);
      setDraftRestored(nextDraftRestored);
      setReady(true);
    };

    restoreForKey();
  }, [storageKey]);

  // Flush any pending write when the component unmounts.
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const save = useCallback(
    (data) => {
      const target = storageKeyRef.current;
      if (!target) return;

      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        try {
          window.localStorage.setItem(
            target,
            JSON.stringify({ savedAt: Date.now(), data })
          );
        } catch {
          /* quota exceeded or storage disabled — drafts are best-effort */
        }
      }, debounceMs);
    },
    [debounceMs]
  );

  const clear = useCallback(() => {
    clearTimeout(timerRef.current);
    setDraftRestored(false);
    const target = storageKeyRef.current;
    if (!target) return;
    try {
      window.localStorage.removeItem(target);
    } catch {
      /* storage unavailable — nothing to clean up */
    }
  }, []);

  const dismissNotice = useCallback(() => setDraftRestored(false), []);

  return { restoredDraft, ready, draftRestored, save, clear, dismissNotice };
}

export default useFormDraft;
