from pydantic import BaseModel


class PermissionOut(BaseModel):
    key: str
    label: str
    roles: list[str]


class UpdatePermissionRolesIn(BaseModel):
    roles: list[str]
