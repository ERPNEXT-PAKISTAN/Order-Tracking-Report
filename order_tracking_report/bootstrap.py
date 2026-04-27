import json

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def ensure_item_po_setup():
    ensure_order_tracking_reports()
    ensure_packing_slip_print_format()
    ensure_expense_claim_sales_order_field()
    ensure_packing_weight_fields()
    remove_packing_invoice_weight_fields()
    remove_main_weight_fields_for_sales_and_delivery()
    ensure_purchase_item_supplier_status_html_fields()
    ensure_wastage_doctype()
    ensure_wastage_doctype_fields()
    remove_legacy_wastage_fields()
    ensure_sales_order_wastage_mode_fields()
    ensure_sales_order_po_tab_fields()
    ensure_item_po_doctype()
    ensure_item_po_fields()
    ensure_purchase_order_item_tracking_fields()
    ensure_allow_on_submit_for_po_fields()
    ensure_sales_order_po_tab_field_order()
    ensure_sales_order_item_custom_fields()


def ensure_packing_slip_print_format():
    name = "Packing Slip"
    html = """
<style>
  .ps-wrap { font-family: Arial, sans-serif; color: #111; font-size: 12px; }
  .ps-brand { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .ps-brand td { border: 1px solid #111; padding: 8px; vertical-align: middle; }
  .ps-brand-title { font-size: 21px; font-weight: 700; text-align: center; letter-spacing: 0.2px; }
  .ps-logo-box { width: 90px; text-align: center; }
  .ps-logo { max-height: 68px; max-width: 80px; object-fit: contain; }
  .ps-head { width: 100%; border-collapse: collapse; margin-bottom: 0; }
  .ps-head td { border: 1px solid #111; padding: 8px; vertical-align: top; font-weight: 700; font-size: 13px; line-height: 1.35; }
  .ps-table { width: 100%; border-collapse: collapse; }
  .ps-table th, .ps-table td { border: 1px solid #111; padding: 5px 6px; }
  .ps-table th { font-size: 13px; font-weight: 700; text-align: center; line-height: 1.1; }
  .ps-center { text-align: center; }
  .ps-right { text-align: right; }
  .ps-item { font-weight: 700; text-transform: uppercase; text-align: center; vertical-align: middle; }
  .ps-color { font-weight: 700; text-align: center; vertical-align: middle; }
  .ps-size { text-align: center; }
  .ps-total td { font-weight: 700; font-size: 13px; }
  .ps-muted { color: #222; }
</style>

<div class="ps-wrap">
  {% set company_logo = frappe.db.get_value("Company", doc.company, "company_logo") if doc.company else "" %}
  <table class="ps-brand">
    <tr>
      <td>
        <div class="ps-brand-title">{{ doc.company or "" }}</div>
      </td>
      <td class="ps-logo-box">
        {% if company_logo %}
          <img class="ps-logo" src="{{ company_logo }}">
        {% endif %}
      </td>
    </tr>
  </table>

  <table class="ps-head">
    <tr>
      <td style="width:38%;">
        <div>Invoice# {{ doc.invoice_no or doc.name }}</div>
        {% if doc.delivery_note %}<div class="ps-muted">({{ doc.delivery_note }})</div>{% endif %}
      </td>
      <td style="width:35%; text-align:center;">
        <div>{{ doc.customer or "" }}</div>
        {% if doc.container_no %}<div>Container: {{ doc.container_no }}</div>{% endif %}
        {% if doc.seal_no %}<div>(Seal#{{ doc.seal_no }})</div>{% endif %}
      </td>
      <td style="width:27%; text-align:center;">
        {{ frappe.utils.formatdate(doc.date) if doc.date else "" }}
      </td>
    </tr>
  </table>

  <table class="ps-table">
    <thead>
      <tr>
        <th rowspan="2">Item</th>
        <th rowspan="2">Colour/Standard</th>
        <th rowspan="2">Size</th>
        <th colspan="2">Numbering</th>
        <th rowspan="2">Pcs/CTN</th>
        <th rowspan="2">CTN</th>
        <th rowspan="2">Total Pcs</th>
      </tr>
      <tr>
        <th>from</th>
        <th>to</th>
      </tr>
    </thead>
    <tbody>
      {% set rows = (doc.packing_items or [])
        | sort(attribute='carton_number_from')
        | sort(attribute='color')
        | sort(attribute='item') %}
      {% for row in rows %}
      {% set i = loop.index0 %}
      {% set prev = rows[i-1] if i > 0 else None %}
      {% set show_item = (i == 0) or ((prev.item or "") != (row.item or "")) %}
      {% set show_color = show_item or ((prev.color or "") != (row.color or "")) %}

      {% set item_span = namespace(v=0, stop=0) %}
      {% if show_item %}
        {% for r2 in rows[i:] %}
          {% if item_span.stop == 0 and (r2.item or "") == (row.item or "") %}
            {% set item_span.v = item_span.v + 1 %}
          {% elif item_span.stop == 0 %}
            {% set item_span.stop = 1 %}
          {% endif %}
        {% endfor %}
      {% endif %}

      {% set color_span = namespace(v=0, stop=0) %}
      {% if show_color %}
        {% for r3 in rows[i:] %}
          {% if color_span.stop == 0 and (r3.item or "") == (row.item or "") and (r3.color or "") == (row.color or "") %}
            {% set color_span.v = color_span.v + 1 %}
          {% elif color_span.stop == 0 %}
            {% set color_span.stop = 1 %}
          {% endif %}
        {% endfor %}
      {% endif %}

      <tr>
        {% if show_item %}
        <td class="ps-item" rowspan="{{ item_span.v }}">{{ row.item or "" }}</td>
        {% endif %}
        {% if show_color %}
        <td class="ps-color" rowspan="{{ color_span.v }}">{{ row.color or "" }}</td>
        {% endif %}
        <td class="ps-size">{{ row.size or "" }}</td>
        <td class="ps-right">{{ frappe.format_value(row.carton_number_from, {"fieldtype":"Float", "precision":0}) if row.carton_number_from is not none else "" }}</td>
        <td class="ps-right">{{ frappe.format_value(row.carton_number_to, {"fieldtype":"Float", "precision":0}) if row.carton_number_to is not none else "" }}</td>
        <td class="ps-right">{{ frappe.format_value(row.pcs_per_ctn, {"fieldtype":"Float", "precision":0}) if row.pcs_per_ctn is not none else "" }}</td>
        <td class="ps-right">{{ frappe.format_value(row.ctn, {"fieldtype":"Float", "precision":0}) if row.ctn is not none else "" }}</td>
        <td class="ps-right">{{ frappe.format_value(row.total_pcs, {"fieldtype":"Float", "precision":0}) if row.total_pcs is not none else "" }}</td>
      </tr>
      {% endfor %}
      <tr class="ps-total">
        <td colspan="6" class="ps-right">Total</td>
        <td class="ps-right">
          {{ frappe.format_value((doc.packing_items | map(attribute='ctn') | list | sum), {"fieldtype":"Float", "precision":0}) }}
        </td>
        <td class="ps-right">
          {{ frappe.format_value((doc.packing_items | map(attribute='total_pcs') | list | sum), {"fieldtype":"Float", "precision":0}) }}
        </td>
      </tr>
    </tbody>
  </table>
</div>
""".strip()

    if not frappe.db.exists("Print Format", name):
        frappe.get_doc(
            {
                "doctype": "Print Format",
                "name": name,
                "doc_type": "Packing Item List Invoice",
                "module": "Order Tracking Report",
                "print_format_type": "Jinja",
                "custom_format": 1,
                "standard": "No",
                "disabled": 0,
                "raw_printing": 0,
                "html": html,
            }
        ).insert(ignore_permissions=True)
        return

    frappe.db.set_value(
        "Print Format",
        name,
        {
            "doc_type": "Packing Item List Invoice",
            "module": "Order Tracking Report",
            "print_format_type": "Jinja",
            "custom_format": 1,
            "standard": "No",
            "disabled": 0,
            "raw_printing": 0,
            "html": html,
        },
        update_modified=False,
    )
    ensure_packing_item_list_link_fields()


