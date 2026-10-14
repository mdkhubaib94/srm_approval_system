import { test, expect } from "@playwright/test";
import { uiLogin, USERS, PASSWORD, API } from "../support/helpers.js";

test.describe("Authentication (UI)", () => {
  test("AUTH-01 login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "SRM PRIME Approval System" })).toBeVisible();
    await expect(page.getByLabel("Email or Employee ID")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Forgot your password?" })).toBeVisible();
  });

  test("AUTH-02 valid login by email lands on the dashboard", async ({ page }) => {
    await uiLogin(page, USERS.REQUESTER);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("AUTH-03 valid login by employee ID", async ({ page }) => {
    await uiLogin(page, "EMP001");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("AUTH-04 wrong password shows an error and stays on login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email or Employee ID").fill(USERS.REQUESTER);
    await page.locator("#password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByText(/invalid|incorrect|wrong/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("AUTH-05 protected pages redirect anonymous visitors to login", async ({ page }) => {
    for (const path of ["/dashboard", "/requests", "/create-request", "/user-management"]) {
      await page.goto(path);
      await page.waitForURL("**/login");
    }
  });

  test("AUTH-06 session survives a page reload (refresh cookie)", async ({ page }) => {
    await uiLogin(page, USERS.REQUESTER);
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("AUTH-07 logout ends the session", async ({ page }) => {
    await uiLogin(page, USERS.REQUESTER);
    await page.getByRole("button", { name: /log ?out|sign ?out/i }).first().click();
    await page.waitForURL("**/login");
    await page.goto("/requests");
    await page.waitForURL("**/login");
  });

  test("AUTH-08 forgot-password page is reachable from login", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Forgot your password?" }).click();
    await expect(page).toHaveURL(/forgot-password/);
    await expect(page.getByPlaceholder("name@srmrmp.edu.in")).toBeVisible();
  });

  test("AUTH-09 already signed-in user visiting /login is sent to dashboard", async ({ page }) => {
    await uiLogin(page, USERS.REQUESTER);
    await page.goto("/login");
    await page.waitForURL("**/dashboard");
  });
});

test.describe("Auth & platform API", () => {
  test("API-01 /ping is public and returns 200", async ({ request }) => {
    expect((await request.get(`${API}/ping`)).status()).toBe(200);
  });

  test("API-02 protected endpoints reject missing tokens with 401", async ({ request }) => {
    for (const p of ["/requests", "/users/me", "/queries", "/policies"]) {
      expect((await request.get(API + p)).status(), p).toBe(401);
    }
  });

  test("API-03 login returns an access token and sets an httpOnly refresh cookie", async ({ request }) => {
    const r = await request.post(`${API}/auth/login`, { data: { email: USERS.REQUESTER, password: PASSWORD } });
    expect(r.status()).toBe(200);
    expect((await r.json()).accessToken).toBeTruthy();
    expect(r.headers()["set-cookie"]).toMatch(/jwt=.*HttpOnly/i);
  });

  test("API-04 security headers are present", async ({ request }) => {
    const r = await request.get(`${API}/users/me`);
    expect(r.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("API-05 JSON body over the 10MB cap is rejected with 413", async ({ request }) => {
    const r = await request.post(`${API}/auth/login`, {
      data: { email: USERS.REQUESTER, password: "x".repeat(11 * 1024 * 1024) },
    });
    expect(r.status()).toBe(413);
  });
});
