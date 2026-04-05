import frappe


def execute(filters=None):
    filters = frappe._dict(filters or {})
    columns = get_columns(filters)
    data = get_data(filters)
    return columns, data


def get_columns(filters):
    group_by = (filters.get("group_by") or "Item Group").strip()
    if group_by not in ("Item Group", "Item", "Supplier"):
        group_by = "Item Group"

    first_col = {"label": group_by, "fieldname": "group_value", "fieldtype": "Data", "width": 220}
    if group_by == "Supplier":
        second_col = {"label": "Item Group", "fieldname": "second_value", "fieldtype": "Data", "width": 180}
        third_col = {"label": "Item Name", "fieldname": "third_value", "fieldtype": "Data", "width": 220}
    elif group_by == "Item":
        second_col = {"label": "Item Group", "fieldname": "second_value", "fieldtype": "Data", "width": 180}
        third_col = {"label": "Supplier Name", "fieldname": "third_value", "fieldtype": "Data", "width": 220}
    else:
        second_col = {"label": "Item Name", "fieldname": "second_value", "fieldtype": "Data", "width": 220}
        third_col = {"label": "Supplier Name", "fieldname": "third_value", "fieldtype": "Data", "width": 220}

    return [
        first_col,
        second_col,
        third_col,
        {"label": "PO Number", "fieldname": "po_number", "fieldtype": "Link", "options": "Purchase Order", "width": 170},
        {"label": "Date", "fieldname": "date", "fieldtype": "Date", "width": 110},
        {"label": "PO Qty", "fieldname": "po_qty", "fieldtype": "Float", "precision": 0, "width": 110},
        {"label": "Received Qty", "fieldname": "received_qty", "fieldtype": "Float", "precision": 0, "width": 120},
        {"label": "Pending Qty", "fieldname": "pending_qty", "fieldtype": "Float", "precision": 0, "width": 120},
    ]


def get_conditions(filters):
    conditions = ["po.docstatus = 1"]
    values = {}

    if filters.get("from_date"):
        conditions.append("po.transaction_date >= %(from_date)s")
        values["from_date"] = filters.get("from_date")

    if filters.get("to_date"):
        conditions.append("po.transaction_date <= %(to_date)s")
        values["to_date"] = filters.get("to_date")

    if filters.get("supplier"):
        conditions.append("po.supplier = %(supplier)s")
        values["supplier"] = filters.get("supplier")

    if filters.get("item_group"):
        conditions.append("IFNULL(i.item_group, 'Uncategorized') = %(item_group)s")
        values["item_group"] = filters.get("item_group")

    if filters.get("item_code"):
        conditions.append("poi.item_code = %(item_code)s")
        values["item_code"] = filters.get("item_code")

    return " AND ".join(conditions), values


def get_data(filters):
    group_by = (filters.get("group_by") or "Item Group").strip()
    if group_by not in ("Item Group", "Item", "Supplier"):
        group_by = "Item Group"

    where_sql, values = get_conditions(filters)
    detail_rows = frappe.db.sql(
        """
        SELECT
            po.name AS po_number,
            po.transaction_date AS date,
            IFNULL(po.supplier, 'Unknown Supplier') AS supplier,
            poi.item_code AS item_code,
            IFNULL(poi.item_name, poi.item_code) AS item_name,
            IFNULL(i.item_group, 'Uncategorized') AS item_group,
            IFNULL(poi.qty, 0) AS po_qty,
            IFNULL(poi.received_qty, 0) AS received_qty
        FROM `tabPurchase Order Item` poi
        INNER JOIN `tabPurchase Order` po ON po.name = poi.parent
        LEFT JOIN `tabItem` i ON i.name = poi.item_code
        WHERE {where_sql}
        ORDER BY po.transaction_date DESC, po.name DESC, poi.idx ASC
        """.format(where_sql=where_sql),
        values,
        as_dict=True,
    )

    grouped = {}
    for r in detail_rows:
        key = get_group_key(r, group_by)
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(r)

    out = []
    sorted_keys = sorted(grouped.keys())
    for idx, key in enumerate(sorted_keys):
        children = grouped.get(key) or []
        po_total = 0.0
        received_total = 0.0
        max_date = None
        for r in children:
            po_total += flt(r.get("po_qty"))
            received_total += flt(r.get("received_qty"))
            d = r.get("date")
            if d and (not max_date or d > max_date):
                max_date = d

        pending_total = po_total - received_total
        if pending_total < 0:
            pending_total = 0

        out.append(
            {
                "group_value": key,
                "second_value": "",
                "third_value": "",
                "po_number": "",
                "date": max_date,
                "po_qty": round(po_total, 0),
                "received_qty": round(received_total, 0),
                "pending_qty": round(pending_total, 0),
                "indent": 0,
                "bold": 1,
            }
        )

        for r in children:
            po_qty = flt(r.get("po_qty"))
            received_qty = flt(r.get("received_qty"))
            pending_qty = po_qty - received_qty
            if pending_qty < 0:
                pending_qty = 0
            out.append(
                {
                    "group_value": "",
                    "second_value": detail_second_value(r, group_by),
                    "third_value": detail_third_value(r, group_by),
                    "po_number": r.get("po_number"),
                    "date": r.get("date"),
                    "po_qty": round(po_qty, 0),
                    "received_qty": round(received_qty, 0),
                    "pending_qty": round(pending_qty, 0),
                    "indent": 1,
                }
            )

        # Keep visual empty row when group changes
        if idx < len(sorted_keys) - 1:
            out.append(
                {
                    "group_value": "",
                    "second_value": "",
                    "third_value": "",
                    "po_number": "",
                    "date": None,
                    "po_qty": None,
                    "received_qty": None,
                    "pending_qty": None,
                }
            )

    return out


def get_group_key(row, group_by):
    if group_by == "Item":
        return row.get("item_name") or row.get("item_code") or "Unknown Item"
    if group_by == "Supplier":
        return row.get("supplier") or "Unknown Supplier"
    return row.get("item_group") or "Uncategorized"


def detail_second_value(row, group_by):
    if group_by == "Supplier":
        return row.get("item_group")
    if group_by == "Item":
        return row.get("item_group")
    return row.get("item_name")


def detail_third_value(row, group_by):
    if group_by == "Supplier":
        return row.get("item_name")
    if group_by == "Item":
        return row.get("supplier")
    return row.get("supplier")


def flt(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0
