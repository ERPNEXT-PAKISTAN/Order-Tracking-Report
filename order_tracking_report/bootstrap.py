import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def ensure_item_po_setup():
    ensure_wastage_doctype()
    ensure_wastage_doctype_fields()
    ensure_sales_order_wastage_mode_fields()
    ensure_item_po_doctype()
    ensure_item_po_fields()
    ensure_purchase_order_item_tracking_fields()
    ensure_allow_on_submit_for_po_fields()


def ensure_sales_order_live_shortcuts():
    ensure_manufacturing_workspace_shortcut()
    ensure_manufacturing_live_work_order_shortcut()


def ensure_manufacturing_workspace_shortcut():
    if not frappe.db.exists("Workspace", "Manufacturing"):
        return

    changed = False

    has_shortcut = frappe.db.exists(
        "Workspace Shortcut",
        {
            "parent": "Manufacturing",
            "parenttype": "Workspace",
            "parentfield": "shortcuts",
            "label": "Sales Order Live",
            "type": "Page",
            "link_to": "sales-order-live",
        },
    )
    if not has_shortcut:
        next_idx = frappe.db.count(
            "Workspace Shortcut",
            {
                "parent": "Manufacturing",
                "parenttype": "Workspace",
                "parentfield": "shortcuts",
            },
        ) + 1
        frappe.get_doc(
            {
                "doctype": "Workspace Shortcut",
                "parent": "Manufacturing",
                "parenttype": "Workspace",
                "parentfield": "shortcuts",
                "idx": next_idx,
                "label": "Sales Order Live",
                "type": "Page",
                "link_to": "sales-order-live",
                "color": "blue",
            }
        ).db_insert(ignore_if_duplicate=True)
        changed = True

    try:
        content = frappe.parse_json(frappe.db.get_value("Workspace", "Manufacturing", "content")) or []
    except Exception:
        content = []

    has_shortcut_block = any(
        block.get("type") == "shortcut"
        and (block.get("data") or {}).get("shortcut_name") == "Sales Order Live"
        for block in content
    )

    if not has_shortcut_block:
        shortcut_block = {
            "id": frappe.generate_hash(length=10),
            "type": "shortcut",
            "data": {"shortcut_name": "Sales Order Live", "col": 3},
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
        frappe.db.set_value("Workspace", "Manufacturing", "content", frappe.as_json(content), update_modified=False)
        changed = True

    if changed:
        frappe.clear_document_cache("Workspace", "Manufacturing")


def ensure_manufacturing_live_work_order_shortcut():
    if not frappe.db.exists("Workspace", "Manufacturing"):
        return

    changed = False

    has_shortcut = frappe.db.exists(
        "Workspace Shortcut",
        {
            "parent": "Manufacturing",
            "parenttype": "Workspace",
            "parentfield": "shortcuts",
            "label": "Live Work Order",
            "type": "Page",
            "link_to": "live-work-order",
        },
    )
    if not has_shortcut:
        next_idx = frappe.db.count(
            "Workspace Shortcut",
            {
                "parent": "Manufacturing",
                "parenttype": "Workspace",
                "parentfield": "shortcuts",
            },
        ) + 1
        frappe.get_doc(
            {
                "doctype": "Workspace Shortcut",
                "parent": "Manufacturing",
                "parenttype": "Workspace",
                "parentfield": "shortcuts",
                "idx": next_idx,
                "label": "Live Work Order",
                "type": "Page",
                "link_to": "live-work-order",
                "color": "green",
            }
        ).db_insert(ignore_if_duplicate=True)
        changed = True

    try:
        content = frappe.parse_json(frappe.db.get_value("Workspace", "Manufacturing", "content")) or []
    except Exception:
        content = []

    has_shortcut_block = any(
        block.get("type") == "shortcut"
        and (block.get("data") or {}).get("shortcut_name") == "Live Work Order"
        for block in content
    )

    if not has_shortcut_block:
        shortcut_block = {
            "id": frappe.generate_hash(length=10),
            "type": "shortcut",
            "data": {"shortcut_name": "Live Work Order", "col": 3},
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
        frappe.db.set_value("Workspace", "Manufacturing", "content", frappe.as_json(content), update_modified=False)
        changed = True

    if changed:
        frappe.clear_document_cache("Workspace", "Manufacturing")


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
                {"fieldname": "item", "label": "Item", "fieldtype": "Link", "options": "Item"},
                {"fieldname": "qty", "label": "Qty", "fieldtype": "Float"},
                {"fieldname": "remarks", "label": "Remarks", "fieldtype": "Data"},
            ],
            "permissions": [],
        }
    )
    doc.insert(ignore_permissions=True)


def ensure_wastage_doctype_fields():
    if not frappe.db.exists("DocType", "Wastage"):
        return

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
        "item_group": {"fieldtype": "Link", "options": "Item Group"},
        "wastage": {"fieldtype": "Float"},
        "manual": {"fieldtype": "Float"},
        "po": {"fieldtype": "Float"},
        "source": {"fieldtype": "Select", "options": "\nWastage\nManual\nPO"},
    }
    for fn, cfg in normalize.items():
        df_name = frappe.db.get_value("DocField", {"parent": "Wastage", "fieldname": fn}, "name")
        if not df_name:
            continue
        for k, v in cfg.items():
            frappe.db.set_value("DocField", df_name, k, v, update_modified=False)

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


def ensure_sales_order_wastage_mode_fields():
    custom_fields = {
        "Sales Order": [
            {
                "fieldname": "custom_wastage_mode",
                "label": "Wastage Source",
                "fieldtype": "Select",
                "options": "\nIndividual\nWastage\nManual\nPO\nGlobal Manual %",
                "insert_after": "custom_wastages",
                "default": "Individual",
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
