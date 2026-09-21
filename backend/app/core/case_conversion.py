"""snake_case <-> camelCase key conversion for the JSON boundary with the
frontend (a pre-existing React app written against the original Node/Express
API, which — being JS — used camelCase throughout, plus a handful of
Mongoose-era acronym-cased fields). This is NOT a general-purpose
transformer: RESPONSE_KEY_OVERRIDES/REQUEST_KEY_OVERRIDES exist specifically
to cover the fields where the frontend's exact expected name isn't what a
generic snake<->camel conversion would produce.
"""

import re

_UNDERSCORE_RE = re.compile(r"_([a-zA-Z0-9])")
_CAMEL_BOUNDARY_RE = re.compile(r"(?<!^)(?=[A-Z])")

# snake_case -> camelCase, for keys the generic algorithm gets wrong (mostly
# acronyms the frontend spells in all-caps: SOP, ID, HOD).
RESPONSE_KEY_OVERRIDES: dict[str, str] = {
    "request_id": "requestID",
    "employee_id": "employeeID",
    "sop_available": "SOPAvailable",
    "sop_text": "SOP",
    "remarks_by_hod": "remarksByHOD",
}

# The reverse map, for translating incoming camelCase keys back to this
# codebase's snake_case column/field names.
REQUEST_KEY_OVERRIDES: dict[str, str] = {v: k for k, v in RESPONSE_KEY_OVERRIDES.items()}


def snake_to_camel(key: str) -> str:
    if key in RESPONSE_KEY_OVERRIDES:
        return RESPONSE_KEY_OVERRIDES[key]
    if "_" not in key:
        return key
    return _UNDERSCORE_RE.sub(lambda m: m.group(1).upper(), key)


def camel_to_snake(key: str) -> str:
    if key in REQUEST_KEY_OVERRIDES:
        return REQUEST_KEY_OVERRIDES[key]
    # Already snake_case (or has no case boundaries at all) — leave alone,
    # so payloads written directly in this codebase's own tests round-trip
    # unchanged.
    if "_" in key or key.islower():
        return key
    return _CAMEL_BOUNDARY_RE.sub("_", key).lower()
