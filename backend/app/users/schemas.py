from pydantic import BaseModel, ConfigDict, Field


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    name: str
    employee_id: str = Field(serialization_alias="employeeID")
    email: str
    phone: str | None = None
    role: str
    institution: str | None = None
    department: str | None = None
    token_version: int = Field(serialization_alias="tokenVersion")


class UpdateMeIn(BaseModel):
    phone: str | None = None
    department: str | None = None


class CreateUserIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    employee_id: str = Field(alias="employeeID")
    email: str
    phone: str | None = None
    role: str
    institution: str | None = None
    department: str | None = None


class BulkUserRow(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = None
    employee_id: str | None = Field(default=None, alias="employeeID")
    email: str | None = None
    phone: str | None = None
    department: str | None = None


class BulkCreateUsersIn(BaseModel):
    role: str
    institution: str | None = None
    rows: list[BulkUserRow]


class UpdateUserIn(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    institution: str | None = None
    department: str | None = None


class ChangeMyPasswordIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    current_password: str = Field(alias="currentPassword")
    new_password: str = Field(alias="newPassword")


class VerifyMyPasswordIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    current_password: str = Field(alias="currentPassword")


class SetUserPasswordIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    new_password: str = Field(alias="newPassword")
