from __future__ import annotations

import json
from pathlib import Path

import frappe

from order_tracking_report.bootstrap import ensure_item_po_setup
from order_tracking_report.bootstrap import ensure_sales_order_live_shortcuts
from order_tracking_report.daily_production_setup import ensure_daily_production_setup
from order_tracking_report.per_piece_setup import apply
from order_tracking_report.print_format_setup import apply_print_setup


def _should_apply_order_tracking_per_piece_setup() -> bool:
    """Do not override Per Piece UI/logic when dedicated app is installed."""
    try:
        installed = frappe.get_installed_apps() or []
    except Exception:
        installed = []
    return "per_piece_payroll" not in installed


def after_install() -> None:
    ensure_item_po_setup()
    ensure_daily_production_setup()
    ensure_sales_order_live_shortcuts()
    apply_print_setup()
    if _should_apply_order_tracking_per_piece_setup():
        apply()


def before_migrate() -> None:
    _sanitize_conflicting_per_piece_custom_field_fixtures()


def after_migrate() -> None:
    ensure_item_po_setup()
    ensure_daily_production_setup()
    ensure_sales_order_live_shortcuts()
    apply_print_setup()
    if _should_apply_order_tracking_per_piece_setup():
        apply()


def _sanitize_conflicting_per_piece_custom_field_fixtures() -> None:
    """Remove stale Per Piece custom-field fixture rows from this app only."""
    fixtures_dir = Path(frappe.get_app_path("order_tracking_report", "fixtures"))
    if not fixtures_dir.exists():
        return

    target_doctypes = {"Per Piece", "Per Piece Salary"}
    for fixture_path in fixtures_dir.glob("*.json"):
        try:
            raw = fixture_path.read_text(encoding="utf-8")
            payload = json.loads(raw)
        except Exception:
            continue

        if not isinstance(payload, list):
            continue

        cleaned = []
        removed = 0
        for row in payload:
            if not isinstance(row, dict):
                cleaned.append(row)
                continue
            if row.get("doctype") == "Custom Field" and row.get("dt") in target_doctypes:
                removed += 1
                continue
            cleaned.append(row)

        if removed:
            fixture_path.write_text(json.dumps(cleaned, indent=1, sort_keys=True) + "\n", encoding="utf-8")
            frappe.logger().warning(
                "order_tracking_report: removed %s conflicting rows from %s",
                removed,
                str(fixture_path),
            )
