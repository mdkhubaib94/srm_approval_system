import logging.config
from pathlib import Path

from app.config import Settings


def configure_logging(settings: Settings) -> None:
    """Wire the stdlib logging module so app.* loggers actually emit somewhere.

    Console output is captured by systemd/journald when run as a service;
    the rotating file handler gives an on-disk log independent of the
    service manager, for tools/log-shippers that expect a plain file.
    """
    Path(settings.log_dir).mkdir(parents=True, exist_ok=True)

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {
                    "format": "%(asctime)s %(levelname)s %(name)s: %(message)s",
                },
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "default",
                },
                "file": {
                    "class": "logging.handlers.RotatingFileHandler",
                    "formatter": "default",
                    "filename": str(Path(settings.log_dir) / "app.log"),
                    "maxBytes": 10 * 1024 * 1024,
                    "backupCount": 5,
                },
            },
            "root": {
                "level": settings.log_level,
                "handlers": ["console", "file"],
            },
        }
    )
