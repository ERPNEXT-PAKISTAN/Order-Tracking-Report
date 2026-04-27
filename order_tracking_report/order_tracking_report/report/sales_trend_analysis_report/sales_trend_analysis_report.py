import frappe
from frappe.utils import getdate, today


GROUP_BY_OPTIONS = {
    "Sales Invoice": "source_document",
    "Sales Order": "source_document",
    "Delivery Note": "source_document",
    "Customer": "customer",
    "Item Group": "item_group",
    "Item": "item_name",
}

FIELD_LABELS = {
    "source_document": "Document",
    "customer": "Customer",
    "item_group": "Item Group",
    "item_name": "Item",
}
def execute(filters=None):
    filters = frappe._dict(filters or {})
    normalize_filters(filters)
    rows = get_rows(filters)
    time_columns = build_time_columns(filters, rows)
    columns = get_columns(filters, time_columns)
    data = build_tree_pivot_data(rows, filters, time_columns)
    return columns, data


def normalize_filters(filters):
    source_type = (filters.get("source_type") or "Sales Invoices").strip()
    if source_type not in ("Sales Orders", "Delivery Notes", "Sales Invoices"):
        source_type = "Sales Invoices"
    filters["source_type"] = source_type

    group_default = source_label_for_source_type(source_type)
    group_by = (filters.get("group_by") or group_default).strip()
    if group_by not in GROUP_BY_OPTIONS:
        group_by = group_default
    filters["group_by"] = group_by

    period = (filters.get("period") or "Monthly").strip()
    if period not in ("Daily", "Monthly", "Quarterly", "Yearly"):
        period = "Monthly"
    filters["period"] = period

    show_by = (filters.get("show_by") or "Qty").strip()
    if show_by not in ("Qty", "Amount"):
        show_by = "Qty"
    filters["show_by"] = show_by

    if filters.get("from_date") and filters.get("to_date") and filters.get("from_date") > filters.get("to_date"):
        filters["to_date"] = filters.get("from_date")


def get_columns(filters, time_columns):
    value_fieldtype = "Currency" if filters.get("show_by") == "Amount" else "Float"
    columns = [
        {"label": "Group", "fieldname": "group_value", "fieldtype": "Data", "width": 460},
    ]
    for col in time_columns:
        columns.append(
            {
                "label": col["label"],
                "fieldname": col["fieldname"],
                "fieldtype": value_fieldtype,
                "width": 100,
                "precision": 1 if value_fieldtype == "Float" else None,
            }
        )
    columns.append(
        {
            "label": "Total",
            "fieldname": "total_value",
            "fieldtype": value_fieldtype,
            "width": 130,
            "precision": 1 if value_fieldtype == "Float" else None,
        }
    )
    return columns


def get_rows(filters):
    source = get_source_config(filters.get("source_type"))
    parent_alias = source["parent_alias"]
    child_alias = source["child_alias"]
    item_alias = source["item_alias"]

    conditions = [f"{parent_alias}.docstatus = 1"]
    values = {}

    if filters.get("from_date"):
        conditions.append(f"{parent_alias}.{source['date_field']} >= %(from_date)s")
        values["from_date"] = filters.get("from_date")
    if filters.get("to_date"):
        conditions.append(f"{parent_alias}.{source['date_field']} <= %(to_date)s")
        values["to_date"] = filters.get("to_date")
    if filters.get("company"):
        conditions.append(f"{parent_alias}.company = %(company)s")
        values["company"] = filters.get("company")
    if filters.get("customer"):
        conditions.append(f"{parent_alias}.customer = %(customer)s")
        values["customer"] = filters.get("customer")
    if filters.get("item_group"):
        conditions.append(f"IFNULL({item_alias}.item_group, '') = %(item_group)s")
        values["item_group"] = filters.get("item_group")
    if filters.get("item_code"):
        conditions.append(f"{child_alias}.item_code = %(item_code)s")
        values["item_code"] = filters.get("item_code")
    if filters.get("source_document"):
        conditions.append(f"{parent_alias}.name = %(source_document)s")
        values["source_document"] = filters.get("source_document")

    where_sql = " AND ".join(conditions)
    return frappe.db.sql(
        f"""
        SELECT
            {parent_alias}.name AS source_document,
            {parent_alias}.{source['date_field']} AS date,
            {parent_alias}.customer AS customer,
            IFNULL({item_alias}.item_group, 'Uncategorized') AS item_group,
            IFNULL({child_alias}.item_name, {child_alias}.item_code) AS item_name,
            IFNULL({child_alias}.qty, 0) AS qty,
            {source['amount_expr']} AS amount
        FROM `{source['child_table']}` {child_alias}
        INNER JOIN `{source['parent_table']}` {parent_alias} ON {parent_alias}.name = {child_alias}.parent
        LEFT JOIN `tabItem` {item_alias} ON {item_alias}.name = {child_alias}.item_code
        WHERE {where_sql}
        ORDER BY {parent_alias}.{source['date_field']} DESC, {parent_alias}.name DESC, {child_alias}.idx ASC
        """,
        values,
        as_dict=True,
    )


