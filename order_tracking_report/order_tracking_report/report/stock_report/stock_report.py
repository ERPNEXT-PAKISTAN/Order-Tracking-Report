import frappe


GROUP_BY_OPTIONS = {"Item Group", "Variant"}


def execute(filters=None):
    filters = frappe._dict(filters or {})
    normalize_filters(filters)
    rows = get_rows(filters)
    data = build_grouped_data(rows, filters.get("group_by"))
    return get_columns(), data


def normalize_filters(filters):
    group_by = (filters.get("group_by") or "Item Group").strip()
    if group_by not in GROUP_BY_OPTIONS:
        group_by = "Item Group"
    filters["group_by"] = group_by

    if filters.get("from_date") and filters.get("to_date") and filters.get("from_date") > filters.get("to_date"):
        filters["to_date"] = filters.get("from_date")


def get_columns():
    return [
        {"label": "Group", "fieldname": "group_value", "fieldtype": "Data", "width": 240},
        {"label": "Item Name", "fieldname": "item_name", "fieldtype": "Data", "width": 260},
        {"label": "Item Group", "fieldname": "item_group", "fieldtype": "Link", "options": "Item Group", "width": 180},
        {"label": "In Qty", "fieldname": "in_qty", "fieldtype": "Float", "precision": 1, "width": 120},
        {"label": "Out Qty", "fieldname": "out_qty", "fieldtype": "Float", "precision": 1, "width": 120},
        {"label": "Balance Qty", "fieldname": "balance_qty", "fieldtype": "Float", "precision": 1, "width": 130},
        {"label": "Amount", "fieldname": "amount", "fieldtype": "Currency", "width": 140},
        {"label": "Avg Rate", "fieldname": "avg_rate", "fieldtype": "Currency", "width": 120},
    ]


def get_rows(filters):
    conditions = ["sle.is_cancelled = 0"]
    values = {}

    if filters.get("from_date"):
        conditions.append("sle.posting_date >= %(from_date)s")
        values["from_date"] = filters.get("from_date")

    if filters.get("to_date"):
        conditions.append("sle.posting_date <= %(to_date)s")
        values["to_date"] = filters.get("to_date")

    if filters.get("warehouse"):
        conditions.append("sle.warehouse = %(warehouse)s")
        values["warehouse"] = filters.get("warehouse")

    if filters.get("company"):
        conditions.append("sle.company = %(company)s")
        values["company"] = filters.get("company")

    if filters.get("variant"):
        conditions.append("IFNULL(i.variant_of, '') = %(variant)s")
        values["variant"] = filters.get("variant")

    if filters.get("item_group"):
        conditions.append("IFNULL(i.item_group, '') = %(item_group)s")
        values["item_group"] = filters.get("item_group")

    if filters.get("item_code"):
        conditions.append("sle.item_code = %(item_code)s")
        values["item_code"] = filters.get("item_code")

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

    where_sql = " AND ".join(conditions)

    return frappe.db.sql(
        f"""
        SELECT
            sle.item_code,
            IFNULL(i.item_name, sle.item_code) AS item_name,
            IFNULL(i.item_group, 'Uncategorized') AS item_group,
            IFNULL(i.variant_of, '') AS variant_of,
            SUM(CASE WHEN IFNULL(sle.actual_qty, 0) > 0 THEN sle.actual_qty ELSE 0 END) AS in_qty,
            ABS(SUM(CASE WHEN IFNULL(sle.actual_qty, 0) < 0 THEN sle.actual_qty ELSE 0 END)) AS out_qty,
            SUM(IFNULL(sle.actual_qty, 0)) AS balance_qty,
            SUM(IFNULL(sle.stock_value_difference, 0)) AS amount
        FROM `tabStock Ledger Entry` sle
        LEFT JOIN `tabItem` i ON i.name = sle.item_code
        WHERE {where_sql}
        GROUP BY sle.item_code, i.item_name, i.item_group, i.variant_of
        ORDER BY i.item_group ASC, i.variant_of ASC, i.item_name ASC
        """,
        values,
        as_dict=True,
    )


def build_grouped_data(rows, group_by):
    grouped = {}
    for row in rows:
        row["avg_rate"] = flt(row.get("amount")) / flt(row.get("balance_qty")) if flt(row.get("balance_qty")) else 0
        if group_by == "Variant":
            key = row.get("variant_of") or "No Variant"
        else:
            key = row.get("item_group") or "Uncategorized"
        grouped.setdefault(key, []).append(row)

    output = []
    child_rows = []
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

        for idx, row in enumerate(children, start=1):
            child_rows.append(
                {
                    "group_value": f"{idx}",
                    "item_name": row.get("item_name"),
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
            )

    output.extend(child_rows)
    return output


def flt(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0