def ensure_packing_item_list_link_fields():
    if not frappe.db.exists("DocType", "Packing Items List"):
        return

    changed = False
    changed |= _ensure_doctype_field_type_and_options(
        "Packing Items List", "delivery_note", "Link", "Delivery Note"
    )
    changed |= _ensure_doctype_field_type_and_options(
        "Packing Items List", "sale_order", "Link", "Sales Order"
    )
    changed |= _ensure_doctype_field_type_and_options(
        "Packing Items List", "sales_order", "Link", "Sales Order"
    )
    changed |= _ensure_doctype_field_type_and_options(
        "Packing Item List Invoice", "sales_order", "Link", "Sales Order"
    )

    if changed:
        frappe.clear_cache(doctype="Packing Items List")
        frappe.clear_cache(doctype="Packing Item List Invoice")


def _ensure_doctype_field_type_and_options(parent_doctype, fieldname, fieldtype, options=None):
    df = frappe.db.get_value(
        "DocField",
        {"parent": parent_doctype, "fieldname": fieldname},
        ["name", "fieldtype", "options"],
        as_dict=True,
    )
    if not df:
        return False

    updates = {}
    if df.get("fieldtype") != fieldtype:
        updates["fieldtype"] = fieldtype
    if options is not None and (df.get("options") or "") != options:
        updates["options"] = options

    if updates:
        frappe.db.set_value("DocField", df.get("name"), updates, update_modified=False)
        return True
    return False


def ensure_expense_claim_sales_order_field():
    custom_fields = {
        "Expense Claim": [
            {
                "fieldname": "sales_order",
                "label": "Sales Order",
                "fieldtype": "Link",
                "options": "Sales Order",
                "insert_after": "project",
                "allow_on_submit": 1,
            },
        ]
    }
    create_custom_fields(custom_fields, update=True)


def ensure_packing_weight_fields():
    custom_fields = {
        "Sales Order Item": [
            {
                "fieldname": "gross_weight",
                "label": "Gross Weight",
                "fieldtype": "Data",
                "insert_after": "qty",
            },
            {
                "fieldname": "net_weight",
                "label": "Net Weight",
                "fieldtype": "Data",
                "insert_after": "gross_weight",
            },
        ],
        "Delivery Note Item": [
            {
                "fieldname": "gross_weight",
                "label": "Gross Weight",
                "fieldtype": "Data",
                "insert_after": "qty",
            },
            {
                "fieldname": "net_weight",
                "label": "Net Weight",
                "fieldtype": "Data",
                "insert_after": "gross_weight",
            },
        ],
        "Item": [
            {
                "fieldname": "custom_gross_weight_uom",
                "label": "Gross Weight",
                "fieldtype": "Data",
                "insert_after": "weight_per_unit",
            },
            {
                "fieldname": "custom_net_weight",
                "label": "Net Weight",
                "fieldtype": "Data",
                "insert_after": "custom_gross_weight_uom",
            },
        ],
    }
    # Create missing fields only; do not force-change type of already existing fields.
    create_custom_fields(custom_fields, update=False)


def remove_packing_invoice_weight_fields():
    for fieldname in ("gross_weight", "net_weight"):
        cf_name = frappe.db.get_value(
            "Custom Field",
            {"dt": "Packing Item List Invoice", "fieldname": fieldname},
            "name",
        )
        if cf_name:
            frappe.delete_doc("Custom Field", cf_name, ignore_permissions=True, force=True)


