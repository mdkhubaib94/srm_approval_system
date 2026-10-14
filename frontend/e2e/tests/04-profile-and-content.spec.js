import { test, expect } from "@playwright/test";
import { uiLogin, apiToken, USERS, API } from "../support/helpers.js";

test.describe("Profile, content pages and error handling", () => {
  test("MISC-01 My Profile shows the signed-in user's details", async ({ page }) => {
    await uiLogin(page, USERS.REQUESTER);
    await page.goto("/my-profile");
    await expect(page.getByText("Alice Requester").first()).toBeVisible();
    await expect(page.getByText(USERS.REQUESTER).first()).toBeVisible();
  });

  test("MISC-02 /users/me matches the seeded account", async ({ request }) => {
    const token = await apiToken(request, USERS.REQUESTER);
    const r = await request.get(`${API}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r.status()).toBe(200);
    const body = await r.json();
    const me = body.data || body;
    expect(JSON.stringify(me)).toContain("REQUESTER");
    expect(JSON.stringify(me)).not.toMatch(/password/i);
  });

  test("MISC-03 Flow Categories reference page lists categories", async ({ page }) => {
    await uiLogin(page, USERS.REQUESTER);
    await page.goto("/flow-categories");
    await expect(page.getByRole("heading", { name: "Approval Flow Categories" })).toBeVisible();
    await expect(page.getByText(/RESEARCH/i).first()).toBeVisible();
  });

  test("MISC-04 Queries and Completion Status render empty states without errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await uiLogin(page, USERS.REQUESTER);
    for (const [path, heading] of [["/queries", "Queries"], ["/completion-status", "Completion Status"]]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("MISC-05 Head of Institution user management lists users", async ({ page }) => {
    await uiLogin(page, USERS.HEAD_OF_INSTITUTION);
    await page.goto("/user-management");
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  });

  test("MISC-06 dashboard renders for every seeded approval role without JS errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const role of ["REQUESTER", "INSTITUTION_MANAGER", "ACCOUNTANT", "HEAD_OF_INSTITUTION", "DIRECTOR_ADMIN", "CHIEF_DIRECTOR", "CHAIRMAN", "CHAIRMAN_OFFICE", "AUDIT"]) {
      await page.context().clearCookies();
      await uiLogin(page, USERS[role]);
      await expect(page.getByRole("heading", { name: "Dashboard" }), role).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("MISC-07 unknown route does not crash the shell", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await uiLogin(page, USERS.REQUESTER);
    await page.goto("/this-route-does-not-exist");
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("MISC-08 opening a non-existent request shows an error state, not a blank page", async ({ page }) => {
    await uiLogin(page, USERS.REQUESTER);
    await page.goto("/requests/does-not-exist-123");
    await expect(page.getByText(/error|not found|failed/i).first()).toBeVisible();
  });

  test("MISC-09 mobile viewport collapses navigation into a drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await uiLogin(page, USERS.REQUESTER);
    await expect(page.getByRole("button", { name: /open|menu|navigation/i }).first()).toBeVisible();
  });
});
