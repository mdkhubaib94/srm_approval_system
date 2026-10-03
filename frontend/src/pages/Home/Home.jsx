
import { useState, useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import srmLogo from "../../assets/SRMRMP_LOGO.png";
import styles from "./Home.module.css";

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const [backgroundImages] = useState([
    "/images/easwari-engineering-college.jpeg",
    "/images/srm-dental-college.jpeg",
    "/images/srm-university-ramapuram.jpeg",
  ]);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Rotate background images every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % backgroundImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [backgroundImages.length]);

  // Already signed in (session restored from the refresh cookie): go straight in.
  if (!authLoading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div className={styles.container}>
      {/* Background Images - Carousel Effect */}
      {backgroundImages.map((img, index) => (
        <div
          key={img}
          className={`${styles.bgImage} ${
            index === currentImageIndex ? styles.bgImageActive : styles.bgImageInactive
          }`}
          style={{
            backgroundImage: `url('${img}')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          {/* Overlay */}
          <div className={styles.overlay}></div>
        </div>
      ))}

      {/* Content on top of background */}
      <div className={styles.contentWrapper}>
        <main className={styles.mainContent}>
          <div className={styles.innerContent}>
            <div className={styles.logoTextGroup}>
              {/* SRM Logo at top */}
              <div className={styles.logoWrapper}>
                <img
                  src={srmLogo}
                  alt="SRM Logo"
                  className={styles.logo}
                  
                />
              </div>

              {/* Text below logo */}
              <h1 className={styles.title}>
                <span className={styles.titleBlock}>Digital Institutional</span>
                <span className={styles.titleBlue}>Approval System</span>
              </h1>

              {/* Login Button below text */}
              <div className={styles.btnGroup}>
                <Link
                  to="/login"
                  className={styles.loginBtn}
                >
                  Login
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
