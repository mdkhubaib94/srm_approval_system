"""Shared setup for every `python -m app.scripts.X` entry point: import every
model module (so relationships/metadata resolve) and hand back a session
factory, mirroring the source scripts' `require("../config/db").connectDB()`.
"""

from app.completed import models as _completed_models  # noqa: F401
from app.db.base import get_sessionmaker
from app.files import models as _files_models  # noqa: F401
from app.flagged import models as _flagged_models  # noqa: F401
from app.policies import models as _policies_models  # noqa: F401
from app.queries import models as _queries_models  # noqa: F401
from app.requests import models as _requests_models  # noqa: F401
from app.requests.details import models as _requests_details_models  # noqa: F401
from app.sops import models as _sops_models  # noqa: F401
from app.users import models as _users_models  # noqa: F401

__all__ = ["get_sessionmaker"]
