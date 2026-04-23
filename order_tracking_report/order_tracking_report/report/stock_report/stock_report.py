import frappe
import json
import re


GROUP_BY_OPTIONS = {"Item Group", "Variant"}


def execute(filters=None):
    filters = frappe._dict(filters or {})
    normalize_filters(filters)
    rows = get_rows(filters)
    attribute_columns = attach_attribute_columns(rows)
    data = build_grouped_data(rows, filters.get("group_by"), attribute_columns)
    return get_columns(attribute_columns), data


def normalize_filters(filters):
    group_by = (filters.get("group_by") or "Item Group").strip()
    if group_by not in GROUP_BY_OPTIONS:
        group_by = "Item Group"
    filters["group_by"] = group_by

    if filters.get("from_date") and filters.get("to_date") and filters.get("from_date") > filters.get("to_date"):
        filters["to_date"] = filters.get("from_date")


def get_columns(attribute_columns=None):
    attribute_columns = attribute_columns or []
    return [
        {"label": "Group", "fieldname": "group_value", "fieldtype": "Data", "width": 240},
        {"label": "Item Name", "fieldname": "item_name", "fieldtype": "Data", "width": 260},
        {"label": "Item Group", "fieldname": "item_group", "fieldtype": "Link", "options": "Item Group", "width": 180},
        {"label": "In Qty", "fieldname": "in_qty", "fieldtype": "Float", "precision": 1, "width": 120},
        {"label": "Out Qty", "fieldname": "out_qty", "fieldtype": "Float", "precision": 1, "width": 120},
        {"label": "Balance Qty", "fieldname": "balance_qty", "fieldtype": "Float", "precision": 1, "width": 130},
        {"label": "Amount", "fieldname": "amount", "fieldtype": "Currency", "width": 140},
        {"label": "Avg Rate", "fieldname": "avg_rate", "fieldtype": "Currency", "width": 120},
    ] + attribute_columns + [
        {"label": "Attributes", "fieldname": "attributes", "fieldtype": "Data", "width": 300},
    ]


def get_rows(filters):
    conditions = ["sle.is_cancelled = 0"]
    values = {}

    if filters.get("to_date"):
        values["to_date"] = filters.get("to_date")
        # Performance guard: nothing after closing date is needed.
        conditions.append("sle.posting_date <= %(to_date)s")

    if filters.get("from_date"):
        values["from_date"] = filters.get("from_date")

    if filters.get("warehouse"):
        conditions.append("sle.warehouse = %(warehouse)s")
        values["warehouse"] = filters.get("warehouse")

    if filters.get("company"):
        conditions.append("sle.company = %(company)s")
        values["company"] = filters.get("company")

    if filters.get("template_item"):
        conditions.append("(IFNULL(i.variant_of, '') = %(template_item)s OR i.name = %(template_item)s)")
        values["template_item"] = filters.get("template_item")

    if filters.get("variant"):
        conditions.append("i.name = %(variant)s")
        values["variant"] = filters.get("variant")

    if filters.get("attribute_name"):
        conditions.append(
            """
            EXISTS (
                SELECT 1
                FROM `tabItem Variant Attribute` iva_attr
                WHERE iva_attr.parent = i.name
                  AND LOWER(iva_attr.attribute) = LOWER(%(attribute_name)s)
            )
            """
        )
        values["attribute_name"] = filters.get("attribute_name")

    if filters.get("item_group"):
        conditions.append("IFNULL(i.item_group, '') = %(item_group)s")
        values["item_group"] = filters.get("item_group")

    if filters.get("item_code"):
        conditions.append("sle.item_code = %(item_code)s")
        values["item_code"] = filters.get("item_code")

    apply_dynamic_attribute_filters(filters, conditions, values)

    where_sql = " AND ".join(conditions)
    movement_window_sql = get_movement_window_sql(filters)
    closing_window_sql = "sle.posting_date <= %(to_date)s" if filters.get("to_date") else "1=1"

    rows = frappe.db.sql(
        f"""
        SELECT
            sle.item_code,
            IFNULL(i.item_name, sle.item_code) AS item_name,
            IFNULL(i.item_group, 'Uncategorized') AS item_group,
            IFNULL(i.variant_of, '') AS variant_of,
            SUM(CASE WHEN {movement_window_sql} AND IFNULL(sle.actual_qty, 0) > 0 THEN sle.actual_qty ELSE 0 END) AS in_qty,
            ABS(SUM(CASE WHEN {movement_window_sql} AND IFNULL(sle.actual_qty, 0) < 0 THEN sle.actual_qty ELSE 0 END)) AS out_qty,
            SUM(CASE WHEN {closing_window_sql} THEN IFNULL(sle.actual_qty, 0) ELSE 0 END) AS balance_qty,
            SUM(CASE WHEN {closing_window_sql} THEN IFNULL(sle.stock_value_difference, 0) ELSE 0 END) AS amount
        FROM `tabStock Ledger Entry` sle
        LEFT JOIN `tabItem` i ON i.name = sle.item_code
        WHERE {where_sql}
        GROUP BY sle.item_code, i.item_name, i.item_group, i.variant_of
        ORDER BY i.item_group ASC, i.variant_of ASC, i.item_name ASC
        """,
        values,
        as_dict=True,
    )
    apply_live_bin_balance(rows, filters)
    return rows


