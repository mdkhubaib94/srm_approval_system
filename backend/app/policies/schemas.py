from pydantic import BaseModel


class UpdatePolicyIn(BaseModel):
    policy_approval_status: str | None = None
    rejected_reason: str | None = None
