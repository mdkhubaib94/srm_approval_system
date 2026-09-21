
import styles from './ProcessRequestModal.module.css';

/**
 * HeadOfInstitutionForm
 *
 * Previously contained a department-role selector (MMA / HR / IT).
 * That logic has been removed — routing is now determined by requestCategory
 * set at creation time. HOI simply reviews and forwards.
 */
export default function HeadOfInstitutionForm() {
  return (
    <div className={styles.roleForm}>
      <h3 className={styles.roleFormTitle}>Head of Institution Review</h3>

      <div className={styles.infoBox}>
        <p className={styles.infoText}>
          Review the request details, add your comments, and forward to the next
          stage. The routing path is determined automatically by the request
          category selected at submission.
        </p>
      </div>
    </div>
  );
}