def get_movement_window_sql(filters):
    if filters.get("from_date") and filters.get("to_date"):
        return "sle.posting_date >= %(from_date)s AND sle.posting_date <= %(to_date)s"
    if filters.get("from_date"):
        return "sle.posting_date >= %(from_date)s"
    if filters.get("to_date"):
        return "sle.posting_date <= %(to_date)s"
    return "1=1"


def apply_dynamic_attribute_filters(filters, conditions, values):
    raw_map = filters.get("dynamic_attribute_map")
    if not raw_map:
        return
    try:
        attr_map = json.loads(raw_map) if isinstance(raw_map, str) else (raw_map or {})
    except Exception:
        attr_map = {}
    if not isinstance(attr_map, dict):
        return

    i = 0
    for fieldname, attr_name in attr_map.items():
        if not fieldname or not attr_name:
            continue
        filter_value = filters.get(fieldname)
        if not filter_value:
            continue
        i += 1
        attr_name_key = f"dyn_attr_name_{i}"
        attr_value_key = f"dyn_attr_val_{i}"
        conditions.append(
            f"""
            EXISTS (
                SELECT 1
                FROM `tabItem Variant Attribute` iva_dyn_{i}
                WHERE iva_dyn_{i}.parent = i.name
                  AND LOWER(iva_dyn_{i}.attribute) = LOWER(%({attr_name_key})s)
                  AND IFNULL(iva_dyn_{i}.attribute_value, '') LIKE %({attr_value_key})s
            )
            """
        )
        values[attr_name_key] = str(attr_name)
        values[attr_value_key] = f"%{filter_value}%"


def apply_live_bin_balance(rows, filters):
    if not rows:
        return
    balance_map = get_live_bin_balance_map(filters)
    for row in rows:
        item_code = row.get("item_code")
        if item_code in balance_map:
            row["balance_qty"] = flt(balance_map.get(item_code))


def get_live_bin_balance_map(filters):
    conditions = ["1=1"]
    values = {}

    if filters.get("warehouse"):
        conditions.append("b.warehouse = %(warehouse)s")
        values["warehouse"] = filters.get("warehouse")

    if filters.get("company"):
        conditions.append("IFNULL(w.company, '') = %(company)s")
        values["company"] = filters.get("company")

    if filters.get("template_item"):
        conditions.append("(IFNULL(i.variant_of, '') = %(template_item)s OR i.name = %(template_item)s)")
        values["template_item"] = filters.get("template_item")

    if filters.get("variant"):
        conditions.append("i.name = %(variant)s")
        values["variant"] = filters.get("variant")

    if filters.get("attribute_name"):
        conditions.append(
            """
            EXISTS (
                SELECT 1
                FROM `tabItem Variant Attribute` iva_attr
                WHERE iva_attr.parent = i.name
                  AND LOWER(iva_attr.attribute) = LOWER(%(attribute_name)s)
            )
            """
        )
        values["attribute_name"] = filters.get("attribute_name")

    if filters.get("item_group"):
        conditions.append("IFNULL(i.item_group, '') = %(item_group)s")
        values["item_group"] = filters.get("item_group")

    if filters.get("item_code"):
        conditions.append("b.item_code = %(item_code)s")
        values["item_code"] = filters.get("item_code")

    apply_dynamic_attribute_filters(filters, conditions, values)
    where_sql = " AND ".join(conditions)

    data = frappe.db.sql(
        f"""
        SELECT
            b.item_code,
            SUM(IFNULL(b.actual_qty, 0)) AS balance_qty
        FROM `tabBin` b
        LEFT JOIN `tabItem` i ON i.name = b.item_code
        LEFT JOIN `tabWarehouse` w ON w.name = b.warehouse
        WHERE {where_sql}
        GROUP BY b.item_code
        """,
        values,
        as_dict=True,
    )
    return {d.get("item_code"): flt(d.get("balance_qty")) for d in data}


