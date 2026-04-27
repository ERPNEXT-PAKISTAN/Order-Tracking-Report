import frappe
from frappe.utils import getdate


GROUP_BY_OPTIONS = {
    "Period": "period_label",
    "Sales Order": "sales_order",
    "Customer": "customer",
    "Item Group": "item_group",
    "Item": "item_name",
    "Status": "status",
}


def execute(filters=None):
    filters = frappe._dict(filters or {})
    normalize_filters(filters)
    rows = get_rows(filters)
    rows = attach_period(rows, filters.get("period"))
    data = build_grouped_data(rows, filters.get("group_by"))
    return get_columns(), data


def normalize_filters(filters):
    group_by = (filters.get("group_by") or "Period").strip()
    if group_by not in GROUP_BY_OPTIONS:
        group_by = "Period"
    filters["group_by"] = group_by

    period = (filters.get("period") or "Monthly").strip()
    if period not in ("Daily", "Monthly", "Quarterly", "Yearly"):
        period = "Monthly"
    filters["period"] = period

    if filters.get("from_date") and filters.get("to_date") and filters.get("from_date") > filters.get("to_date"):
        filters["to_date"] = filters.get("from_date")


def get_columns():
    return [
        {"label": "Group (Click Arrow)", "fieldname": "group_value", "fieldtype": "Data", "width": 220},
        {"label": "Period", "fieldname": "period_label", "fieldtype": "Data", "width": 130},
        {"label": "Sales Order", "fieldname": "sales_order", "fieldtype": "Link", "options": "Sales Order", "width": 200},
        {"label": "Date", "fieldname": "date", "fieldtype": "Date", "width": 110},
        {"label": "Customer", "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 210},
        {"label": "Status", "fieldname": "status", "fieldtype": "Data", "width": 150},
        {"label": "Item Group", "fieldname": "item_group", "fieldtype": "Link", "options": "Item Group", "width": 150},
        {"label": "Item Name", "fieldname": "item_name", "fieldtype": "Data", "width": 220},
        {"label": "Qty", "fieldname": "qty", "fieldtype": "Float", "precision": 1, "width": 120},
        {"label": "Amount", "fieldname": "amount", "fieldtype": "Currency", "width": 140},
    ]


def get_rows(filters):
    conditions = ["so.docstatus < 2"]
    values = {}

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
            IFNULL(soi.base_amount, IFNULL(soi.amount, 0)) AS amount
        FROM `tabSales Order Item` soi
        INNER JOIN `tabSales Order` so ON so.name = soi.parent
        LEFT JOIN `tabItem` i ON i.name = soi.item_code
        WHERE {where_sql}
        ORDER BY so.transaction_date DESC, so.name DESC, soi.idx ASC
        """,
        values,
        as_dict=True,
    )


def attach_period(rows, period):
    for row in rows or []:
        dt = getdate(row.get("date")) if row.get("date") else None
        row["period_label"] = period_label(dt, period) if dt else "Unknown"
    return rows


def period_label(dt, period):
    if period == "Daily":
        return dt.strftime("%Y-%m-%d")
    if period == "Monthly":
        return dt.strftime("%Y-%m")
    if period == "Quarterly":
        q = ((dt.month - 1) // 3) + 1
        return f"{dt.year}-Q{q}"
    return str(dt.year)


def build_grouped_data(rows, group_by):
    group_field = GROUP_BY_OPTIONS.get(group_by, "period_label")
    grouped = {}
    for row in rows or []:
        key = (row.get(group_field) or "Unknown")
        grouped.setdefault(str(key), []).append(row)

    output = []
    group_index = 0
    for group_key in sorted(grouped.keys(), key=lambda d: str(d or "")):
        children = grouped[group_key]
        qty_total = sum(flt(d.get("qty")) for d in children)
        amount_total = sum(flt(d.get("amount")) for d in children)
        latest_date = max((d.get("date") for d in children if d.get("date")), default=None)
        group_index += 1
        group_id = f"group_{group_index}"

        header = {
            "group_value": str(group_key),
            "period_label": group_key if group_field == "period_label" else children[0].get("period_label"),
            "sales_order": group_key if group_field == "sales_order" else "",
            "date": latest_date,
            "customer": group_key if group_field == "customer" else "",
            "status": group_key if group_field == "status" else f"Summary ({len(children)})",
            "item_group": group_key if group_field == "item_group" else "",
            "item_name": group_key if group_field == "item_name" else "",
            "qty": round(qty_total, 1),
            "amount": amount_total,
            "indent": 0,
            "bold": 1,
            "is_group_row": 1,
            "_node": group_id,
            "_parent_node": "",
        }
        output.append(header)

        for idx, row in enumerate(children, start=1):
            output.append(
                {
                    "group_value": f"{idx}",
                    "period_label": row.get("period_label"),
                    "sales_order": row.get("sales_order"),
                    "date": row.get("date"),
                    "customer": row.get("customer"),
                    "status": row.get("status"),
                    "item_group": row.get("item_group"),
                    "item_name": row.get("item_name"),
                    "qty": round(flt(row.get("qty")), 1),
                    "amount": flt(row.get("amount")),
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
