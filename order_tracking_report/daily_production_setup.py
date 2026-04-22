from __future__ import annotations

import json

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


PARENT_DOCTYPE = "Daily Production"
CHILD_DOCTYPE = "Operation Process"
SCRIPT_NAME = "Daily Production Sales Order Loader"

DEFAULT_ROLES = ["System Manager", "Manufacturing User", "Sales User"]

PARENT_CUSTOM_FIELDS = {
    PARENT_DOCTYPE: [
        {
            "fieldname": "otr_column_break_item_group",
            "label": "",
            "fieldtype": "Column Break",
            "insert_after": "customer",
        },
        {
            "fieldname": "item_group",
            "label": "Item Group",
            "fieldtype": "Link",
            "options": "Item Group",
            "insert_after": "otr_column_break_item_group",
        },
        {
            "fieldname": "otr_column_break_company",
            "label": "",
            "fieldtype": "Column Break",
            "insert_after": "item_group",
        },
        {
            "fieldname": "company",
            "label": "Company",
            "fieldtype": "Link",
            "options": "Company",
            "insert_after": "otr_column_break_company",
        },
    ]
}

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
    ensure_daily_production_doctypes()
    ensure_operation_process_grid_fields()
    remove_legacy_daily_production_custom_fields()
    ensure_daily_production_custom_fields()
    ensure_daily_production_field_order()
    ensure_daily_production_client_script()


def ensure_daily_production_doctypes() -> None:
    ensure_operation_process_doctype()
    ensure_daily_production_doctype()


def ensure_operation_process_doctype() -> None:
    if frappe.db.exists("DocType", CHILD_DOCTYPE):
        return

    doc = frappe.get_doc(
        {
            "doctype": "DocType",
            "name": CHILD_DOCTYPE,
            "module": "Order Tracking Report",
            "custom": 1,
            "istable": 1,
            "editable_grid": 1,
            "engine": "InnoDB",
            "fields": [
                {"fieldname": "date", "label": "Date", "fieldtype": "Date"},
                {"fieldname": "item", "label": "Item", "fieldtype": "Link", "options": "Item"},
                {"fieldname": "operations", "label": "Operations", "fieldtype": "Link", "options": "Operation"},
                {"fieldname": "qty", "label": "Qty", "fieldtype": "Float"},
                {"fieldname": "employee", "label": "Employee", "fieldtype": "Data"},
                {"fieldname": "sales_order", "label": "Sales Order", "fieldtype": "Data"},
            ],
            "permissions": [],
        }
    )
    doc.insert(ignore_permissions=True)
    frappe.clear_document_cache("DocType", CHILD_DOCTYPE)


def ensure_daily_production_doctype() -> None:
    if frappe.db.exists("DocType", PARENT_DOCTYPE):
        return

    doc = frappe.get_doc(
        {
            "doctype": "DocType",
            "name": PARENT_DOCTYPE,
            "module": "Order Tracking Report",
            "custom": 1,
            "autoname": "format:OP-.#####",
            "engine": "InnoDB",
            "sort_field": "creation",
            "sort_order": "DESC",
            "fields": [
                {"fieldname": "section_break_ckse", "label": "", "fieldtype": "Section Break"},
                {"fieldname": "date", "label": "Date", "fieldtype": "Date"},
                {"fieldname": "column_break_aznq", "label": "", "fieldtype": "Column Break"},
                {"fieldname": "sales_order", "label": "Sales Order", "fieldtype": "Link", "options": "Sales Order"},
                {"fieldname": "column_break_nzqy", "label": "", "fieldtype": "Column Break"},
                {"fieldname": "customer", "label": "Customer", "fieldtype": "Data", "fetch_from": "sales_order.customer"},
                {"fieldname": "otr_column_break_item_group", "label": "", "fieldtype": "Column Break"},
                {"fieldname": "item_group", "label": "Item Group", "fieldtype": "Link", "options": "Item Group"},
                {"fieldname": "otr_column_break_company", "label": "", "fieldtype": "Column Break"},
                {
                    "fieldname": "company",
                    "label": "Company",
                    "fieldtype": "Link",
                    "options": "Company",
                    "fetch_from": "sales_order.company",
                    "fetch_if_empty": 1,
                },
                {"fieldname": "section_break_items", "label": "", "fieldtype": "Section Break"},
                {"fieldname": "operations", "label": "Operations", "fieldtype": "Table", "options": CHILD_DOCTYPE},
                {"fieldname": "remarks", "label": "Remarks", "fieldtype": "Small Text"},
            ],
            "permissions": [
                {
                    "role": role,
                    "read": 1,
                    "write": 1,
                    "create": 1,
                    "delete": 1,
                    "report": 1,
                    "export": 1,
                    "share": 1,
                    "print": 1,
                    "email": 1,
                }
                for role in DEFAULT_ROLES
            ],
        }
    )
    doc.insert(ignore_permissions=True)
    frappe.clear_document_cache("DocType", PARENT_DOCTYPE)


