from pydantic import BaseModel


class CreateQueryIn(BaseModel):
    request: str | None = None
    policy: str | None = None
    query: str
    query_reply_by: int | None = None
