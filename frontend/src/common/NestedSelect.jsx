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
  searchable = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredOption, setHoveredOption] = useState(null);
  const containerRef = useRef(null);
  const [subMenuPos, setSubMenuPos] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
    setHoveredOption(null);
    setQuery("");
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

  // While searching, nested groups are flattened so a match inside a submenu is
  // directly selectable; the group name is kept as context.
  const searchTerm = searchable ? query.trim().toLowerCase() : "";
  const searchResults = searchTerm
    ? options.flatMap((rawOpt) => {
        const opt = normalizeOption(rawOpt);
        if (opt.subOptions?.length) {
          return opt.subOptions
            .filter((sub) => sub.label.toLowerCase().includes(searchTerm))
            .map((sub) => ({ ...sub, group: opt.label }));
        }
        return opt.value && opt.label.toLowerCase().includes(searchTerm) ? [opt] : [];
      })
    : null;

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
          {searchable && (
            <div className={styles.searchWrapper}>
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className={styles.searchInput}
              />
            </div>
          )}
          <div className={styles.scrollWrapper}>
            {searchResults && searchResults.length === 0 && (
              <div className={styles.noResults}>No matches found</div>
            )}
            {searchResults
              ? searchResults.map((opt) => (
                  <div
                    key={`${opt.group || ""}-${opt.value}`}
                    className={`${styles.option} ${value === opt.value ? styles.optionSelected : ""}`}
                    onClick={() => handleSelect(opt.value)}
                  >
                    <span className={styles.optionLabel}>
                      {opt.label}
                      {opt.group && <span className={styles.groupHint}> · {opt.group}</span>}
                    </span>
                  </div>
                ))
              : options.map((rawOpt) => {
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
