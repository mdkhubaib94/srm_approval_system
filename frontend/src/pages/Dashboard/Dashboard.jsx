

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardDocumentListIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

import { SectionErrorBoundary } from "../../common/ErrorBoundary";
import StatsCard from "../../common/StatsCard";
import ProtectedRoute from "../../common/ProtectedRoute";
import LoadingScreen from "../../common/LoadingScreen";
import { useAuth } from "../../context/AuthContext";
import { getRequests } from "../../api/requests.api";
import { getQueries } from "../../api/queries.api";
import { getPolicies } from "../../api/policies.api";
import styles from "./Dashboard.module.css";
import { sameInstitution } from "../../utils/institutionGroups";
export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const currentUser = user;
  const [requests, setRequests] = useState([]);
  const [queries, setQueries] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Bumped by retry/refresh actions to re-run the effect below.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (authLoading || !user) return;

    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await getRequests();
        setRequests(response.data?.data || []);

        // Fetch queries for all users (they see queries raised to them)
        try {
          const queriesResponse = await getQueries();
          setQueries(queriesResponse.data?.data || []);
        } catch (queriesError) {
          console.error("Failed to fetch queries:", queriesError);
          setQueries([]);
        }

        // Fetch policies for all users
        try {
          const policiesResponse = await getPolicies();
          setPolicies(policiesResponse.data?.data || []);
        } catch (policiesError) {
          console.error("Failed to fetch policies:", policiesError);
          setPolicies([]);
        }
      } catch (err) {
        setError(err.response?.data?.message || "Failed to fetch dashboard data");
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboardData();
  }, [authLoading, user, reloadKey]);

  const fetchDashboardData = () => setReloadKey((k) => k + 1);

  const getPendingCount = () => {
    if (currentUser?.role === "REQUESTER") {
      return requests.filter((r) => r.status === "PENDING").length;
    }
    
    // For institution-scoped roles, check both stage and institution
    const INSTITUTION_SCOPED_STAGES = ['INSTITUTION_MANAGER', 'ACCOUNTANT', 'HEAD_OF_INSTITUTION'];
    if (INSTITUTION_SCOPED_STAGES.includes(currentUser?.role)) {
      return requests.filter((r) => 
        r.stage === currentUser?.role && 
        sameInstitution(r.institution, currentUser?.institution, currentUser?.role) &&
        r.status === "PENDING"
      ).length;
    }
    
    // For other roles, count requests where stage matches their role
    return requests.filter((r) => r.stage === currentUser?.role && r.status === "PENDING").length;
  };

  const getQueriesCount = () => {
    // Count unresolved queries where current user is the one who should reply
    return queries.filter((q) => {
      if (q.queryResolved) return false; // Skip resolved queries
      
      // Check if current user is the queryReplyBy user
      const currentUserId = currentUser?.id || currentUser?._id;
      const queryReplyById = q.queryReplyBy?._id || q.queryReplyBy;
      
      return currentUserId && queryReplyById && String(currentUserId) === String(queryReplyById);
    }).length;
  };

  const getPoliciesCount = () => {
    // For HOI - count total policies they created (all statuses)
    if (currentUser?.role === "HEAD_OF_INSTITUTION") {
      return policies.length; // Total policies created by this HOI
    } else if (currentUser?.role === "DIRECTOR_ADMIN") {
      return policies.filter((p) => p.stage === "DIRECTOR_ADMIN" && p.policyApprovalStatus === "PENDING").length;
    } else if (currentUser?.role === "CHAIRMAN") {
      return policies.filter((p) => p.stage === "CHAIRMAN" && p.policyApprovalStatus === "PENDING").length;
    } else {
      // For all other users, show total policies relevant to them (could be all policies or institution-specific)
      return policies.filter((p) => p.policyApprovalStatus === "PENDING" && p.policyApprovalStatus === "APPROVED").length;
    }
  };

  const getBudgetedRequestsCount = () => {
    return requests.filter((r) => r.budgetAvailable === true).length;
  };

  const getUnbudgetedRequestsCount = () => {
    return requests.filter((r) => r.budgetAvailable === false).length;
  };

  const stats = {
    totalRequests: requests.length,
    pendingRequests: getPendingCount(),
    approvedRequests: requests.filter((r) => r.status === "APPROVED").length,
    rejectedRequests: requests.filter((r) => r.status === "REJECTED").length,
    inProgressRequests: requests.filter((r) => r.status === "PENDING").length,
    queriesCount: getQueriesCount(),
    policiesCount: getPoliciesCount(),
  };

  const recentRequests = {
    requests: requests.slice(0, 5).map((r) => ({
      _id: r._id,
      requestID: r.requestID,
      title: r.title,
      college: r.institution,
      department: r.department,
      costEstimate: r.cost,
      createdAt: r.createdAt,
      status: r.status,
    })),
  };

  const sectionErrors = { user: null, stats: error, requests: error };

  const handleStatsCardClick = (name) => {
    const filterMap = {
      "Total Requests": "all",
      "Pending": "pending",
      "Approved": "approved",
      "Rejected": "rejected",
      "Queries": "queries",
      "Policies": "policies",
      "Budgeted Requests": "budgeted",
      "Unbudgeted Requests": "unbudgeted",
    };
    const filter = filterMap[name] || "all";
    
    // Handle specific navigation
    if (filter === "queries") {
      // For all users, when clicking queries card, show only queries they need to reply to
      navigate("/queries?filter=myqueries");
      return;
    }
    if (filter === "policies") {
      navigate("/policies");
      return;
    }
    
    // For non-requesters, pass the user role/stage for filtering
    const INSTITUTION_SCOPED_ROLES = ['INSTITUTION_MANAGER', 'ACCOUNTANT', 'HEAD_OF_INSTITUTION'];

    if (currentUser?.role !== "REQUESTER") {
      if (INSTITUTION_SCOPED_ROLES.includes(currentUser?.role)) {
        navigate(`/requests?filter=${filter}&stage=${currentUser.role}`);
      } else {
        navigate(`/requests?filter=${filter}&stage=${currentUser.role}`);
      }
    } else {
      navigate(`/requests?filter=${filter}`);
    }
  };

  // Policies are authored by HEAD_OF_INSTITUTION and approved up the
  // CHAIRMAN_OFFICE -> DIRECTOR_ADMIN -> CHAIRMAN chain; nobody else acts on
  // them, so the tile is hidden from every other role.
  const POLICY_TILE_ROLES = [
    "CHAIRMAN",
    "CHAIRMAN_OFFICE",
    "DIRECTOR_ADMIN",
    "HEAD_OF_INSTITUTION",
  ];

  // Base stats cards for all users
  const baseStatsCards = [
    {
      name: "Total Requests",
      stat: stats?.totalRequests || 0,
      icon: ClipboardDocumentListIcon,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      description:
        currentUser?.role === "requester"
          ? "View all my requests"
          : "View all requests forwarded to you",
    },
    {
      name: "Pending",
      stat: stats?.pendingRequests || 0,
      icon: ClockIcon,
      color: "text-yellow-600",
      bgColor: "bg-yellow-100",
      description:
        currentUser?.role === "requester"
          ? "View my pending requests"
          : "View pending approvals",
    },
    {
      name: "Approved",
      stat: stats?.approvedRequests || 0,
      icon: CheckCircleIcon,
      color: "text-green-600",
      bgColor: "bg-green-100",
      description:
        currentUser?.role === "requester"
          ? "View my fully approved requests"
          : "View requests which were approved",
    },
    {
      name: "Rejected",
      stat: stats?.rejectedRequests || 0,
      icon: ExclamationTriangleIcon,
      color: "text-red-600",
      bgColor: "bg-red-100",
      description:
        currentUser?.role === "requester"
          ? "View my rejected requests"
          : "View requests which were rejected",
    },
    {
      name: "Queries",
      stat: stats?.queriesCount || 0,
      icon: ChatBubbleLeftRightIcon,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
      description: "View queries raised to you",
    },
    ...(POLICY_TILE_ROLES.includes(currentUser?.role)
      ? [
          {
            name: "Policies",
            stat: stats?.policiesCount || 0,
            icon: DocumentTextIcon,
            color: "text-indigo-600",
            bgColor: "bg-indigo-100",
            description:
              currentUser?.role === "HEAD_OF_INSTITUTION"
                ? "View all policies you have created"
                : ["DIRECTOR_ADMIN", "CHAIRMAN"].includes(currentUser?.role)
                  ? "View policies awaiting your approval"
                  : "View policies in the system",
          },
        ]
      : []),
  ];

  // Additional tiles for ACCOUNTANT role
  const accountantTiles = currentUser?.role === "ACCOUNTANT" ? [
    {
      name: "Budgeted Requests",
      stat: getBudgetedRequestsCount(),
      icon: CheckCircleIcon,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100",
      description: "Requests with budget available",
    },
    {
      name: "Unbudgeted Requests",
      stat: getUnbudgetedRequestsCount(),
      icon: ExclamationTriangleIcon,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
      description: "Requests without budget available",
    },
  ] : [];

  if (authLoading) {
    return <LoadingScreen message="Authenticating..." />;
  }

  return (
    <ProtectedRoute>
      {isLoading ? (
        <LoadingScreen message="Loading dashboard..." />
      ) : (
        <div className={styles.container}>
        <div className={styles.header}>
          <div className="flex-1 min-w-0">
            <h2 className={styles.headerTitle}>
              Dashboard
            </h2>
            {currentUser?.name && (
              <div className={styles.userInfo}>
                <p className={styles.welcomeText}>
                  Welcome, {currentUser.name}
                </p>
                {currentUser.department && currentUser.role && currentUser.institution && (
                  <p className={styles.userDetails}>
                    {currentUser.department} - {currentUser.role} - {currentUser.institution}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {(sectionErrors.user ||
          sectionErrors.stats ||
          sectionErrors.requests) && (
            <div className={styles.warningBox}>
              <div className={styles.warningFlex}>
                <ExclamationTriangleIcon className={styles.warningIcon} />
                <div className={styles.warningContent}>
                  <p className={styles.warningTitle}>
                    Some data could not be loaded:
                  </p>
                  <ul className={styles.warningList}>
                    {sectionErrors.user && (
                      <li>User information: {sectionErrors.user}</li>
                    )}
                    {sectionErrors.stats && (
                      <li>Statistics: {sectionErrors.stats}</li>
                    )}
                    {sectionErrors.requests && (
                      <li>Recent requests: {sectionErrors.requests}</li>
                    )}
                  </ul>
                  <button
                    onClick={fetchDashboardData}
                    className={styles.warningBtn}
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          )}

        <SectionErrorBoundary
          sectionName="statistics"
          error={sectionErrors.stats}
          onRetry={fetchDashboardData}
        >
          <div
            className={styles.statsGrid}
            style={{
              gridTemplateColumns: `repeat(${baseStatsCards.length}, minmax(0, 1fr))`,
            }}
          >
            {baseStatsCards.map((item) => (
              <StatsCard
                key={item.name}
                item={item}
                onActivate={() => handleStatsCardClick(item.name)}
              />
            ))}
          </div>
          
          {/* Additional tiles for ACCOUNTANT - full width row */}
          {currentUser?.role === "ACCOUNTANT" && (
            <div className={styles.accountantTilesGrid}>
              {accountantTiles.map((item) => (
                <StatsCard
                  key={item.name}
                  item={item}
                  onActivate={() => handleStatsCardClick(item.name)}
                />
              ))}
            </div>
          )}
        </SectionErrorBoundary>

        <SectionErrorBoundary
          sectionName="recent requests"
          error={sectionErrors.requests}
          onRetry={fetchDashboardData}
        >
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>
                Recent Requests
              </h3>
              {recentRequests?.requests?.length > 0 && (
                <p className={styles.cardHelpText}>
                  Click on any request to view details
                </p>
              )}
            </div>

            {recentRequests?.requests?.length > 0 ? (
              <ul className={styles.list}>
                {recentRequests.requests
                  .filter((request) => request && request._id)
                  .map((request) => (
                    <li
                      key={request._id}
                      className={styles.listItem}
                      onClick={() => navigate(`/requests/${request.requestID}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          console.log("Open request", request._id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`View request: ${request.title || "Untitled Request"}`}
                    >
                      <div className={styles.itemDetails}>
                        <p className={styles.itemTitle}>
                          {request.title || "Untitled Request"}
                        </p>
                        <p className={styles.itemSubtitle}>
                          {request.department || "Unknown"} - {currentUser?.role || "Unknown"} - {request.college || "Unknown"}
                        </p>
                        <p className={styles.itemMeta}>
                          {request.costEstimate > 0 &&
                            `₹${request.costEstimate?.toLocaleString() || "0"} • `}
                          {request.createdAt
                            ? new Date(request.createdAt).toLocaleDateString(
                              "en-GB",
                            )
                            : "Unknown date"}
                        </p>
                      </div>

                      <div className={styles.itemRightCol}>
                        <div className={styles.itemPillWrapper}>
                          <span
                            className={`${styles.statusPill} ${getStatusClass(request.status || "unknown")}`}
                          >
                            {request.status
                              ? request.status === "parallel_verification"
                                ? "VERIFICATION"
                                : request.status.replace("_", " ").toUpperCase()
                              : "UNKNOWN"}
                          </span>
                        </div>
                        <svg
                          className={styles.chevronIcon}
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
                    </li>
                  ))}
              </ul>
            ) : (
              <p className={styles.emptyPlaceholder}>
                No recent requests found.
              </p>
            )}

            {recentRequests?.requests?.length > 0 && (
              <div className={styles.footer}>
                <button
                  onClick={() => navigate("/requests")}
                  className={styles.viewAllBtn}
                >
                  View All →
                </button>
              </div>
            )}
          </div>
        </SectionErrorBoundary>
      </div>
      )}
    </ProtectedRoute>
  );
}

function getStatusClass(status) {
  if (!status) return "bg-gray-100 text-gray-700";
  switch (String(status).toLowerCase()) {
    case "approved":
      return "bg-green-100 text-green-700";
    case "rejected":
      return "bg-red-100 text-red-700";
    case "draft":
      return "bg-gray-200 text-gray-700";
    default:
      return "bg-yellow-100 text-yellow-700";
  }
}
