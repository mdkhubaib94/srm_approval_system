import { test, expect } from "@playwright/test";
import { uiLogin, apiToken, USERS, API } from "../support/helpers.js";

// Sidebar entries each role must (not) see — mirrors NavigationPane.jsx.
const NAV = {
  REQUESTER: {
    visible: ["Dashboard", "All Requests", "Create Requests", "Flow Categories", "Queries", "SOPs", "Completion Status", "My Profile"],
    hidden: ["User Management", "Workflow", "Policies", "Create Policy", "Flagged Requests", "Create SOP"],
  },
  INSTITUTION_MANAGER: {
    visible: ["Dashboard", "All Requests", "Create Requests", "Queries", "SOPs", "Flagged Requests", "Completion Status"],
    hidden: ["User Management", "Workflow", "Create Policy", "Create SOP"],
  },
  HEAD_OF_INSTITUTION: {
    visible: ["Dashboard", "Create Requests", "Policies", "Create Policy", "SOPs", "Flagged Requests", "User Management"],
    hidden: ["Workflow", "Create SOP"],
  },
  DIRECTOR_ADMIN: {
    visible: ["Dashboard", "All Requests", "Policies", "Workflow", "Completion Status", "User Management", "Flagged Requests"],
    hidden: ["Create Requests", "Create Policy", "Create SOP", "SOPs"],
  },
  CHAIRMAN: {
    visible: ["Dashboard", "Policies", "Workflow", "User Management", "Flow Categories", "Completion Status"],
    hidden: ["Create Requests", "Create Policy", "Create SOP"],
  },
  CHAIRMAN_OFFICE: {
    visible: ["Dashboard", "Create SOP", "SOPs", "User Management"],
    hidden: ["Create Requests", "Workflow", "Policies"],
  },
};

for (const [role, { visible, hidden }] of Object.entries(NAV)) {
  test(`RBAC-NAV ${role}: sidebar shows only permitted entries`, async ({ page }) => {
    await uiLogin(page, USERS[role]);
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    for (const name of visible) {
      await expect(nav.getByRole("link", { name, exact: true }), `${role} should see "${name}"`).toBeVisible();
    }
    for (const name of hidden) {
      await expect(nav.getByRole("link", { name, exact: true }), `${role} must not see "${name}"`).toHaveCount(0);
    }
  });
}

// Every top-level page must render its heading without a crash for a role
// that is allowed to open it.
const PAGES = [
  ["REQUESTER", "/requests", "All Requests"],
  ["REQUESTER", "/create-request", "Create New Request"],
  ["REQUESTER", "/flow-categories", "Approval Flow Categories"],
  ["REQUESTER", "/queries", "Queries"],
  ["REQUESTER", "/sops", "Standard Operating Procedures"],
  ["REQUESTER", "/completion-status", "Completion Status"],
  ["REQUESTER", "/my-profile", "My Profile"],
  ["HEAD_OF_INSTITUTION", "/policies", "Policies"],
  ["HEAD_OF_INSTITUTION", "/create-policy", "Create New Policy"],
  ["HEAD_OF_INSTITUTION", "/flagged", "Flagged"],
  ["HEAD_OF_INSTITUTION", "/user-management", "User Management"],
  ["DIRECTOR_ADMIN", "/workflow", "Workflow"],
  ["CHAIRMAN_OFFICE", "/create-sop", "Create New SOP"],
];

for (const [role, path, heading] of PAGES) {
  test(`PAGE ${role} can open ${path}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await uiLogin(page, USERS[role]);
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    expect(errors, "uncaught JS errors").toEqual([]);
  });
}

test("RBAC-GUARD requester opening Create Policy is denied", async ({ page }) => {
  await uiLogin(page, USERS.REQUESTER);
  await page.goto("/create-policy");
  await expect(page.getByText(/Only Head of Institution can create policies/i)).toBeVisible();
});

test("RBAC-GUARD non chairman-office user opening Create SOP is denied", async ({ page }) => {
  await uiLogin(page, USERS.REQUESTER);
  await page.goto("/create-sop");
  await expect(page.getByText(/Only the Chairman Office can create SOPs/i)).toBeVisible();
});

test("RBAC-API requester cannot list users", async ({ request }) => {
  const token = await apiToken(request, USERS.REQUESTER);
  const r = await request.get(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } });
  expect([401, 403]).toContain(r.status());
});
