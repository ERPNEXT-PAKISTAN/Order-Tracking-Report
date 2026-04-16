from __future__ import annotations

import frappe


VALID_GROUP_BY = {"None", "Date", "Sales Order", "Item", "Operation", "Employee"}


def execute(filters=None):
    filters = frappe._dict(filters or {})
    normalize_filters(filters)

    columns = get_columns()
    rows = get_rows(filters)

    group_by = filters.get("group_by")
    if group_by and group_by != "None":
        data = build_grouped_rows(rows, group_by)
    else:
        data = [to_detail_row(row) for row in rows]

    chart = build_chart(rows)
    summary = build_report_summary(rows)
    return columns, data, None, chart, summary


def normalize_filters(filters):
    if filters.get("from_date") and filters.get("to_date") and filters.get("from_date") > filters.get("to_date"):
        filters["to_date"] = filters.get("from_date")

    group_by = (filters.get("group_by") or "Date").strip()
    if group_by not in VALID_GROUP_BY:
        group_by = "Date"
    filters["group_by"] = group_by


def get_columns():
    return [
        {
            "label": "Group / Date",
            "fieldname": "group_or_date",
            "fieldtype": "Data",
            "width": 160,
        },
        {
            "label": "Daily Production",
            "fieldname": "daily_production",
            "fieldtype": "Link",
            "options": "Daily Production",
            "width": 170,
        },
        {
            "label": "Sales Order",
            "fieldname": "sales_order",
            "fieldtype": "Link",
            "options": "Sales Order",
            "width": 170,
        },
        {
            "label": "Company",
            "fieldname": "company",
            "fieldtype": "Link",
            "options": "Company",
            "width": 170,
        },
        {
            "label": "Customer",
            "fieldname": "customer",
            "fieldtype": "Data",
            "width": 170,
        },
        {
            "label": "Item",
            "fieldname": "item",
            "fieldtype": "Link",
            "options": "Item",
            "width": 170,
        },
        {
            "label": "Operation",
            "fieldname": "operation",
            "fieldtype": "Link",
            "options": "Operation",
            "width": 150,
        },
        {
            "label": "Employee",
            "fieldname": "employee",
            "fieldtype": "Data",
            "width": 150,
        },
        {
            "label": "Qty",
            "fieldname": "qty",
            "fieldtype": "Float",
            "width": 100,
        },
    ]


def get_rows(filters):
    conditions = ["dp.docstatus < 2"]
    values = {}

    if filters.get("from_date"):
        conditions.append("COALESCE(op.date, dp.date) >= %(from_date)s")
        values["from_date"] = filters.get("from_date")

    if filters.get("to_date"):
        conditions.append("COALESCE(op.date, dp.date) <= %(to_date)s")
        values["to_date"] = filters.get("to_date")

    if filters.get("company"):
        conditions.append("IFNULL(dp.company, '') = %(company)s")
        values["company"] = filters.get("company")

    if filters.get("customer"):
        conditions.append("IFNULL(dp.customer, '') LIKE %(customer)s")
        values["customer"] = f"%{filters.get('customer')}%"

    if filters.get("sales_order"):
        conditions.append(
            "(IFNULL(dp.sales_order, '') = %(sales_order)s OR IFNULL(op.sales_order, '') = %(sales_order)s)"
        )
        values["sales_order"] = filters.get("sales_order")

    if filters.get("item"):
        conditions.append("IFNULL(op.item, '') = %(item)s")
        values["item"] = filters.get("item")

    if filters.get("operation"):
        conditions.append("IFNULL(op.operations, '') = %(operation)s")
        values["operation"] = filters.get("operation")

    if filters.get("employee"):
        conditions.append("IFNULL(op.employee, '') LIKE %(employee)s")
        values["employee"] = f"%{filters.get('employee')}%"

    if frappe.utils.cint(filters.get("hide_zero_qty")):
        conditions.append("IFNULL(op.qty, 0) != 0")

    where_sql = " AND ".join(conditions)
    return frappe.db.sql(
        f"""
        SELECT
            dp.name AS daily_production,
            COALESCE(op.date, dp.date) AS work_date,
            dp.sales_order AS parent_sales_order,
            op.sales_order AS child_sales_order,
            dp.company,
            dp.customer,
            op.item,
            op.operations AS operation,
            op.employee,
            IFNULL(op.qty, 0) AS qty
        FROM `tabDaily Production` dp
        LEFT JOIN `tabOperation Process` op
            ON op.parent = dp.name
            AND op.parenttype = 'Daily Production'
            AND op.parentfield IN ('operations', 'operation_process')
        WHERE {where_sql}
        ORDER BY COALESCE(op.date, dp.date) DESC, dp.name DESC, op.idx ASC
        """,
        values,
        as_dict=True,
    )


