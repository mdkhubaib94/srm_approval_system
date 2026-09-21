

import styles from './ProcessRequestModal.module.css';

export default function ChairmanForm() {
  return (
    <div className={styles.roleForm}>
      <h3 className={styles.roleFormTitle}>Final Approval Authority</h3>
      
      <div className={styles.infoBox}>
        <p className={styles.infoText}>
          As Chairman, you have the authority to approve or reject this request. Choose your action above and provide any additional comments if needed.
        </p>
      </div>
    </div>
  );
}
