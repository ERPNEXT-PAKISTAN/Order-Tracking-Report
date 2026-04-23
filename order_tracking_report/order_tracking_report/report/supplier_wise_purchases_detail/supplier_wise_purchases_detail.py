import frappe
import json
import re


GROUP_BY_OPTIONS = {
    "Supplier": "supplier",
    "Document Type": "document_type",
    "Item Group": "item_group",
    "Item": "item_name",
}


def execute(filters=None):
    filters = frappe._dict(filters or {})
    normalize_filters(filters)
    rows = get_rows(filters)
    attribute_columns = attach_attribute_columns(rows)
    data = build_grouped_data(rows, filters.get("group_by"), attribute_columns)
    return get_columns(attribute_columns), data


def normalize_filters(filters):
    group_by = (filters.get("group_by") or "Supplier").strip()
    if group_by not in GROUP_BY_OPTIONS:
        group_by = "Supplier"
    filters["group_by"] = group_by

    if filters.get("from_date") and filters.get("to_date") and filters.get("from_date") > filters.get("to_date"):
        filters["to_date"] = filters.get("from_date")


def get_columns(attribute_columns=None):
    attribute_columns = attribute_columns or []
    return [
        {"label": "Group (Click Arrow)", "fieldname": "group_value", "fieldtype": "Data", "width": 250},
        {"label": "Date", "fieldname": "date", "fieldtype": "Date", "width": 110},
        {"label": "Supplier", "fieldname": "supplier", "fieldtype": "Link", "options": "Supplier", "width": 200},
        {"label": "Item", "fieldname": "item_name", "fieldtype": "Data", "width": 240},
        {"label": "Item Group", "fieldname": "item_group", "fieldtype": "Link", "options": "Item Group", "width": 160},
        {"label": "Qty", "fieldname": "qty", "fieldtype": "Float", "precision": 2, "width": 120},
        {"label": "Rate", "fieldname": "rate", "fieldtype": "Currency", "width": 130},
        {"label": "Amount", "fieldname": "amount", "fieldtype": "Currency", "width": 140},
        {"label": "Status", "fieldname": "status", "fieldtype": "Data", "width": 130},
        {"label": "Document", "fieldname": "document_no", "fieldtype": "Dynamic Link", "options": "document_type", "width": 190},
        {"label": "Warehouse", "fieldname": "warehouse", "fieldtype": "Link", "options": "Warehouse", "width": 190},
        {"label": "Document Type", "fieldname": "document_type", "fieldtype": "Data", "width": 140},
    ] + attribute_columns + [
        {"label": "Attributes", "fieldname": "attributes", "fieldtype": "Data", "width": 300},
    ]


