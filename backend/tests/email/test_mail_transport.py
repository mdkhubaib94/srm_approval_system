from app.email import mail_transport as mt


def test_describe_mail_config_never_leaks_credentials(monkeypatch):
    from app import config as config_module

    settings = config_module.get_settings()
    monkeypatch.setattr(settings, "email_user", "someone@example.com")
    monkeypatch.setattr(settings, "email_password", "super-secret")

    config = mt.describe_mail_config()
    assert config["provider"] == "smtp"
    # user_set/password_set are booleans, not the values themselves — only
    # the "from" address is intentionally included (it's not a secret, it's
    # the visible sender address; the password never appears anywhere).
    assert config["user_set"] is True
    assert config["password_set"] is True
    assert "super-secret" not in str(config)


def test_resolve_from_address_prefers_email_from(monkeypatch):
    from app import config as config_module

    settings = config_module.get_settings()
    monkeypatch.setattr(settings, "email_from", "Custom Sender <custom@example.com>")
    assert mt.resolve_from_address() == "Custom Sender <custom@example.com>"


def test_describe_mail_error_includes_provider_and_code():
    error = mt.MailError("boom", code="EAUTH", command="AUTH")
    description = mt.describe_mail_error(error)
    assert "code=EAUTH" in description
    assert "command=AUTH" in description
    assert "provider=smtp" in description
