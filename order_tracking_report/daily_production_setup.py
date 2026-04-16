from __future__ import annotations

import json

import frappe


PARENT_DOCTYPE = "Daily Production"
CHILD_DOCTYPE = "Operation Process"
SCRIPT_NAME = "Daily Production Sales Order Loader"

LEGACY_CUSTOM_FIELDS = {
    PARENT_DOCTYPE: ["operation_process", "column_break_company"],
    CHILD_DOCTYPE: [
        "sales_order_item",
        "description",
        "uom",
        "operation",
        "process_qty",
        "completed_qty",
        "remarks",
        "item_code",
        "item_name",
    ],
}


def ensure_daily_production_setup() -> None:
    remove_legacy_daily_production_custom_fields()
    ensure_daily_production_field_order()
    ensure_daily_production_client_script()


def remove_legacy_daily_production_custom_fields() -> None:
    changed_doctypes = set()

    for doctype_name, fieldnames in LEGACY_CUSTOM_FIELDS.items():
        for fieldname in fieldnames:
            custom_field_name = frappe.db.get_value(
                "Custom Field",
                {"dt": doctype_name, "fieldname": fieldname},
                "name",
            )
            if not custom_field_name:
                continue

            frappe.delete_doc("Custom Field", custom_field_name, ignore_permissions=True, force=True)
            changed_doctypes.add(doctype_name)

    for doctype_name in changed_doctypes:
        if frappe.db.exists("DocType", doctype_name):
            frappe.clear_document_cache("DocType", doctype_name)


def ensure_daily_production_field_order() -> None:
    if not frappe.db.exists("DocType", PARENT_DOCTYPE):
        return

    meta = frappe.get_meta(PARENT_DOCTYPE)
    table_fieldname = _get_child_table_fieldname(meta)
    remarks_field = _find_field(meta, "remarks")
    table_field = _find_field(meta, table_fieldname) if table_fieldname else None

    if not table_fieldname or not remarks_field or not table_field:
        return

    if frappe.utils.cint(remarks_field.idx) > frappe.utils.cint(table_field.idx):
        return

    if frappe.db.exists("Custom Field", remarks_field.name):
      frappe.db.set_value(
        "Custom Field",
        remarks_field.name,
        "insert_after",
        table_fieldname,
        update_modified=False,
      )
    elif frappe.db.exists("DocField", remarks_field.name):
      max_idx = 0
      for field in getattr(meta, "fields", []) or []:
        max_idx = max(max_idx, frappe.utils.cint(field.idx))
      frappe.db.set_value("DocField", remarks_field.name, "idx", max_idx + 1, update_modified=False)

    frappe.clear_document_cache("DocType", PARENT_DOCTYPE)
    frappe.db.commit()


def _get_loader_config() -> dict | None:
    if not frappe.db.exists("DocType", PARENT_DOCTYPE):
        return None

    if not frappe.db.exists("DocType", CHILD_DOCTYPE):
        return None

    parent_meta = frappe.get_meta(PARENT_DOCTYPE)
    child_meta = frappe.get_meta(CHILD_DOCTYPE)

    table_fieldname = _get_child_table_fieldname(parent_meta)
    item_fieldname = _get_item_fieldname(child_meta)
    date_fieldname = "date" if _find_field(child_meta, "date") else None
    sales_order_fieldname = "sales_order" if _find_field(child_meta, "sales_order") else None

    if not table_fieldname or not item_fieldname:
        return None

    return {
        "table_fieldname": table_fieldname,
        "item_fieldname": item_fieldname,
        "date_fieldname": date_fieldname,
        "sales_order_fieldname": sales_order_fieldname,
    }


def _get_child_table_fieldname(parent_meta) -> str | None:
    for fieldname in ["operations", "operation_process"]:
        field = _find_field(parent_meta, fieldname)
        if field and field.fieldtype == "Table" and field.options == CHILD_DOCTYPE:
            return fieldname

    for field in getattr(parent_meta, "fields", []) or []:
        if field.fieldtype == "Table" and field.options == CHILD_DOCTYPE:
            return field.fieldname

    return None


def _get_item_fieldname(child_meta) -> str | None:
    for fieldname in ["item", "item_code"]:
        field = _find_field(child_meta, fieldname)
        if field and field.fieldtype == "Link" and field.options == "Item":
            return fieldname

    return None