def remove_main_weight_fields_for_sales_and_delivery():
    targets = [
        ("Sales Order", "gross_weight"),
        ("Sales Order", "net_weight"),
        ("Delivery Note", "gross_weight"),
        ("Delivery Note", "net_weight"),
    ]
    for dt, fieldname in targets:
        cf_name = frappe.db.get_value(
            "Custom Field",
            {"dt": dt, "fieldname": fieldname},
            "name",
        )
        if cf_name:
            frappe.delete_doc("Custom Field", cf_name, ignore_permissions=True, force=True)


def ensure_purchase_item_supplier_status_html_fields():
    custom_fields = {
        "Purchase Order": [
            {
                "fieldname": "custom_po_item_status_html",
                "label": "Purchase Order Item Status",
                "fieldtype": "HTML",
                "insert_after": "items",
            }
        ],
        "Item": [
            {
                "fieldname": "custom_item_purchase_status_section",
                "label": "Purchase Order Status",
                "fieldtype": "Section Break",
                "insert_after": "item_name",
            },
            {
                "fieldname": "custom_item_purchase_status_html",
                "label": "Purchase Order Status",
                "fieldtype": "HTML",
                "insert_after": "custom_item_purchase_status_section",
            }
        ],
        "Supplier": [
            {
                "fieldname": "custom_supplier_purchase_status_html",
                "label": "Purchase Order Status",
                "fieldtype": "HTML",
                "insert_after": "supplier_group",
            }
        ],
        "Employee": [
            {
                "fieldname": "custom_employee_advance_ledger_section",
                "label": "Employee Advance Ledger",
                "fieldtype": "Section Break",
                "insert_after": "employee_advance_account",
            },
            {
                "fieldname": "custom_employee_advance_ledger_html",
                "label": "Employee Advance Ledger",
                "fieldtype": "HTML",
                "insert_after": "custom_employee_advance_ledger_section",
            },
        ],
    }
    create_custom_fields(custom_fields, update=True)


def ensure_order_tracking_reports():
    ensure_script_report("Purchase Order updated Status", "Purchase Order")
    ensure_script_report("Purchase Order Status Report", "Purchase Order")
    ensure_script_report("Sales Order Status Report", "Sales Order")
    ensure_script_report("Sales Trend Analysis Report", "Sales Invoice")
    ensure_script_report("Stock Report", "Stock Ledger Entry")
    ensure_script_report("Supplier Wise Purchases Detail", "Purchase Order")
    ensure_script_report("Consumption Report", "Stock Entry")
    ensure_script_report("Daily Operation Report", "Daily Production")
    ensure_report_roles(
        "Consumption Report",
        [
            "System Manager",
            "Manufacturing Manager",
            "Manufacturing User",
            "Stock Manager",
            "Stock User",
            "Sales Manager",
            "Sales User",
        ],
    )


def ensure_script_report(report_name, ref_doctype):
    report = frappe.db.get_value(
        "Report",
        report_name,
        ["name", "ref_doctype", "report_type", "module", "is_standard"],
        as_dict=True,
    )

    if not report:
        frappe.get_doc(
            {
                "doctype": "Report",
                "name": report_name,
                "report_name": report_name,
                "report_type": "Script Report",
                "is_standard": "Yes",
                "module": "Order Tracking Report",
                "ref_doctype": ref_doctype,
                "prepared_report": 0,
                "roles": [{"role": "System Manager"}],
            }
        ).insert(ignore_permissions=True)
        return

    updates = {}
    if report.get("ref_doctype") != ref_doctype:
        updates["ref_doctype"] = ref_doctype
    if report.get("report_type") != "Script Report":
        updates["report_type"] = "Script Report"
    if report.get("module") != "Order Tracking Report":
        updates["module"] = "Order Tracking Report"
    if str(report.get("is_standard") or "") != "Yes":
        updates["is_standard"] = "Yes"

    if updates:
        frappe.db.set_value("Report", report_name, updates, update_modified=False)


def ensure_report_roles(report_name, roles):
    if not frappe.db.exists("Report", report_name):
        return

    existing_roles = set(
        frappe.get_all(
            "Has Role",
            filters={"parenttype": "Report", "parent": report_name, "parentfield": "roles"},
            pluck="role",
        )
    )
    for role in roles:
        if role in existing_roles:
            continue
        frappe.get_doc(
            {
                "doctype": "Has Role",
                "parenttype": "Report",
                "parent": report_name,
                "parentfield": "roles",
                "role": role,
            }
        ).db_insert(ignore_if_duplicate=True)


# Ensure custom fields on Sales Order Item for fabric quality, design color, comments
def ensure_sales_order_item_custom_fields():
    custom_fields = {
        "Sales Order Item": [
            {
                "fieldname": "custom_fabric_quality",
                "label": "Fabric Quality",
                "fieldtype": "Data",
                "insert_after": "item_name",
                "allow_on_submit": 1,
            },
            {
                "fieldname": "custom_designcolor",
                "label": "Design/Color",
                "fieldtype": "Data",
                "insert_after": "custom_fabric_quality",
                "allow_on_submit": 1,
            },
            {
                "fieldname": "custom_comments",
                "label": "Comments",
                "fieldtype": "Data",
                "insert_after": "custom_designcolor",
                "allow_on_submit": 1,
            },
        ]
    }
    create_custom_fields(custom_fields, update=True)


def ensure_sales_order_po_tab_fields():
    custom_fields = {
        "Sales Order": [
            {
                "fieldname": "custom_section_break_hvvut",
                "label": "",
                "fieldtype": "Section Break",
                "insert_after": "custom_wastages",
            },
            {
                "fieldname": "custom_detail_status",
                "label": "Detail Status",
                "fieldtype": "HTML",
                "insert_after": "custom_section_break_hvvut",
            },
            {
                "fieldname": "custom_po",
                "label": "PO",
                "fieldtype": "Tab Break",
                "insert_after": "custom_detail_status",
            },
            {
                "fieldname": "custom_section_break_0tn3c",
                "label": "",
                "fieldtype": "Section Break",
                "insert_after": "custom_po",
            },
            {
                "fieldname": "custom_po_item",
                "label": "PO Item",
                "fieldtype": "Table",
                "options": "Item PO",
                "insert_after": "custom_section_break_0tn3c",
                "allow_on_submit": 1,
            },
            {
                "fieldname": "custom_po_remarks",
                "label": "PO Remarks",
                "fieldtype": "Small Text",
                "insert_after": "custom_po_item",
                "allow_on_submit": 1,
            },
        ]
    }
    create_custom_fields(custom_fields, update=True)


