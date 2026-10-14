from app.email.health import check_email_health, token_matches


def test_token_matches_is_constant_time_correct():
    assert token_matches("secret-token", "secret-token") is True
    assert token_matches("wrong", "secret-token") is False
    assert token_matches("", "secret-token") is False


async def test_check_email_health_disabled_when_no_token_configured():
    status_code, body = await check_email_health("anything", None)
    assert status_code == 404
    assert body["success"] is False


async def test_check_email_health_rejects_wrong_token():
    status_code, body = await check_email_health("wrong-token", "correct-token")
    assert status_code == 404


async def test_check_email_health_reports_missing_smtp_credentials(monkeypatch):
    from app import config as config_module

    settings = config_module.get_settings()
    monkeypatch.setattr(settings, "email_user", None)
    monkeypatch.setattr(settings, "email_password", None)

    status_code, body = await check_email_health("correct-token", "correct-token")
    assert status_code == 503
    assert body["stage"] == "config"


async def test_check_email_health_returns_200_when_transport_verifies(monkeypatch):
    from app import config as config_module

    settings = config_module.get_settings()
    monkeypatch.setattr(settings, "email_user", "smtp-user@example.com")
    monkeypatch.setattr(settings, "email_password", "smtp-password")

    from app.email import health as health_module

    async def fake_verify_transport():
        return {"provider": "smtp", "verified": True}

    monkeypatch.setattr(health_module, "verify_transport", fake_verify_transport)

    status_code, body = await check_email_health("correct-token", "correct-token")
    assert status_code == 200
    assert body["stage"] == "verified"


async def test_check_email_health_probes_egress_on_transport_failure(monkeypatch):
    from app import config as config_module

    settings = config_module.get_settings()
    monkeypatch.setattr(settings, "email_user", "smtp-user@example.com")
    monkeypatch.setattr(settings, "email_password", "smtp-password")

    from app.email import health as health_module
    from app.email.mail_transport import MailError

    async def failing_verify_transport():
        raise MailError("Authentication failed", code="EAUTH", command="AUTH", response_code=535)

    async def fake_probe_egress():
        return {"target": "smtp.gmail.com", "resolved": "1.2.3.4", "probes": [{"port": 465, "reachable": True, "control": False}]}

    monkeypatch.setattr(health_module, "verify_transport", failing_verify_transport)
    monkeypatch.setattr(health_module, "probe_egress", fake_probe_egress)

    status_code, body = await check_email_health("correct-token", "correct-token")
    assert status_code == 503
    assert body["stage"] == "connect"
    assert "code=EAUTH" in body["message"]
    assert body["egress"]["target"] == "smtp.gmail.com"
