import frappe


def sync_item_po_status_for_purchase_order(doc, method=None):
    posting_status = "Draft"
    if doc.docstatus == 1:
        posting_status = "Submitted"
    elif doc.docstatus == 2:
        posting_status = "Cancelled"

    status_value = doc.status or posting_status

    rows = frappe.get_all(
        "Item PO",
        filters={"purchase_order": doc.name},
        fields=["name"],
    )

    for row in rows:
        frappe.db.set_value("Item PO", row.name, "posting_status", posting_status, update_modified=False)
        frappe.db.set_value("Item PO", row.name, "po_status", status_value, update_modified=False)