def ensure_sales_order_po_tab_field_order():
    setter = frappe.db.get_value(
        "Property Setter",
        "Sales Order-main-field_order",
        ["name", "value"],
        as_dict=True,
    ) or frappe.db.get_value(
        "Property Setter",
        {"doc_type": "Sales Order", "property": "field_order"},
        ["name", "value"],
        as_dict=True,
    )
    if not setter or not setter.get("name"):
        return

    try:
        field_order = json.loads(setter.get("value") or "[]")
    except Exception:
        return

    if not isinstance(field_order, list) or not field_order:
        return

    tail_fields = [
        "custom_section_break_hvvut",
        "custom_detail_status",
        "custom_po",
        "custom_section_break_0tn3c",
        "custom_po_item",
        "custom_po_remarks",
    ]
    reordered = [fieldname for fieldname in field_order if fieldname not in tail_fields]
    reordered.extend(tail_fields)

    if reordered != field_order:
        frappe.db.set_value(
            "Property Setter",
            setter.get("name"),
            "value",
            json.dumps(reordered),
            update_modified=False,
        )


def ensure_sales_order_live_shortcuts():
    ensure_manufacturing_workspace_shortcut()
    ensure_manufacturing_live_work_order_shortcut()
    ensure_manufacturing_sales_order_status_board_shortcut()
    remove_workspace_report_shortcut("Selling", "Daily Operation Report", "Daily Operation Report")
    ensure_selling_daily_operation_report_page_shortcut()
    ensure_selling_daily_production_shortcut()
    ensure_selling_sales_order_status_report_shortcut()
    ensure_stock_reports_shortcuts()
    remove_workspace_page_shortcut("Manufacturing", "Existing Manufacturing Documents", "existing-manufacturing-documents")
    remove_workspace_page_shortcut("Manufacturing", "Manage Sales Orders", "manage-sales-orders")
    ensure_order_tracking_workspace()
    ensure_order_tracking_workspace_shortcuts()
    ensure_order_tracking_reports_workspace_shortcuts()
    ensure_order_tracking_desktop_icons()


def _ensure_workspace(
    workspace_name,
    title=None,
    module="Order Tracking Report",
    icon="folder-normal",
    public=1,
    sequence_id=None,
    parent_page="",
    workspace_type="Workspace",
):
    title = title or workspace_name
    changed = False

    if not frappe.db.exists("Workspace", workspace_name):
        workspace = frappe.get_doc(
            {
                "doctype": "Workspace",
                "label": workspace_name,
                "title": title,
                "module": module,
                "app": "order_tracking_report",
                "icon": icon,
                "indicator_color": "blue",
                "type": workspace_type,
                "public": public,
                "sequence_id": sequence_id or 0,
                "parent_page": parent_page,
                "content": "[]",
                "is_hidden": 0,
            }
        )
        workspace.insert(ignore_permissions=True)
        return

    updates = {
        "title": title,
        "module": module,
        "app": "order_tracking_report",
        "icon": icon,
        "type": workspace_type,
        "is_hidden": 0,
        "parent_page": parent_page,
    }
    if public is not None:
        updates["public"] = public
    if sequence_id is not None:
        updates["sequence_id"] = sequence_id

    current = frappe.db.get_value("Workspace", workspace_name, list(updates), as_dict=True) or {}
    for fieldname, value in updates.items():
        if current.get(fieldname) != value:
            frappe.db.set_value("Workspace", workspace_name, fieldname, value, update_modified=False)
            changed = True

    if changed:
        frappe.clear_document_cache("Workspace", workspace_name)

    _unhide_workspace_for_all_users(workspace_name)
    _clear_workspace_roles_for_public(workspace_name, public)


def _clear_workspace_roles_for_public(workspace_name, public):
    if public != 1:
        return
    if not frappe.db.exists("Workspace", workspace_name):
        return
    if not frappe.db.exists("DocType", "Workspace Link"):
        return

    role_rows = frappe.get_all(
        "Workspace Link",
        filters={
            "parent": workspace_name,
            "parenttype": "Workspace",
            "parentfield": "roles",
        },
        pluck="name",
    )
    if not role_rows:
        return

    for row_name in role_rows:
        frappe.delete_doc("Workspace Link", row_name, ignore_permissions=True, force=True)
    frappe.clear_document_cache("Workspace", workspace_name)


def _ensure_desktop_icon(
    label,
    link_to,
    icon="folder-normal",
    idx=90,
    app="order_tracking_report",
):
    if not frappe.db.exists("Workspace", link_to):
        return
    _ensure_workspace_sidebar_for_workspace(link_to, icon, app)
    if not frappe.db.exists("Workspace Sidebar", link_to):
        return

    values = {
        "doctype": "Desktop Icon",
        "label": label,
        "app": app,
        "icon_type": "Link",
        "link_type": "Workspace Sidebar",
        "link_to": link_to,
        "sidebar": link_to,
        "icon": icon,
        "idx": idx,
        "hidden": 0,
        "restrict_removal": 0,
        "standard": 0,
    }

    if not frappe.db.exists("Desktop Icon", label):
        frappe.get_doc(values).insert(ignore_permissions=True)
        return

    changed = False
    fields_to_read = [field for field in values.keys() if field != "doctype"]
    current = frappe.db.get_value("Desktop Icon", label, fields_to_read, as_dict=True) or {}
    for fieldname, value in values.items():
        if fieldname == "doctype":
            continue
        if current.get(fieldname) != value:
            frappe.db.set_value("Desktop Icon", label, fieldname, value, update_modified=False)
            changed = True

    if changed:
        frappe.clear_cache(user="Administrator")


