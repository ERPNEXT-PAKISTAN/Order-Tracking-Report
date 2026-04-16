from __future__ import annotations

import frappe


OPERATION_PROCESS_BASE_FIELDS = [
    {
        "fieldname": "item_code",
        "label": "Item",
        "fieldtype": "Link",
        "options": "Item",
        "in_list_view": 1,
        "columns": 2,
    },
    {
        "fieldname": "item_name",
        "label": "Item Name",
        "fieldtype": "Data",
        "in_list_view": 1,
        "columns": 2,
    },
    {
        "fieldname": "qty",
        "label": "Sales Order Qty",
        "fieldtype": "Float",
        "in_list_view": 1,
        "columns": 1,
    },
]


DAILY_PRODUCTION_BASE_FIELDS = [
    {
        "fieldname": "date",
        "label": "Date",
        "fieldtype": "Date",
        "default": "Today",
    },
    {
        "fieldname": "sales_order",
        "label": "Sales Order",
        "fieldtype": "Link",
        "options": "Sales Order",
        "reqd": 1,
    },
    {
        "fieldname": "company",
        "label": "Company",
        "fieldtype": "Link",
        "options": "Company",
        "fetch_from": "sales_order.company",
        "fetch_if_empty": 1,
    },
    {
        "fieldname": "customer",
        "label": "Customer",
        "fieldtype": "Data",
        "fetch_from": "sales_order.customer_name",
        "fetch_if_empty": 1,
    },
    {
        "fieldname": "section_break_items",
        "label": "",
        "fieldtype": "Section Break",
    },
    {
        "fieldname": "operation_process",
        "label": "Operation Process",
        "fieldtype": "Table",
        "options": "Operation Process",
    },
]


def ensure_daily_production_setup() -> None:
    ensure_operation_process_doctype()
    ensure_operation_process_fields()
    ensure_daily_production_doctype()
    ensure_daily_production_fields()
    ensure_daily_production_permissions()
    ensure_operation_process_permissions()
    ensure_daily_production_client_script()


def _create_doctype_if_missing(doc: dict) -> None:
    if frappe.db.exists("DocType", doc["name"]):
        return
    frappe.get_doc(doc).insert(ignore_permissions=True)


def _ensure_doctype_fields(doctype_name: str, fields: list[dict]) -> None:
    meta = frappe.get_meta(doctype_name)
    existing = {df.fieldname for df in meta.fields}
    insert_after = meta.fields[-1].fieldname if meta.fields else None

    for field in fields:
        if field["fieldname"] in existing:
            insert_after = field["fieldname"]
            continue

        custom_field = {
            "doctype": "Custom Field",
            "dt": doctype_name,
            "fieldname": field["fieldname"],
            "label": field.get("label") or "",
            "fieldtype": field["fieldtype"],
            "insert_after": field.get("insert_after") or insert_after,
        }
        for key in (
            "options",
            "default",
            "fetch_from",
            "fetch_if_empty",
            "read_only",
            "in_list_view",
            "reqd",
            "hidden",
            "columns",
            "allow_on_submit",
            "precision",
        ):
            if key in field:
                custom_field[key] = field[key]

        frappe.get_doc(custom_field).insert(ignore_permissions=True)
        insert_after = field["fieldname"]


def _ensure_permissions(doctype_name: str, roles: list[str]) -> None:
    try:
        doc = frappe.get_doc("DocType", doctype_name)
    except Exception:
        return

    existing_roles = {row.role for row in (doc.permissions or []) if row.role}
    changed = False
    for role in roles:
        if not frappe.db.exists("Role", role) or role in existing_roles:
            continue
        doc.append(
            "permissions",
            {
                "role": role,
                "read": 1,
                "write": 1,
                "create": 1,
                "delete": 1,
                "report": 1,
                "export": 1,
                "print": 1,
                "email": 1,
                "share": 1,
            },
        )
        changed = True

    if changed:
        doc.save(ignore_permissions=True)
        frappe.clear_document_cache("DocType", doctype_name)


def ensure_operation_process_doctype() -> None:
    _create_doctype_if_missing(
        {
            "doctype": "DocType",
            "name": "Operation Process",
            "module": "Order Tracking Report",
            "custom": 1,
            "istable": 1,
            "editable_grid": 1,
            "engine": "InnoDB",
            "permissions": [],
            "fields": OPERATION_PROCESS_BASE_FIELDS,
        }
    )


