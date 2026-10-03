"""Object-level access rules for reading/writing requests. Direct port of
src/utils/access.js.

Pure, dependency-free (no DB session, no FastAPI) — operates on plain
attributes of a request-like object (works against the Request ORM model or
a lightweight stand-in in tests) so it can be unit-tested without a DB.

The list endpoint (GET /requests) already scopes results by role; these
helpers apply the equivalent rule when a single document is fetched by id,
which is where broken-object-level-authorization bugs normally live.
"""

from app.users.constants import institutions_for, same_institution
from app.requests.workflow import CATEGORY_STAGE_SEQUENCES, INSTITUTION_SCOPED_STAGES

# Roles whose remit spans every institution.
GLOBAL_VIEW_ROLES = [
    "CHAIRMAN_OFFICE",
    "HR_HEAD",
    "MMA",
    "MANAGER_DATA_MANAGEMENT",
    "AUDIT",
    "GM_FINANCE",
    "DIRECTOR_ADMISSIONS",
    "DIRECTOR_RESEARCH",
    "DIRECTOR_ADMIN",
    "CHIEF_DIRECTOR",
    "CHAIRMAN",
]

# Roles confined to their own institution.
INSTITUTION_VIEW_ROLES = ["INSTITUTION_MANAGER", "ACCOUNTANT", "HEAD_OF_INSTITUTION"]

# Roles allowed to pull the unfiltered cross-institution request list.
ALL_REQUESTS_ROLES = ["DIRECTOR_ADMIN", "CHIEF_DIRECTOR", "CHAIRMAN"]

# Roles that see every completion record (mirrors get_all_completed, Phase 4).
COMPLETED_ADMIN_ROLES = ["DIRECTOR_ADMIN", "CHIEF_DIRECTOR", "CHAIRMAN", "CHAIRMAN_OFFICE"]


def _same_id(a, b) -> bool:
    return a is not None and b is not None and a == b


def can_view_request(user, request) -> bool:
    """May this user read this request?
    - REQUESTER: only their own submissions
    - institution-scoped approvers: only their own institution
    - central approvers: any request whose category's stage sequence
      includes their role (not blanket access to every category)
    """
    if not user or not request:
        return False

    if user.role == "REQUESTER":
        return _same_id(request.requester_id, user.id)

    if user.role in INSTITUTION_VIEW_ROLES:
        if request.institution and not same_institution(request.institution, user.institution, user.role):
            # Still allow it if they personally acted on it (audit trail).
            return any(_same_id(entry.action_by_id, user.id) for entry in (request.action_history or []))
        return True

    if user.role in GLOBAL_VIEW_ROLES:
        sequence = CATEGORY_STAGE_SEQUENCES.get(request.request_category)
        return bool(sequence) and user.role in sequence

    return False


def can_view_all_requests(user) -> bool:
    return bool(user) and user.role in ALL_REQUESTS_ROLES


def can_see_action_history_entry(user, request, entry) -> bool:
    """You always see your own entries. Otherwise, an entry is visible only
    if your role sits later in the request's category stage sequence than
    the entry's author — stages above you see your comments; you see
    comments from stages below you. Roles absent from the sequence
    (REQUESTER, or a role from an unrelated category) sort below everyone.
    """
    if _same_id(entry.action_by_id, user.id if user else None):
        return True

    author_role = entry.action_by.role if entry.action_by else None
    if not author_role:
        return False

    sequence = CATEGORY_STAGE_SEQUENCES.get(request.request_category if request else None)
    if not sequence:
        return False

    user_role = user.role if user else None
    try:
        user_index = sequence.index(user_role)
    except ValueError:
        user_index = -1
    try:
        author_index = sequence.index(author_role)
    except ValueError:
        author_index = -1
    return user_index > author_index


def filter_action_history_for_viewer(request, user, action_history: list) -> list:
    """The subset of `action_history` entries `user` is allowed to see."""
    return [entry for entry in action_history if can_see_action_history_entry(user, request, entry)]


# ─── Write-level rules ────────────────────────────────────────────────────────
#
# The helpers above answer "may this user READ this?". Everything below
# answers "may this user CHANGE this?", a strictly narrower question. Using a
# read predicate to gate a write is its own vulnerability class: every
# GLOBAL_VIEW_ROLES holder can read any request, but that must not let them
# mutate one that is not at their stage.


def stage_is_institution_scoped(stage: str | None) -> bool:
    return stage in INSTITUTION_SCOPED_STAGES


def is_stage_holder(user, request) -> bool:
    """Is this user the approver currently holding the request's stage?
    Institution-scoped stages additionally require an institution match."""
    if not user or not request:
        return False
    if request.stage != user.role:
        return False
    if stage_is_institution_scoped(request.stage) and not same_institution(request.institution, user.institution, user.role):
        return False
    return True


