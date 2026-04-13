from __future__ import annotations

from order_tracking_report.per_piece_setup import apply


def after_install() -> None:
    apply()


def after_migrate() -> None:
    apply()
