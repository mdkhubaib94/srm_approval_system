"""Generic column introspection for detail models. Port of
requestController.js's pickSchemaFields.

Not belt-and-braces: a detail update payload may arrive as a JSON *string*
(detailsUpdatePayload), so Pydantic's own body validation never sees inside
it either if it's merged into an ORM update as a raw dict — this filter is
what stands between that payload and the ORM `UPDATE`, exactly as
pickSchemaFields stands between it and Mongoose's `$set`.
"""

from sqlalchemy import inspect

# Fields a client update may never drive directly — assigned server-side only.
SERVER_OWNED_FIELDS = {"id", "created_at", "updated_at", "indent_number"}


def pick_model_fields(model_cls, payload) -> dict | None:
    """Reduce `payload` to the fields that are actual columns on
    `model_cls`, dropping anything server-owned. Returns None if nothing
    survives (mirrors the source's behavior of refusing an update that would
    be a no-op)."""
    if not isinstance(payload, dict):
        return None

    column_names = {c.key for c in inspect(model_cls).columns}
    safe = {key: value for key, value in payload.items() if key in column_names and key not in SERVER_OWNED_FIELDS}
    return safe or None


def model_to_dict(instance) -> dict:
    """Plain dict of every column on an ORM instance — used to serialize a
    detail document back to the client without a per-type Pydantic schema."""
    return {c.key: getattr(instance, c.key) for c in inspect(instance).mapper.columns}