def is_request_owner(user, request) -> bool:
    """Is this user the REQUESTER who submitted this request?"""
    if not user or not request:
        return False
    # A Head of Institution / Institution Manager who submitted the request owns
    # it like a requester.
    is_creator_role = (
        (user.role == "HEAD_OF_INSTITUTION" and getattr(request, "is_hoi_created", False))
        or (user.role == "INSTITUTION_MANAGER" and getattr(request, "is_im_created", False))
    )
    if user.role != "REQUESTER" and not is_creator_role:
        return False
    return _same_id(request.requester_id, user.id)


def can_act_on_request(user, request) -> bool:
    """May this user mutate this request (forward, reject, set stage fields)?

    A REQUESTER may only touch their own submission. Everyone else must be
    the role currently holding the stage.
    """
    if not user or not request:
        return False
    if user.role == "REQUESTER" or is_request_owner(user, request):
        return is_request_owner(user, request)
    return is_stage_holder(user, request)


def can_attach_to_request(user, request) -> bool:
    """May this user add attachments to this request? Same rule as acting on
    it — deliberately does NOT reuse can_view_request: read access is far
    broader, and appending files is a write."""
    return can_act_on_request(user, request)


def can_view_completed(user, request) -> bool:
    """Completion records inherit their parent request's visibility."""
    return can_view_request(user, request)


def can_update_completed(user, request) -> bool:
    """May this user record completion progress against this request?

    The UI only offers this to the REQUESTER (who does the work); oversight
    roles that already see every completion record may correct bad data;
    HEAD_OF_INSTITUTION is limited to its own institution.
    """
    if not user or not request:
        return False
    if user.role == "REQUESTER" or is_request_owner(user, request):
        return is_request_owner(user, request)
    if user.role in COMPLETED_ADMIN_ROLES:
        return True
    if user.role == "HEAD_OF_INSTITUTION":
        return not request.institution or request.institution == user.institution
    return False


def can_view_query(user, request) -> bool:
    """Queries inherit their parent request's visibility."""
    return can_view_request(user, request)


def can_raise_query(user, request) -> bool:
    """Raising a query flips the request to QUERY status and stops the
    approval clock, so it is restricted to whoever currently holds the
    stage."""
    return is_stage_holder(user, request)


def can_reply_to_query(user, query, request) -> bool:
    """May this user reply to / resolve this query? Limited to: the
    requester of the parent request, the user nominated in query_reply_by,
    and the stage holder who raised it."""
    if not user or not query:
        return False
    if _same_id(query.query_reply_by_id, user.id):
        return True
    if _same_id(query.raised_by_id, user.id):
        return True
    if not request:
        return False
    if user.role == "REQUESTER" or is_request_owner(user, request):
        return is_request_owner(user, request)
    return is_stage_holder(user, request)


# ─── Policies ─────────────────────────────────────────────────────────────────

POLICY_FULL_VIEW_ROLES = ["DIRECTOR_ADMIN", "CHAIRMAN"]

POLICY_PUBLIC_FIELDS = ["title", "description", "cost", "requester", "created_at", "updated_at", "policy_approval_status"]


def can_view_full_policy(user, policy) -> bool:
    """Authors see their own; DIRECTOR_ADMIN and CHAIRMAN approve them so they
    see all."""
    if not user or not policy:
        return False
    if user.role in POLICY_FULL_VIEW_ROLES:
        return True
    if user.role == "HEAD_OF_INSTITUTION":
        return _same_id(policy.requester_id, user.id)
    return False


def is_policy_owner(user, policy) -> bool:
    """Is this user the HEAD_OF_INSTITUTION who submitted this policy?"""
    if not user or not policy:
        return False
    if user.role != "HEAD_OF_INSTITUTION":
        return False
    return _same_id(policy.requester_id, user.id)


def can_view_policy_query(user, policy) -> bool:
    """Policies are readable reference material for every authenticated
    staff member (GET /policies never scopes the list itself, only the
    projection), so a query raised on one is visible the same way."""
    return bool(user) and bool(policy)


def can_raise_policy_query(user, policy) -> bool:
    """Only CHAIRMAN approves policies, and only while a decision is still
    pending — mirrors can_raise_query being restricted to the current stage
    holder."""
    if not user or not policy:
        return False
    return user.role == "CHAIRMAN" and policy.policy_approval_status == "PENDING"


def can_reply_to_policy_query(user, query, policy) -> bool:
    """May this user reply to / resolve this policy query? Limited to: the
    HEAD_OF_INSTITUTION who submitted the policy, the user nominated in
    query_reply_by, and the CHAIRMAN who raised it."""
    if not user or not query:
        return False
    if _same_id(query.query_reply_by_id, user.id):
        return True
    if _same_id(query.raised_by_id, user.id):
        return True
    if not policy:
        return False
    if user.role == "HEAD_OF_INSTITUTION":
        return is_policy_owner(user, policy)
    return user.role == "CHAIRMAN"
