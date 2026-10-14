import { test, expect } from "@playwright/test";
import {
  uiLogin, apiToken, createMouRequest, forwardRequest, pdfFile, USERS, API,
} from "../support/helpers.js";

test.describe("Request lifecycle", () => {
  let requesterToken;
  let imToken;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    requesterToken = await apiToken(request, USERS.REQUESTER);
    imToken = await apiToken(request, USERS.INSTITUTION_MANAGER);
    await request.dispose();
  });

  test("REQ-01 new request is created at the Institution Manager stage", async ({ request }) => {
    const created = await createMouRequest(request, requesterToken, { title: "REQ-01 baseline MOU" });
    expect(created.requestID).toBeTruthy();
    const r = await request.get(`${API}/requests/${created.requestID}`, {
      headers: { Authorization: `Bearer ${requesterToken}` },
    });
    expect(r.status()).toBe(200);
    const payload = await r.json();
    const body = payload.data ?? payload;
    expect(body.status).toBe("PENDING");
    expect(body.stage).toBe("INSTITUTION_MANAGER");
  });

  test("REQ-02 requester sees their request in All Requests and can open it", async ({ page, request }) => {
    const title = `REQ-02 visible MOU ${Date.now()}`;
    const created = await createMouRequest(request, requesterToken, { title });

    await uiLogin(page, USERS.REQUESTER);
    await page.goto("/requests");
    await expect(page.getByText(title)).toBeVisible();
    await page.getByText(title).click();
    await expect(page).toHaveURL(new RegExp(`/requests/${created.requestID}`));
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("PENDING").first()).toBeVisible();
    await expect(page.getByText("INSTITUTION_MANAGER").first()).toBeVisible();
    // The requester is not the stage holder, so no processing controls.
    await expect(page.getByRole("button", { name: "Process Request" })).toHaveCount(0);
  });

  test("REQ-03 stage holder (Institution Manager) gets the Process Request action", async ({ page, request }) => {
    const title = `REQ-03 IM actionable ${Date.now()}`;
    const created = await createMouRequest(request, requesterToken, { title });

    await uiLogin(page, USERS.INSTITUTION_MANAGER);
    await page.goto(`/requests/${created.requestID}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("button", { name: "Process Request" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Raise Query" })).toBeVisible();
  });

  test("REQ-04 forwarding a zero-cost request skips the accountant (UI reflects new stage)", async ({ page, request }) => {
    const title = `REQ-04 zero cost ${Date.now()}`;
    const created = await createMouRequest(request, requesterToken, { title });
    const after = await forwardRequest(request, imToken, created.requestID);
    expect(after.stage).toBe("HEAD_OF_INSTITUTION");

    await uiLogin(page, USERS.REQUESTER);
    await page.goto(`/requests/${created.requestID}`);
    await expect(page.getByText("HEAD_OF_INSTITUTION").first()).toBeVisible();
  });

  test("REQ-05 forwarding a request with a cost estimate goes to the accountant", async ({ request }) => {
    const created = await createMouRequest(request, requesterToken, { title: "REQ-05 costed MOU", costEstimate: 1000 });
    const after = await forwardRequest(request, imToken, created.requestID);
    expect(after.stage).toBe("ACCOUNTANT");
  });

  // KNOWN DEFECT (found by this suite, reported to the team): the request OWNER
  // is allowed through can_act_on_request(), and the "forwarded" branch of
  // update_request() never checks that the actor holds the current stage, so a
  // REQUESTER can push their own request past the approvers. This test asserts
  // the SECURE behaviour and is marked test.fail(): the suite stays green
  // while the defect exists and goes red ("unexpected pass") the moment it is
  // fixed, prompting removal of the annotation.
  test("REQ-06 [KNOWN DEFECT] the requester cannot forward their own request past the approvers", async ({ request }) => {
    test.fail(true, "Requester can advance their own request through approval stages");
    const created = await createMouRequest(request, requesterToken, { title: "REQ-06 self-forward" });
    const r = await request.patch(`${API}/requests/${created.requestID}`, {
      multipart: { action: "forwarded" },
      headers: { Authorization: `Bearer ${requesterToken}` },
    });
    expect([401, 403]).toContain(r.status());
  });

  test("REQ-07 a user at the wrong stage cannot forward (HOI cannot act at IM stage)", async ({ request }) => {
    const created = await createMouRequest(request, requesterToken, { title: "REQ-07 wrong stage" });
    const hoiToken = await apiToken(request, USERS.HEAD_OF_INSTITUTION);
    const r = await request.patch(`${API}/requests/${created.requestID}`, {
      multipart: { action: "forwarded" },
      headers: { Authorization: `Bearer ${hoiToken}` },
    });
    expect([400, 401, 403]).toContain(r.status());
  });

  test("REQ-08 rejecting a request moves it to REJECTED and the UI shows it", async ({ page, request }) => {
    const title = `REQ-08 reject ${Date.now()}`;
    const created = await createMouRequest(request, requesterToken, { title });
    const r = await request.patch(`${API}/requests/${created.requestID}`, {
      multipart: { action: "rejected", rejected_reason: "E2E rejection", comments: "no" },
      headers: { Authorization: `Bearer ${imToken}` },
    });
    expect(r.status(), await r.text()).toBe(200);

    await uiLogin(page, USERS.REQUESTER);
    await page.goto(`/requests/${created.requestID}`);
    await expect(page.getByText("REJECTED").first()).toBeVisible();
  });

  test("REQ-09 request list filters: Pending / Rejected tabs respond", async ({ page }) => {
    await uiLogin(page, USERS.REQUESTER);
    await page.goto("/requests");
    await page.getByRole("button", { name: /^Rejected/ }).click();
    await expect(page.getByText("REQ-08 reject").first()).toBeVisible();
    await page.getByRole("button", { name: /^Pending/ }).click();
    await expect(page.getByText("REQ-08 reject")).toHaveCount(0);
  });

  test("REQ-10 request without an attachment is refused by the API", async ({ request }) => {
    const r = await request.post(`${API}/requests`, {
      multipart: {
        title: "REQ-10 no attachment",
        department: "Computer Science and Engineering",
        details_model: "MouDetail",
        details_payload: JSON.stringify({ mou_type: "Fresh" }),
      },
      headers: { Authorization: `Bearer ${requesterToken}` },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });
});

test.describe("Create Request form", () => {
  test("FORM-01 submitting an empty form shows validation errors and does not navigate", async ({ page }) => {
    await uiLogin(page, USERS.REQUESTER);
    await page.goto("/create-request");
    await page.getByRole("button", { name: /submit|create request/i }).last().click();
    await expect(page.getByText("Validation Errors:")).toBeVisible();
    await expect(page).toHaveURL(/\/create-request/);
  });

  test("FORM-02 title shorter than 5 characters is flagged on blur", async ({ page }) => {
    await uiLogin(page, USERS.REQUESTER);
    await page.goto("/create-request");
    const title = page.getByPlaceholder("Enter request title (min 5 characters)");
    await title.fill("abc");
    await title.blur();
    await expect(page.getByText("Title must be at least 5 characters").first()).toBeVisible();
  });

  test("FORM-03 picking a request type reveals its approval category", async ({ page }) => {
    await uiLogin(page, USERS.REQUESTER);
    await page.goto("/create-request");
    // "Approval Category" is a disabled, read-only <input>, so assert on its value.
    const category = page.locator("input[readonly][disabled]").first();
    await expect(category).toHaveValue("Select a Request Type above");
    const select = page.locator("select").first();
    await select.selectOption({ index: 1 });
    await expect(category).not.toHaveValue("Select a Request Type above");
  });
});

test.describe("Create Request - full UI happy path", () => {
  test("FORM-04 requester submits an MOU request through the form and lands on its detail page", async ({ page }) => {
    const title = `FORM-04 UI-created MOU ${Date.now()}`;
    await uiLogin(page, USERS.REQUESTER);
    await page.goto("/create-request");

    // Dynamic fields have <label>s that are not bound to their control, so
    // locate the control as the label's next sibling.
    const control = (label, tag) =>
      page.locator(`xpath=//label[contains(normalize-space(.), "${label}")]/following-sibling::${tag}[1]`).first();

    await page.getByPlaceholder("Enter request title (min 5 characters)").fill(title);
    await page.getByPlaceholder(/Explain the purpose/).fill("Regression test purpose for the MOU request.");

    // Institution (custom dropdown) then Department (searchable dropdown).
    await page.getByRole("button", { name: /Select Institution/i }).click();
    await page.getByText("EEC", { exact: true }).first().click();
    await page.getByRole("button", { name: "Select Department" }).click();
    await page.getByPlaceholder("Search...").fill("Computer Science");
    // Scope to the open dropdown - the page header also shows this department.
    await page.getByPlaceholder("Search...").locator("xpath=ancestor::div[2]").getByText(/Computer Science and Engineering/).first().click();

    await page.locator("select").first().selectOption("MouDetail");

    await control("MOU Type", "select").selectOption("Fresh");
    await control("Organisation Name", "input").fill("Acme Labs");
    await control("Organisation Type", "select").selectOption("Software");
    await control("Domain/Products", "input").fill("Cloud tooling");
    await control("Validity From", "input").fill("2026-01-01");
    await control("Validity To", "input").fill("2027-01-01");

    await page.locator('input[type="file"]').first().setInputFiles(pdfFile("mou.pdf"));
    await expect(page.getByText("mou.pdf")).toBeVisible();

    await page.getByRole("button", { name: "Create Request" }).click();
    await expect(page.getByText("Submit Request for Approval")).toBeVisible();
    await page.getByRole("button", { name: "Confirm & Submit" }).click();
    await page.waitForURL(/\/requests\/[^/]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("INSTITUTION_MANAGER").first()).toBeVisible();
  });
});
