"""Business logic for dynamic request-creation form configuration. No
controller in the source (src/models/FormConfig.js) ever exposed this model
over HTTP — the Next.js frontend hardcoded the same shape in
lib/formConfigs.js instead — but the schema is kept as a going concern, so
this is a fresh CRUD surface built to the same shape rather than a line-for-
line port.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser
from app.form_configs.models import FormConfig, FormConfigField
from app.form_configs.schemas import FormFieldIn
from app.form_configs import repository as repo
from app.requests.details.registry import DETAIL_MODELS

# Only CHAIRMAN_OFFICE manages SOPs and other cross-cutting reference data
# (see app/services/sops_service.py) — form configs get the same gate.
MANAGE_ROLES = ("CHAIRMAN_OFFICE",)


class FormConfigServiceError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _serialize(config: FormConfig) -> dict:
    return {
        "id": config.id,
        "request_type": config.request_type,
        "title": config.title,
        "fields": [
            {
                "name": f.name,
                "label": f.label,
                "type": f.field_type,
                "required": f.required,
                "options": f.options or [],
                "validation": {
                    "min": float(f.validation_min) if f.validation_min is not None else None,
                    "max": float(f.validation_max) if f.validation_max is not None else None,
                    "regex": f.validation_regex,
                },
            }
            for f in config.fields
        ],
        "created_at": config.created_at,
        "updated_at": config.updated_at,
    }


def _build_field_rows(fields: list[FormFieldIn]) -> list[FormConfigField]:
    return [
        FormConfigField(
            position=i,
            name=f.name,
            label=f.label,
            field_type=f.type,
            required=f.required,
            options=f.options or None,
            validation_min=f.validation.min if f.validation else None,
            validation_max=f.validation.max if f.validation else None,
            validation_regex=f.validation.regex if f.validation else None,
        )
        for i, f in enumerate(fields)
    ]


async def list_form_configs(db: AsyncSession) -> dict:
    configs = await repo.list_form_configs(db)
    return {"success": True, "count": len(configs), "data": [_serialize(c) for c in configs]}


async def get_form_config(db: AsyncSession, request_type: str) -> dict:
    config = await repo.get_by_request_type(db, request_type)
    if config is None:
        raise FormConfigServiceError(404, "Form config not found")
    return {"success": True, "data": _serialize(config)}


async def create_form_config(
    db: AsyncSession, current_user: CurrentUser, *, request_type: str, title: str, fields: list[FormFieldIn]
) -> dict:
    if current_user.role not in MANAGE_ROLES:
        raise FormConfigServiceError(403, "Only CHAIRMAN_OFFICE can manage form configs")
    if request_type not in DETAIL_MODELS:
        raise FormConfigServiceError(400, f"Unknown request type: {request_type}")

    existing = await repo.get_id_by_request_type(db, request_type)
    if existing is not None:
        raise FormConfigServiceError(409, f"A form config for {request_type} already exists")

    config = FormConfig(request_type=request_type, title=title, fields=_build_field_rows(fields))
    repo.add_form_config(db, config)
    await repo.commit(db)

    config = await repo.get_by_id(db, config.id)
    return {"success": True, "message": "Form config created successfully", "data": _serialize(config)}


async def update_form_config(
    db: AsyncSession,
    current_user: CurrentUser,
    request_type: str,
    *,
    title: str | None,
    fields: list[FormFieldIn] | None,
) -> dict:
    if current_user.role not in MANAGE_ROLES:
        raise FormConfigServiceError(403, "Only CHAIRMAN_OFFICE can manage form configs")

    config = await repo.get_by_request_type(db, request_type)
    if config is None:
        raise FormConfigServiceError(404, "Form config not found")

    if title is not None:
        config.title = title
    if fields is not None:
        config.fields = _build_field_rows(fields)

    await repo.commit(db)

    config = await repo.get_by_id(db, config.id)
    return {"success": True, "message": "Form config updated successfully", "data": _serialize(config)}


async def delete_form_config(db: AsyncSession, current_user: CurrentUser, request_type: str) -> dict:
    if current_user.role not in MANAGE_ROLES:
        raise FormConfigServiceError(403, "Only CHAIRMAN_OFFICE can manage form configs")

    config = await repo.get_by_request_type(db, request_type)
    if config is None:
        raise FormConfigServiceError(404, "Form config not found")

    await repo.delete_form_config(db, config)
    await repo.commit(db)
    return {"success": True, "message": "Form config deleted successfully"}