def get_rows(filters):
    values = {}

    common_conditions = []
    if filters.get("company"):
        common_conditions.append("d.company = %(company)s")
        values["company"] = filters.get("company")
    if filters.get("supplier"):
        common_conditions.append("d.supplier = %(supplier)s")
        values["supplier"] = filters.get("supplier")
    if filters.get("from_date"):
        values["from_date"] = filters.get("from_date")
    if filters.get("to_date"):
        values["to_date"] = filters.get("to_date")
    if filters.get("item_group"):
        common_conditions.append("IFNULL(i.item_group, '') = %(item_group)s")
        values["item_group"] = filters.get("item_group")
    if filters.get("item_code"):
        common_conditions.append("x.item_code = %(item_code)s")
        values["item_code"] = filters.get("item_code")
    if filters.get("warehouse"):
        common_conditions.append("IFNULL(x.warehouse, '') = %(warehouse)s")
        values["warehouse"] = filters.get("warehouse")
    if filters.get("template_item"):
        common_conditions.append("(IFNULL(i.variant_of, '') = %(template_item)s OR i.name = %(template_item)s)")
        values["template_item"] = filters.get("template_item")
    if filters.get("attribute_name"):
        common_conditions.append(
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
    if filters.get("variant"):
        common_conditions.append("i.name = %(variant)s")
        values["variant"] = filters.get("variant")
    apply_dynamic_attribute_filters(filters, common_conditions, values)

    docstatus_filter = (filters.get("docstatus") or "Submitted").strip()
    if docstatus_filter == "Submitted":
        common_conditions.append("d.docstatus = 1")
    elif docstatus_filter == "Draft":
        common_conditions.append("d.docstatus = 0")
    elif docstatus_filter == "Cancelled":
        common_conditions.append("d.docstatus = 2")

    doctype_filter = (filters.get("purchase_document") or "").strip()

    parts = []
    if not doctype_filter or doctype_filter == "Purchase Order":
        parts.append(
            _query_part(
                "Purchase Order",
                "tabPurchase Order",
                "tabPurchase Order Item",
                "transaction_date",
                common_conditions,
                filters,
            )
        )
    if not doctype_filter or doctype_filter == "Purchase Receipt":
        parts.append(
            _query_part(
                "Purchase Receipt",
                "tabPurchase Receipt",
                "tabPurchase Receipt Item",
                "posting_date",
                common_conditions,
                filters,
            )
        )
    if not doctype_filter or doctype_filter == "Purchase Invoice":
        parts.append(
            _query_part(
                "Purchase Invoice",
                "tabPurchase Invoice",
                "tabPurchase Invoice Item",
                "posting_date",
                common_conditions,
                filters,
            )
        )

    if not parts:
        return []

    sql = "\nUNION ALL\n".join(parts) + "\nORDER BY date DESC, document_type ASC, document_no DESC, item_name ASC"
    return frappe.db.sql(sql, values, as_dict=True)


def _query_part(document_type, parent_table, child_table, date_field, conditions, filters):
    where = ["d.name = x.parent", "x.item_code = i.name", f"d.{date_field} IS NOT NULL"]
    where.extend(conditions)
    if filters.get("from_date"):
        where.append(f"d.{date_field} >= %(from_date)s")
    if filters.get("to_date"):
        where.append(f"d.{date_field} <= %(to_date)s")
    return f"""
        SELECT
            '{document_type}' AS document_type,
            d.name AS document_no,
            d.{date_field} AS date,
            IFNULL(d.supplier, '') AS supplier,
            IFNULL(d.status, '') AS status,
            IFNULL(x.item_code, '') AS item_code,
            IFNULL(i.item_group, 'Uncategorized') AS item_group,
            IFNULL(x.item_name, x.item_code) AS item_name,
            IFNULL(x.warehouse, '') AS warehouse,
            IFNULL(x.qty, 0) AS qty,
            IFNULL(x.rate, 0) AS rate,
            IFNULL(x.amount, 0) AS amount
        FROM `{parent_table}` d, `{child_table}` x, `tabItem` i
        WHERE {" AND ".join(where)}
    """


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
    group_field = GROUP_BY_OPTIONS.get(group_by, "supplier")
    grouped = {}

    for row in rows:
        key = (row.get(group_field) or "Unknown").strip() if isinstance(row.get(group_field), str) else (row.get(group_field) or "Unknown")
        grouped.setdefault(str(key), []).append(row)

    output = []
    group_index = 0

    for group_key in sorted(grouped.keys(), key=lambda d: str(d or "")):
        children = grouped[group_key]
        qty_total = sum(flt(x.get("qty")) for x in children)
        amount_total = sum(flt(x.get("amount")) for x in children)
        avg_rate = amount_total / qty_total if qty_total else 0
        latest_date = max((x.get("date") for x in children if x.get("date")), default=None)
        group_index += 1
        group_id = f"group_{group_index}"

        output.append(
            {
                "group_value": str(group_key),
                "date": latest_date,
                "document_type": "",
                "document_no": "",
                "supplier": group_key if group_field == "supplier" else "",
                "item_code": "",
                "item_group": group_key if group_field == "item_group" else "",
                "item_name": group_key if group_field == "item_name" else "",
                "attributes": "",
                "warehouse": "",
                "status": f"Summary ({len(children)})",
                "qty": round(qty_total, 2),
                "rate": avg_rate,
                "amount": amount_total,
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
                "group_value": str(idx),
                "date": row.get("date"),
                "document_type": row.get("document_type"),
                "document_no": row.get("document_no"),
                "supplier": row.get("supplier"),
                "item_code": row.get("item_code"),
                "item_group": row.get("item_group"),
                "item_name": row.get("item_name"),
                "attributes": row.get("attributes") or "",
                "warehouse": row.get("warehouse"),
                "status": row.get("status"),
                "qty": round(flt(row.get("qty")), 2),
                "rate": flt(row.get("rate")),
                "amount": flt(row.get("amount")),
                "indent": 1,
                "_node": f"{group_id}_{idx}",
                "_parent_node": group_id,
            }
            for fieldname in attr_fields:
                child[fieldname] = row.get(fieldname) or ""
            output.append(child)

    return output


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


def flt(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0
