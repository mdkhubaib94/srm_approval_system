import { useState, useRef, useEffect } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import styles from "./NestedSelect.module.css";

export default function NestedSelect({
  value,
  onChange,
  options,
  placeholder = "Select Option",
  error,
  className,
  dropUp = false,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredOption, setHoveredOption] = useState(null);
  const containerRef = useRef(null);
  const [subMenuPos, setSubMenuPos] = useState(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
    setHoveredOption(null);
  };

  const handleMouseEnter = (event, uniqueKey) => {
    setHoveredOption(uniqueKey);
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect) {
      setSubMenuPos({
        top: rect.top,
        left: rect.right,
      });
    }
  };

  // Helper to normalize option to object
  const normalizeOption = (opt) => {
    if (typeof opt === "string") {
      return { label: opt, value: opt };
    }
    return opt;
  };

  return (
    <div className={`${styles.container} ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`${styles.button} 
          ${error ? styles.buttonError : styles.buttonDefault} 
          ${disabled ? styles.buttonDisabled : styles.buttonActive}`}
      >
        <span
          className={`${styles.label} ${!value ? styles.labelEmpty : styles.labelSelected}`}
        >
          {value || placeholder}
        </span>
        <ChevronDownIcon className={styles.chevronIcon} aria-hidden="true" />
      </button>

      {isOpen && !disabled && (
        <div
          className={`${styles.dropdown} ${dropUp ? styles.dropdownDropup : styles.dropdownDropdown}`}
        >
          <div className={styles.scrollWrapper}>
            {options.map((rawOpt) => {
              const opt = normalizeOption(rawOpt);
              const hasSub = !!opt.subOptions && opt.subOptions.length > 0;
              const uniqueKey = opt.label; // Assuming generic labels are unique enough for key

              return (
                <div
                  key={uniqueKey}
                  className={styles.optionWrapper}
                  onMouseEnter={(e) => handleMouseEnter(e, uniqueKey)}
                  onMouseLeave={() => setHoveredOption(null)}
                >
                  <div
                    className={`${styles.option} ${value === opt.value ? styles.optionSelected : ""}`}
                    onClick={() => {
                      if (!hasSub && opt.value) {
                        handleSelect(opt.value);
                      }
                    }}
                  >
                    <span className={styles.optionLabel}>{opt.label}</span>
                    {hasSub && (
                      <ChevronRightIcon className={styles.submenuChevron} />
                    )}
                  </div>

                  {/* Submenu */}
                  {hasSub && hoveredOption === uniqueKey && subMenuPos && (
                    <div
                      className={styles.submenu}
                      style={{
                        top: subMenuPos.top,
                        left: subMenuPos.left,
                      }}
                    >
                      {opt.subOptions?.map((sub) => (
                        <div
                          key={sub.value}
                          className={`${styles.submenuOption} ${styles.wrapBreakWord}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelect(sub.value);
                          }}
                        >
                          <span className={styles.submenuLabel}>{sub.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
}
