import styles from './StatsCard.module.css';

const COLOR_MAP = {
  "text-blue-600": styles.textBlue,
  "text-yellow-600": styles.textYellow,
  "text-green-600": styles.textGreen,
  "text-red-600": styles.textRed,
  "text-purple-600": styles.textPurple,
  "text-indigo-600": styles.textIndigo,
};

const BG_MAP = {
  "bg-blue-100": styles.bgBlue,
  "bg-yellow-100": styles.bgYellow,
  "bg-green-100": styles.bgGreen,
  "bg-red-100": styles.bgRed,
  "bg-purple-100": styles.bgPurple,
  "bg-indigo-100": styles.bgIndigo,
};

export default function StatsCard({ item, onActivate }) {
  const Icon = item.icon;
  const colorClass = COLOR_MAP[item.color] || "";
  const bgClass = BG_MAP[item.bgColor] || "";

  return (
    <div
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${item.description} - ${item.stat} requests`}
      className={styles.card}
    >
      <div className="flex flex-col items-center">
        <div className={`${styles.iconWrapper} ${bgClass}`}>
          <Icon className={`${styles.icon} ${colorClass}`} />
        </div>

        <p className={styles.name}>
          {item.name}
        </p>
      </div>

      <div className={styles.stat}>
        {item.stat}
      </div>

      <div className="flex flex-col items-center">
        <p className={styles.description}>
          {item.description}
        </p>

        <div className={styles.footer}>
          <span>Click to view</span>
          <svg
            className={styles.arrowIcon}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
