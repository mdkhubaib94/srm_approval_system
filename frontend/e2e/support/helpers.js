import { expect } from "@playwright/test";

export const API = `http://localhost:${process.env.E2E_API_PORT || "5001"}`;
export const PASSWORD = "123456";

// One account per role, created by backend/app/scripts/seed_users.py.
export const USERS = {
  REQUESTER: "requester@gmail.com",
  INSTITUTION_MANAGER: "institution.manager@gmail.com",
  ACCOUNTANT: "accountant@gmail.com",
  HEAD_OF_INSTITUTION: "hoi@gmail.com",
  DIRECTOR_ADMIN: "directoradmin@gmail.com",
  CHIEF_DIRECTOR: "chiefdirector@gmail.com",
  CHAIRMAN: "chairman@gmail.com",
  CHAIRMAN_OFFICE: "chairmanoffice@gmail.com",
  AUDIT: "audit@gmail.com",
};

/** Sign in through the real login form. */
export async function uiLogin(page, email, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email or Employee ID").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("**/dashboard");
}

/** Bearer token straight from the API (used to arrange test data quickly). */
export async function apiToken(request, email, password = PASSWORD) {
  const resp = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(resp.status(), await resp.text()).toBe(200);
  return (await resp.json()).accessToken;
}

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF",
);
export const pdfFile = (name = "attachment.pdf") => ({ name, mimeType: "application/pdf", buffer: PDF });

/** Create an MOU request as `token`'s user. Returns the API payload. */
export async function createMouRequest(request, token, { title, costEstimate } = {}) {
  const multipart = {
    title: title || `E2E MOU ${Date.now()}`,
    department: "Computer Science and Engineering",
    details_model: "MouDetail",
    details_payload: JSON.stringify({
      legal_opinion_obtained: true,
      mou_type: "Fresh",
      organisation_name: "Acme Labs",
      organisation_type: "Software",
      domain_or_products: "Cloud tooling",
      validity_from: "2025-01-01",
      validity_to: "2026-01-01",
    }),
    attachments: pdfFile(),
  };
  if (costEstimate !== undefined) multipart.cost_estimate = String(costEstimate);
  const resp = await request.post(`${API}/requests`, {
    multipart,
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(resp.status(), await resp.text()).toBe(201);
  return resp.json();
}

export async function forwardRequest(request, token, requestId, comments = "E2E forward") {
  const resp = await request.patch(`${API}/requests/${requestId}`, {
    multipart: { action: "forwarded", comments },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(resp.status(), await resp.text()).toBe(200);
  return (await resp.json()).data;
}
