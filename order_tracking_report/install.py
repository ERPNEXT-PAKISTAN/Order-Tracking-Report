from __future__ import annotations

from order_tracking_report.bootstrap import ensure_item_po_setup
from order_tracking_report.per_piece_setup import apply


def after_install() -> None:
    ensure_item_po_setup()
    apply()


def after_migrate() -> None:
    ensure_item_po_setup()
    apply()