def get_source_config(source_type):
    if source_type == "Sales Orders":
        return {
            "parent_table": "tabSales Order",
            "child_table": "tabSales Order Item",
            "parent_alias": "sd",
            "child_alias": "sdi",
            "item_alias": "it",
            "date_field": "transaction_date",
            "amount_expr": "IFNULL(sdi.base_amount, IFNULL(sdi.amount, 0))",
        }
    if source_type == "Delivery Notes":
        return {
            "parent_table": "tabDelivery Note",
            "child_table": "tabDelivery Note Item",
            "parent_alias": "sd",
            "child_alias": "sdi",
            "item_alias": "it",
            "date_field": "posting_date",
            "amount_expr": "IFNULL(sdi.base_amount, IFNULL(sdi.amount, 0))",
        }
    return {
        "parent_table": "tabSales Invoice",
        "child_table": "tabSales Invoice Item",
        "parent_alias": "sd",
        "child_alias": "sdi",
        "item_alias": "it",
        "date_field": "posting_date",
        "amount_expr": "IFNULL(sdi.base_net_amount, IFNULL(sdi.base_amount, IFNULL(sdi.amount, 0)))",
    }


def source_label_for_source_type(source_type):
    if source_type == "Sales Orders":
        return "Sales Order"
    if source_type == "Delivery Notes":
        return "Delivery Note"
    return "Sales Invoice"


