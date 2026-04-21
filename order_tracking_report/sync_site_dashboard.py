import json
import os

import frappe


def _fixture_path(filename):
    base_dir = os.path.dirname(__file__)
    return os.path.join(base_dir, "fixtures", filename)


def _load_fixture_records(filename):
    with open(_fixture_path(filename), encoding="utf-8") as fixture_file:
        return json.load(fixture_file)


def _get_fixture_record(filename, record_name):
    for row in _load_fixture_records(filename):
        if row.get("name") == record_name:
            return row
    raise ValueError(f"Fixture record not found: {filename}::{record_name}")


@frappe.whitelist()
def sync_site_dashboard(page_name="financial", page_route="fs", source_page_name="finanicals"):
    page_name = (page_name or "financial").strip()
    page_route = (page_route or "fs").strip()
    source_page_name = (source_page_name or "finanicals").strip()

    source_page = _get_fixture_record("web_page.json", source_page_name)
    source_script = _get_fixture_record("server_script.json", "fin_sight_dashboard_api")

    dashboard_html = source_page.get("main_section_html") or source_page.get("main_section") or ""
    dashboard_html = dashboard_html.replace(
        "/api/method/order_tracking_report.api.fin_gold_rate_api",
        "/api/method/fin_gold_rate_api",
    )

    web_page = frappe.get_doc("Web Page", page_name)
    web_page.main_section_html = dashboard_html
    web_page.route = page_route
    web_page.title = source_page.get("title") or web_page.title or page_name.title()
    if hasattr(web_page, "published"):
        web_page.published = 1
    web_page.flags.ignore_version = True
    web_page.save(ignore_permissions=True)

    server_script = frappe.get_doc("Server Script", "fin_sight_dashboard_api")
    server_script.script = source_script.get("script") or ""
    for fieldname in ("enable_rate_limit", "rate_limit_count", "rate_limit_seconds"):
        if fieldname in source_script:
            setattr(server_script, fieldname, source_script.get(fieldname))
    server_script.flags.ignore_version = True
    server_script.save(ignore_permissions=True)

    frappe.clear_cache()
    frappe.clear_document_cache("Web Page", page_name)
    frappe.clear_document_cache("Server Script", "fin_sight_dashboard_api")

    return {
        "page_name": page_name,
        "page_route": page_route,
        "updated_web_page": web_page.name,
        "updated_server_script": server_script.name,
    }