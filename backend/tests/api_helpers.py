import json

MINIMAL_PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"


def pdf_upload(filename: str = "attachment.pdf"):
    return ("attachments", (filename, MINIMAL_PDF_BYTES, "application/pdf"))


async def login(client, email: str, password: str = "secret123") -> str:
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["accessToken"]


MOU_PAYLOAD = {
    "legal_opinion_obtained": True,
    "mou_type": "Fresh",
    "organisation_name": "Acme Labs",
    "organisation_type": "Software",
    "domain_or_products": "Cloud tooling",
    "validity_from": "2025-01-01",
    "validity_to": "2026-01-01",
}


async def create_mou_request(client, token: str, *, title: str = "MOU with Acme", department: str = "Physics") -> dict:
    resp = await client.post(
        "/requests",
        data={
            "title": title,
            "department": department,
            "details_model": "MouDetail",
            "details_payload": json.dumps(MOU_PAYLOAD),
        },
        files=[pdf_upload()],
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()
