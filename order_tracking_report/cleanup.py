import frappe


def remove_legacy_ui_scripts():
    # remove legacy scripts previously managed via fixtures
    for name in (
        "Sales Order Detail Status",
        "create_po_from_sales_order_po_tab",
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
    ):
        if frappe.db.exists("Client Script", name):
            frappe.delete_doc("Client Script", name, force=1, ignore_permissions=True)