def ensure_daily_production_custom_fields() -> None:
    if not frappe.db.exists("DocType", PARENT_DOCTYPE):
        return

    meta = frappe.get_meta(PARENT_DOCTYPE)
    missing_fields = [field for field in PARENT_CUSTOM_FIELDS[PARENT_DOCTYPE] if not meta.get_field(field["fieldname"])]
    if missing_fields:
        create_custom_fields({PARENT_DOCTYPE: missing_fields}, update=True)


def ensure_operation_process_grid_fields() -> None:
    if not frappe.db.exists("DocType", CHILD_DOCTYPE):
        return

    # Keep Operation Process child table readable in grid/list view on every site.
    field_columns = {
        "date": 1,
        "item": 2,
        "operations": 2,
        "qty": 1,
        "employee": 2,
        "sales_order": 2,
    }
    changed = False
    for fieldname, columns in field_columns.items():
        docfield_name = frappe.db.get_value(
            "DocField",
            {"parent": CHILD_DOCTYPE, "fieldname": fieldname},
            "name",
        )
        if not docfield_name:
            continue

        current = frappe.db.get_value(
            "DocField",
            docfield_name,
            ["in_list_view", "columns"],
            as_dict=True,
        ) or {}
        in_list_view = frappe.utils.cint(current.get("in_list_view"))
        current_columns = frappe.utils.cint(current.get("columns"))
        if in_list_view == 1 and current_columns == columns:
            continue

        frappe.db.set_value(
            "DocField",
            docfield_name,
            {"in_list_view": 1, "columns": columns},
            update_modified=False,
        )
        changed = True

    if changed:
        frappe.clear_document_cache("DocType", CHILD_DOCTYPE)
        frappe.db.commit()


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
    section_break_items = _find_field(meta, "section_break_items")

    if section_break_items and frappe.db.exists("Custom Field", section_break_items.name):
        frappe.db.set_value(
            "Custom Field",
            section_break_items.name,
            "insert_after",
            "company",
            update_modified=False,
        )

    if not table_fieldname or not remarks_field or not table_field:
        frappe.clear_document_cache("DocType", PARENT_DOCTYPE)
        frappe.db.commit()
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
    item_group_fieldname = "item_group" if _find_field(parent_meta, "item_group") else None
    customer_fieldname = "customer" if _find_field(parent_meta, "customer") else None
    company_fieldname = "company" if _find_field(parent_meta, "company") else None

    if not table_fieldname or not item_fieldname:
        return None

    return {
        "table_fieldname": table_fieldname,
        "item_fieldname": item_fieldname,
        "date_fieldname": date_fieldname,
        "sales_order_fieldname": sales_order_fieldname,
        "item_group_fieldname": item_group_fieldname,
        "customer_fieldname": customer_fieldname,
        "company_fieldname": company_fieldname,
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
const OTR_ITEM_GROUP_FIELD = {json.dumps(config['item_group_fieldname'])};
const OTR_CUSTOMER_FIELD = {json.dumps(config['customer_fieldname'])};
const OTR_COMPANY_FIELD = {json.dumps(config['company_fieldname'])};

function otrHasValue(value) {{
  return value !== undefined && value !== null && String(value).trim() !== '';
}}

function otrSetIfPresent(frm, fieldname, value) {{
  if (!fieldname || !frm.fields_dict[fieldname]) {{
    return Promise.resolve();
  }}
  return frm.set_value(fieldname, value || '');
}}

function otrApplyParentValuesToRow(frm, row) {{
  if (!row) {{
    return;
  }}

  if (OTR_DATE_FIELD) {{
    row[OTR_DATE_FIELD] = frm.doc.date || '';
  }}
  if (OTR_SALES_ORDER_FIELD) {{
    row[OTR_SALES_ORDER_FIELD] = frm.doc.sales_order || '';
  }}
}}

function otrApplyParentSalesOrder(frm) {{
  if (!OTR_SALES_ORDER_FIELD) {{
    return;
  }}

  (frm.doc[OTR_TABLE_FIELD] || []).forEach((row) => {{
    row[OTR_SALES_ORDER_FIELD] = frm.doc.sales_order || '';
  }});
  frm.refresh_field(OTR_TABLE_FIELD);
}}

function otrRefreshItemQuery(frm) {{
  const getItemQuery = () => {{
    const filters = {{ disabled: 0 }};
    if (OTR_ITEM_GROUP_FIELD && frm.doc[OTR_ITEM_GROUP_FIELD]) {{
      filters.item_group = frm.doc[OTR_ITEM_GROUP_FIELD];
    }}
    return {{ filters }};
  }};

  frm.set_query(OTR_ITEM_FIELD, OTR_TABLE_FIELD, getItemQuery);
  if (
    frm.fields_dict &&
    frm.fields_dict[OTR_TABLE_FIELD] &&
    frm.fields_dict[OTR_TABLE_FIELD].grid
  ) {{
    frm.fields_dict[OTR_TABLE_FIELD].grid.get_field(OTR_ITEM_FIELD).get_query = getItemQuery;
  }}
}}

async function otrApplySalesOrderContext(frm) {{
  if (!frm.doc.sales_order) {{
    await otrSetIfPresent(frm, OTR_CUSTOMER_FIELD, '');
    await otrSetIfPresent(frm, OTR_COMPANY_FIELD, '');
    return;
  }}

  const response = await frappe.db.get_value('Sales Order', frm.doc.sales_order, ['customer_name', 'customer', 'company']);
  const details = response.message || {{}};
  await otrSetIfPresent(frm, OTR_CUSTOMER_FIELD, details.customer_name || details.customer || '');
  await otrSetIfPresent(frm, OTR_COMPANY_FIELD, details.company || '');
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
    args: {{
      sales_order: frm.doc.sales_order,
      item_group: OTR_ITEM_GROUP_FIELD ? (frm.doc[OTR_ITEM_GROUP_FIELD] || '') : '',
    }},
    freeze: true,
    freeze_message: __('Loading Sales Order items...'),
  }});

  const rows = response.message || [];
  frm.clear_table(OTR_TABLE_FIELD);

  rows.forEach((row) => {{
    const child = frm.add_child(OTR_TABLE_FIELD);
    child[OTR_ITEM_FIELD] = row.item_code || '';
    otrApplyParentValuesToRow(frm, child);
  }});

  frm.refresh_field(OTR_TABLE_FIELD);
}}

