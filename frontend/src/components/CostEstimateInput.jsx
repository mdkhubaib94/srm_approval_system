import styles from "./CostEstimateInput.module.css";

export default function CostEstimateInput({ value, onChange, error, className }) {
  const formatNumber = (num) => {
    if (!num && num !== 0) return "";
    return Number(num).toLocaleString("en-IN");
  };

  const handleChange = (e) => {
    const rawVal = e.target.value;
    // Strip non-numeric characters except decimals
    const numericVal = rawVal.replace(/[^0-9.]/g, "");

    // Prevent multiple decimals
    const parts = numericVal.split(".");
    const cleanVal = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : numericVal;

    const num = cleanVal === "" ? "" : parseFloat(cleanVal);
    onChange(num);
  };


  const displayValue = formatNumber(value);

  return (
    <div className={className}>
      <div className={styles.inputWrapper}>
        <div className={styles.leftAddon}>
          <span className={styles.addonText}>₹</span>
        </div>
        <input
          type="text"
          name="costEstimate"
          id="costEstimate"
          value={displayValue}
          onChange={handleChange}
          placeholder="0.00"
          className={`${styles.inputField} ${error ? styles.inputFieldError : ""}`}
        />
        <div className={styles.rightAddon}>
          <span className={styles.addonText} id="price-currency">
            INR
          </span>
        </div>
      </div>
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
}
