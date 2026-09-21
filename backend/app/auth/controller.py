from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.schemas import (
    AccessTokenOut,
    ForgotPasswordIn,
    LoginIn,
    MessageOut,
    RegisterIn,
    RegisterOut,
    RegisteredUserOut,
    ResetPasswordIn,
    SendSignupOtpIn,
    VerifyResetOtpIn,
    VerifyResetOtpOut,
    VerifySignupOtpIn,
)
from app.config import get_settings
from app.core.rate_limit import login_rate_limit_precheck, otp_rate_limit, register_rate_limit
from app.core.security import refresh_cookie_kwargs, reset_cookie_kwargs
from app.db.session import get_db
from app.auth import service

router = APIRouter(prefix="/auth", tags=["auth"])


def _error_response(exc: service.AuthServiceError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.body)


# ─── Signup OTP ───────────────────────────────────────────────────────────────


@router.post("/send-signup-otp", dependencies=[Depends(otp_rate_limit)])
async def send_signup_otp(body: SendSignupOtpIn, db: AsyncSession = Depends(get_db)):
    try:
        await service.send_signup_otp(db, body.email, body.name)
    except service.AuthServiceError as exc:
        return _error_response(exc)
    return MessageOut(success=True, message="OTP sent successfully to your email.")


@router.post("/verify-signup-otp", dependencies=[Depends(otp_rate_limit)])
async def verify_signup_otp(body: VerifySignupOtpIn):
    try:
        service.verify_signup_otp(body.email, body.otp)
    except service.AuthServiceError as exc:
        return _error_response(exc)
    return MessageOut(success=True, message="OTP verified successfully. You can now complete your registration.")


@router.post("/resend-signup-otp", dependencies=[Depends(otp_rate_limit)])
async def resend_signup_otp(body: SendSignupOtpIn, db: AsyncSession = Depends(get_db)):
    try:
        await service.resend_signup_otp(db, body.email, body.name)
    except service.AuthServiceError as exc:
        return _error_response(exc)
    return MessageOut(success=True, message="OTP sent successfully to your email.")


# ─── Register ─────────────────────────────────────────────────────────────────


@router.post("/register", status_code=status.HTTP_201_CREATED, dependencies=[Depends(register_rate_limit)])
async def register(body: RegisterIn, db: AsyncSession = Depends(get_db)):
    try:
        user = await service.register(
            db,
            password=body.password,
            email=body.email,
            employee_id=body.employee_id,
            role=body.role,
            name=body.name,
            phone=body.phone,
            institution=body.institution,
            department=body.department,
        )
    except service.AuthServiceError as exc:
        return _error_response(exc)

    return RegisterOut(
        message="Account created successfully",
        user=RegisteredUserOut(id=user.id, name=user.name, email=user.email, role=user.role, institution=user.institution),
    )


# ─── Login / refresh / logout ─────────────────────────────────────────────────


@router.post("/login")
async def login(
    body: LoginIn,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    rate_limit_key: str = Depends(login_rate_limit_precheck),
):
    try:
        user, access_token, refresh_token = await service.login(
            db, credential=body.email.strip(), password=body.password, rate_limit_key=rate_limit_key
        )
    except service.AuthServiceError as exc:
        return _error_response(exc)

    # The refresh token is delivered only as an httpOnly cookie — never in the
    # response body, so client-side script (and therefore XSS) cannot read it.
    response.set_cookie("jwt", refresh_token, **refresh_cookie_kwargs(request, user))
    return AccessTokenOut(access_token=access_token)


@router.get("/refresh")
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    try:
        user, access_token, new_refresh_token = await service.refresh_tokens(db, request.cookies.get("jwt"))
    except service.AuthServiceError as exc:
        return _error_response(exc)

    response.set_cookie("jwt", new_refresh_token, **refresh_cookie_kwargs(request, user))
    return AccessTokenOut(access_token=access_token)


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    refresh_token = request.cookies.get("jwt")

    clear_kwargs = refresh_cookie_kwargs(request, None)
    clear_kwargs.pop("max_age", None)
    response.delete_cookie("jwt", path=clear_kwargs["path"], samesite=clear_kwargs["samesite"], secure=clear_kwargs["secure"], httponly=clear_kwargs["httponly"])

    if not refresh_token:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    await service.revoke_refresh_token(db, refresh_token)
    return MessageOut(success=True, message="Logged out successfully")


# ─── Password reset ───────────────────────────────────────────────────────────

NEUTRAL_RESET_RESPONSE = MessageOut(success=True, message=service.NEUTRAL_RESET_MESSAGE)


@router.post("/forgot-password", dependencies=[Depends(otp_rate_limit)])
async def forgot_password(body: ForgotPasswordIn, db: AsyncSession = Depends(get_db)):
    try:
        await service.dispatch_reset_otp(db, body.email)
    except service.AuthServiceError as exc:
        return _error_response(exc)
    return NEUTRAL_RESET_RESPONSE


@router.post("/verify-reset-otp", dependencies=[Depends(otp_rate_limit)])
async def verify_reset_otp(body: VerifyResetOtpIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    try:
        _, reset_token = await service.verify_reset_otp(db, email=body.email, otp=body.otp)
    except service.AuthServiceError as exc:
        return _error_response(exc)

    response.set_cookie("resetToken", reset_token, **reset_cookie_kwargs(request))

    return VerifyResetOtpOut(
        success=True,
        message="OTP verified successfully. You can now reset your password.",
        reset_token=reset_token,
    )


@router.post("/reset-password", dependencies=[Depends(otp_rate_limit)])
async def reset_password(body: ResetPasswordIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    # Cookie first, then the body copy the reset page still sends.
    token = request.cookies.get("resetToken") or body.reset_token

    try:
        await service.reset_password(db, token=token, email=body.email, new_password=body.new_password)
    except service.AuthServiceError as exc:
        return _error_response(exc)

    # Same attributes as the set, minus max_age, so the clear actually matches.
    clear_kwargs = reset_cookie_kwargs(request)
    response.delete_cookie(
        "resetToken",
        path=clear_kwargs["path"],
        samesite=clear_kwargs["samesite"],
        secure=clear_kwargs["secure"],
        httponly=clear_kwargs["httponly"],
    )

    return MessageOut(success=True, message="Password reset successfully. You can now log in with your new password.")


@router.post("/resend-reset-otp", dependencies=[Depends(otp_rate_limit)])
async def resend_reset_otp(body: ForgotPasswordIn, db: AsyncSession = Depends(get_db)):
    try:
        await service.dispatch_reset_otp(db, body.email)
    except service.AuthServiceError as exc:
        return _error_response(exc)
    return NEUTRAL_RESET_RESPONSE


# ─── Deployment diagnostics ────────────────────────────────────────────────────
# Behind EMAIL_DIAG_TOKEN — 404s when that is unset, so it does not exist as a
# route in a normal deployment. otp_rate_limit is reused because this opens an
# outbound SMTP/HTTPS connection per call.


@router.get("/email-health", dependencies=[Depends(otp_rate_limit)])
async def email_health(token: str | None = None):
    from app.email.health import check_email_health

    status_code, body = await check_email_health(token, get_settings().email_diag_token)
    return JSONResponse(status_code=status_code, content=body)
