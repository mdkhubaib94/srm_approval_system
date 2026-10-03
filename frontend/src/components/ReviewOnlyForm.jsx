
import styles from './ProcessRequestModal.module.css';

export default function ReviewOnlyForm({ role }) {
  const roleNames = {
    CHAIRMAN_OFFICE: 'Chairman Office',
    HR_HEAD: 'HR Head',
    MMA: 'MMA',
    MANAGER_DATA_MANAGEMENT: 'Manager - Data Management',
    AUDIT: 'Audit',
    GM_FINANCE: 'GM Finance',
    DIRECTOR_ADMISSIONS: 'Director Admissions',
    DIRECTOR_RESEARCH: 'Director Research',
    DEAN_ADMIN: 'Dean Admin',
    CHIEF_DIRECTOR: 'Chief Director',
  };

  return (
    <div className={styles.roleForm}>
      <h3 className={styles.roleFormTitle}>Request Review</h3>
      
      <div className={styles.infoBox}>
        <p className={styles.infoText}>
          As {roleNames[role]}, you can review the request, add comments, and forward it to the next stage in the workflow. No additional fields are required.
        </p>
      </div>
    </div>
  );
}
