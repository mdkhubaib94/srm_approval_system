"""Static registry of the polymorphic detail models. Direct port of
src/models/details/index.js.

Every entry is a literal reference resolved at module import, so the set of
loadable models is fixed at process start — this is what stands in for the
source's frozen DETAIL_MODELS object literal, which itself replaced an
earlier `require(`../models/details/${detailsModel}`)` call (a client-
controlled string reaching a dynamic module path — a traversal/RCE risk).
The Python equivalent risk would be a client string reaching `getattr()` or
`importlib.import_module()`; a frozen dict lookup closes it the same way.
Never replace this with a dynamic name-based lookup.

All 14 production types are registered (Phase 3 completed the 12 mechanically
transcribed in Phase 2's wake). GenericDetail is deliberately excluded per
the migration plan — it existed in the source only as a flexible fallback
shape for seed/test fixtures, and a typed Postgres schema + real pytest
factories remove the reason it existed.
"""

from sqlalchemy.orm import DeclarativeBase

from app.requests.details.models import (
    DiscontinuedStudentDetail,
    EquipmentPurchaseDetail,
    FeesConcessionDetail,
    GeneralDetail,
    GuestLectureDetail,
    ITPurchaseDetail,
    MachineRepairDetail,
    MaintenanceDetail,
    MouDetail,
    NonBudgetedAssetDetail,
    RecurringExpenditureDetail,
    SeminarHostingDetail,
    SeminarParticipationDetail,
    UnexpectedExpenseDetail,
)

DETAIL_MODELS: dict[str, type[DeclarativeBase]] = {
    "MouDetail": MouDetail,
    "GuestLectureDetail": GuestLectureDetail,
    "EquipmentPurchaseDetail": EquipmentPurchaseDetail,
    "MaintenanceDetail": MaintenanceDetail,
    "SeminarParticipationDetail": SeminarParticipationDetail,
    "SeminarHostingDetail": SeminarHostingDetail,
    "MachineRepairDetail": MachineRepairDetail,
    "GeneralDetail": GeneralDetail,
    "DiscontinuedStudentDetail": DiscontinuedStudentDetail,
    "FeesConcessionDetail": FeesConcessionDetail,
    "NonBudgetedAssetDetail": NonBudgetedAssetDetail,
    "UnexpectedExpenseDetail": UnexpectedExpenseDetail,
    "ITPurchaseDetail": ITPurchaseDetail,
    "RecurringExpenditureDetail": RecurringExpenditureDetail,
}

# Maps a detail model name to its table name, for the shared indent tables'
# (owner_table, owner_id) dispatch.
DETAIL_MODEL_TABLE_NAMES: dict[str, str] = {
    "MouDetail": "mou_details",
    "GuestLectureDetail": "guest_lecture_details",
    "EquipmentPurchaseDetail": "equipment_purchase_details",
    "MaintenanceDetail": "maintenance_details",
    "SeminarParticipationDetail": "seminar_participation_details",
    "SeminarHostingDetail": "seminar_hosting_details",
    "MachineRepairDetail": "machine_repair_details",
    "GeneralDetail": "general_details",
    "DiscontinuedStudentDetail": "discontinued_student_details",
    "FeesConcessionDetail": "fees_concession_details",
    "NonBudgetedAssetDetail": "non_budgeted_asset_details",
    "UnexpectedExpenseDetail": "unexpected_expense_details",
    "ITPurchaseDetail": "it_purchase_details",
    "RecurringExpenditureDetail": "recurring_expenditure_details",
}

# The subset of detail types that support the shared indent block (indent
# line items / change log). Port of requestController.js's
# INDENT_CAPABLE_MODELS.
INDENT_CAPABLE_MODELS: list[str] = [
    "NonBudgetedAssetDetail",
    "EquipmentPurchaseDetail",
    "ITPurchaseDetail",
    "GeneralDetail",
    "UnexpectedExpenseDetail",
    "RecurringExpenditureDetail",
]


def get_detail_model(name: str | None) -> type[DeclarativeBase] | None:
    """Look up a detail model by name. Returns None when `name` is not an
    exact, scalar match for a registered model. Never raises on hostile
    input."""
    if not isinstance(name, str):
        return None
    return DETAIL_MODELS.get(name)