def _find_field(meta_or_doc, fieldname: str | None):
    if not fieldname:
        return None

    get_field = getattr(meta_or_doc, "get_field", None)
    if callable(get_field):
        return get_field(fieldname)

    for field in getattr(meta_or_doc, "fields", []) or []:
        if field.fieldname == fieldname:
            return field

    return None


def ensure_daily_production_client_script() -> None:
    config = _get_loader_config()

    if not config:
        if frappe.db.exists("Client Script", SCRIPT_NAME):
            doc = frappe.get_doc("Client Script", SCRIPT_NAME)
            doc.enabled = 0
            doc.save(ignore_permissions=True)
        return

    script = f"""
const OTR_TABLE_FIELD = {json.dumps(config['table_fieldname'])};
const OTR_ITEM_FIELD = {json.dumps(config['item_fieldname'])};
const OTR_DATE_FIELD = {json.dumps(config['date_fieldname'])};
const OTR_SALES_ORDER_FIELD = {json.dumps(config['sales_order_fieldname'])};

function otrHasValue(value) {{
  return value !== undefined && value !== null && String(value).trim() !== '';
}}

function otrGetExistingRows(frm) {{
  return (frm.doc[OTR_TABLE_FIELD] || []).filter((row) => otrHasValue(row[OTR_ITEM_FIELD]));
}}

function otrApplyParentDate(frm) {{
  if (!OTR_DATE_FIELD) {{
    return;
  }}

  (frm.doc[OTR_TABLE_FIELD] || []).forEach((row) => {{
    row[OTR_DATE_FIELD] = frm.doc.date || '';
  }});
  frm.refresh_field(OTR_TABLE_FIELD);
}}

function otrConfirmReplaceRows() {{
  return new Promise((resolve) => {{
    frappe.confirm(
      __('This will replace current rows with Sales Order items. Continue?'),
      () => resolve(true),
      () => resolve(false)
    );
  }});
}}

async function otrLoadSalesOrderItems(frm, forceReload) {{
  if (!frm.doc.sales_order) {{
    frappe.msgprint(__('Select a Sales Order first.'));
    return;
  }}

  if (otrGetExistingRows(frm).length && !forceReload) {{
    const confirmed = await otrConfirmReplaceRows();
    if (!confirmed) {{
      return;
    }}
  }}

  const response = await frappe.call({{
    method: 'order_tracking_report.api.get_sales_order_items_for_daily_production',
    args: {{ sales_order: frm.doc.sales_order }},
    freeze: true,
    freeze_message: __('Loading Sales Order items...'),
  }});

  const rows = response.message || [];
  frm.clear_table(OTR_TABLE_FIELD);

  rows.forEach((row) => {{
    const child = frm.add_child(OTR_TABLE_FIELD);
    child[OTR_ITEM_FIELD] = row.item_code || '';
    if (OTR_DATE_FIELD) {{
      child[OTR_DATE_FIELD] = frm.doc.date || '';
    }}
    if (OTR_SALES_ORDER_FIELD) {{
      child[OTR_SALES_ORDER_FIELD] = frm.doc.sales_order || '';
    }}
  }});

  frm.refresh_field(OTR_TABLE_FIELD);
}}

frappe.ui.form.on('Daily Production', {{
  refresh(frm) {{
    frm.add_custom_button(__('Load Items from Sales Order'), () => otrLoadSalesOrderItems(frm, false));
  }},
  sales_order(frm) {{
    if (!frm.doc.sales_order) {{
      frm.clear_table(OTR_TABLE_FIELD);
      frm.refresh_field(OTR_TABLE_FIELD);
      return;
    }}

    otrLoadSalesOrderItems(frm, true);
  }},
  date(frm) {{
    otrApplyParentDate(frm);
  }},
}});
"""

    if frappe.db.exists("Client Script", SCRIPT_NAME):
        doc = frappe.get_doc("Client Script", SCRIPT_NAME)
        doc.update({"dt": PARENT_DOCTYPE, "enabled": 1, "view": "Form", "script": script})
        doc.save(ignore_permissions=True)
    else:
        frappe.get_doc(
            {
                "doctype": "Client Script",
                "name": SCRIPT_NAME,
                "dt": PARENT_DOCTYPE,
                "view": "Form",
                "enabled": 1,
                "script": script,
            }
        ).insert(ignore_permissions=True)

    frappe.db.commit()