def _ensure_workspace_sidebar_for_workspace(workspace_name, icon="folder-normal", app="order_tracking_report"):
    if not frappe.db.exists("Workspace", workspace_name):
        return
    if frappe.db.exists("Workspace Sidebar", workspace_name):
        return

    doc = frappe.get_doc(
        {
            "doctype": "Workspace Sidebar",
            "title": workspace_name,
            "header_icon": icon,
            "app": app,
            "standard": 0,
            "items": [
                {
                    "doctype": "Workspace Sidebar Item",
                    "label": "Home",
                    "link_to": workspace_name,
                    "link_type": "Workspace",
                    "type": "Link",
                    "idx": 1,
                }
            ],
        }
    )
    doc.insert(ignore_permissions=True)


def ensure_order_tracking_desktop_icons():
    _ensure_desktop_icon(
        label="Order Tracking",
        link_to="Order Tracking",
        icon="branch",
        idx=84,
    )
    _ensure_desktop_icon(
        label="Order Tracking Reports",
        link_to="Order Tracking Reports",
        icon="report",
        idx=85,
    )


def _unhide_workspace_for_all_users(workspace_name):
    if not frappe.db.exists("Workspace", workspace_name):
        return
    if not frappe.db.exists("DocType", "Workspace Hidden"):
        return

    hidden_rows = frappe.get_all(
        "Workspace Hidden",
        filters={"workspace_name": workspace_name},
        pluck="name",
    )
    for row_name in hidden_rows:
        frappe.delete_doc("Workspace Hidden", row_name, ignore_permissions=True, force=True)


def _ensure_workspace_shortcut(workspace_name, label, shortcut_type, link_to, color):
    if not frappe.db.exists("Workspace", workspace_name):
        return

    changed = False

    has_shortcut = frappe.db.exists(
        "Workspace Shortcut",
        {
            "parent": workspace_name,
            "parenttype": "Workspace",
            "parentfield": "shortcuts",
            "label": label,
            "type": shortcut_type,
            "link_to": link_to,
        },
    )
    if not has_shortcut:
        next_idx = frappe.db.count(
            "Workspace Shortcut",
            {
                "parent": workspace_name,
                "parenttype": "Workspace",
                "parentfield": "shortcuts",
            },
        ) + 1
        frappe.get_doc(
            {
                "doctype": "Workspace Shortcut",
                "parent": workspace_name,
                "parenttype": "Workspace",
                "parentfield": "shortcuts",
                "idx": next_idx,
                "label": label,
                "type": shortcut_type,
                "link_to": link_to,
                "color": color,
            }
        ).db_insert(ignore_if_duplicate=True)
        changed = True

    try:
        content = frappe.parse_json(frappe.db.get_value("Workspace", workspace_name, "content")) or []
    except Exception:
        content = []

    has_shortcut_block = any(
        block.get("type") == "shortcut"
        and (block.get("data") or {}).get("shortcut_name") == label
        for block in content
    )

    if not has_shortcut_block:
        shortcut_block = {
            "id": frappe.generate_hash(length=10),
            "type": "shortcut",
            "data": {"shortcut_name": label, "col": 3},
        }
        insert_at = next(
            (
                index
                for index, block in enumerate(content)
                if block.get("type") in {"spacer", "card", "header"}
                and (block.get("data") or {}).get("text") != '<span class="h4"><b>Your Shortcuts</b></span>'
            ),
            len(content),
        )
        content.insert(insert_at, shortcut_block)
        frappe.db.set_value("Workspace", workspace_name, "content", frappe.as_json(content), update_modified=False)
        changed = True

    if changed:
        frappe.clear_document_cache("Workspace", workspace_name)


def _ensure_workspace_page_shortcut(workspace_name, label, page_name, color):
    _ensure_workspace_shortcut(workspace_name, label, "Page", page_name, color)


def _ensure_workspace_report_shortcut(workspace_name, label, report_name, color):
    _ensure_workspace_shortcut(workspace_name, label, "Report", report_name, color)


def remove_workspace_report_shortcut(workspace_name, label, report_name):
    if not frappe.db.exists("Workspace", workspace_name):
        return

    changed = False
    shortcut_names = frappe.get_all(
        "Workspace Shortcut",
        filters={
            "parent": workspace_name,
            "parenttype": "Workspace",
            "parentfield": "shortcuts",
            "label": label,
            "type": "Report",
            "link_to": report_name,
        },
        pluck="name",
    )
    for shortcut_name in shortcut_names:
        frappe.delete_doc("Workspace Shortcut", shortcut_name, ignore_permissions=True, force=True)
        changed = True

    try:
        content = frappe.parse_json(frappe.db.get_value("Workspace", workspace_name, "content")) or []
    except Exception:
        content = []

    filtered_content = [
        block
        for block in content
        if not (
            block.get("type") == "shortcut"
            and (block.get("data") or {}).get("shortcut_name") == label
        )
    ]

    if len(filtered_content) != len(content):
        frappe.db.set_value("Workspace", workspace_name, "content", frappe.as_json(filtered_content), update_modified=False)
        changed = True

    if changed:
        frappe.clear_document_cache("Workspace", workspace_name)


