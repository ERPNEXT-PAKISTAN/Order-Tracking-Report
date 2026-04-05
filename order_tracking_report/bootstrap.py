import frappe


def ensure_item_po_setup():
    ensure_wastage_doctype()
    ensure_item_po_doctype()
    ensure_item_po_fields()


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
        {"fieldname": "supplier", "label": "Supplier", "fieldtype": "Link", "options": "Supplier"},
        {"fieldname": "qty", "label": "Qty", "fieldtype": "Float"},
        {"fieldname": "descriptions", "label": "Descriptions", "fieldtype": "Data"},
        {"fieldname": "comments", "label": "Comments", "fieldtype": "Data"},
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
