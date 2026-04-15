import json

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def ensure_item_po_setup():
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
    remove_workspace_page_shortcut("Manufacturing", "Existing Manufacturing Documents", "existing-manufacturing-documents")
    ensure_manufacturing_manage_sales_orders_shortcut()
    ensure_order_tracking_workspace()
    ensure_order_tracking_workspace_shortcuts()


def _ensure_workspace(
    workspace_name,
    title=None,
    module="Order Tracking Report",
    icon="folder-normal",
    public=1,
    sequence_id=None,
    parent_page="",
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
                "type": "Workspace",
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
        "type": "Workspace",
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


def ensure_manufacturing_manage_sales_orders_shortcut():
    _ensure_workspace_page_shortcut(
        "Manufacturing", "Manage Sales Orders", "manage-sales-orders", "cyan"
    )


def ensure_order_tracking_workspace():
    _ensure_workspace(
        "Order Tracking",
        title="Order Tracking",
        icon="branch",
        sequence_id=8.1,
        parent_page="",
    )


def ensure_order_tracking_workspace_shortcuts():
    _ensure_workspace_page_shortcut("Order Tracking", "Sales Order Live", "sales-order-live", "blue")
    _ensure_workspace_page_shortcut("Order Tracking", "Live Work Order", "live-work-order", "green")
    _ensure_workspace_page_shortcut("Order Tracking", "Manage Sales Orders", "manage-sales-orders", "cyan")
    _ensure_workspace_page_shortcut(
        "Order Tracking", "Sales Order Status Board", "sales-order-status-board", "orange"
    )
    _ensure_workspace_page_shortcut("Order Tracking", "Finanicals", "finanicals", "grey")
    _ensure_workspace_report_shortcut(
        "Order Tracking", "Purchase Order Updated Status", "Purchase Order updated Status", "yellow"
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
