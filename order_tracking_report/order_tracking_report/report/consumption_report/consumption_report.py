import frappe


GROUP_BY_OPTIONS = {
    "Work Order": "work_order",
    "Stock Entry Type": "stock_entry_type",
    "Warehouse": "warehouse",
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
    group_by = (filters.get("group_by") or "Work Order").strip()
    if group_by not in GROUP_BY_OPTIONS:
        group_by = "Work Order"
    filters["group_by"] = group_by

    if filters.get("from_date") and filters.get("to_date") and filters.get("from_date") > filters.get("to_date"):
        filters["to_date"] = filters.get("from_date")


def get_columns():
    return [
        {"label": "Group (Click Arrow)", "fieldname": "group_value", "fieldtype": "Data", "width": 250},
        {"label": "Date", "fieldname": "date", "fieldtype": "Date", "width": 110},
        {"label": "Stock Entry Type", "fieldname": "stock_entry_type", "fieldtype": "Data", "width": 190},
        {"label": "Stock Entry", "fieldname": "stock_entry", "fieldtype": "Link", "options": "Stock Entry", "width": 180},
        {"label": "Work Order", "fieldname": "work_order", "fieldtype": "Link", "options": "Work Order", "width": 180},
        {"label": "Warehouse", "fieldname": "warehouse", "fieldtype": "Link", "options": "Warehouse", "width": 190},
        {"label": "Item Group", "fieldname": "item_group", "fieldtype": "Link", "options": "Item Group", "width": 160},
        {"label": "Item", "fieldname": "item_name", "fieldtype": "Data", "width": 240},
        {"label": "Consumption Qty", "fieldname": "consumption_qty", "fieldtype": "Float", "precision": 2, "width": 150},
        {"label": "Amount", "fieldname": "amount", "fieldtype": "Currency", "width": 140},
        {"label": "Avg Rate", "fieldname": "avg_rate", "fieldtype": "Currency", "width": 120},
    ]


def get_rows(filters):
    conditions = [
        "sle.is_cancelled = 0",
        "sle.voucher_type = 'Stock Entry'",
        "sle.actual_qty < 0",
    ]
    values = {}

    if filters.get("from_date"):
        conditions.append("sle.posting_date >= %(from_date)s")
        values["from_date"] = filters.get("from_date")
    if filters.get("to_date"):
        conditions.append("sle.posting_date <= %(to_date)s")
        values["to_date"] = filters.get("to_date")
    if filters.get("company"):
        conditions.append("se.company = %(company)s")
        values["company"] = filters.get("company")
    if filters.get("work_order"):
        conditions.append("IFNULL(se.work_order, '') = %(work_order)s")
        values["work_order"] = filters.get("work_order")
    if filters.get("stock_entry_type"):
        conditions.append("IFNULL(se.purpose, '') = %(stock_entry_type)s")
        values["stock_entry_type"] = filters.get("stock_entry_type")
    if filters.get("warehouse"):
        conditions.append("IFNULL(sle.warehouse, '') = %(warehouse)s")
        values["warehouse"] = filters.get("warehouse")
    if filters.get("item_group"):
        conditions.append("IFNULL(i.item_group, '') = %(item_group)s")
        values["item_group"] = filters.get("item_group")
    if filters.get("item_code"):
        conditions.append("sle.item_code = %(item_code)s")
        values["item_code"] = filters.get("item_code")
    if filters.get("variant"):
        conditions.append("IFNULL(i.variant_of, '') = %(variant)s")
        values["variant"] = filters.get("variant")
    if filters.get("attributes"):
        conditions.append(
            """
            EXISTS (
                SELECT 1
                FROM `tabItem Variant Attribute` iva
                WHERE iva.parent = i.name
                  AND (
                    iva.attribute LIKE %(attributes_like)s
                    OR iva.attribute_value LIKE %(attributes_like)s
                  )
            )
            """
        )
        values["attributes_like"] = f"%{filters.get('attributes')}%"
    if filters.get("sales_order"):
        conditions.append("IFNULL(wo.sales_order, '') = %(sales_order)s")
        values["sales_order"] = filters.get("sales_order")

    return frappe.db.sql(
        f"""
        SELECT
            sle.posting_date AS date,
            IFNULL(se.purpose, '') AS stock_entry_type,
            se.name AS stock_entry,
            IFNULL(se.work_order, '') AS work_order,
            IFNULL(sle.warehouse, '') AS warehouse,
            IFNULL(i.item_group, 'Uncategorized') AS item_group,
            IFNULL(i.item_name, sle.item_code) AS item_name,
            ABS(IFNULL(sle.actual_qty, 0)) AS consumption_qty,
            ABS(IFNULL(sle.stock_value_difference, 0)) AS amount
        FROM `tabStock Ledger Entry` sle
        INNER JOIN `tabStock Entry` se ON se.name = sle.voucher_no
        INNER JOIN `tabItem` i ON i.name = sle.item_code
        LEFT JOIN `tabWork Order` wo ON wo.name = se.work_order
        WHERE {" AND ".join(conditions)}
        ORDER BY sle.posting_date DESC, se.name DESC, i.item_name ASC
        """,
        values,
        as_dict=True,
    )


def build_grouped_data(rows, group_by):
    group_field = GROUP_BY_OPTIONS.get(group_by, "work_order")
    grouped = {}

    for row in rows:
        amount = flt(row.get("amount"))
        qty = flt(row.get("consumption_qty"))
        row["avg_rate"] = amount / qty if qty else 0
        key = row.get(group_field) or "Not Set"
        grouped.setdefault(str(key), []).append(row)

    output = []
    group_index = 0

    for group_key in sorted(grouped.keys(), key=lambda d: str(d or "")):
        children = grouped[group_key]
        qty_total = sum(flt(x.get("consumption_qty")) for x in children)
        amount_total = sum(flt(x.get("amount")) for x in children)
        avg_rate = amount_total / qty_total if qty_total else 0
        latest_date = max((x.get("date") for x in children if x.get("date")), default=None)
        group_index += 1
        group_id = f"group_{group_index}"

        output.append(
            {
                "group_value": group_key,
                "date": latest_date,
                "stock_entry_type": "",
                "stock_entry": "",
                "work_order": group_key if group_field == "work_order" else "",
                "warehouse": group_key if group_field == "warehouse" else "",
                "item_group": group_key if group_field == "item_group" else "",
                "item_name": group_key if group_field == "item_name" else "",
                "consumption_qty": round(qty_total, 2),
                "amount": amount_total,
                "avg_rate": avg_rate,
                "indent": 0,
                "bold": 1,
                "is_group_row": 1,
                "_node": group_id,
                "_parent_node": "",
            }
        )

        for idx, row in enumerate(children, start=1):
            output.append(
                {
                    "group_value": str(idx),
                    "date": row.get("date"),
                    "stock_entry_type": row.get("stock_entry_type"),
                    "stock_entry": row.get("stock_entry"),
                    "work_order": row.get("work_order"),
                    "warehouse": row.get("warehouse"),
                    "item_group": row.get("item_group"),
                    "item_name": row.get("item_name"),
                    "consumption_qty": round(flt(row.get("consumption_qty")), 2),
                    "amount": flt(row.get("amount")),
                    "avg_rate": flt(row.get("avg_rate")),
                    "indent": 1,
                    "_node": f"{group_id}_{idx}",
                    "_parent_node": group_id,
                }
            )

    return output


def flt(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0
