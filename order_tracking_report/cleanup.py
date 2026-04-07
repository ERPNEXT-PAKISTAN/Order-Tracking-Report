import frappe


def remove_legacy_ui_scripts():
    # remove legacy scripts previously managed via fixtures
    for name in (
        "Sales Order Detail Status",
        "create_po_from_sales_order_po_tab",
    ):
        if frappe.db.exists("Server Script", name):
            frappe.delete_doc("Server Script", name, force=1, ignore_permissions=True)

    for name in (
        "Install Data Entry Client Scripts Bundle",
    ):
        if frappe.db.exists("Server Script", name):
            frappe.delete_doc("Server Script", name, force=1, ignore_permissions=True)

    old_po_status_scripts = frappe.get_all(
        "Server Script",
        filters={"name": ["like", "Status update Creat PO from SO_po_tab%"]},
        pluck="name",
    )
    for name in old_po_status_scripts:
        if frappe.db.exists("Server Script", name):
            frappe.delete_doc("Server Script", name, force=1, ignore_permissions=True)

    for name in (
        "Sales Order Detail Status",
        "create_po_from_sales_order_po_tab",
        "Sales Order Bank Account Autofill",
        "Data Entry on Sales Order",
        "Data Entry on Sales Invoice",
        "Data Entry on Purchase Order",
        "Data Entry on Purchase Receipt",
        "Data Entry on Purchase Invoice",
        "Data Entry on Stock Entry",
    ):
        if frappe.db.exists("Client Script", name):
            frappe.delete_doc("Client Script", name, force=1, ignore_permissions=True)


def normalize_purchase_receipt_titles():
    # Fix historical docs where title stayed as literal "{supplier_name}".
    rows = frappe.get_all(
        "Purchase Receipt",
        filters={"title": "{supplier_name}"},
        fields=["name", "supplier_name", "supplier"],
        limit_page_length=0,
    )
    for r in rows:
        proper = r.get("supplier_name") or r.get("supplier")
        if not proper:
            continue
        frappe.db.set_value("Purchase Receipt", r["name"], "title", proper, update_modified=False)


def ensure_purchase_receipt_title(doc, method=None):
    proper = doc.get("supplier_name") or doc.get("supplier")
    if not proper:
        return
    if not doc.get("title") or doc.get("title") == "{supplier_name}":
        doc.title = proper
