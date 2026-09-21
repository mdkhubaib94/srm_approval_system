import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  HomeIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  DocumentPlusIcon,
  ArrowRightOnRectangleIcon,
  FlagIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  DocumentArrowUpIcon,
  CheckBadgeIcon,
  Squares2X2Icon,
  BookOpenIcon,
  UsersIcon,
  UserCircleIcon,
  XMarkIcon,
  Bars3Icon,
} from "@heroicons/react/24/outline";
import SRMRMP_Logo from "../assets/SRMRMP_LOGO.png";
import { useAuth } from "../context/AuthContext";
import LoadingScreen from "../common/LoadingScreen";
import { getQueries } from "../api/queries.api";
import { getPolicies } from "../api/policies.api";
import { getFlagged } from "../api/flagged.api";

import styles from "./NavigationPane.module.css";

const PUBLIC_ROUTES = ["/", "/login", "/signup", "/forgot-password"];

export default function NavigationPane({ children }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, loading: authLoading, logout } = useAuth();
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
  const [queryCount, setQueryCount] = useState(0);
  const [policyCount, setPolicyCount] = useState(0);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Mirrors the `lg` Tailwind breakpoint (1024px) used by NavigationPane.module.css
  // to decide whether the sidebar is a persistent column or a slide-in drawer.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
  );

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const handleChange = (e) => setIsDesktop(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  // Fetch notification counts.
  //
  // Skipped on public routes. Hooks run regardless of the `isPublicRoute`
  // early return below, so a browser that still held a valid session while
  // sitting on /signup or /login kept polling /queries and /flagged every 30s
  // — badge counts for a nav shell that isn't rendered on those pages.
  useEffect(() => {
    if (!user || isPublicRoute) return;

    const fetchCounts = async () => {
      try {
        // Fetch queries count - count unresolved queries where current user should reply
        try {
          const queriesResponse = await getQueries();
          const queries = queriesResponse.data?.data || [];
          
          const currentUserId = user?.id || user?._id;
          
          // Count queries where user is queryReplyBy and queryResolved is false
          const unresolvedQueries = queries.filter(q => {
            if (q.queryResolved) return false;
            
            const queryReplyById = q.queryReplyBy?._id || q.queryReplyBy;
            return currentUserId && queryReplyById && String(currentUserId) === String(queryReplyById);
          }).length;
          
          setQueryCount(unresolvedQueries);
        } catch (queryError) {
          if (queryError.response?.status !== 403) {
            console.error("Error fetching queries:", queryError);
          }
          setQueryCount(0);
        }

        // Fetch policies count - only for DEAN_ADMIN and CHAIRMAN
        if (user?.role === "DEAN_ADMIN" || user?.role === "CHAIRMAN") {
          try {
            const policiesResponse = await getPolicies();
            const policies = policiesResponse.data?.data || [];
            
            let pendingPolicies = 0;
            
            if (user?.role === "DEAN_ADMIN") {
              // Count policies at DEAN_ADMIN stage with PENDING status
              pendingPolicies = policies.filter(p => 
                p.stage === "DEAN_ADMIN" && p.policyApprovalStatus === "PENDING"
              ).length;
            } else if (user?.role === "CHAIRMAN") {
              // Count policies at CHAIRMAN stage with PENDING status
              pendingPolicies = policies.filter(p => 
                p.stage === "CHAIRMAN" && p.policyApprovalStatus === "PENDING"
              ).length;
            }
            
            setPolicyCount(pendingPolicies);
          } catch (policyError) {
            if (policyError.response?.status !== 403) {
              console.error("Error fetching policies:", policyError);
            }
            setPolicyCount(0);
          }
        } else {
          // Other roles don't see policy count
          setPolicyCount(0);
        }

        // Fetch flagged requests count - backend returns already filtered results
        if (user?.role !== "REQUESTER") {
          try {
            const flaggedResponse = await getFlagged();
            const flaggedRequests = flaggedResponse.data?.data || [];
            // Backend returns unresolved flags by default, so just count them
            setFlaggedCount(flaggedRequests.length);
          } catch (flaggedError) {
            if (flaggedError.response?.status !== 403) {
              console.error("Error fetching flagged requests:", flaggedError);
            }
            setFlaggedCount(0);
          }
        } else {
          setFlaggedCount(0);
        }
      } catch (error) {
        console.error("Error fetching notification counts:", error);
      }
    };

    fetchCounts();

    // Refresh counts every 30 seconds
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
    // Deliberately narrowed to id/role instead of `user` itself, so a new user
    // object reference with the same id/role (e.g. after a token refresh)
    // doesn't restart the polling interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, isPublicRoute]);

  // Everything outside PUBLIC_ROUTES is a signed-in view. Without this gate an
  // anonymous visitor got the full shell and page body — nav, role-derived menu
  // and chrome — and only the API calls behind it failed, which reads as a
  // broken app rather than "please sign in".
  //
  // This is defence in depth for the UI only: the API already rejects every
  // /requests, /queries, /policies… call without a bearer token, and that
  // remains the authorization boundary. Nothing here is trusted server-side.
  useEffect(() => {
    if (!authLoading && !user && !isPublicRoute) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, user, isPublicRoute, navigate]);

  // Public pages render without the nav shell
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // No session yet: either /auth/refresh is still in flight, or it failed and
  // the redirect above is running. Either way the protected page must not
  // paint. `user` is populated from the cached profile before refresh resolves,
  // so a returning user sees the app immediately and not a spinner.
  if (!user) {
    return <LoadingScreen />;
  }

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: HomeIcon },
    {
      name: "All Requests",
      href: "/requests",
      icon: ClipboardDocumentListIcon,
    },
    user?.role === "REQUESTER" && {
      name: "Create Requests",
      href: "/create-request",
      icon: DocumentPlusIcon,
    },
    ["REQUESTER", "HEAD_OF_INSTITUTION", "CHAIRMAN"].includes(user?.role) && {
      name: "Flow Categories",
      href: "/flow-categories",
      icon: Squares2X2Icon,
    },
    { name: "Queries", href: "/queries", icon: ClockIcon },
    ["HEAD_OF_INSTITUTION", "DEAN_ADMIN", "CHAIRMAN"].includes(user?.role) && {
      name: "Policies",
      href: "/policies",
      icon: DocumentTextIcon,
    },
    user?.role === "HEAD_OF_INSTITUTION" && {
      name: "Create Policy",
      href: "/create-policy",
      icon: DocumentArrowUpIcon,
    },
    ["REQUESTER", "INSTITUTION_MANAGER", "CHAIRMAN_OFFICE"].includes(user?.role) && {
      name: "SOPs",
      href: "/sops",
      icon: BookOpenIcon,
    },
    user?.role === "CHAIRMAN_OFFICE" && {
      name: "Create SOP",
      href: "/create-sop",
      icon: DocumentArrowUpIcon,
    },
    user?.role !== "REQUESTER" && {
      name: "Flagged Requests",
      href: "/flagged",
      icon: FlagIcon,
    },
    ["DEAN_ADMIN", "CHIEF_DIRECTOR", "CHAIRMAN"].includes(user?.role) && {
      name: "Workflow",
      href: "/workflow",
      icon: ArrowPathIcon,
    },
    ["REQUESTER", "HEAD_OF_INSTITUTION", "DEAN_ADMIN", "CHIEF_DIRECTOR", "CHAIRMAN"].includes(user?.role) && {
      name: "Completion Status",
      href: "/completion-status",
      icon: CheckBadgeIcon,
    },
    ["HEAD_OF_INSTITUTION", "CHAIRMAN_OFFICE", "DEAN_ADMIN", "CHAIRMAN"].includes(user?.role) && {
      name: "User Management",
      href: "/user-management",
      icon: UsersIcon,
    },
    {
      name: "My Profile",
      href: "/my-profile",
      icon: UserCircleIcon,
    }
  ].filter(Boolean);

  const isActiveRoute = (href) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  // On desktop the sidebar is already always visible, so the logo doubles as
  // a logout shortcut. On mobile, opening the slide-in drawer is handled by
  // the dedicated hamburger button instead.
  const handleLogoClick = () => {
    if (isDesktop) {
      handleLogout();
    }
  };

  return (
    <div className={styles.layout}>
      {mobileNavOpen && (
        <div
          className={styles.backdrop}
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className={`${styles.sidebar} ${mobileNavOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.sidebarInner}>
          <div className={styles.logoArea}>
            <div className={styles.logoAreaRow}>
              <h1 className={styles.logoText}>
                SRM PRIME
              </h1>
              <button
                type="button"
                className={styles.closeDrawerBtn}
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation menu"
              >
                <XMarkIcon className={styles.closeDrawerIcon} />
              </button>
            </div>
          </div>
          <nav
            className={styles.navList}
            aria-label="Primary navigation"
          >
            {navigation.map((item) => {
              const isActive = isActiveRoute(item.href);
              const Icon = item.icon;
              
              // Determine badge count and style for each navigation item
              let badgeCount = 0;
              let badgeClass = styles.badge;
              
              if (item.name === "Queries" && queryCount > 0) {
                badgeCount = queryCount;
                badgeClass = styles.badge; // Yellow badge for queries
              } else if (item.name === "Policies" && policyCount > 0) {
                badgeCount = policyCount;
                badgeClass = styles.policyBadge; // Indigo badge for policies
              } else if (item.name === "Flagged Requests" && flaggedCount > 0) {
                badgeCount = flaggedCount;
                badgeClass = styles.flaggedBadge; // Red badge for flagged requests
              }

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`${styles.navLink} ${isActive ? styles.navLinkActive : styles.navLinkInactive}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setMobileNavOpen(false)}
                >
                  <Icon
                    className={`${styles.navIcon} ${isActive ? styles.navIconActive : styles.navIconInactive}`}
                  />
                  <span className="flex-1">{item.name}</span>
                  {badgeCount > 0 && (
                    <span className={badgeClass}>
                      {badgeCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className={styles.mainWrapper}>
        <div className={styles.topBar}>
          <button
            onClick={() => setMobileNavOpen(true)}
            className={styles.menuBtn}
            aria-label="Open navigation menu"
            aria-expanded={mobileNavOpen}
            type="button"
          >
            <Bars3Icon className={styles.menuIcon} />
          </button>

          <button
            onClick={handleLogoClick}
            className={styles.logoBtn}
            title={isDesktop ? "Click to logout" : undefined}
            aria-label={isDesktop ? "Logout" : "SRM PRIME Approval System"}
            type="button"
          >
            <img
              src={SRMRMP_Logo}
              alt="SRM-RMP Logo"
              width={36}
              height={36}


            />
            <span className={styles.systemTitle}>
              SRM PRIME Approval System
            </span>
          </button>

          <div className={styles.userSection}>
            <div className={styles.userInfo}>
              <div className={styles.userRole}>
                Welcome,{" "}
                <span className={styles.userRoleBold}>
                  {user ? user.name : "Guest"}
                </span>
              </div>
              {user && (
                <div className={styles.userInst}>
                  {(() => {
                    // Format role: replace underscores with spaces
                    const formatRole = (role) => {
                      if (role === "REQUESTER") return "HEAD OF DEPARTMENT";
                      return role.replace(/_/g, " ");
                    };
                    
                    const displayRole = formatRole(user.role);
                    
                    // Roles that should show institution
                    const institutionScopedRoles = ["HEAD_OF_INSTITUTION", "INSTITUTION_MANAGER", "ACCOUNTANT", "REQUESTER"];
                    
                    // For REQUESTER: show department if available, then institution if available
                    if (user.role === "REQUESTER") {
                      const parts = [];
                      if (user.department) parts.push(user.department);
                      if (user.institution) parts.push(user.institution);
                      return parts.length > 0 ? parts.join(" - ") : displayRole;
                    }
                    
                    // For other institution-scoped roles: show role and institution
                    if (institutionScopedRoles.includes(user.role) && user.institution) {
                      return `${displayRole} - ${user.institution}`;
                    }
                    
                    // Default: just show the role
                    return displayRole;
                  })()}
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              className={styles.logoutBtn}
              title="Logout"
              type="button"
            >
              <ArrowRightOnRectangleIcon className={styles.logoutIcon} />
            </button>
          </div>
        </div>

        <main className={styles.mainContent}>
          <div className={styles.mainInner}>{children}</div>
        </main>
      </div>
    </div>
  );
}
