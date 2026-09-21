

import { useState } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

import styles from "./PasswordInput.module.css";

export default function PasswordInput({ 
  value, 
  onChange, 
  placeholder = "••••••••", 
  required = false,
  className = "",
  id,
  name,
  autoComplete = "off"
}) {
  const [showPassword, setShowPassword] = useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className={styles.wrapper}>
      <input
        id={id}
        name={name}
        type={showPassword ? "text" : "password"}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`${styles.inputField} ${className}`}
      />
      <button
        type="button"
        onClick={togglePasswordVisibility}
        className={styles.toggleBtn}
        tabIndex={-1}
        title={showPassword ? "Hide password" : "Show password"}
      >
        {showPassword ? (
          // Password is visible, show "eye with slash" to indicate "click to hide"
          <EyeSlashIcon className={styles.icon} />
        ) : (
          // Password is hidden, show "eye" to indicate "click to show"
          <EyeIcon className={styles.icon} />
        )}
      </button>
    </div>
  );
}