def remove_workspace_page_shortcut(workspace_name, label, page_name):
    if not frappe.db.exists("Workspace", workspace_name):
        return

    changed = False
    shortcut_names = frappe.get_all(
        "Workspace Shortcut",
        filters={
            "parent": workspace_name,
            "parenttype": "Workspace",
            "parentfield": "shortcuts",
            "label": label,
            "type": "Page",
            "link_to": page_name,
        },
        pluck="name",
    )
    for shortcut_name in shortcut_names:
        frappe.delete_doc("Workspace Shortcut", shortcut_name, ignore_permissions=True, force=True)
        changed = True

    try:
        content = frappe.parse_json(frappe.db.get_value("Workspace", workspace_name, "content")) or []
    except Exception:
        content = []

    filtered_content = [
        block
        for block in content
        if not (
            block.get("type") == "shortcut"
            and (block.get("data") or {}).get("shortcut_name") == label
        )
    ]

    if len(filtered_content) != len(content):
        frappe.db.set_value("Workspace", workspace_name, "content", frappe.as_json(filtered_content), update_modified=False)
        changed = True

    if changed:
        frappe.clear_document_cache("Workspace", workspace_name)


def ensure_manufacturing_workspace_shortcut():
    _ensure_workspace_page_shortcut("Manufacturing", "Sales Order Live", "sales-order-live", "blue")


def ensure_manufacturing_live_work_order_shortcut():
    _ensure_workspace_page_shortcut("Manufacturing", "Live Work Order", "live-work-order", "green")


def ensure_manufacturing_sales_order_status_board_shortcut():
    _ensure_workspace_page_shortcut(
        "Manufacturing", "Sales Order Status Board", "sales-order-status-board", "orange"
    )


def ensure_selling_daily_operation_report_page_shortcut():
    _ensure_workspace_page_shortcut(
        "Selling", "Daily Operation Report", "daily-operation-report", "green"
    )


def ensure_selling_daily_production_shortcut():
    _ensure_workspace_shortcut(
        "Selling", "Daily Production", "DocType", "Daily Production", "green"
    )


def ensure_selling_sales_order_status_report_shortcut():
    _ensure_workspace_report_shortcut(
        "Selling", "Sales Order Status Report", "Sales Order Status Report", "blue"
    )
    _ensure_workspace_report_shortcut(
        "Selling", "Sales Trend Analysis Report", "Sales Trend Analysis Report", "purple"
    )


def ensure_stock_reports_shortcuts():
    _ensure_workspace_report_shortcut(
        "Stock", "Purchase Order Status Report", "Purchase Order Status Report", "yellow"
    )
    _ensure_workspace_report_shortcut(
        "Stock", "Stock Report", "Stock Report", "green"
    )
    _ensure_workspace_report_shortcut(
        "Stock", "Supplier Wise Purchases Detail", "Supplier Wise Purchases Detail", "blue"
    )
    _ensure_workspace_report_shortcut(
        "Stock", "Consumption Report", "Consumption Report", "orange"
    )


def ensure_order_tracking_workspace():
    _ensure_workspace(
        "Order Tracking",
        title="Order Tracking",
        icon="branch",
        sequence_id=8.1,
        parent_page="",
        workspace_type="Module",
    )


def ensure_order_tracking_workspace_shortcuts():
    _ensure_workspace_page_shortcut("Order Tracking", "Sales Order Live", "sales-order-live", "blue")
    _ensure_workspace_page_shortcut("Order Tracking", "Live Work Order", "live-work-order", "green")
    remove_workspace_page_shortcut("Order Tracking", "Manage Sales Orders", "manage-sales-orders")
    _ensure_workspace_page_shortcut(
        "Order Tracking", "Sales Order Status Board", "sales-order-status-board", "orange"
    )
    _ensure_workspace_page_shortcut("Order Tracking", "Finanicals", "finanicals", "grey")
    _ensure_workspace_report_shortcut(
        "Order Tracking", "Purchase Order Updated Status", "Purchase Order updated Status", "yellow"
    )
    _ensure_workspace_report_shortcut(
        "Order Tracking", "Supplier Wise Purchases Detail", "Supplier Wise Purchases Detail", "blue"
    )
    _ensure_workspace_report_shortcut(
        "Order Tracking", "Consumption Report", "Consumption Report", "orange"
    )


def ensure_order_tracking_reports_workspace_shortcuts():
    _ensure_workspace(
        "Order Tracking Reports",
        title="Order Tracking Reports",
        icon="report",
        sequence_id=8.2,
        parent_page="",
        workspace_type="Module",
    )

    # Sales Order View action shortcuts (best route equivalent for workspace)
    _ensure_workspace_page_shortcut("Order Tracking Reports", "Refresh Detail Status", "sales-order-status-board", "blue")
    _ensure_workspace_page_shortcut("Order Tracking Reports", "Sales Order Live", "sales-order-live", "blue")
    _ensure_workspace_page_shortcut("Order Tracking Reports", "Live Work Order", "live-work-order", "green")
    _ensure_workspace_page_shortcut("Order Tracking Reports", "All Related Links", "sales-order-live", "cyan")
    _ensure_workspace_page_shortcut(
        "Order Tracking Reports", "Sales Order Status Board", "sales-order-status-board", "orange"
    )
    _ensure_workspace_page_shortcut("Order Tracking Reports", "Finanicals", "finanicals", "grey")
    _ensure_workspace_page_shortcut("Order Tracking Reports", "PL by Order", "pl-by-order", "cyan")
    _ensure_workspace_page_shortcut(
        "Order Tracking Reports", "Daily Operation Page", "daily-operation-report", "purple"
    )

    # Reports from Sales Order View menu
    _ensure_workspace_report_shortcut(
        "Order Tracking Reports", "Purchase Order Status Report", "Purchase Order Status Report", "blue"
    )
    _ensure_workspace_report_shortcut(
        "Order Tracking Reports", "Purchase Order Updated Status", "Purchase Order updated Status", "yellow"
    )
    _ensure_workspace_report_shortcut(
        "Order Tracking Reports", "Sales Order Status Report", "Sales Order Status Report", "orange"
    )
    _ensure_workspace_report_shortcut(
        "Order Tracking Reports", "Sales Trend Analysis Report", "Sales Trend Analysis Report", "purple"
    )
    _ensure_workspace_report_shortcut(
        "Order Tracking Reports", "Stock Report", "Stock Report", "green"
    )
    _ensure_workspace_report_shortcut(
        "Order Tracking Reports", "Daily Operation Report", "Daily Operation Report", "teal"
    )
    _ensure_workspace_report_shortcut(
        "Order Tracking Reports", "Supplier Wise Purchases Detail", "Supplier Wise Purchases Detail", "cyan"
    )
    _ensure_workspace_report_shortcut(
        "Order Tracking Reports", "Consumption Report", "Consumption Report", "grey"
    )


