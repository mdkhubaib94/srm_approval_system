import { useLocation } from "react-router-dom";

const BASE = "w-full border-t border-gray-200 bg-white px-4 text-center text-xs text-gray-500";

// On the login page the footer is pinned to the bottom of the screen so it is
// visible without scrolling; everywhere else it sits at the end of the page.
export default function Footer() {
  const { pathname } = useLocation();
  const pinned = pathname === "/login";
  const layout = pinned
    ? "fixed inset-x-0 bottom-0 z-30 h-9 flex items-center justify-center"
    : "py-3";

  return (
    <footer className={`${BASE} ${layout}`}>
      © 2026 SRM PRIME Approval System. All rights reserved.
    </footer>
  );
}
