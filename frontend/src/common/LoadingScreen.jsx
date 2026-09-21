
import styles from './LoadingScreen.module.css';

export default function LoadingScreen({ message }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.spinner} />
      {message && <p className={styles.message}>{message}</p>}
    </div>
  );
}
