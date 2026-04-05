import frappe

from .so_detail_status_backend import run as run_detail_status


@frappe.whitelist()
def custom_so_execution_status(sales_order=None, action=None, doctype=None, docname=None):
    return run_detail_status(
        sales_order=sales_order,
        action=action,
        doctype=doctype,
        docname=docname,
    )


def _parse_row_names(raw):
    values = []
    if not raw:
        return values

    if isinstance(raw, list):
        candidates = raw
    else:
        candidates = str(raw).split(",")

    for candidate in candidates:
        value = (candidate or "").strip()
        if value and value not in values:
            values.append(value)

    return values


def _get_fallback_supplier(item_code, company):
    po_items = frappe.get_all(
        "Purchase Order Item",
        filters={"item_code": item_code},
        fields=["parent"],
        order_by="creation desc",
        limit_page_length=50,
    )

    checked = []
    for po_item in po_items:
        po_name = po_item.get("parent")
        if not po_name or po_name in checked:
            continue
        checked.append(po_name)

        po = frappe.db.get_value(
            "Purchase Order",
            po_name,
            ["supplier", "company", "docstatus"],
            as_dict=True,
        )
        if not po:
            continue
        if po.docstatus == 2:
            continue
        if po.company != company:
            continue
        if po.supplier:
            return po.supplier

    return None


@frappe.whitelist()
def create_po_from_sales_order_po_tab(source_name=None, row_names=None):
    if not source_name:
        frappe.throw("Sales Order is required")

    selected_row_names = _parse_row_names(row_names)
    sales_order = frappe.get_doc("Sales Order", source_name)

    if sales_order.docstatus == 2:
        frappe.throw("Cancelled Sales Order is not allowed")

    rows = sales_order.get("custom_po_item") or []
    if not rows:
        frappe.throw("No rows found in PO Item table")

    sales_order_transaction_date = sales_order.transaction_date or frappe.utils.nowdate()
    sales_order_schedule_date = sales_order.delivery_date or sales_order_transaction_date
    effective_schedule_date = sales_order_schedule_date
    if effective_schedule_date < sales_order_transaction_date:
        effective_schedule_date = sales_order_transaction_date

    rows_by_supplier = {}
    item_codes = []
    pending_count = 0
    selected_count = 0
    validation_errors = []

    for row in rows:
        if selected_row_names and row.name not in selected_row_names:
            continue

        selected_count = selected_count + 1

        row_purchase_order = (row.get("purchase_order") or "").strip()
        if row_purchase_order:
            existing_po = frappe.db.get_value(
                "Purchase Order",
                row_purchase_order,
                ["name", "docstatus", "status"],
                as_dict=True,
            )
            if existing_po and existing_po.docstatus != 2:
                posting_status = "Submitted" if existing_po.docstatus == 1 else "Draft"
                frappe.db.set_value("Item PO", row.name, "posting_status", posting_status, update_modified=False)
                frappe.db.set_value("Item PO", row.name, "po_status", existing_po.status or posting_status, update_modified=False)
                continue

            frappe.db.set_value("Item PO", row.name, "purchase_order", "", update_modified=False)
            frappe.db.set_value("Item PO", row.name, "posting_status", "", update_modified=False)
            frappe.db.set_value("Item PO", row.name, "po_status", "", update_modified=False)

        if not row.item:
            validation_errors.append("Row #" + str(row.idx) + ": Item is required")
            continue

        if (row.qty or 0) <= 0:
            validation_errors.append("Row #" + str(row.idx) + ": Qty must be greater than zero")
            continue

        supplier = (row.get("supplier") or "").strip()
        if not supplier:
            supplier = _get_fallback_supplier(row.item, sales_order.company)
            if supplier:
                frappe.db.set_value("Item PO", row.name, "supplier", supplier, update_modified=False)

        if not supplier:
            validation_errors.append(
                "Row #"
                + str(row.idx)
                + ": Supplier is required (set supplier in row or create one PO for this item first)"
            )
            continue

        if supplier not in rows_by_supplier:
            rows_by_supplier[supplier] = []
        rows_by_supplier[supplier].append(row)

        pending_count = pending_count + 1

        if row.item not in item_codes:
            item_codes.append(row.item)

    if selected_row_names and selected_count == 0:
        frappe.throw("Selected rows were not found")

    if validation_errors:
        frappe.throw("<br>".join(validation_errors))

    if pending_count == 0:
        if selected_row_names:
            frappe.throw("Purchase Order already created for selected rows")
        frappe.throw("Purchase Order already created for all rows")

    item_map = {}
    for item in frappe.get_all(
        "Item",
        filters={"name": ["in", item_codes]},
        fields=["name", "item_name", "description", "stock_uom", "purchase_uom"],
    ):
        item_map[item.name] = item

    created = []
    remarks = (sales_order.get("custom_po_remarks") or "").strip()

    for supplier, supplier_rows in rows_by_supplier.items():
        po = frappe.new_doc("Purchase Order")
        po.company = sales_order.company
        po.supplier = supplier
        po.transaction_date = sales_order_transaction_date
        po.schedule_date = effective_schedule_date
        po.project = sales_order.project
        po.custom_remarks = remarks
        po.custom_so_number = sales_order.name

        for row in supplier_rows:
            item = item_map.get(row.item)
            if not item:
                frappe.throw("Item not found: " + str(row.item))

            stock_uom = item.get("stock_uom")
            purchase_uom = item.get("purchase_uom") or stock_uom

            description_value = ""
            if row.get("descriptions"):
                description_value = row.get("descriptions").strip()
            elif item.get("description"):
                description_value = item.get("description").strip()

            po.append(
                "items",
                {
                    "item_code": row.item,
                    "item_name": item.get("item_name") or row.item,
                    "description": description_value,
                    "custom_comments": row.get("comments") or "",
                    "qty": row.qty,
                    "schedule_date": effective_schedule_date,
                    "uom": purchase_uom,
                    "stock_uom": stock_uom,
                    "sales_order": sales_order.name,
                    "custom_so_number": sales_order.name,
                    "project": sales_order.project,
                },
            )

        po.run_method("set_missing_values")
        po.run_method("calculate_taxes_and_totals")
        po.insert()

        comment_text = "Created from Sales Order " + sales_order.name
        if remarks:
            comment_text = comment_text + "\nPO Remarks: " + remarks
        po.add_comment("Comment", comment_text)

        posting_status = "Submitted" if po.docstatus == 1 else "Draft"

        for row in supplier_rows:
            frappe.db.set_value("Item PO", row.name, "purchase_order", po.name, update_modified=False)
            frappe.db.set_value("Item PO", row.name, "posting_status", posting_status, update_modified=False)
            frappe.db.set_value("Item PO", row.name, "po_status", po.status or posting_status, update_modified=False)
            frappe.db.set_value("Item PO", row.name, "select_for_po", 0, update_modified=False)

        created.append({"name": po.name, "supplier": supplier})

    return created
