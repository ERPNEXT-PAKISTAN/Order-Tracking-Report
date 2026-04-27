from __future__ import annotations

from order_tracking_report.bootstrap import ensure_item_po_setup
from order_tracking_report.bootstrap import ensure_sales_order_live_shortcuts
from order_tracking_report.daily_production_setup import ensure_daily_production_setup
from order_tracking_report.per_piece_setup import apply
from order_tracking_report.print_format_setup import apply_print_setup


def after_install() -> None:
    ensure_item_po_setup()
    ensure_daily_production_setup()
    ensure_sales_order_live_shortcuts()
    apply_print_setup()
    apply()


def after_migrate() -> None:
    ensure_item_po_setup()
    ensure_daily_production_setup()
    ensure_sales_order_live_shortcuts()
    apply_print_setup()
    apply()
