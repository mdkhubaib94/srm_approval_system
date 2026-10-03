from pydantic import BaseModel, ConfigDict, Field


class MessageOut(BaseModel):
    success: bool = True
    message: str


class LoginIn(BaseModel):
    email: str
    password: str


class AccessTokenOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    access_token: str = Field(alias="accessToken", serialization_alias="accessToken")


class ForgotPasswordIn(BaseModel):
    email: str


class VerifyResetOtpIn(BaseModel):
    email: str
    otp: str


class VerifyResetOtpOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool = True
    message: str
    reset_token: str = Field(alias="resetToken", serialization_alias="resetToken")


class ResetPasswordIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    email: str
    new_password: str = Field(alias="newPassword")
    reset_token: str | None = Field(default=None, alias="resetToken")