const dailyProductionHandlers = {{
  async refresh(frm) {{
    otrRefreshItemQuery(frm);
    await otrApplySalesOrderContext(frm);
    otrApplyParentSalesOrder(frm);
    otrApplyParentDate(frm);
    frm.add_custom_button(__('Load Items from Sales Order'), () => otrLoadSalesOrderItems(frm, false));
  }},
  async sales_order(frm) {{
    await otrApplySalesOrderContext(frm);
    otrApplyParentSalesOrder(frm);
    if (!frm.doc.sales_order) {{
      frm.clear_table(OTR_TABLE_FIELD);
      frm.refresh_field(OTR_TABLE_FIELD);
      return;
    }}

    await otrLoadSalesOrderItems(frm, true);
  }},
  date(frm) {{
    otrApplyParentDate(frm);
  }},
  item_group(frm) {{
    otrRefreshItemQuery(frm);
    frm.refresh_field(OTR_TABLE_FIELD);
  }},
}};

dailyProductionHandlers[`${{OTR_TABLE_FIELD}}_add`] = function (frm, cdt, cdn) {{
  const row = locals[cdt] && locals[cdt][cdn];
  otrApplyParentValuesToRow(frm, row);
  frm.refresh_field(OTR_TABLE_FIELD);
}};

frappe.ui.form.on('Daily Production', dailyProductionHandlers);
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
