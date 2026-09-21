
import { useState } from 'react';
import SopAiSearch from './SopAiSearch';
import { REQUEST_CATEGORY_LABELS } from '../utils/types';
import styles from './ProcessRequestModal.module.css';

export default function InstitutionManagerForm({ request, formData, onChange }) {
  // The SOP currently linked to this request (populated by the backend),
  // which the manager can view, change via AI search, or clear.
  // Guard: only usable when sopId arrived populated (an object, not a bare id).
  const [selectedSop, setSelectedSop] = useState(
    request?.sopId && typeof request.sopId === 'object' ? request.sopId : null
  );

  const handleSOPAvailableChange = (e) => {
    const value = e.target.value === 'true';
    if (value) {
      onChange({ SOPAvailable: true });
    } else {
      // No SOP → clear the linked SOP and reference
      setSelectedSop(null);
      onChange({ SOPAvailable: false, SOP: '', sopId: '' });
    }
  };

  const handleSOPReferenceChange = (e) => {
    onChange({ SOP: e.target.value });
  };

  // Called by SopAiSearch when the AI (or the manager) picks/clears an SOP
  const handleSopChange = (sop) => {
    setSelectedSop(sop);
    if (sop) {
      onChange({
        SOPAvailable: true,
        SOP: sop.referenceNumber,
        sopId: sop._id,
      });
    } else {
      onChange({ SOP: '', sopId: '' });
    }
  };

  return (
    <div className={styles.roleForm}>
      <h3 className={styles.roleFormTitle}>SOP Management</h3>

      {/* SOP Available Toggle */}
      <div className={styles.formSection}>
        <label className={styles.label}>Is SOP Available?</label>
        <div className={styles.radioGroup}>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="sopAvailable"
              value="true"
              checked={formData.SOPAvailable === true}
              onChange={handleSOPAvailableChange}
            />
            Yes
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="sopAvailable"
              value="false"
              checked={formData.SOPAvailable === false}
              onChange={handleSOPAvailableChange}
            />
            No
          </label>
        </div>
      </div>

      {/* SOP Reference + AI search against the request's own text.
          The selected SOP card (with View SOP Document) shows the SOP
          already linked to this request, and any new pick replaces it. */}
      <div className={styles.formSection}>
        <label className={styles.label}>SOP Reference</label>
        <SopAiSearch
          title={request?.title || ''}
          description={request?.description || ''}
          category={
            request?.requestCategory
              ? (REQUEST_CATEGORY_LABELS[request.requestCategory] || request.requestCategory)
              : ''
          }
          selectedSop={selectedSop}
          onSopChange={handleSopChange}
        >
          <input
            type="text"
            className={styles.input}
            placeholder="e.g., SOP-2024-001"
            value={formData.SOP}
            onChange={handleSOPReferenceChange}
          />
        </SopAiSearch>
      </div>

    </div>
  );
}
