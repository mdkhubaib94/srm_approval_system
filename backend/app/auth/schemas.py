from pydantic import BaseModel, ConfigDict, Field


class MessageOut(BaseModel):
    success: bool = True
    message: str


class SendSignupOtpIn(BaseModel):
    email: str
    name: str


class VerifySignupOtpIn(BaseModel):
    email: str
    otp: str


class RegisterIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    employee_id: str = Field(alias="employeeID")
    email: str
    phone: str | None = None
    password: str
    role: str | None = None
    institution: str | None = None
    department: str | None = None


class RegisteredUserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    institution: str | None = None


class RegisterOut(BaseModel):
    message: str
    user: RegisteredUserOut


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