def ensure_wastage_doctype():
    if frappe.db.exists("DocType", "Wastage"):
        return

    doc = frappe.get_doc(
        {
            "doctype": "DocType",
            "name": "Wastage",
            "module": "Order Tracking Report",
            "custom": 1,
            "istable": 1,
            "editable_grid": 1,
            "engine": "InnoDB",
            "fields": [
                {
                    "fieldname": "item_group",
                    "label": "Item Group",
                    "fieldtype": "Link",
                    "options": "Item Group",
                    "in_list_view": 1,
                    "columns": 2,
                },
                {"fieldname": "wastage", "label": "Wastage", "fieldtype": "Float", "in_list_view": 1, "columns": 1},
                {"fieldname": "manual", "label": "Manual", "fieldtype": "Float", "in_list_view": 1, "columns": 1},
                {"fieldname": "po", "label": "PO", "fieldtype": "Float", "in_list_view": 1, "columns": 1},
                {
                    "fieldname": "source",
                    "label": "Source",
                    "fieldtype": "Select",
                    "options": "\nWastage\nManual\nPO",
                    "in_list_view": 1,
                    "columns": 1,
                },
            ],
            "permissions": [],
        }
    )
    doc.insert(ignore_permissions=True)


def ensure_wastage_doctype_fields():
    if not frappe.db.exists("DocType", "Wastage"):
        return

    if frappe.db.get_value("DocType", "Wastage", "module") != "Order Tracking Report":
        frappe.db.set_value("DocType", "Wastage", "module", "Order Tracking Report", update_modified=False)

    required_fields = [
        {"fieldname": "item_group", "label": "Item Group", "fieldtype": "Link", "options": "Item Group"},
        {"fieldname": "wastage", "label": "Wastage", "fieldtype": "Float"},
        {"fieldname": "manual", "label": "Manual", "fieldtype": "Float"},
        {"fieldname": "po", "label": "PO", "fieldtype": "Float"},
        {"fieldname": "source", "label": "Source", "fieldtype": "Select", "options": "\nWastage\nManual\nPO"},
    ]

    meta = frappe.get_meta("Wastage")
    existing = {df.fieldname for df in meta.fields}
    insert_after = meta.fields[-1].fieldname if meta.fields else None

    for f in required_fields:
        if f["fieldname"] in existing:
            insert_after = f["fieldname"]
            continue

        d = {
            "doctype": "Custom Field",
            "dt": "Wastage",
            "fieldname": f["fieldname"],
            "label": f["label"],
            "fieldtype": f["fieldtype"],
            "insert_after": insert_after,
        }
        if f.get("options"):
            d["options"] = f["options"]
        frappe.get_doc(d).insert(ignore_permissions=True)
        insert_after = f["fieldname"]

    # Normalize previously-created field definitions (older versions had Data/Check types).
    normalize = {
        "item_group": {"fieldtype": "Link", "options": "Item Group", "in_list_view": 1, "columns": 2},
        "wastage": {"fieldtype": "Float", "in_list_view": 1, "columns": 1},
        "manual": {"fieldtype": "Float", "in_list_view": 1, "columns": 1},
        "po": {"fieldtype": "Float", "in_list_view": 1, "columns": 1},
        "source": {"fieldtype": "Select", "options": "\nWastage\nManual\nPO", "in_list_view": 1, "columns": 1},
    }
    for fn, cfg in normalize.items():
        df_name = frappe.db.get_value("DocField", {"parent": "Wastage", "fieldname": fn}, "name")
        target_doctype = "DocField"
        if not df_name:
            df_name = frappe.db.get_value("Custom Field", {"dt": "Wastage", "fieldname": fn}, "name")
            target_doctype = "Custom Field"
        if not df_name:
            continue
        for k, v in cfg.items():
            frappe.db.set_value(target_doctype, df_name, k, v, update_modified=False)

    # Ensure physical DB column types are numeric too (older setups had
    # varchar/check columns, which breaks non-global wastage calculations).
    try:
        columns = {
            (c.get("Field") or "").strip(): (c.get("Type") or "").strip().lower()
            for c in (frappe.db.sql("DESCRIBE `tabWastage`", as_dict=True) or [])
        }
        for fieldname in ("wastage", "manual", "po"):
            ctype = columns.get(fieldname, "")
            if not ctype or any(x in ctype for x in ("decimal", "float", "double")):
                continue
            try:
                # Clean common text values before type conversion.
                frappe.db.sql(
                    "UPDATE `tabWastage` SET `{0}` = REPLACE(TRIM(IFNULL(`{0}`, '0')), '%', '')".format(fieldname)
                )
                frappe.db.sql(
                    "UPDATE `tabWastage` SET `{0}` = '0' WHERE `{0}` = ''".format(fieldname)
                )
                frappe.db.sql(
                    "ALTER TABLE `tabWastage` MODIFY COLUMN `{}` DECIMAL(21,9) NOT NULL DEFAULT 0".format(fieldname)
                )
            except Exception:
                # Keep migration resilient even on dirty legacy data.
                continue
    except Exception:
        pass


