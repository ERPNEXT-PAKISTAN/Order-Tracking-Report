import frappe


GROUP_BY_OPTIONS = {
    "Sales Order Number": "sales_order",
    "Customer": "customer",
    "Item Group": "item_group",
    "Item": "item_name",
}


def execute(filters=None):
    filters = frappe._dict(filters or {})
    normalize_filters(filters)
    rows = get_rows(filters)
    data = build_grouped_data(rows, filters.get("group_by"))
    return get_columns(), data


def normalize_filters(filters):
    group_by = (filters.get("group_by") or "Sales Order Number").strip()
    if group_by not in GROUP_BY_OPTIONS:
        group_by = "Sales Order Number"
    filters["group_by"] = group_by

    if filters.get("from_date") and filters.get("to_date") and filters.get("from_date") > filters.get("to_date"):
        filters["to_date"] = filters.get("from_date")


def get_columns():
    return [
        {"label": "Group (Click Arrow)", "fieldname": "group_value", "fieldtype": "Data", "width": 240},
        {
            "label": "Sales Order",
            "fieldname": "sales_order",
            "fieldtype": "Link",
            "options": "Sales Order",
            "width": 220,
        },
        {"label": "Date", "fieldname": "date", "fieldtype": "Date", "width": 110},
        {"label": "Customer", "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 220},
        {"label": "Item Group", "fieldname": "item_group", "fieldtype": "Link", "options": "Item Group", "width": 160},
        {"label": "Status", "fieldname": "status", "fieldtype": "Data", "width": 170},
        {"label": "Item Name", "fieldname": "item_name", "fieldtype": "Data", "width": 240},
        {"label": "Qty", "fieldname": "qty", "fieldtype": "Float", "precision": 1, "width": 120},
        {"label": "Delivered Qty", "fieldname": "delivered_qty", "fieldtype": "Float", "precision": 1, "width": 130},
        {"label": "Pending Qty", "fieldname": "pending_qty", "fieldtype": "Float", "precision": 1, "width": 130},
    ]


def get_rows(filters):
    conditions = ["so.docstatus < 2"]
    values = {}

    if filters.get("warehouse"):
        conditions.append("IFNULL(soi.warehouse, '') = %(warehouse)s")
        values["warehouse"] = filters.get("warehouse")

    if filters.get("from_date"):
        conditions.append("so.transaction_date >= %(from_date)s")
        values["from_date"] = filters.get("from_date")

    if filters.get("to_date"):
        conditions.append("so.transaction_date <= %(to_date)s")
        values["to_date"] = filters.get("to_date")

    if filters.get("company"):
        conditions.append("so.company = %(company)s")
        values["company"] = filters.get("company")

    if filters.get("customer"):
        conditions.append("so.customer = %(customer)s")
        values["customer"] = filters.get("customer")

    if filters.get("status"):
        conditions.append("so.status = %(status)s")
        values["status"] = filters.get("status")

    if filters.get("item_group"):
        conditions.append("IFNULL(i.item_group, '') = %(item_group)s")
        values["item_group"] = filters.get("item_group")

    if filters.get("item_code"):
        conditions.append("soi.item_code = %(item_code)s")
        values["item_code"] = filters.get("item_code")

    if filters.get("sales_order"):
        conditions.append("so.name = %(sales_order)s")
        values["sales_order"] = filters.get("sales_order")

    where_sql = " AND ".join(conditions)

    return frappe.db.sql(
        f"""
        SELECT
            so.name AS sales_order,
            so.transaction_date AS date,
            so.customer,
            so.status,
            IFNULL(i.item_group, 'Uncategorized') AS item_group,
            IFNULL(soi.item_name, soi.item_code) AS item_name,
            IFNULL(soi.qty, 0) AS qty,
            IFNULL(soi.delivered_qty, 0) AS delivered_qty
        FROM `tabSales Order Item` soi
        INNER JOIN `tabSales Order` so ON so.name = soi.parent
        LEFT JOIN `tabItem` i ON i.name = soi.item_code
        WHERE {where_sql}
        ORDER BY so.transaction_date DESC, so.name DESC, soi.idx ASC
        """,
        values,
        as_dict=True,
    )


def build_grouped_data(rows, group_by):
    group_field = GROUP_BY_OPTIONS.get(group_by, "sales_order")
    grouped = {}
    for row in rows:
        pending_qty = flt(row.get("qty")) - flt(row.get("delivered_qty"))
        row["pending_qty"] = pending_qty if pending_qty > 0 else 0
        key = row.get(group_field) or "Unknown"
        grouped.setdefault(key, []).append(row)

    output = []
    group_index = 0
    for group_key in sorted(grouped.keys(), key=lambda d: str(d or "")):
        children = grouped[group_key]
        qty_total = sum(flt(d.get("qty")) for d in children)
        delivered_total = sum(flt(d.get("delivered_qty")) for d in children)
        pending_total = sum(flt(d.get("pending_qty")) for d in children)
        latest_date = max((d.get("date") for d in children if d.get("date")), default=None)
        group_index += 1
        group_id = f"group_{group_index}"

        header = {
            "group_value": str(group_key),
            "sales_order": "",
            "date": latest_date,
            "customer": "",
            "item_group": "",
            "status": f"Summary ({len(children)})",
            "item_name": "",
            "qty": round(qty_total, 1),
            "delivered_qty": round(delivered_total, 1),
            "pending_qty": round(pending_total, 1),
            "indent": 0,
            "bold": 1,
            "is_group_row": 1,
            "_node": group_id,
            "_parent_node": "",
        }

        if group_field == "sales_order":
            header["sales_order"] = group_key
            header["customer"] = children[0].get("customer")
            header["item_group"] = "Mixed"
            header["status"] = f"{children[0].get('status')} ({len(children)})"
        elif group_field == "customer":
            header["customer"] = group_key
            header["item_group"] = "Mixed"
        elif group_field == "item_group":
            header["item_group"] = group_key
            header["item_name"] = "Multiple Items"
        else:
            header["item_group"] = children[0].get("item_group")
            header["item_name"] = str(group_key)

        output.append(header)

        for idx, row in enumerate(children, start=1):
            output.append(
                {
                    "group_value": f"{idx}",
                    "sales_order": row.get("sales_order"),
                    "date": row.get("date"),
                    "customer": row.get("customer"),
                    "item_group": row.get("item_group"),
                    "status": row.get("status"),
                    "item_name": row.get("item_name"),
                    "qty": round(flt(row.get("qty")), 1),
                    "delivered_qty": round(flt(row.get("delivered_qty")), 1),
                    "pending_qty": round(flt(row.get("pending_qty")), 1),
                    "indent": 1,
                    "_node": f"{group_id}_child_{idx}",
                    "_parent_node": group_id,
                }
            )

    return output


def flt(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0