def make_attr_fieldname(attribute_name):
    safe = re.sub(r"[^a-z0-9]+", "_", str(attribute_name or "").strip().lower()).strip("_")
    if not safe:
        safe = "attribute"
    return f"attr_{safe[:40]}"


def attach_attribute_columns(rows):
    item_codes = list({row.get("item_code") for row in rows if row.get("item_code")})
    if not item_codes:
        return []

    attr_rows = frappe.db.sql(
        """
        SELECT parent, attribute, attribute_value, idx
        FROM `tabItem Variant Attribute`
        WHERE parent IN %(item_codes)s
        ORDER BY parent ASC, idx ASC
        """,
        {"item_codes": item_codes},
        as_dict=True,
    )

    parent_values = {}
    parent_text = {}
    attribute_names = []
    seen_names = set()

    for ar in attr_rows:
        parent = ar.get("parent")
        attr_name = (ar.get("attribute") or "").strip()
        attr_val = ar.get("attribute_value") or ""
        if not parent or not attr_name:
            continue
        parent_values.setdefault(parent, {})
        parent_text.setdefault(parent, [])
        if attr_name not in parent_values[parent]:
            parent_values[parent][attr_name] = attr_val
        parent_text[parent].append(f"{attr_name}: {attr_val}")
        key = attr_name.lower()
        if key not in seen_names:
            seen_names.add(key)
            attribute_names.append(attr_name)

    field_map = {}
    used_fields = set()
    for attr_name in attribute_names:
        base = make_attr_fieldname(attr_name)
        fieldname = base
        n = 2
        while fieldname in used_fields:
            fieldname = f"{base}_{n}"
            n += 1
        used_fields.add(fieldname)
        field_map[attr_name] = fieldname

    for row in rows:
        item_code = row.get("item_code")
        values = parent_values.get(item_code, {})
        for attr_name in attribute_names:
            row[field_map[attr_name]] = values.get(attr_name, "")
        row["attributes"] = ", ".join(parent_text.get(item_code, []))

    columns = []
    for attr_name in attribute_names:
        columns.append(
            {
                "label": attr_name,
                "fieldname": field_map[attr_name],
                "fieldtype": "Data",
                "width": 170,
            }
        )
    return columns


def build_grouped_data(rows, group_by, attribute_columns=None):
    attribute_columns = attribute_columns or []
    attr_fields = [d.get("fieldname") for d in attribute_columns if d.get("fieldname")]
    grouped = {}
    for row in rows:
        row["avg_rate"] = flt(row.get("amount")) / flt(row.get("balance_qty")) if flt(row.get("balance_qty")) else 0
        if group_by == "Variant":
            key = row.get("variant_of") or "No Variant"
        else:
            key = row.get("item_group") or "Uncategorized"
        grouped.setdefault(key, []).append(row)

    output = []
    group_index = 0
    for key in sorted(grouped.keys(), key=lambda d: str(d or "")):
        children = grouped[key]
        in_total = sum(flt(d.get("in_qty")) for d in children)
        out_total = sum(flt(d.get("out_qty")) for d in children)
        bal_total = sum(flt(d.get("balance_qty")) for d in children)
        amount_total = sum(flt(d.get("amount")) for d in children)
        avg_rate = amount_total / bal_total if bal_total else 0
        group_index += 1
        group_id = f"group_{group_index}"

        output.append(
            {
                "group_value": str(key),
                "item_name": f"{group_by}: {key}",
                "attributes": "",
                "item_group": children[0].get("item_group") if group_by == "Variant" else key,
                "in_qty": round(in_total, 1),
                "out_qty": round(out_total, 1),
                "balance_qty": round(bal_total, 1),
                "amount": amount_total,
                "avg_rate": avg_rate,
                "indent": 0,
                "bold": 1,
                "is_group_row": 1,
                "_node": group_id,
                "_parent_node": "",
            }
        )
        for fieldname in attr_fields:
            output[-1][fieldname] = ""

        for idx, row in enumerate(children, start=1):
            child = {
                "group_value": f"{idx}",
                "item_name": row.get("item_name"),
                "attributes": row.get("attributes") or "",
                "item_group": row.get("item_group"),
                "in_qty": round(flt(row.get("in_qty")), 1),
                "out_qty": round(flt(row.get("out_qty")), 1),
                "balance_qty": round(flt(row.get("balance_qty")), 1),
                "amount": row.get("amount"),
                "avg_rate": row.get("avg_rate"),
                "indent": 1,
                "_node": f"{group_id}_child_{idx}",
                "_parent_node": group_id,
            }
            for fieldname in attr_fields:
                child[fieldname] = row.get(fieldname) or ""
            output.append(child)
    return output


def flt(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0
