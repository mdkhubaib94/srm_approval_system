
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ProtectedRoute from "../../common/ProtectedRoute";
import { useAuth } from "../../context/AuthContext";
import styles from "./FlowCategories.module.css";
const BASE_FLOW = [
  "Requester (HoD)",
  "Institution Manager",
  "Accountant",
  "Head of Institution",
  "Chairman Office",
];

const CATEGORIES = [
  {
    group: "Admin",
    groupColor: "blue",
    items: [
      {
        id: "ADMIN_HR",
        label: "HR",
        examples: [
          "Recruitment",
          "Salary Revision",
          "Resignation",
          "Holiday",
          "Medical Leave",
          "Long Leave",
          "Maternity Leave",
          "Others",
        ],
        flow: ["HR Head", "Director Admin", "Chief Director", "Chairman"],
      },
      {
        id: "ADMIN_PURCHASE",
        label: "Purchase",
        examples: [
          "Consumables",
          "Non-consumables",
          "Books & Journals",
          "Lab Equipment",
          "Others",
        ],
        flow: ["MMA", "Audit", "Director Admin", "Chairman"],
      },
      {
        id: "ADMIN_IT",
        label: "IT",
        examples: [
          "Software",
          "Computers",
          "Batteries & UPS",
          "TV & Wi-Fi",
          "Networking",
          "Smart Boards",
          "Others", 
        ],
        flow: [
          "Manager – Data Management",
          "Audit",
          "Director Admissions",
          "Director Admin",
          "Chairman",
        ],
      },
      {
        id: "ADMIN_MAINTENANCE",
        label: "Maintenance",
        examples: ["AMC", "Servicing", "Scrap","Others"],
        flow: [
          "MMA",
          "Audit",
          "Director Admin",
          "Chief Director",
          "Chairman",
          
        ],
      },
    ],
  },
  {
    group: "Academic",
    groupColor: "green",
    items: [
      {
        id: "ACADEMIC_FINANCE",
        label: "Finance",
        examples: [
          "Xerox & Printing Bills",
          "Food Bills",
          "Remuneration",
          "Placement & Training",
          "Clubs, Events & Seminars",
          "Refund & Scholarships",
          "Fees Concession",
          "Brochure, Marketing & Website",
          "Others",
        ],
        flow: ["Audit", "GM Finance", "Director Admissions*", "Director Admin", "Chairman"],
        note: "* Director Admissions is included only for Branding and Fees Concession items.",
      },
      {
        id: "ACADEMIC_NON_FINANCE",
        label: "Non-Finance",
        examples: ["Industrial Trip", "Industrial Tour", "Discontinue", "Readmission", "Others"],
        flow: ["Director Admin", "Chairman"],
      },
    ],
  },
  {
    group: "Research",
    groupColor: "purple",
    items: [
      {
        id: "RESEARCH",
        label: "Research",
        examples: [
          "Ph.D. & NOC",
          "Full & Part-time Scholars",
          "MOU",
          "Publications",
          "Consultancy",
          "Patents",
          "Startup",
          "Research Promotion",
          "Others", 
        ],
        flow: [
          "Audit",
          "Director Research",
          "Director Admin",
          "Chief Director",
          "Chairman",
        ],
      },
    ],
  },
  {
    group: "Non-Budgeted",
    groupColor: "orange",
    items: [
      {
        id: "NON_BUDGETED",
        label: "Non-Budgeted",
        examples: ["Non-Budgeted Assets", "Unexpected Expenses", "Others"],
        flow: ["GM Finance", "Chairman"],
      },
    ],
  },
];

const ALLOWED_ROLES = ["REQUESTER", "HEAD_OF_INSTITUTION", "INSTITUTION_MANAGER", "CHAIRMAN"];

export default function FlowCategoriesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !ALLOWED_ROLES.includes(user.role)) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  if (!user || !ALLOWED_ROLES.includes(user.role)) return null;

  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Approval Flow Categories</h2>
          <p className={styles.subtitle}>
            Use this reference to choose the correct category when raising a request.
            Every request follows the base flow below before being routed to the
            category-specific approvers.
          </p>
        </div>

        {/* Base flow banner */}
        <div className={styles.baseFlowCard}>
          <p className={styles.baseFlowLabel}>Base flow — applies to every request</p>
          <div className={styles.baseFlowSteps}>
            {BASE_FLOW.map((stage, i) => (
              <div key={stage} className={styles.baseFlowStep}>
                <div className={styles.baseFlowBubble}>{stage}</div>
                {i < BASE_FLOW.length - 1 && (
                  <span className={styles.arrow} aria-hidden="true">→</span>
                )}
              </div>
            ))}
            <span className={styles.arrow} aria-hidden="true">→</span>
            <div className={styles.baseFlowBubble + " " + styles.baseFlowThen}>
              Category-specific stages
            </div>
          </div>
        </div>

        {/* Category sections */}
        {CATEGORIES.map((group) => (
          <section key={group.group} className={styles.groupSection}>
            <h3 className={`${styles.groupHeading} ${styles[`group_${group.groupColor}`]}`}>
              {group.group}
            </h3>
            <div className={styles.cardsGrid}>
              {group.items.map((cat) => (
                <div key={cat.id} className={`${styles.card} ${styles[`card_${group.groupColor}`]}`}>
                  <div className={styles.cardTop}>
                    <span className={`${styles.categoryBadge} ${styles[`badge_${group.groupColor}`]}`}>
                      {cat.label}
                    </span>
                  </div>

                  <div className={styles.examplesSection}>
                    <p className={styles.examplesLabel}>Includes</p>
                    <div className={styles.tagsList}>
                      {cat.examples.map((ex) => (
                        <span key={ex} className={styles.tag}>{ex}</span>
                      ))}
                    </div>
                  </div>

                  <div className={styles.flowSection}>
                    <p className={styles.flowLabel}>After Chairman Office</p>
                    <div className={styles.flowSteps}>
                      {cat.flow.map((stage, i) => (
                        <div key={stage} className={styles.flowStep}>
                          <span className={styles.flowBubble}>{stage}</span>
                          {i < cat.flow.length - 1 && (
                            <span className={styles.flowArrow} aria-hidden="true">→</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {cat.note && (
                      <p className={styles.noteText}>{cat.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* Special cases */}
        <div className={styles.specialCard}>
          <p className={styles.specialTitle}>Special Routing Cases</p>
          <ul className={styles.specialList}>
            <li>
              <span className={styles.specialBullet}>Policy approvals or amounts above ₹10 lakhs</span> — Head of Institution explains and seeks Chairman approval directly.
            </li>
            <li>
              <span className={styles.specialBullet}>SOP not available</span> — a new SOP is created and circulated via Chairman Office / Management Office.
            </li>
          </ul>
        </div>
      </div>
    </ProtectedRoute>
  );
}