def remove_legacy_wastage_fields():
    if not frappe.db.exists("DocType", "Wastage"):
        return

    legacy_fields = {"item", "qty", "remarks"}

    try:
        doctype = frappe.get_doc("DocType", "Wastage")
    except Exception:
        return

    remaining_fields = [field for field in (doctype.fields or []) if field.fieldname not in legacy_fields]
    if len(remaining_fields) == len(doctype.fields or []):
        return

    doctype.fields = remaining_fields
    doctype.module = "Order Tracking Report"
    doctype.istable = 1
    doctype.editable_grid = 1
    doctype.save(ignore_permissions=True)
    frappe.clear_document_cache("DocType", "Wastage")


def ensure_sales_order_wastage_mode_fields():
    custom_fields = {
        "Sales Order": [
            {
                "fieldname": "custom_wastage_mode",
                "label": "Wastage Source",
                "fieldtype": "Select",
                "options": "\nIndividual\nWastage\nManual\nPO\nGlobal Manual %",
                "insert_after": "custom_wastages",
                "default": "Wastage",
            },
            {
                "fieldname": "custom_manual_wastage_percent",
                "label": "Global Manual Wastage %",
                "fieldtype": "Float",
                "insert_after": "custom_wastage_mode",
            },
        ]
    }
    create_custom_fields(custom_fields, update=True)


def ensure_item_po_doctype():
    if frappe.db.exists("DocType", "Item PO"):
        return

    doc = frappe.get_doc(
        {
            "doctype": "DocType",
            "name": "Item PO",
            "module": "Order Tracking Report",
            "custom": 1,
            "istable": 1,
            "editable_grid": 1,
            "engine": "InnoDB",
            "fields": [],
            "permissions": [],
        }
    )
    doc.insert(ignore_permissions=True)


def ensure_item_po_fields():
    required_fields = [
        {"fieldname": "item", "label": "Item", "fieldtype": "Link", "options": "Item"},
        {"fieldname": "column_break_left_top", "label": "", "fieldtype": "Column Break"},
        {"fieldname": "supplier", "label": "Supplier", "fieldtype": "Link", "options": "Supplier"},
        {"fieldname": "warehouse", "label": "Warehouse", "fieldtype": "Link", "options": "Warehouse"},
        {"fieldname": "qty", "label": "Qty", "fieldtype": "Float"},
        {"fieldname": "custom_base_qty", "label": "Base Qty", "fieldtype": "Float"},
        {"fieldname": "column_break_right_mid", "label": "", "fieldtype": "Column Break"},
        {"fieldname": "descriptions", "label": "Descriptions", "fieldtype": "Data"},
        {"fieldname": "comments", "label": "Comments", "fieldtype": "Data"},
        {"fieldname": "custom_wastage_percentage", "label": "Wastage %", "fieldtype": "Float"},
        {"fieldname": "custom_wastage_qty", "label": "Wastage Qty", "fieldtype": "Float"},
        {"fieldname": "custom_extra_qty", "label": "Extra Qty", "fieldtype": "Float"},
        {"fieldname": "custom_po_qty", "label": "PO Qty", "fieldtype": "Float"},
        {"fieldname": "column_break_left_bottom", "label": "", "fieldtype": "Column Break"},
        {"fieldname": "purchase_order", "label": "Purchase Order", "fieldtype": "Link", "options": "Purchase Order"},
        {"fieldname": "posting_status", "label": "Posting Status", "fieldtype": "Data"},
        {"fieldname": "po_status", "label": "PO Status", "fieldtype": "Data"},
        {"fieldname": "select_for_po", "label": "Select for PO", "fieldtype": "Check"},
        {"fieldname": "create_po", "label": "Create PO", "fieldtype": "Button"},
    ]

    existing = set()
    meta = frappe.get_meta("Item PO")
    for df in meta.fields:
        existing.add(df.fieldname)

    insert_after = None
    for f in required_fields:
        fieldname = f["fieldname"]
        if fieldname in existing:
            insert_after = fieldname
            continue

        custom_field = {
            "doctype": "Custom Field",
            "dt": "Item PO",
            "fieldname": fieldname,
            "label": f["label"],
            "fieldtype": f["fieldtype"],
            "insert_after": insert_after,
        }
        if f.get("options"):
            custom_field["options"] = f["options"]

        frappe.get_doc(custom_field).insert(ignore_permissions=True)
        insert_after = fieldname


def ensure_purchase_order_item_tracking_fields():
    custom_fields = {
        "Purchase Order Item": [
            {
                "fieldname": "custom_base_qty",
                "label": "Base Qty",
                "fieldtype": "Float",
                "insert_after": "qty",
            },
            {
                "fieldname": "custom_wastage_percentage",
                "label": "Wastage %",
                "fieldtype": "Float",
                "insert_after": "custom_base_qty",
            },
            {
                "fieldname": "custom_wastage_qty",
                "label": "Wastage Qty",
                "fieldtype": "Float",
                "insert_after": "custom_wastage_percentage",
            },
            {
                "fieldname": "custom_extra_qty",
                "label": "Extra Qty",
                "fieldtype": "Float",
                "insert_after": "custom_wastage_qty",
            },
            {
                "fieldname": "custom_po_qty",
                "label": "PO Qty",
                "fieldtype": "Float",
                "insert_after": "custom_extra_qty",
            },
        ]
    }
    create_custom_fields(custom_fields, update=True)


def ensure_allow_on_submit_for_po_fields():
    targets = [
        ("Sales Order", "custom_po_item"),
        ("Sales Order", "custom_wastage_mode"),
        ("Sales Order", "custom_manual_wastage_percent"),
        ("Item PO", "warehouse"),
        ("Wastage", "source"),
    ]

    for dt, fieldname in targets:
        cf_name = frappe.db.get_value("Custom Field", {"dt": dt, "fieldname": fieldname}, "name")
        if not cf_name:
            continue
        frappe.db.set_value("Custom Field", cf_name, "allow_on_submit", 1, update_modified=False)
