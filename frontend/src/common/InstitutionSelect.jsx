import { useState, useRef, useEffect } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import styles from "./InstitutionSelect.module.css";

const INSTITUTIONS = [
  {
    id: "SRM",
    label: "SRMIST",
    hasSubmenu: true,
    subOptions: [
      { id: "E&T", label: "E&T" },
      { id: "FSH", label: "FSH" },
      { id: "Management", label: "Management" },
      { id: "SEAD", label: "SEAD" },
    ],
  },
  { id: "EEC", label: "EEC" },
  { id: "DENTAL", label: "DENTAL" },
  { id: "SRM Nightingale School", label: "SRM Nightingale School" },
  { id: "Others", label: "Others" },
];

export default function InstitutionSelect({
  value,
  onChange,
  error,
  className,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredOption, setHoveredOption] = useState(null);
  const containerRef = useRef(null);

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

  const handleSelect = (optionId, subOptionId) => {
    let selectedValue;
    if (subOptionId) {
      // Must match the INSTITUTIONS enum on the backend exactly, so the value
      // is built from the parent's label ("SRMIST"), not its id ("SRM").
      // Format: "SRMIST - E&T", "SRMIST - FSH", etc.
      const parent = INSTITUTIONS.find((i) => i.id === optionId);
      selectedValue = `${parent?.label ?? optionId} - ${subOptionId}`;
    } else {
      // Direct selection: "EEC" or "DENTAL"
      selectedValue = optionId;
    }
    onChange(selectedValue);
    setIsOpen(false);
    setHoveredOption(null);
  };

  // Helper to get display label from value
  const getDisplayLabel = () => {
    if (!value) return "Select Institution";
    // If value matches one of our simple options
    if (value === "EEC") return "EEC";
    if (value === "DENTAL") return "DENTAL";
    if (value === "SRM Nightingale School") return "SRM Nightingale School";
    if (value === "Others") return "Others";
    if (value === "SRM") return "SRMIST"; // Legacy handling maybe?
    if (value.startsWith("SRM - ")) return value.replace(/^SRM\s*-\s*/, "SRMIST - ");
    // If value already contains SRMIST or is a simple value, return as-is
    return value; // Should be "SRMIST - E&T" etc.
  };

  return (
    <div className={`${styles.container} ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`${styles.button} ${error ? styles.buttonError : styles.buttonDefault}`}
      >
        <span
          className={`${styles.label} ${!value ? styles.labelEmpty : styles.labelSelected}`}
        >
          {getDisplayLabel()}
        </span>
        <ChevronDownIcon className={styles.chevronIcon} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          {INSTITUTIONS.map((inst) => {
            const isSelected =
              value === inst.id ||
              value === inst.label ||
              (value &&
                (value.startsWith(`${inst.id} -`) ||
                  value.startsWith(`${inst.label} -`)));
            return (
              <div
                key={inst.id}
                className={styles.optionWrapper}
                onMouseEnter={() => setHoveredOption(inst.id)}
                onMouseLeave={() => setHoveredOption(null)}
              >
                <div
                  className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                  onClick={() => !inst.hasSubmenu && handleSelect(inst.id)}
                >
                  <span className={styles.optionLabel}>{inst.label}</span>
                  {inst.hasSubmenu && (
                    <ChevronRightIcon className={styles.submenuChevron} />
                  )}
                </div>

                {/* Submenu */}
                {inst.hasSubmenu && hoveredOption === inst.id && (
                  <div className={styles.submenu}>
                    {inst.subOptions?.map((sub) => (
                      <div
                        key={sub.id}
                        className={styles.submenuOption}
                        onClick={(e) => {
                          e.stopPropagation();
                          // Use institution id + sub id for value (e.g. "SRM - E&T")
                          handleSelect(inst.id, sub.id);
                        }}
                      >
                        <span className={styles.optionLabel}>{sub.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
}