def ensure_operation_process_fields() -> None:
    _ensure_doctype_fields(
        "Operation Process",
        OPERATION_PROCESS_BASE_FIELDS
        + [
            {
                "fieldname": "sales_order_item",
                "label": "Sales Order Item",
                "fieldtype": "Data",
                "hidden": 1,
            },
            {
                "fieldname": "description",
                "label": "Description",
                "fieldtype": "Small Text",
            },
            {
                "fieldname": "uom",
                "label": "UOM",
                "fieldtype": "Link",
                "options": "UOM",
                "in_list_view": 1,
                "columns": 1,
            },
            {
                "fieldname": "operation",
                "label": "Operation",
                "fieldtype": "Data",
                "in_list_view": 1,
                "columns": 2,
            },
            {
                "fieldname": "process_qty",
                "label": "Process Qty",
                "fieldtype": "Float",
                "in_list_view": 1,
                "columns": 1,
            },
            {
                "fieldname": "completed_qty",
                "label": "Completed Qty",
                "fieldtype": "Float",
                "in_list_view": 1,
                "columns": 1,
            },
            {
                "fieldname": "remarks",
                "label": "Remarks",
                "fieldtype": "Data",
            },
        ],
    )


def ensure_daily_production_doctype() -> None:
    _create_doctype_if_missing(
        {
            "doctype": "DocType",
            "name": "Daily Production",
            "module": "Order Tracking Report",
            "custom": 1,
            "autoname": "format:DP-.#####",
            "naming_rule": "Expression (old style)",
            "istable": 0,
            "editable_grid": 0,
            "engine": "InnoDB",
            "permissions": [],
            "fields": DAILY_PRODUCTION_BASE_FIELDS,
        }
    )


def ensure_daily_production_fields() -> None:
    _ensure_doctype_fields(
        "Daily Production",
        DAILY_PRODUCTION_BASE_FIELDS
        + [
            {
                "fieldname": "column_break_company",
                "label": "",
                "fieldtype": "Column Break",
                "insert_after": "sales_order",
            },
            {
                "fieldname": "remarks",
                "label": "Remarks",
                "fieldtype": "Small Text",
                "insert_after": "customer",
            },
        ],
    )


def ensure_daily_production_permissions() -> None:
    _ensure_permissions("Daily Production", ["System Manager", "Manufacturing User", "Sales User"])


def ensure_operation_process_permissions() -> None:
    _ensure_permissions("Operation Process", ["System Manager"])


def ensure_daily_production_client_script() -> None:
    script_name = "Daily Production Sales Order Loader"
    script = """
function otrConfirmReplaceRows() {
    return new Promise((resolve) => {
        frappe.confirm(
            __('This will replace current Operation Process rows with Sales Order items. Continue?'),
            () => resolve(true),
            () => resolve(false)
        );
    });
}

async function otrLoadSalesOrderItems(frm, forceReload) {
  if (!frm.doc.sales_order) {
    frappe.msgprint(__('Select a Sales Order first.'));
    return;
  }

  const existingRows = (frm.doc.operation_process || []).filter((row) => row.item_code || row.item_name || row.qty);
  if (existingRows.length && !forceReload) {
        const confirmed = await otrConfirmReplaceRows();
    if (!confirmed) {
      return;
    }
  }

  const response = await frappe.call({
    method: 'order_tracking_report.api.get_sales_order_items_for_daily_production',
    args: { sales_order: frm.doc.sales_order },
    freeze: true,
    freeze_message: __('Loading Sales Order items...'),
  });

  const rows = response.message || [];
  frm.clear_table('operation_process');
  rows.forEach((row) => {
    const child = frm.add_child('operation_process');
    child.sales_order_item = row.sales_order_item || '';
    child.item_code = row.item_code || '';
    child.item_name = row.item_name || '';
    child.description = row.description || '';
    child.qty = row.qty || 0;
    child.uom = row.uom || '';
    child.process_qty = row.qty || 0;
    child.completed_qty = 0;
  });
  frm.refresh_field('operation_process');
}

frappe.ui.form.on('Daily Production', {
  refresh(frm) {
    frm.add_custom_button(__('Load Items from Sales Order'), () => otrLoadSalesOrderItems(frm, false));
  },
  sales_order(frm) {
    if (!frm.doc.sales_order) {
      frm.clear_table('operation_process');
      frm.refresh_field('operation_process');
      return;
    }
    otrLoadSalesOrderItems(frm, true);
  },
});
"""

    if frappe.db.exists("Client Script", script_name):
        doc = frappe.get_doc("Client Script", script_name)
        doc.update({"dt": "Daily Production", "enabled": 1, "view": "Form", "script": script})
        doc.save(ignore_permissions=True)
    else:
        frappe.get_doc(
            {
                "doctype": "Client Script",
                "name": script_name,
                "dt": "Daily Production",
                "view": "Form",
                "enabled": 1,
                "script": script,
            }
        ).insert(ignore_permissions=True)

    frappe.db.commit()