def build_grouped_rows(rows, group_by):
    grouped = {}
    for row in rows:
        key = get_group_key(row, group_by)
        grouped.setdefault(key, []).append(row)

    output = []
    sorted_keys = sorted(grouped.keys(), key=lambda x: str(x or ""))
    for index, key in enumerate(sorted_keys):
        children = grouped[key]
        total_qty = sum(to_float(child.get("qty")) for child in children)

        output.append(
            {
                "group_or_date": key,
                "daily_production": "",
                "sales_order": "",
                "company": "",
                "customer": "",
                "item": "",
                "operation": "",
                "employee": "",
                "qty": total_qty,
                "indent": 0,
                "bold": 1,
            }
        )

        for child in children:
            detail = to_detail_row(child)
            detail["group_or_date"] = ""
            detail["indent"] = 1
            output.append(detail)

        if index < len(sorted_keys) - 1:
            output.append({"group_or_date": "", "qty": None})

    return output


def to_detail_row(row):
    sales_order = (row.get("parent_sales_order") or row.get("child_sales_order") or "").strip()
    return {
        "group_or_date": row.get("work_date"),
        "daily_production": row.get("daily_production"),
        "sales_order": sales_order,
        "company": row.get("company"),
        "customer": row.get("customer"),
        "item": row.get("item"),
        "operation": row.get("operation"),
        "employee": row.get("employee"),
        "qty": to_float(row.get("qty")),
    }


def get_group_key(row, group_by):
    if group_by == "Date":
        return frappe.format_value(row.get("work_date"), {"fieldtype": "Date"}) or "No Date"
    if group_by == "Sales Order":
        return (row.get("parent_sales_order") or row.get("child_sales_order") or "No Sales Order").strip()
    if group_by == "Item":
        return (row.get("item") or "No Item").strip()
    if group_by == "Operation":
        return (row.get("operation") or "No Operation").strip()
    if group_by == "Employee":
        return (row.get("employee") or "No Employee").strip()
    return "All"


def build_chart(rows):
    totals_by_date = {}
    for row in rows:
        date_value = row.get("work_date")
        if not date_value:
            continue
        label = frappe.format_value(date_value, {"fieldtype": "Date"})
        totals_by_date[label] = totals_by_date.get(label, 0) + to_float(row.get("qty"))

    if not totals_by_date:
        return None

    labels = sorted(totals_by_date.keys())
    values = [totals_by_date[label] for label in labels]
    return {
        "data": {
            "labels": labels,
            "datasets": [{"name": "Qty", "values": values}],
        },
        "type": "line",
        "fieldtype": "Float",
    }


def build_report_summary(rows):
    total_rows = len(rows)
    total_qty = sum(to_float(row.get("qty")) for row in rows)
    unique_sales_orders = {
        (row.get("parent_sales_order") or row.get("child_sales_order") or "").strip()
        for row in rows
        if (row.get("parent_sales_order") or row.get("child_sales_order"))
    }
    unique_items = {(row.get("item") or "").strip() for row in rows if row.get("item")}

    return [
        {
            "label": "Rows",
            "value": total_rows,
            "indicator": "Blue",
            "datatype": "Int",
        },
        {
            "label": "Total Qty",
            "value": total_qty,
            "indicator": "Green",
            "datatype": "Float",
        },
        {
            "label": "Sales Orders",
            "value": len(unique_sales_orders),
            "indicator": "Purple",
            "datatype": "Int",
        },
        {
            "label": "Items",
            "value": len(unique_items),
            "indicator": "Orange",
            "datatype": "Int",
        },
    ]


def to_float(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0