def build_time_columns(filters, rows):
    period = filters.get("period")
    from_date, to_date = get_date_range(filters, rows)

    if period == "Daily":
        return [{"fieldname": f"d_{d:02d}", "label": str(d), "kind": "daily", "day": d} for d in range(1, 32)]

    if period == "Monthly":
        out = []
        cursor = from_date.replace(day=1)
        end = to_date.replace(day=1)
        while cursor <= end:
            out.append(
                {
                    "fieldname": f"m_{cursor.year}_{cursor.month:02d}",
                    "label": cursor.strftime("%b-%Y"),
                    "kind": "monthly",
                    "year": cursor.year,
                    "month": cursor.month,
                }
            )
            if cursor.month == 12:
                cursor = cursor.replace(year=cursor.year + 1, month=1)
            else:
                cursor = cursor.replace(month=cursor.month + 1)
        return out

    if period == "Quarterly":
        out = []
        start_q = ((from_date.month - 1) // 3) + 1
        end_q = ((to_date.month - 1) // 3) + 1
        year = from_date.year
        q = start_q
        while (year < to_date.year) or (year == to_date.year and q <= end_q):
            out.append(
                {
                    "fieldname": f"q_{year}_{q}",
                    "label": f"Qtr-{q}-{year}",
                    "kind": "quarterly",
                    "year": year,
                    "quarter": q,
                }
            )
            q += 1
            if q > 4:
                q = 1
                year += 1
        return out

    return [
        {"fieldname": f"y_{year}", "label": str(year), "kind": "yearly", "year": year}
        for year in range(from_date.year, to_date.year + 1)
    ]


def get_date_range(filters, rows):
    if filters.get("from_date"):
        from_date = getdate(filters.get("from_date"))
    else:
        all_dates = [getdate(d.get("date")) for d in rows or [] if d.get("date")]
        from_date = min(all_dates) if all_dates else getdate(today())

    if filters.get("to_date"):
        to_date = getdate(filters.get("to_date"))
    else:
        all_dates = [getdate(d.get("date")) for d in rows or [] if d.get("date")]
        to_date = max(all_dates) if all_dates else from_date

    if from_date > to_date:
        to_date = from_date
    return from_date, to_date


def get_period_fieldname(dt, period):
    if period == "Daily":
        return f"d_{dt.day:02d}"
    if period == "Monthly":
        return f"m_{dt.year}_{dt.month:02d}"
    if period == "Quarterly":
        quarter = ((dt.month - 1) // 3) + 1
        return f"q_{dt.year}_{quarter}"
    return f"y_{dt.year}"


def get_hierarchy_order(group_by):
    base = ["source_document", "customer", "item_group", "item_name"]
    top = GROUP_BY_OPTIONS.get(group_by, "source_document")
    out = [top]
    for field in base:
        if field not in out:
            out.append(field)
    return out


def make_empty_value_row(bucket_fields):
    row = {"total_value": 0.0}
    for bf in bucket_fields:
        row[bf] = 0.0
    return row


def add_value_to_row(target_row, bucket_field, value):
    if bucket_field in target_row:
        target_row[bucket_field] = flt(target_row.get(bucket_field)) + value
        target_row["total_value"] = flt(target_row.get("total_value")) + value


def build_tree_pivot_data(rows, filters, time_columns):
    period = filters.get("period")
    value_field = "amount" if filters.get("show_by") == "Amount" else "qty"
    hierarchy_fields = get_hierarchy_order(filters.get("group_by"))
    bucket_fields = [c["fieldname"] for c in time_columns]

    node_map = {}
    root_paths = []

    for src in rows or []:
        dt = getdate(src.get("date")) if src.get("date") else None
        if not dt:
            continue
        bucket_field = get_period_fieldname(dt, period)
        val = flt(src.get(value_field))
        if not val:
            continue

        parent_path = ""
        for field in hierarchy_fields:
            label = (src.get(field) or "Unknown")
            path = f"{parent_path}|{field}:{label}" if parent_path else f"{field}:{label}"
            if path not in node_map:
                parent_dims = node_map[parent_path]["_dims"] if parent_path else {}
                dims = dict(parent_dims)
                dims[field] = label
                node_map[path] = {
                    "_node": path,
                    "_parent_node": parent_path,
                    "group_value": label,
                    "_field": field,
                    "_dims": dims,
                    "_children": [],
                    **make_empty_value_row(bucket_fields),
                }
                if parent_path:
                    node_map[parent_path]["_children"].append(path)
                else:
                    root_paths.append(path)
            add_value_to_row(node_map[path], bucket_field, val)
            parent_path = path

    for node in node_map.values():
        for bf in bucket_fields:
            node[bf] = round(flt(node.get(bf)), 1)
        node["total_value"] = round(flt(node.get("total_value")), 1)

    out = []

    def walk(path):
        node = node_map[path]
        has_children = bool(node.get("_children"))
        out.append(
            {
                "group_value": node["group_value"],
                "_field": node.get("_field"),
                "_level": max(len(str(node["_node"]).split("|")) - 1, 0),
                "is_group_row": 1 if has_children else 0,
                "_node": node["_node"],
                "_parent_node": node["_parent_node"],
                **{bf: node.get(bf) for bf in bucket_fields},
                "total_value": node.get("total_value"),
            }
        )
        children = sorted(node.get("_children") or [], key=lambda p: (node_map[p].get("_field", ""), node_map[p].get("group_value", "")))
        for child in children:
            walk(child)

    for root in sorted(root_paths, key=lambda p: node_map[p].get("group_value", "")):
        walk(root)

    return out


def flt(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0
