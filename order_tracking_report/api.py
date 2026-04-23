import json
import re

import frappe

from .so_detail_status_backend import run as run_detail_status


def _load_fixture_records(filename):
    fixture_path = frappe.get_app_path("order_tracking_report", "fixtures", filename)
    with open(fixture_path, encoding="utf-8") as fixture_file:
        return json.load(fixture_file)


def _get_custom_html_block_from_fixtures(block_name):
    data = _load_fixture_records("custom_html_block.json")

    for row in data:
        if row.get("name") == block_name:
            return row

    return None


def _get_web_page_from_fixtures(page_name):
    data = _load_fixture_records("web_page.json")

    for row in data:
        if row.get("name") == page_name:
            return row

    return None


def _extract_fixture_html_payload(document_html):
    document_html = document_html or ""
    styles = "\n\n".join(re.findall(r"(?is)<style\b[^>]*>(.*?)</style>", document_html))
    script = "\n\n".join(re.findall(r"(?is)<script\b[^>]*>(.*?)</script>", document_html))
    body_match = re.search(r"(?is)<body[^>]*>(.*)</body>", document_html)
    body_html = body_match.group(1) if body_match else document_html
    body_html = re.sub(r"(?is)<script\b[^>]*>.*?</script>", "", body_html)
    body_html = re.sub(r"(?is)<style\b[^>]*>.*?</style>", "", body_html)
    body_html = re.sub(r"(?is)^.*?<body[^>]*>", "", body_html)
    body_html = re.sub(r"(?is)</body>.*$", "", body_html)
    return {
        "html": body_html.strip(),
        "styles": styles.strip(),
        "script": script.strip(),
    }


def _rewrite_web_page_script(page_name, script):
    if page_name == "finanicals":
        script = script.replace(
            "/api/method/fin_gold_rate_api",
            "/api/method/order_tracking_report.api.fin_gold_rate_api",
        )
    return script


def _escape_like_pattern(value):
    return re.sub(r"[^A-Za-z0-9]+", " ", (value or "").strip()).strip().lower()


def _get_sales_orders_from_delivery_note(delivery_note):
    rows = frappe.db.sql(
        """
        SELECT DISTINCT against_sales_order
        FROM `tabDelivery Note Item`
        WHERE parent = %(delivery_note)s
            AND IFNULL(against_sales_order, '') != ''
        ORDER BY against_sales_order
        """,
        {"delivery_note": delivery_note},
        as_dict=True,
    )
    return [row.get("against_sales_order") for row in rows if row.get("against_sales_order")]


def _resolve_sales_order_from_delivery_note(delivery_note, preferred_sales_order=None):
    so_names = _get_sales_orders_from_delivery_note(delivery_note)
    if not so_names:
        return ""
    preferred_sales_order = (preferred_sales_order or "").strip()
    if preferred_sales_order and preferred_sales_order in so_names:
        return preferred_sales_order
    return so_names[0]


def _get_delivery_note_items(delivery_note):
    return frappe.db.sql(
        """
        SELECT item_code, qty, rate, amount, against_sales_order
        FROM `tabDelivery Note Item`
        WHERE parent = %(delivery_note)s
        ORDER BY idx
        """,
        {"delivery_note": delivery_note},
        as_dict=True,
    )


def _aggregate_qty_by_item(rows):
    qty_by_item = {}
    for row in rows or []:
        item_code = (row.get("item_code") or "").strip()
        if not item_code:
            continue
        qty_by_item[item_code] = qty_by_item.get(item_code, 0) + frappe.utils.flt(row.get("qty"))
    return qty_by_item


@frappe.whitelist()
def get_sales_order_items_for_daily_production(sales_order=None, item_group=None):
    sales_order = (sales_order or "").strip()
    item_group = (item_group or "").strip()
    if not sales_order:
        frappe.throw("Sales Order is required")

    if not frappe.db.exists("Sales Order", sales_order):
        frappe.throw("Sales Order not found")

    if item_group:
        rows = frappe.db.sql(
            """
            SELECT soi.name, soi.item_code
            FROM `tabSales Order Item` soi
            INNER JOIN `tabItem` item ON item.name = soi.item_code
            WHERE
                soi.parent = %(sales_order)s
                AND soi.parenttype = 'Sales Order'
                AND item.item_group = %(item_group)s
            ORDER BY soi.idx ASC
            """,
            {"sales_order": sales_order, "item_group": item_group},
            as_dict=True,
        )
    else:
        rows = frappe.get_all(
            "Sales Order Item",
            filters={"parent": sales_order, "parenttype": "Sales Order"},
            fields=["name", "item_code"],
            order_by="idx asc",
        )

    return [
        {
            "sales_order_item": row.get("name") or "",
            "item_code": row.get("item_code") or "",
        }
        for row in rows
    ]


def _flatten_bom_rows(tree, selected_qty_by_item=None):
    rows = []
    selected_qty_by_item = selected_qty_by_item or {}
    for item_row in tree or []:
        item_code = (item_row.get("item_code") or "").strip()
        order_qty = frappe.utils.flt(item_row.get("order_qty"))
        selected_qty = selected_qty_by_item.get(item_code)
        if selected_qty_by_item:
            if not selected_qty:
                continue
            scale_ratio = (selected_qty / order_qty) if order_qty else 0
            shown_order_qty = selected_qty
        else:
            scale_ratio = 1
            shown_order_qty = order_qty

        for bom_row in item_row.get("boms") or []:
            for material_row in bom_row.get("raw_materials") or []:
                rows.append(
                    {
                        "item_code": item_code,
                        "order_qty": shown_order_qty,
                        "bom": bom_row.get("bom") or "",
                        "material_item_code": material_row.get("item_code") or "",
                        "required_qty": frappe.utils.flt(material_row.get("required_qty")) * scale_ratio,
                        "stock_qty": frappe.utils.flt(material_row.get("stock_qty")),
                        "shortage_qty": frappe.utils.flt(material_row.get("shortage_qty")) * scale_ratio,
                    }
                )
    return rows


def _flatten_work_order_consumption_rows(sales_orders, selected_qty_by_item=None, order_qty_by_item=None):
    sales_orders = [
        (so or "").strip()
        for so in (sales_orders or [])
        if (so or "").strip()
    ]
    if not sales_orders:
        return []

    selected_qty_by_item = selected_qty_by_item or {}
    order_qty_by_item = order_qty_by_item or {}

    rows = frappe.db.sql(
        """
        SELECT
            wo.sales_order,
            wo.production_item AS item_code,
            woi.item_code AS material_item_code,
            SUM(IFNULL(woi.consumed_qty, 0)) AS consumed_qty
        FROM `tabWork Order` wo
        JOIN `tabWork Order Item` woi ON woi.parent = wo.name
        WHERE
            wo.docstatus < 2
            AND LOWER(IFNULL(wo.status, '')) != 'cancelled'
            AND wo.sales_order IN %(sales_orders)s
            AND IFNULL(woi.item_code, '') != ''
        GROUP BY wo.sales_order, wo.production_item, woi.item_code
        ORDER BY wo.production_item, woi.item_code
        """,
        {"sales_orders": tuple(sales_orders)},
        as_dict=True,
    )

    out = []
    for row in rows or []:
        item_code = (row.get("item_code") or "").strip()
        material_item_code = (row.get("material_item_code") or "").strip()
        if not item_code or not material_item_code:
            continue

        consumed_qty = frappe.utils.flt(row.get("consumed_qty"))
        if consumed_qty <= 0:
            continue

        scale_ratio = 1
        shown_order_qty = frappe.utils.flt(order_qty_by_item.get(item_code))
        if selected_qty_by_item:
            selected_qty = frappe.utils.flt(selected_qty_by_item.get(item_code))
            if selected_qty <= 0:
                continue
            order_qty = frappe.utils.flt(order_qty_by_item.get(item_code))
            scale_ratio = (selected_qty / order_qty) if order_qty else 0
            shown_order_qty = selected_qty

        required_qty = consumed_qty * scale_ratio

        out.append(
            {
                "item_code": item_code,
                "order_qty": shown_order_qty,
                "bom": "",
                "material_item_code": material_item_code,
                "required_qty": required_qty,
                "stock_qty": 0,
                "shortage_qty": 0,
            }
        )

    return out


def _get_last_purchase_rate_map(item_codes, company=None):
    clean_codes = sorted({(code or "").strip() for code in item_codes or [] if (code or "").strip()})
    if not clean_codes:
        return {}

    conditions = ["po.docstatus = 1", "poi.item_code IN %(item_codes)s"]
    values = {"item_codes": tuple(clean_codes)}
    if company:
        conditions.append("po.company = %(company)s")
        values["company"] = company

    rows = frappe.db.sql(
        """
        SELECT poi.item_code, poi.rate
        FROM `tabPurchase Order Item` poi
        JOIN `tabPurchase Order` po ON po.name = poi.parent
        WHERE {where_clause}
        ORDER BY poi.item_code ASC, po.transaction_date DESC, poi.modified DESC
        """.format(where_clause=" AND ".join(conditions)),
        values=values,
        as_dict=True,
    )

    out = {}
    for row in rows:
        item_code = (row.get("item_code") or "").strip()
        if not item_code or item_code in out:
            continue
        out[item_code] = frappe.utils.flt(row.get("rate"))
    return out


def _compute_selected_profit(order_profit_rows, selected_items):
    lookup = {}
    for row in order_profit_rows or []:
        item_code = (row.get("item_code") or "").strip()
        if item_code:
            sales_order = (row.get("sales_order") or "").strip()
            if sales_order:
                lookup[(sales_order, item_code)] = row
            lookup[item_code] = row

    aggregated = {}
    for row in selected_items or []:
        item_code = (row.get("item_code") or "").strip()
        if not item_code:
            continue
        sales_order = (row.get("against_sales_order") or "").strip()
        entry = aggregated.setdefault(
            (sales_order, item_code),
            {
                "sales_order": sales_order,
                "item_code": item_code,
                "qty": 0,
                "sales_amount": 0,
            },
        )
        entry["qty"] = entry["qty"] + frappe.utils.flt(row.get("qty"))
        entry["sales_amount"] = entry["sales_amount"] + frappe.utils.flt(row.get("amount"))

    items = []
    total_sales = 0
    total_cost = 0
    for (_, item_code), row in aggregated.items():
        order_row = lookup.get((row.get("sales_order") or "", item_code)) or lookup.get(item_code) or {}
        order_qty = frappe.utils.flt(order_row.get("qty"))
        unit_cost = (frappe.utils.flt(order_row.get("estimated_cost")) / order_qty) if order_qty else 0
        estimated_cost = unit_cost * frappe.utils.flt(row.get("qty"))
        sales_amount = frappe.utils.flt(row.get("sales_amount"))
        estimated_profit = sales_amount - estimated_cost
        margin_pct = (estimated_profit * 100.0 / sales_amount) if sales_amount else 0
        items.append(
            {
                "item_code": item_code,
                "sales_order": row.get("sales_order") or "",
                "qty": row.get("qty") or 0,
                "default_bom": order_row.get("default_bom") or "",
                "bom_unit_cost": order_row.get("bom_unit_cost") or 0,
                "sales_amount": sales_amount,
                "estimated_cost": estimated_cost,
                "estimated_profit": estimated_profit,
                "margin_pct": round(margin_pct, 2),
            }
        )
        total_sales = total_sales + sales_amount
        total_cost = total_cost + estimated_cost

    total_profit = total_sales - total_cost
    margin_pct = (total_profit * 100.0 / total_sales) if total_sales else 0
    return {
        "summary": {
            "sales_amount": total_sales,
            "estimated_cost": total_cost,
            "estimated_profit": total_profit,
            "margin_pct": round(margin_pct, 2),
        },
        "items": items,
    }


def _build_profit_summary_from_rows(rows):
    total_sales = 0
    total_cost = 0
    for row in rows or []:
        total_sales = total_sales + frappe.utils.flt(row.get("sales_amount"))
        total_cost = total_cost + frappe.utils.flt(row.get("estimated_cost"))

    total_profit = total_sales - total_cost
    margin_pct = (total_profit * 100.0 / total_sales) if total_sales else 0
    return {
        "sales_amount": total_sales,
        "estimated_cost": total_cost,
        "estimated_profit": total_profit,
        "margin_pct": round(margin_pct, 2),
    }


def _apply_material_cost_by_item(profit_rows, cost_by_item):
    cost_by_item = cost_by_item or {}
    out = []
    for row in profit_rows or []:
        item_code = (row.get("item_code") or "").strip()
        sales_amount = frappe.utils.flt(row.get("sales_amount"))
        estimated_cost = frappe.utils.flt(cost_by_item.get(item_code))
        estimated_profit = sales_amount - estimated_cost
        margin_pct = (estimated_profit * 100.0 / sales_amount) if sales_amount else 0

        updated = dict(row)
        updated["estimated_cost"] = estimated_cost
        updated["estimated_profit"] = estimated_profit
        updated["margin_pct"] = round(margin_pct, 2)
        out.append(updated)
    return out


def _merge_profit_rows(payloads):
    rows = []
    summary = {
        "sales_amount": 0,
        "estimated_cost": 0,
        "estimated_profit": 0,
        "margin_pct": 0,
    }

    for payload in payloads:
        sales_order = (payload.get("sales_order") or "").strip()
        payload_summary = payload.get("profit_summary") or {}
        summary["sales_amount"] = summary["sales_amount"] + frappe.utils.flt(payload_summary.get("sales_amount"))
        summary["estimated_cost"] = summary["estimated_cost"] + frappe.utils.flt(payload_summary.get("estimated_cost"))
        summary["estimated_profit"] = summary["estimated_profit"] + frappe.utils.flt(payload_summary.get("estimated_profit"))

        for row in payload.get("profit_by_item") or []:
            new_row = dict(row)
            new_row["sales_order"] = sales_order
            rows.append(new_row)

    if summary["sales_amount"]:
        summary["margin_pct"] = round(summary["estimated_profit"] * 100.0 / summary["sales_amount"], 2)

    return rows, summary


def _merge_delivery_note_options(payloads):
    options = {}
    for payload in payloads:
        for row in payload.get("sales_fulfillment_hierarchy") or []:
            delivery_note = (row.get("delivery_note") or "").strip()
            if not delivery_note:
                continue
            entry = options.setdefault(
                delivery_note,
                {
                    "delivery_note": delivery_note,
                    "status": row.get("status") or "",
                    "posting_date": row.get("posting_date") or "",
                    "invoice_count": 0,
                },
            )
            entry["invoice_count"] = max(entry["invoice_count"], len(row.get("invoices") or []))
    return [options[key] for key in sorted(options)]


def _merge_fulfillment_rows(payloads):
    rows = {}
    for payload in payloads:
        for row in payload.get("sales_fulfillment_hierarchy") or []:
            delivery_note = (row.get("delivery_note") or "").strip()
            if not delivery_note:
                continue
            entry = rows.setdefault(
                delivery_note,
                {
                    "delivery_note": delivery_note,
                    "status": row.get("status") or "",
                    "posting_date": row.get("posting_date") or "",
                    "invoices": [],
                },
            )
            invoice_names = {invoice.get("name") for invoice in entry.get("invoices") or [] if invoice.get("name")}
            for invoice in row.get("invoices") or []:
                if invoice.get("name") and invoice.get("name") not in invoice_names:
                    entry["invoices"].append(invoice)
    return [rows[key] for key in sorted(rows)]


def _merge_group_amounts(rows, key_field, amount_fields):
    grouped = {}
    for row in rows or []:
        key = (row.get(key_field) or "Unclassified").strip() or "Unclassified"
        entry = grouped.setdefault(key, {key_field: key})
        for amount_field in amount_fields:
            entry[amount_field] = frappe.utils.flt(entry.get(amount_field)) + frappe.utils.flt(row.get(amount_field))
    return [grouped[key] for key in sorted(grouped)]


def _merge_payloads(payloads):
    profit_rows, profit_summary = _merge_profit_rows(payloads)
    delivery_note_options = _merge_delivery_note_options(payloads)
    fulfillment_rows = _merge_fulfillment_rows(payloads)
    bom_tree = []
    labour_rows = []
    material_shortage = []
    purchase_flow_rows = []
    sales_order_expenses = []

    for payload in payloads:
        bom_tree.extend(payload.get("bom_tree") or [])
        labour_rows.extend(payload.get("labour_cost_employee_item_wise") or [])
        material_shortage.extend(payload.get("material_shortage") or [])
        purchase_flow_rows.extend(payload.get("purchase_flow_rows") or [])
        sales_order_expenses.extend(payload.get("sales_order_expenses") or [])

    return {
        "profit_by_item": profit_rows,
        "profit_summary": profit_summary,
        "delivery_note_options": delivery_note_options,
        "sales_fulfillment_hierarchy": fulfillment_rows,
        "po_item_group_summary": _merge_group_amounts(
            [row for payload in payloads for row in (payload.get("po_item_group_summary") or [])],
            "item_group",
            ["po_amount"],
        ),
        "bom_tree": bom_tree,
        "material_shortage": material_shortage,
        "labour_cost_employee_item_wise": labour_rows,
        "purchase_flow_rows": purchase_flow_rows,
        "sales_order_expenses": sales_order_expenses,
    }


def _get_item_group_map(item_codes):
    item_codes = sorted({(item_code or "").strip() for item_code in item_codes if (item_code or "").strip()})
    if not item_codes:
        return {}

    rows = frappe.get_all(
        "Item",
        filters={"name": ["in", item_codes]},
        fields=["name", "item_group"],
        limit_page_length=len(item_codes),
    )
    return {(row.get("name") or "").strip(): row.get("item_group") or "" for row in rows}


def _attach_item_groups(rows, item_group_map):
    out = []
    for row in rows or []:
        new_row = dict(row)
        item_code = (new_row.get("item_code") or new_row.get("product") or "").strip()
        new_row["item_group"] = item_group_map.get(item_code, "")
        out.append(new_row)
    return out


def _build_item_group_summary(profit_rows):
    grouped = {}
    for row in profit_rows or []:
        item_group = (row.get("item_group") or "Unclassified").strip() or "Unclassified"
        entry = grouped.setdefault(
            item_group,
            {
                "item_group": item_group,
                "qty": 0,
                "sales_amount": 0,
                "estimated_cost": 0,
                "estimated_profit": 0,
            },
        )
        entry["qty"] = entry["qty"] + frappe.utils.flt(row.get("qty"))
        entry["sales_amount"] = entry["sales_amount"] + frappe.utils.flt(row.get("sales_amount"))
        entry["estimated_cost"] = entry["estimated_cost"] + frappe.utils.flt(row.get("estimated_cost"))
        entry["estimated_profit"] = entry["estimated_profit"] + frappe.utils.flt(row.get("estimated_profit"))

    rows = []
    for item_group, row in grouped.items():
        sales_amount = frappe.utils.flt(row.get("sales_amount"))
        estimated_profit = frappe.utils.flt(row.get("estimated_profit"))
        margin_pct = (estimated_profit * 100.0 / sales_amount) if sales_amount else 0
        out_row = dict(row)
        out_row["margin_pct"] = round(margin_pct, 2)
        rows.append(out_row)
    rows.sort(key=lambda row: row.get("item_group") or "")
    return rows


def _build_statement_rows(selected_profit_summary, labour_summary, po_item_group_summary, sales_order_expenses=None):
    sales_amount = frappe.utils.flt(selected_profit_summary.get("sales_amount"))
    material_cost = frappe.utils.flt(selected_profit_summary.get("estimated_cost"))
    gross_profit = sales_amount - material_cost
    labour_cost = frappe.utils.flt(labour_summary.get("total_cost"))
    procurement_amount = _sum_po_amount(po_item_group_summary)
    expense_claim_amount = _sum_sales_order_expenses(sales_order_expenses)
    net_profit_after_labour = gross_profit - labour_cost
    net_profit_after_procurement = net_profit_after_labour - procurement_amount
    net_profit_after_expenses = net_profit_after_procurement - expense_claim_amount

    return [
        {"label": "Sales Amount", "amount": sales_amount},
        {"label": "Estimated Material Cost", "amount": material_cost},
        {"label": "Gross Profit", "amount": gross_profit},
        {"label": "Labour Cost", "amount": labour_cost},
        {"label": "Profit After Labour", "amount": net_profit_after_labour},
        {"label": "Procurement Amount", "amount": procurement_amount},
        {"label": "Net Profit After Procurement", "amount": net_profit_after_procurement},
        {"label": "Expense Claims", "amount": expense_claim_amount},
        {"label": "Net Profit After Expenses", "amount": net_profit_after_expenses},
    ]


def _build_labour_cost_by_item(rows):
    totals = {}
    for row in rows or []:
        item_code = (row.get("product") or row.get("item_code") or "").strip()
        if not item_code:
            continue
        totals[item_code] = totals.get(item_code, 0) + frappe.utils.flt(row.get("labour_cost"))
    return totals


def _get_item_group_paths(item_groups):
    pending = {(item_group or "").strip() for item_group in item_groups if (item_group or "").strip()}
    group_meta = {}

    while pending:
        rows = frappe.get_all(
            "Item Group",
            filters={"name": ["in", sorted(pending)]},
            fields=["name", "parent_item_group"],
            limit_page_length=len(pending),
        )
        pending = set()
        for row in rows:
            name = (row.get("name") or "").strip()
            parent = (row.get("parent_item_group") or "").strip()
            if not name or name in group_meta:
                continue
            group_meta[name] = parent
            if parent and parent not in group_meta and parent != "All Item Groups":
                pending.add(parent)

    paths = {}
    for item_group in item_groups:
        name = (item_group or "").strip()
        if not name:
            paths[item_group] = ["Unclassified"]
            continue

        path = []
        current = name
        visited = set()
        while current and current not in visited and current != "All Item Groups":
            visited.add(current)
            path.append(current)
            current = group_meta.get(current) or ""
        paths[item_group] = list(reversed(path)) or [name]

    return paths


def _allocate_procurement_by_item(profit_rows, po_item_group_summary):
    po_by_group = {
        ((row.get("item_group") or "Unclassified").strip() or "Unclassified"): frappe.utils.flt(row.get("po_amount"))
        for row in po_item_group_summary or []
    }
    grouped_items = {}
    for row in profit_rows or []:
        item_group = (row.get("item_group") or "Unclassified").strip() or "Unclassified"
        grouped_items.setdefault(item_group, []).append(row)

    allocations = {}
    for item_group, rows in grouped_items.items():
        total_po_amount = po_by_group.get(item_group)
        if not total_po_amount:
            continue

        basis_values = []
        for row in rows:
            basis = frappe.utils.flt(row.get("estimated_cost")) or frappe.utils.flt(row.get("sales_amount")) or frappe.utils.flt(row.get("qty")) or 1
            basis_values.append(((row.get("item_code") or "").strip(), basis))
        total_basis = sum(basis for _, basis in basis_values) or 1

        allocated = 0
        for index, (item_code, basis) in enumerate(basis_values):
            if not item_code:
                continue
            if index == len(basis_values) - 1:
                amount = total_po_amount - allocated
            else:
                amount = total_po_amount * basis / total_basis
                allocated = allocated + amount
            allocations[item_code] = allocations.get(item_code, 0) + amount

    return allocations


def _build_material_rows_by_item(bom_rows, profit_rows):
    profit_lookup = {
        (row.get("item_code") or "").strip(): row
        for row in profit_rows or []
        if (row.get("item_code") or "").strip()
    }
    grouped = {}
    for row in bom_rows or []:
        item_code = (row.get("item_code") or "").strip()
        material_code = (row.get("material_item_code") or "").strip()
        if not item_code or not material_code:
            continue
        grouped.setdefault(item_code, []).append(row)

    out = {}
    for item_code, rows in grouped.items():
        item_total_cost = frappe.utils.flt((profit_lookup.get(item_code) or {}).get("estimated_cost"))
        total_required_qty = sum(frappe.utils.flt(row.get("required_qty")) for row in rows)
        total_basis = total_required_qty if total_required_qty > 0 else len(rows) or 1
        allocated = 0
        item_rows = []

        for index, row in enumerate(rows):
            basis = frappe.utils.flt(row.get("required_qty")) if total_required_qty > 0 else 1
            if index == len(rows) - 1:
                material_cost = item_total_cost - allocated
            else:
                material_cost = item_total_cost * basis / total_basis
                allocated = allocated + material_cost
            item_rows.append(
                {
                    "label": row.get("material_item_code") or "-",
                    "qty": frappe.utils.flt(row.get("required_qty")),
                    "sales_amount": 0,
                    "material_cost": material_cost,
                    "labour_cost": 0,
                    "procurement_amount": 0,
                    "profit_amount": -material_cost,
                }
            )

        out[item_code] = item_rows

    return out


def _attach_material_item_groups(material_rows_by_item):
    material_codes = []
    for rows in material_rows_by_item.values():
        for row in rows:
            material_codes.append(row.get("label"))

    item_group_map = _get_item_group_map(material_codes)
    for rows in material_rows_by_item.values():
        for row in rows:
            material_code = (row.get("label") or "").strip()
            row["item_group"] = item_group_map.get(material_code, "Unclassified") or "Unclassified"

    return material_rows_by_item


def _make_statement_tree_node(label, level=0):
    return {
        "label": label,
        "level": level,
        "children": [],
        "items": [],
        "totals": {
            "qty": 0,
            "sales_amount": 0,
            "material_cost": 0,
            "labour_cost": 0,
            "procurement_amount": 0,
            "profit_amount": 0,
        },
    }


def _build_hierarchical_statement_rows(profit_rows, bom_rows, labour_rows, po_item_group_summary):
    if not profit_rows:
        return []

    labour_by_item = _build_labour_cost_by_item(labour_rows)
    procurement_by_item = _allocate_procurement_by_item(profit_rows, po_item_group_summary)
    material_rows_by_item = _attach_material_item_groups(_build_material_rows_by_item(bom_rows, profit_rows))
    item_group_paths = _get_item_group_paths([row.get("item_group") for row in profit_rows])

    root = _make_statement_tree_node("root", level=-1)
    node_map = {(): root}

    def get_or_create_node(path_parts):
        path_key = tuple(path_parts)
        if path_key in node_map:
            return node_map[path_key]

        parent = get_or_create_node(path_parts[:-1])
        node = _make_statement_tree_node(path_parts[-1], level=len(path_parts) - 1)
        parent["children"].append(node)
        node_map[path_key] = node
        return node

    for profit_row in profit_rows:
        item_code = (profit_row.get("item_code") or "").strip()
        if not item_code:
            continue

        item_group = (profit_row.get("item_group") or "Unclassified").strip() or "Unclassified"
        path_parts = item_group_paths.get(item_group) or [item_group]
        parent_node = get_or_create_node(path_parts)

        sales_amount = frappe.utils.flt(profit_row.get("sales_amount"))
        qty = frappe.utils.flt(profit_row.get("qty"))
        material_cost = frappe.utils.flt(profit_row.get("estimated_cost"))
        labour_cost = labour_by_item.get(item_code, 0)
        procurement_amount = procurement_by_item.get(item_code, 0)
        profit_amount = sales_amount - material_cost - labour_cost - procurement_amount
        material_rows = material_rows_by_item.get(item_code) or []

        parent_node["items"].append(
            {
                "label": item_code,
                "item_group": item_group,
                "qty": qty,
                "rate": (sales_amount / qty) if qty else 0,
                "sales_amount": sales_amount,
                "material_cost": material_cost,
                "labour_cost": labour_cost,
                "procurement_amount": procurement_amount,
                "profit_amount": profit_amount,
                "material_rows": material_rows,
            }
        )

    def compute_totals(node):
        totals = {
            "qty": 0,
            "sales_amount": 0,
            "material_cost": 0,
            "labour_cost": 0,
            "procurement_amount": 0,
            "profit_amount": 0,
        }
        for child in node["children"]:
            child_totals = compute_totals(child)
            for key in totals:
                totals[key] = totals[key] + frappe.utils.flt(child_totals.get(key))
        for item in node["items"]:
            for key in totals:
                totals[key] = totals[key] + frappe.utils.flt(item.get(key))
        node["totals"] = totals
        return totals

    compute_totals(root)

    out = []

    def append_row(level, row_type, label, values, bold=False):
        out.append(
            {
                "level": level,
                "row_type": row_type,
                "label": label,
                "qty": frappe.utils.flt(values.get("qty")),
                "rate": frappe.utils.flt(values.get("rate")),
                "sales_amount": frappe.utils.flt(values.get("sales_amount")),
                "material_cost": frappe.utils.flt(values.get("material_cost")),
                "labour_cost": frappe.utils.flt(values.get("labour_cost")),
                "procurement_amount": frappe.utils.flt(values.get("procurement_amount")),
                "profit_amount": frappe.utils.flt(values.get("profit_amount")),
                "bold": 1 if bold else 0,
            }
        )

    def walk(node):
        if node["level"] >= 0:
            append_row(node["level"], "group", node["label"], node["totals"], bold=True)

        for child in sorted(node["children"], key=lambda row: row.get("label") or ""):
            walk(child)

        for item in sorted(node["items"], key=lambda row: row.get("label") or ""):
            item_level = node["level"] + 1
            append_row(item_level, "item", item["label"], item, bold=True)
            append_row(
                item_level + 1,
                "sales",
                "Sales",
                {
                    "qty": item.get("qty"),
                    "rate": item.get("rate"),
                    "sales_amount": item.get("sales_amount"),
                    "material_cost": 0,
                    "labour_cost": 0,
                    "procurement_amount": 0,
                    "profit_amount": item.get("sales_amount"),
                },
            )

            append_row(
                item_level + 1,
                "subhead",
                "Raw Materials",
                {
                    "qty": item.get("qty"),
                    "rate": 0,
                    "sales_amount": 0,
                    "material_cost": item.get("material_cost"),
                    "labour_cost": 0,
                    "procurement_amount": 0,
                    "profit_amount": -frappe.utils.flt(item.get("material_cost")),
                },
                bold=True,
            )
            material_groups = {}
            for material_row in item.get("material_rows") or []:
                material_group = (material_row.get("item_group") or "Unclassified").strip() or "Unclassified"
                entry = material_groups.setdefault(
                    material_group,
                    {
                        "qty": 0,
                        "rate": 0,
                        "sales_amount": 0,
                        "material_cost": 0,
                        "labour_cost": 0,
                        "procurement_amount": 0,
                        "profit_amount": 0,
                        "rows": [],
                    },
                )
                entry["qty"] = entry["qty"] + frappe.utils.flt(material_row.get("qty"))
                entry["material_cost"] = entry["material_cost"] + frappe.utils.flt(material_row.get("material_cost"))
                entry["profit_amount"] = entry["profit_amount"] + frappe.utils.flt(material_row.get("profit_amount"))
                entry["rows"].append(material_row)

            for material_group in sorted(material_groups):
                material_group_row = material_groups.get(material_group) or {}
                append_row(item_level + 2, "material-group", material_group, material_group_row, bold=True)
                for material_row in material_group_row.get("rows") or []:
                    append_row(item_level + 3, "material", material_row.get("label"), material_row)

            append_row(
                item_level + 1,
                "subhead",
                "Expenses",
                {
                    "qty": 0,
                    "rate": 0,
                    "sales_amount": 0,
                    "material_cost": 0,
                    "labour_cost": item.get("labour_cost"),
                    "procurement_amount": item.get("procurement_amount"),
                    "profit_amount": -(frappe.utils.flt(item.get("labour_cost")) + frappe.utils.flt(item.get("procurement_amount"))),
                },
                bold=True,
            )
            if frappe.utils.flt(item.get("labour_cost")):
                append_row(
                    item_level + 2,
                    "expense",
                    "Labour Cost",
                    {
                        "qty": 0,
                        "rate": 0,
                        "sales_amount": 0,
                        "material_cost": 0,
                        "labour_cost": item.get("labour_cost"),
                        "procurement_amount": 0,
                        "profit_amount": -frappe.utils.flt(item.get("labour_cost")),
                    },
                )
            if frappe.utils.flt(item.get("procurement_amount")):
                append_row(
                    item_level + 2,
                    "expense",
                    "Procurement Amount",
                    {
                        "qty": 0,
                        "rate": 0,
                        "sales_amount": 0,
                        "material_cost": 0,
                        "labour_cost": 0,
                        "procurement_amount": item.get("procurement_amount"),
                        "profit_amount": -frappe.utils.flt(item.get("procurement_amount")),
                    },
                )

    walk(root)
    return out


def _scale_labour_rows(rows, selected_qty_by_item, order_qty_by_item):
    if not selected_qty_by_item:
        return {
            "rows": rows or [],
            "summary": {
                "total_qty": sum(frappe.utils.flt(row.get("qty")) for row in rows or []),
                "total_cost": sum(frappe.utils.flt(row.get("labour_cost")) for row in rows or []),
            },
        }

    out_rows = []
    total_qty = 0
    total_cost = 0
    for row in rows or []:
        item_code = (row.get("product") or row.get("item_code") or "").strip()
        selected_qty = frappe.utils.flt(selected_qty_by_item.get(item_code))
        if not selected_qty:
            continue
        order_qty = frappe.utils.flt(order_qty_by_item.get(item_code))
        scale_ratio = (selected_qty / order_qty) if order_qty else 0
        scaled_qty = frappe.utils.flt(row.get("qty")) * scale_ratio
        scaled_cost = frappe.utils.flt(row.get("labour_cost")) * scale_ratio
        new_row = dict(row)
        new_row["qty"] = scaled_qty
        new_row["labour_cost"] = scaled_cost
        out_rows.append(new_row)
        total_qty = total_qty + scaled_qty
        total_cost = total_cost + scaled_cost

    return {
        "rows": out_rows,
        "summary": {
            "total_qty": total_qty,
            "total_cost": total_cost,
        },
    }


def _sum_po_amount(po_item_group_summary):
    return sum(frappe.utils.flt(row.get("po_amount")) for row in po_item_group_summary or [])


def _sum_sales_order_expenses(sales_order_expenses):
    return sum(frappe.utils.flt(row.get("amount")) for row in sales_order_expenses or [])


def _get_selected_invoice_details(fulfillment_rows, delivery_note):
    invoice_names = []
    for row in fulfillment_rows or []:
        if (row.get("delivery_note") or "") == delivery_note:
            invoice_names = [invoice.get("name") for invoice in row.get("invoices") or [] if invoice.get("name")]
            break

    out = []
    for invoice_name in invoice_names:
        doc_payload = run_detail_status(action="doc_items", doctype="Sales Invoice", docname=invoice_name) or {}
        out.append(
            {
                "name": invoice_name,
                "meta": doc_payload.get("meta") or {},
                "items": doc_payload.get("items") or [],
            }
        )
    return out


def _build_related_expenses(selected_profit_summary, labour_summary, po_item_group_summary, sales_order_expenses=None):
    expenses = [
        {
            "label": "Estimated Material Cost",
            "amount": frappe.utils.flt(selected_profit_summary.get("estimated_cost")),
            "source": "Default BOM",
            "entry_no": "",
        },
        {
            "label": "Labour Cost",
            "amount": frappe.utils.flt(labour_summary.get("total_cost")),
            "source": "Job Cards",
            "entry_no": "",
        },
    ]
    po_amount = _sum_po_amount(po_item_group_summary)
    if po_amount:
        expenses.append(
            {
                "label": "Procurement Amount",
                "amount": po_amount,
                "source": "Purchase Orders",
                "entry_no": "",
            }
        )
    expense_claim_amount = _sum_sales_order_expenses(sales_order_expenses)
    if expense_claim_amount:
        for row in sales_order_expenses or []:
            expenses.append(
                {
                    "label": (row.get("expense_claim_type") or "Expense Claim").strip(),
                    "amount": frappe.utils.flt(row.get("amount")),
                    "source": (row.get("description") or "").strip() or "Expense Claim",
                    "entry_no": (row.get("expense_claim") or "").strip(),
                }
            )
        expenses.append(
            {
                "label": "Expense Claims",
                "amount": expense_claim_amount,
                "source": "Expense Claim",
                "entry_no": "",
            }
        )
    return expenses


@frappe.whitelist()
def get_custom_html_block_page_payload(block_name=None):
    block_name = (block_name or "").strip()
    if not block_name:
        frappe.throw("Custom HTML Block name is required")

    block = _get_custom_html_block_from_fixtures(block_name)
    if not block:
        frappe.throw(f"Custom HTML Block not found in app fixtures: {block_name}")

    html = block.get("html") or ""
    html = re.sub(r"(?is)^.*?<body[^>]*>", "", html)
    html = re.sub(r"(?is)</body>.*$", "", html)
    html = re.sub(r"(?is)<script\b[^>]*>.*?</script>", "", html)

    return {
        "name": block.get("name"),
        "html": html.strip(),
        "script": block.get("script") or "",
    }


@frappe.whitelist()
def get_web_page_payload(page_name=None):
    page_name = (page_name or "").strip()
    if not page_name:
        frappe.throw("Web Page name is required")

    page = _get_web_page_from_fixtures(page_name)
    if not page:
        frappe.throw(f"Web Page not found in app fixtures: {page_name}")

    payload = _extract_fixture_html_payload(page.get("main_section_html") or page.get("main_section") or "")
    payload["script"] = _rewrite_web_page_script(page_name, payload.get("script") or "")
    return {
        "name": page.get("name"),
        "title": page.get("title") or page.get("name"),
        "route": page.get("route") or page.get("name"),
        "html": payload.get("html") or "",
        "styles": payload.get("styles") or "",
        "script": payload.get("script") or "",
    }


@frappe.whitelist()
def fin_gold_rate_api():
    result = {
        "sarmaaya_pkr": 0,
        "sarmaaya_gram_pkr": 0,
        "sarmaaya_10g_pkr": 0,
        "sarmaaya_ounce_pkr": 0,
        "source_url": "https://sarmaaya.pk/commodities/gold",
    }

    try:
        import requests

        response = requests.get(
            "https://sarmaaya.pk/commodities/gold",
            timeout=10,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        response.raise_for_status()
        content = response.text or ""

        patterns = {
            "sarmaaya_pkr": r"1 Tola Gold .*?Rs\.\s*([\d,]+(?:\.\d+)?)",
            "sarmaaya_10g_pkr": r"10 Gram Gold .*?Rs\.\s*([\d,]+(?:\.\d+)?)",
            "sarmaaya_gram_pkr": r"1 Gram Gold .*?Rs\.\s*([\d,]+(?:\.\d+)?)",
            "sarmaaya_ounce_pkr": r"1 Ounce Gold .*?Rs\.\s*([\d,]+(?:\.\d+)?)",
        }
        for key, pattern in patterns.items():
            match = re.search(pattern, content, flags=re.IGNORECASE | re.DOTALL)
            if match:
                result[key] = frappe.utils.flt((match.group(1) or "").replace(",", ""))

        if not result["sarmaaya_pkr"]:
            table_match = re.search(
                r"Per\s*Tola\s*</[^>]+>\s*([\d,]+(?:\.\d+)?)",
                content,
                flags=re.IGNORECASE | re.DOTALL,
            )
            if table_match:
                result["sarmaaya_pkr"] = frappe.utils.flt((table_match.group(1) or "").replace(",", ""))
        if result["sarmaaya_pkr"]:
            result["fetched"] = True
        else:
            result["fetched"] = False
            result["sarmaaya_error"] = "Gold price could not be parsed from Sarmaaya page"
    except Exception as error:
        result["fetched"] = False
        result["sarmaaya_error"] = str(error)

    return result


@frappe.whitelist()
def get_sales_order_pl_by_order(sales_order=None, delivery_note=None):
    try:
        sales_order = (sales_order or "").strip()
        delivery_note = (delivery_note or "").strip()
        linked_sales_orders = []

        if delivery_note:
            linked_sales_orders = _get_sales_orders_from_delivery_note(delivery_note)
            sales_order = _resolve_sales_order_from_delivery_note(delivery_note, sales_order) or sales_order
        elif sales_order:
            linked_sales_orders = [sales_order]

        if not sales_order:
            frappe.throw("Sales Order or Delivery Note is required")

        payload_sales_orders = linked_sales_orders or [sales_order]
        payloads = []
        for payload_sales_order in payload_sales_orders:
            payload = run_detail_status(sales_order=payload_sales_order) or {}
            payload["sales_order"] = payload_sales_order
            payloads.append(payload)

        base_payload = _merge_payloads(payloads) if len(payloads) > 1 else (payloads[0] if payloads else {})
        profit_rows = base_payload.get("profit_by_item") or []
        profit_summary = base_payload.get("profit_summary") or {}
        fulfillment_rows = base_payload.get("sales_fulfillment_hierarchy") or []
        po_item_group_summary = base_payload.get("po_item_group_summary") or []
        order_qty_by_item = {
            (row.get("item_code") or "").strip(): frappe.utils.flt(row.get("qty"))
            for row in profit_rows
            if (row.get("item_code") or "").strip()
        }
        delivery_note_options = base_payload.get("delivery_note_options") or []

        selected_delivery_meta = {}
        selected_delivery_items = []
        selected_invoice_details = []
        selected_qty_by_item = {}
        selected_profit_summary = profit_summary
        selected_profit_rows = profit_rows

        if delivery_note:
            delivery_payload = run_detail_status(
                action="doc_items",
                doctype="Delivery Note",
                docname=delivery_note,
            ) or {}
            selected_delivery_meta = delivery_payload.get("meta") or {}
            selected_delivery_items = _get_delivery_note_items(delivery_note)
            selected_qty_by_item = _aggregate_qty_by_item(selected_delivery_items)
            selected_profit = _compute_selected_profit(profit_rows, selected_delivery_items)
            selected_profit_summary = selected_profit.get("summary") or {}
            selected_profit_rows = selected_profit.get("items") or []
            selected_invoice_details = _get_selected_invoice_details(fulfillment_rows, delivery_note)

        item_group_map = _get_item_group_map(
            [row.get("item_code") for row in profit_rows]
            + [row.get("item_code") for row in selected_profit_rows]
            + [row.get("item_code") for row in selected_delivery_items]
        )
        profit_rows = _attach_item_groups(profit_rows, item_group_map)
        selected_profit_rows = _attach_item_groups(selected_profit_rows, item_group_map)
        selected_delivery_items = _attach_item_groups(selected_delivery_items, item_group_map)

        scaled_labour = _scale_labour_rows(
            base_payload.get("labour_cost_employee_item_wise") or [],
            selected_qty_by_item,
            order_qty_by_item,
        )
        bom_rows = _flatten_bom_rows(base_payload.get("bom_tree") or [], selected_qty_by_item)
        material_codes = [(row.get("material_item_code") or "").strip() for row in bom_rows]
        material_group_map = _get_item_group_map(material_codes)
        material_rate_map = _get_last_purchase_rate_map(material_codes, company=(base_payload.get("company") or "").strip())
        for row in bom_rows:
            material_code = (row.get("material_item_code") or "").strip()
            row["material_item_group"] = material_group_map.get(material_code, "Unclassified") or "Unclassified"
            row["last_purchase_rate"] = frappe.utils.flt(material_rate_map.get(material_code))
        related_expenses = _build_related_expenses(
            selected_profit_summary,
            scaled_labour.get("summary") or {},
            po_item_group_summary,
            base_payload.get("sales_order_expenses") or [],
        )
        statement_rows = _build_statement_rows(
            selected_profit_summary,
            scaled_labour.get("summary") or {},
            po_item_group_summary,
            base_payload.get("sales_order_expenses") or [],
        )
        item_group_summary = _build_item_group_summary(selected_profit_rows)
        hierarchical_statement_rows = _build_hierarchical_statement_rows(
            selected_profit_rows,
            bom_rows,
            scaled_labour.get("rows") or [],
            po_item_group_summary,
        )

        return {
            "sales_order": sales_order,
            "linked_sales_orders": linked_sales_orders,
            "selected_delivery_note": delivery_note,
            "delivery_note_options": delivery_note_options,
            "delivery_note_meta": selected_delivery_meta,
            "delivery_note_items": selected_delivery_items,
            "invoice_details": selected_invoice_details,
            "profit_summary": profit_summary,
            "profit_by_item": profit_rows,
            "selected_profit_summary": selected_profit_summary,
            "selected_profit_by_item": selected_profit_rows,
            "bom_rows": bom_rows,
            "material_shortage": base_payload.get("material_shortage") or [],
            "labour_cost_rows": scaled_labour.get("rows") or [],
            "labour_cost_summary": scaled_labour.get("summary") or {},
            "po_item_group_summary": po_item_group_summary,
            "purchase_flow_rows": base_payload.get("purchase_flow_rows") or [],
            "sales_fulfillment_hierarchy": fulfillment_rows,
            "sales_order_expenses": base_payload.get("sales_order_expenses") or [],
            "related_expenses": related_expenses,
            "statement_rows": statement_rows,
            "item_group_summary": item_group_summary,
            "hierarchical_statement_rows": hierarchical_statement_rows,
        }
    except Exception as error:
        frappe.log_error(frappe.get_traceback(), "PL by Order API Error")
        return {
            "error": str(error),
        }


@frappe.whitelist()
def get_sales_order_pl_by_wo(sales_order=None, delivery_note=None):
    try:
        sales_order = (sales_order or "").strip()
        delivery_note = (delivery_note or "").strip()
        linked_sales_orders = []

        if delivery_note:
            linked_sales_orders = _get_sales_orders_from_delivery_note(delivery_note)
            sales_order = _resolve_sales_order_from_delivery_note(delivery_note, sales_order) or sales_order
        elif sales_order:
            linked_sales_orders = [sales_order]

        if not sales_order:
            frappe.throw("Sales Order or Delivery Note is required")

        payload_sales_orders = linked_sales_orders or [sales_order]
        payloads = []
        for payload_sales_order in payload_sales_orders:
            payload = run_detail_status(sales_order=payload_sales_order) or {}
            payload["sales_order"] = payload_sales_order
            payloads.append(payload)

        base_payload = _merge_payloads(payloads) if len(payloads) > 1 else (payloads[0] if payloads else {})
        profit_rows = base_payload.get("profit_by_item") or []
        profit_summary = base_payload.get("profit_summary") or {}
        fulfillment_rows = base_payload.get("sales_fulfillment_hierarchy") or []
        po_item_group_summary = base_payload.get("po_item_group_summary") or []
        order_qty_by_item = {
            (row.get("item_code") or "").strip(): frappe.utils.flt(row.get("qty"))
            for row in profit_rows
            if (row.get("item_code") or "").strip()
        }
        delivery_note_options = base_payload.get("delivery_note_options") or []

        selected_delivery_meta = {}
        selected_delivery_items = []
        selected_invoice_details = []
        selected_qty_by_item = {}
        selected_profit_summary = profit_summary
        selected_profit_rows = profit_rows

        if delivery_note:
            delivery_payload = run_detail_status(
                action="doc_items",
                doctype="Delivery Note",
                docname=delivery_note,
            ) or {}
            selected_delivery_meta = delivery_payload.get("meta") or {}
            selected_delivery_items = _get_delivery_note_items(delivery_note)
            selected_qty_by_item = _aggregate_qty_by_item(selected_delivery_items)
            selected_profit = _compute_selected_profit(profit_rows, selected_delivery_items)
            selected_profit_summary = selected_profit.get("summary") or {}
            selected_profit_rows = selected_profit.get("items") or []
            selected_invoice_details = _get_selected_invoice_details(fulfillment_rows, delivery_note)

        item_group_map = _get_item_group_map(
            [row.get("item_code") for row in profit_rows]
            + [row.get("item_code") for row in selected_profit_rows]
            + [row.get("item_code") for row in selected_delivery_items]
        )
        profit_rows = _attach_item_groups(profit_rows, item_group_map)
        selected_profit_rows = _attach_item_groups(selected_profit_rows, item_group_map)
        selected_delivery_items = _attach_item_groups(selected_delivery_items, item_group_map)

        scaled_labour = _scale_labour_rows(
            base_payload.get("labour_cost_employee_item_wise") or [],
            selected_qty_by_item,
            order_qty_by_item,
        )

        wo_rows_full = _flatten_work_order_consumption_rows(
            payload_sales_orders,
            selected_qty_by_item={},
            order_qty_by_item=order_qty_by_item,
        )
        wo_rows = _flatten_work_order_consumption_rows(
            payload_sales_orders,
            selected_qty_by_item=selected_qty_by_item,
            order_qty_by_item=order_qty_by_item,
        )

        material_codes = [
            (row.get("material_item_code") or "").strip()
            for row in (wo_rows_full + wo_rows)
        ]
        material_group_map = _get_item_group_map(material_codes)
        material_rate_map = _get_last_purchase_rate_map(material_codes, company=(base_payload.get("company") or "").strip())
        cost_by_item_full = {}
        cost_by_item_selected = {}

        for row in wo_rows_full:
            material_code = (row.get("material_item_code") or "").strip()
            row["material_item_group"] = material_group_map.get(material_code, "Unclassified") or "Unclassified"
            row["last_purchase_rate"] = frappe.utils.flt(material_rate_map.get(material_code))
            item_code = (row.get("item_code") or "").strip()
            if item_code:
                cost_by_item_full[item_code] = cost_by_item_full.get(item_code, 0) + (
                    frappe.utils.flt(row.get("required_qty")) * frappe.utils.flt(row.get("last_purchase_rate"))
                )

        for row in wo_rows:
            material_code = (row.get("material_item_code") or "").strip()
            row["material_item_group"] = material_group_map.get(material_code, "Unclassified") or "Unclassified"
            row["last_purchase_rate"] = frappe.utils.flt(material_rate_map.get(material_code))
            item_code = (row.get("item_code") or "").strip()
            if item_code:
                cost_by_item_selected[item_code] = cost_by_item_selected.get(item_code, 0) + (
                    frappe.utils.flt(row.get("required_qty")) * frappe.utils.flt(row.get("last_purchase_rate"))
                )

        profit_rows_wo = _apply_material_cost_by_item(profit_rows, cost_by_item_full)
        selected_profit_rows_wo = _apply_material_cost_by_item(
            selected_profit_rows,
            cost_by_item_selected if selected_qty_by_item else cost_by_item_full,
        )
        profit_summary_wo = _build_profit_summary_from_rows(profit_rows_wo)
        selected_profit_summary_wo = _build_profit_summary_from_rows(selected_profit_rows_wo)

        related_expenses = _build_related_expenses(
            selected_profit_summary_wo,
            scaled_labour.get("summary") or {},
            po_item_group_summary,
            base_payload.get("sales_order_expenses") or [],
        )
        statement_rows = _build_statement_rows(
            selected_profit_summary_wo,
            scaled_labour.get("summary") or {},
            po_item_group_summary,
            base_payload.get("sales_order_expenses") or [],
        )
        item_group_summary = _build_item_group_summary(selected_profit_rows_wo)
        hierarchical_statement_rows = _build_hierarchical_statement_rows(
            selected_profit_rows_wo,
            wo_rows,
            scaled_labour.get("rows") or [],
            po_item_group_summary,
        )

        return {
            "sales_order": sales_order,
            "linked_sales_orders": linked_sales_orders,
            "selected_delivery_note": delivery_note,
            "delivery_note_options": delivery_note_options,
            "delivery_note_meta": selected_delivery_meta,
            "delivery_note_items": selected_delivery_items,
            "invoice_details": selected_invoice_details,
            "profit_summary": profit_summary_wo,
            "profit_by_item": profit_rows_wo,
            "selected_profit_summary": selected_profit_summary_wo,
            "selected_profit_by_item": selected_profit_rows_wo,
            "bom_rows": wo_rows,
            "material_shortage": base_payload.get("material_shortage") or [],
            "labour_cost_rows": scaled_labour.get("rows") or [],
            "labour_cost_summary": scaled_labour.get("summary") or {},
            "po_item_group_summary": po_item_group_summary,
            "purchase_flow_rows": base_payload.get("purchase_flow_rows") or [],
            "sales_fulfillment_hierarchy": fulfillment_rows,
            "sales_order_expenses": base_payload.get("sales_order_expenses") or [],
            "related_expenses": related_expenses,
            "statement_rows": statement_rows,
            "item_group_summary": item_group_summary,
            "hierarchical_statement_rows": hierarchical_statement_rows,
            "material_source": "wo_consumption",
        }
    except Exception as error:
        frappe.log_error(frappe.get_traceback(), "PL by WO API Error")
        return {
            "error": str(error),
        }


@frappe.whitelist()
def custom_so_execution_status(sales_order=None, action=None, doctype=None, docname=None, stock_location=None, item_code=None):
    return run_detail_status(
        sales_order=sales_order,
        action=action,
        doctype=doctype,
        docname=docname,
        stock_location=stock_location,
        item_code=item_code,
    )


@frappe.whitelist()
def get_last_purchase_rate(item_code=None, supplier=None, company=None):
    item_code = (item_code or "").strip()
    supplier = (supplier or "").strip()
    company = (company or "").strip()
    if not item_code:
        return {"rate": 0}

    conditions = ["po.docstatus = 1", "poi.item_code = %(item_code)s"]
    values = {"item_code": item_code}
    if supplier:
        conditions.append("po.supplier = %(supplier)s")
        values["supplier"] = supplier
    if company:
        conditions.append("po.company = %(company)s")
        values["company"] = company

    row = frappe.db.sql(
        """
        SELECT poi.rate
        FROM `tabPurchase Order Item` poi
        JOIN `tabPurchase Order` po ON po.name = poi.parent
        WHERE {where_clause}
        ORDER BY po.transaction_date DESC, poi.modified DESC
        LIMIT 1
        """.format(where_clause=" AND ".join(conditions)),
        values=values,
        as_dict=True,
    )
    if row:
        return {"rate": frappe.utils.flt(row[0].get("rate") or 0)}
    return {"rate": 0}


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


def _coerce_po_item_rows(rows):
    if not rows:
        return []

    if isinstance(rows, str):
        rows = json.loads(rows)

    if not isinstance(rows, list):
        frappe.throw("PO item rows must be a list")

    out = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        item_code = (row.get("item_code") or row.get("item") or "").strip()
        if not item_code:
            continue
        out.append(
            {
                "item_code": item_code,
                "supplier": (row.get("supplier") or "").strip(),
                "warehouse": (row.get("warehouse") or "").strip(),
                "rate": frappe.utils.flt(row.get("rate") or 0),
                "base_qty": frappe.utils.flt(row.get("base_qty") or row.get("qty") or 0),
                "qty": frappe.utils.flt(row.get("po_qty") or row.get("qty") or 0),
                "descriptions": row.get("descriptions") or "",
                "comments": row.get("comments") or "",
                "select_for_po": frappe.utils.cint(row.get("select_for_po") or 0),
                "custom_wastage_percentage": frappe.utils.flt(row.get("custom_wastage_percentage") or 0),
                "custom_wastage_qty": frappe.utils.flt(row.get("custom_wastage_qty") or 0),
                "extra_qty": frappe.utils.flt(row.get("extra_qty") or 0),
                "po_qty": frappe.utils.flt(row.get("po_qty") or row.get("qty") or 0),
            }
        )
    return out


@frappe.whitelist()
def append_po_items_to_sales_order(source_name=None, rows=None):
    if not source_name:
        frappe.throw("Sales Order is required")

    sales_order = frappe.get_doc("Sales Order", source_name)
    if sales_order.docstatus == 2:
        frappe.throw("Cancelled Sales Order is not allowed")

    parsed_rows = _coerce_po_item_rows(rows)
    if not parsed_rows:
        frappe.throw("No valid PO item rows provided")

    saved_names = []
    for payload in parsed_rows:
        row = sales_order.append("custom_po_item", {})
        row.item = payload.get("item_code")
        row.supplier = payload.get("supplier") or ""
        row.warehouse = payload.get("warehouse") or ""
        row.rate = payload.get("rate") or 0
        row.qty = payload.get("qty") or 0
        row.custom_base_qty = payload.get("base_qty") or 0
        row.descriptions = payload.get("descriptions") or ""
        row.comments = payload.get("comments") or ""
        row.select_for_po = payload.get("select_for_po") or 0
        row.custom_wastage_percentage = payload.get("custom_wastage_percentage") or 0
        row.custom_wastage_qty = payload.get("custom_wastage_qty") or 0
        row.custom_extra_qty = payload.get("extra_qty") or 0
        row.custom_po_qty = payload.get("po_qty") or payload.get("qty") or 0
        saved_names.append(row.name)

    sales_order.save(ignore_permissions=True)
    frappe.db.commit()

    refreshed = frappe.get_doc("Sales Order", source_name)
    refreshed_names = [row.name for row in (refreshed.get("custom_po_item") or []) if row.name]
    resolved = [name for name in refreshed_names if name in saved_names]

    if not resolved:
        # Fallback: return the newest appended rows by count.
        resolved = refreshed_names[-len(parsed_rows):]

    return {
        "row_names": resolved,
        "row_count": len(resolved),
    }


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
        fields=["name", "item_name", "description", "stock_uom", "purchase_uom", "has_variants"],
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
        default_set_warehouse = ""
        for _r in supplier_rows:
            wh = (_r.get("warehouse") or "").strip()
            if wh:
                default_set_warehouse = wh
                break
        if default_set_warehouse:
            po.set_warehouse = default_set_warehouse

        for row in supplier_rows:
            item = item_map.get(row.item)
            if not item:
                frappe.throw("Item not found: " + str(row.item))
            if frappe.utils.cint(item.get("has_variants")):
                frappe.throw(
                    "Item "
                    + str(row.item)
                    + " is a template, please select one of its variants"
                )

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
                    "custom_base_qty": frappe.utils.flt(row.get("custom_base_qty") or row.qty or 0),
                    "custom_wastage_percentage": frappe.utils.flt(row.get("custom_wastage_percentage") or 0),
                    "custom_wastage_qty": frappe.utils.flt(row.get("custom_wastage_qty") or 0),
                    "custom_extra_qty": frappe.utils.flt(row.get("custom_extra_qty") or 0),
                    "custom_po_qty": frappe.utils.flt(row.get("custom_po_qty") or row.qty or 0),
                    "qty": row.qty,
                    "rate": frappe.utils.flt(row.get("rate") or 0),
                    "warehouse": (row.get("warehouse") or "").strip(),
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


@frappe.whitelist()
def create_po_from_material_shortage_line(
    source_name=None,
    item_code=None,
    qty=None,
    supplier=None,
    description=None,
    warehouse=None,
    rate=None,
    wastage_pct=None,
    wastage_qty=None,
    extra_qty=None,
):
    if not source_name:
        frappe.throw("Sales Order is required")
    if not item_code:
        frappe.throw("Item is required")
    if frappe.utils.flt(qty) <= 0:
        frappe.throw("Qty must be greater than zero")
    if not supplier:
        frappe.throw("Supplier is required")

    so = frappe.get_doc("Sales Order", source_name)
    row = so.append("custom_po_item", {})
    row.item = item_code
    row.qty = frappe.utils.flt(qty)
    row.custom_base_qty = frappe.utils.flt(qty)
    row.custom_po_qty = frappe.utils.flt(qty)
    row.custom_wastage_percentage = 0
    row.custom_wastage_qty = 0
    row.custom_extra_qty = 0
    row.rate = frappe.utils.flt(rate or 0)
    row.supplier = supplier
    row.warehouse = (warehouse or "").strip()
    row.custom_wastage_percentage = frappe.utils.flt(wastage_pct or 0)
    row.custom_wastage_qty = frappe.utils.flt(wastage_qty or 0)
    row.custom_extra_qty = frappe.utils.flt(extra_qty or 0)
    row.descriptions = (description or "").strip()
    row.select_for_po = 1
    so.save(ignore_permissions=True)

    created = create_po_from_sales_order_po_tab(source_name=source_name, row_names=[row.name])
    return {
        "row_name": row.name,
        "created": created,
    }


# ---------------------------------------------------------------------------
# Per Piece Payroll & Daily Overtime APIs
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_item_process_rows(item_group=None, item=None):
    """Return per-piece process rows for the given item or item group."""
    filters = {"disabled": 0}
    if item:
        filters["name"] = item
    elif item_group:
        filters["item_group"] = item_group

    items = frappe.get_all(
        "Item",
        filters=filters,
        fields=["name", "item_name", "item_group"],
        order_by="name asc",
        limit_page_length=5000,
    )

    employee_ids = set()
    for item_row in items:
        item_doc = frappe.get_doc("Item", item_row["name"])
        for row in item_doc.get("custom_prd_process_and_sizes") or []:
            employee = (row.get("employee") or "").strip()
            if employee:
                employee_ids.add(employee)

    employee_name_map = {}
    if employee_ids:
        for emp in frappe.get_all(
            "Employee",
            filters={"name": ["in", list(employee_ids)]},
            fields=["name", "employee_name"],
            limit_page_length=5000,
        ):
            employee_name_map[str(emp.get("name") or "")] = str(emp.get("employee_name") or "").strip()

    output = []
    for item_row in items:
        item_doc = frappe.get_doc("Item", item_row["name"])
        process_rows = item_doc.get("custom_prd_process_and_sizes") or []

        if process_rows:
            for row in process_rows:
                employee = (row.get("employee") or "").strip()
                output.append({
                    "item": item_row["name"],
                    "item_name": item_row.get("item_name") or item_row["name"],
                    "item_group": item_row.get("item_group") or "",
                    "employee": employee,
                    "employee_name": employee_name_map.get(employee, ""),
                    "process_type": row.get("process_type") or "",
                    "process_size": row.get("process_size") or "No Size",
                    "rate": frappe.utils.flt(row.get("rate")),
                    "source": "item_process_table",
                })
            continue

        output.append({
            "item": item_row["name"],
            "item_name": item_row.get("item_name") or item_row["name"],
            "item_group": item_row.get("item_group") or "",
            "employee": "",
            "employee_name": "",
            "process_type": "",
            "process_size": "No Size",
            "rate": 0.0,
            "source": "item",
        })

    return output


@frappe.whitelist()
def force_sync_per_piece_status():
    """Re-sync JV/payment status on all Per Piece rows from live Journal Entry state."""
    def _round2(v):
        return round(float(v or 0), 2)

    rows = frappe.get_all(
        "Per Piece",
        filters={"docstatus": ["<", 2]},
        fields=[
            "name", "amount", "jv_status", "jv_entry_no", "booked_amount",
            "paid_amount", "unpaid_amount", "payment_status", "payment_jv_no",
            "payment_refs", "payment_line_remark",
        ],
        limit_page_length=200000,
    )
    if not rows:
        return {"ok": True, "rows_checked": 0, "rows_updated": 0}

    jv_names = {str(r.get("jv_entry_no") or "").strip() for r in rows if str(r.get("jv_entry_no") or "").strip()}
    pay_jv_names = {str(r.get("payment_jv_no") or "").strip() for r in rows if str(r.get("payment_jv_no") or "").strip()}
    all_jv_names = sorted(jv_names | pay_jv_names)

    jv_status_map = {}
    if all_jv_names:
        for je in frappe.get_all(
            "Journal Entry",
            filters={"name": ["in", all_jv_names]},
            fields=["name", "docstatus"],
            limit_page_length=50000,
        ):
            jv_status_map[str(je.get("name") or "")] = int(je.get("docstatus") or 0)

    updated = 0
    for row in rows:
        name = row.get("name")
        amount = max(_round2(row.get("amount")), 0.0)
        jv_no = str(row.get("jv_entry_no") or "").strip()
        jv_state = jv_status_map.get(jv_no, 0) if jv_no else 0
        is_booked = bool(jv_no and jv_state == 1)

        new_jv_no = jv_no if is_booked else ""
        new_jv_status = "Posted" if is_booked else "Pending"
        new_booked = amount if is_booked else 0.0

        paid = max(_round2(row.get("paid_amount")), 0.0)
        pay_jv_no = str(row.get("payment_jv_no") or "").strip()
        if pay_jv_no and jv_status_map.get(pay_jv_no, 0) != 1:
            pay_jv_no = ""

        if not is_booked:
            paid, unpaid, pay_jv_no = 0.0, 0.0, ""
            pay_status, pay_refs, pay_remark = "Unpaid", "", ""
        else:
            if paid > new_booked:
                paid = new_booked
            unpaid = max(_round2(new_booked - paid), 0.0)
            pay_status = "Paid" if unpaid <= 0.005 else ("Partly Paid" if paid > 0.005 else "Unpaid")
            pay_refs = row.get("payment_refs") or ""
            pay_remark = row.get("payment_line_remark") or ""

        current = {
            "jv_entry_no": str(row.get("jv_entry_no") or "").strip(),
            "jv_status": str(row.get("jv_status") or "").strip() or "Pending",
            "booked_amount": _round2(row.get("booked_amount")),
            "paid_amount": _round2(row.get("paid_amount")),
            "unpaid_amount": _round2(row.get("unpaid_amount")),
            "payment_status": str(row.get("payment_status") or "").strip() or "Unpaid",
            "payment_jv_no": str(row.get("payment_jv_no") or "").strip(),
            "payment_refs": row.get("payment_refs") or "",
            "payment_line_remark": row.get("payment_line_remark") or "",
        }
        target = {
            "jv_entry_no": new_jv_no, "jv_status": new_jv_status,
            "booked_amount": _round2(new_booked), "paid_amount": _round2(paid),
            "unpaid_amount": _round2(unpaid), "payment_status": pay_status,
            "payment_jv_no": pay_jv_no, "payment_refs": pay_refs,
            "payment_line_remark": pay_remark,
        }
        if any(str(current[k]) != str(target[k]) for k in target):
            for k, v in target.items():
                frappe.db.set_value("Per Piece", name, k, v, update_modified=False)
            updated += 1

    frappe.db.sql("""
        UPDATE `tabPer Piece Salary` pps
        LEFT JOIN (
            SELECT parent,
                ROUND(SUM(IFNULL(qty, 0)), 2) AS total_qty,
                ROUND(SUM(IFNULL(amount, 0)), 2) AS total_amount
            FROM `tabPer Piece`
            WHERE parenttype='Per Piece Salary' AND parentfield='perpiece'
            GROUP BY parent
        ) agg ON agg.parent = pps.name
        SET
            pps.total_qty = IFNULL(agg.total_qty, 0),
            pps.total_amount = IFNULL(agg.total_amount, 0)
        WHERE pps.docstatus < 2
    """)
    frappe.db.commit()
    return {"ok": True, "rows_checked": len(rows), "rows_updated": updated}


def _status_counts_label(rows):
    counts = {}
    for row in rows or []:
        status = (row.get("status") or "Unknown").strip() or "Unknown"
        counts[status] = counts.get(status, 0) + 1
    if not counts:
        return "-"
    ordered = sorted(counts.items(), key=lambda kv: kv[0].lower())
    return ", ".join([f"{name}: {qty}" for name, qty in ordered])


def _num(v):
    try:
        return float(v or 0)
    except Exception:
        return 0.0


@frappe.whitelist()
def get_sales_order_status_board(
    company=None,
    customer=None,
    sales_order=None,
    from_date=None,
    to_date=None,
    so_status=None,
):
    conditions = ["so.docstatus < 2", "LOWER(IFNULL(so.status, '')) NOT IN ('cancelled', 'canceled')"]
    values = {}

    if company:
        conditions.append("so.company = %(company)s")
        values["company"] = company
    if customer:
        conditions.append("so.customer = %(customer)s")
        values["customer"] = customer
    if sales_order:
        conditions.append("so.name = %(sales_order)s")
        values["sales_order"] = sales_order
    if from_date:
        conditions.append("so.transaction_date >= %(from_date)s")
        values["from_date"] = from_date
    if to_date:
        conditions.append("so.transaction_date <= %(to_date)s")
        values["to_date"] = to_date
    if so_status and str(so_status).strip().lower() not in {"cancelled", "canceled"}:
        conditions.append("so.status = %(so_status)s")
        values["so_status"] = so_status

    so_rows = frappe.db.sql(
        f"""
        SELECT
            so.name AS sales_order,
            so.transaction_date AS date,
            so.customer,
            so.status AS so_status,
            IFNULL(so.delivery_status, '') AS delivery_status,
            IFNULL(so.billing_status, '') AS billing_status
        FROM `tabSales Order` so
        WHERE {" AND ".join(conditions)}
        ORDER BY so.transaction_date DESC, so.name DESC
        """,
        values,
        as_dict=True,
    )

    if not so_rows:
        return {"rows": []}

    so_names = [r.get("sales_order") for r in so_rows if r.get("sales_order")]

    ordered_qty_rows = frappe.db.sql(
        """
        SELECT parent AS sales_order, item_code, SUM(IFNULL(qty, 0)) AS ordered_qty
        FROM `tabSales Order Item`
        WHERE parent IN %(so_names)s
        GROUP BY parent, item_code
        """,
        {"so_names": tuple(so_names)},
        as_dict=True,
    )
    ordered_qty_map = {}
    for row in ordered_qty_rows:
        ordered_qty_map[(row.get("sales_order"), row.get("item_code"))] = _num(row.get("ordered_qty"))

    pp_status_rows = frappe.db.sql(
        """
        SELECT pps.sales_order, pp.name, IFNULL(pp.status, 'Draft') AS status
        FROM `tabProduction Plan Sales Order` pps
        JOIN `tabProduction Plan` pp ON pp.name = pps.parent
        WHERE pps.sales_order IN %(so_names)s
            AND pp.docstatus != 2
            AND LOWER(IFNULL(pp.status, '')) NOT IN ('cancelled', 'canceled')
        ORDER BY pp.modified DESC
        """,
        {"so_names": tuple(so_names)},
        as_dict=True,
    )

    pp_item_rows = frappe.db.sql(
        """
        SELECT
            ppi.sales_order,
            ppi.item_code AS item,
            SUM(IFNULL(ppi.planned_qty, 0)) AS planned_qty,
            SUM(IFNULL(ppi.produced_qty, 0)) AS produced_qty
        FROM `tabProduction Plan Item` ppi
        JOIN `tabProduction Plan` pp ON pp.name = ppi.parent
        WHERE ppi.sales_order IN %(so_names)s
            AND pp.docstatus != 2
            AND LOWER(IFNULL(pp.status, '')) NOT IN ('cancelled', 'canceled')
        GROUP BY ppi.sales_order, ppi.item_code
        ORDER BY ppi.sales_order, ppi.item_code
        """,
        {"so_names": tuple(so_names)},
        as_dict=True,
    )

    wo_rows = frappe.db.sql(
        """
        SELECT
            wo.sales_order,
            wo.name,
            IFNULL(wo.status, 'Draft') AS status,
            IFNULL(wo.production_item, '') AS item,
            IFNULL(wo.qty, 0) AS qty,
            IFNULL(wo.material_transferred_for_manufacturing, 0) AS material_transferred_for_manufacturing,
            IFNULL(wo.produced_qty, 0) AS produced_qty,
            IFNULL(wo.process_loss_qty, 0) AS process_loss_qty
        FROM `tabWork Order` wo
        WHERE wo.sales_order IN %(so_names)s
            AND wo.docstatus != 2
            AND LOWER(IFNULL(wo.status, '')) NOT IN ('cancelled', 'canceled')
        ORDER BY wo.modified DESC
        """,
        {"so_names": tuple(so_names)},
        as_dict=True,
    )

    wo_names = [r.get("name") for r in wo_rows if r.get("name")]
    jc_rows = []
    se_rows = []
    if wo_names:
        jc_rows = frappe.db.sql(
            """
            SELECT
                wo.sales_order,
                jc.name,
                IFNULL(jc.status, 'Draft') AS status,
                IFNULL(wo.production_item, '') AS item,
                IFNULL(jctl.employee, '') AS employee,
                IFNULL(jc.operation, '') AS operation,
                IFNULL(jc.for_quantity, 0) AS for_quantity,
                IFNULL(jc.total_completed_qty, 0) AS total_completed_qty,
                IFNULL(jc.process_loss_qty, 0) AS process_loss_qty
            FROM `tabJob Card` jc
            JOIN `tabWork Order` wo ON wo.name = jc.work_order
            LEFT JOIN (
                SELECT parent, MIN(employee) AS employee
                FROM `tabJob Card Time Log`
                WHERE IFNULL(employee, '') != ''
                GROUP BY parent
            ) jctl ON jctl.parent = jc.name
            WHERE jc.work_order IN %(wo_names)s
                AND jc.docstatus != 2
                AND wo.docstatus != 2
                AND LOWER(IFNULL(jc.status, '')) NOT IN ('cancelled', 'canceled')
                AND LOWER(IFNULL(wo.status, '')) NOT IN ('cancelled', 'canceled')
            ORDER BY jc.modified DESC
            """,
            {"wo_names": tuple(wo_names)},
            as_dict=True,
        )

        se_rows = frappe.db.sql(
            """
            SELECT
                wo.sales_order,
                se.name,
                se.work_order,
                se.docstatus,
                IFNULL(se.purpose, '') AS stock_entry_type,
                IFNULL(se.fg_completed_qty, 0) AS fg_completed_qty,
                IFNULL(se.bom_no, '') AS bom_no
            FROM `tabStock Entry` se
            JOIN `tabWork Order` wo ON wo.name = se.work_order
            WHERE se.work_order IN %(wo_names)s
                AND se.docstatus != 2
                AND wo.docstatus != 2
                AND LOWER(IFNULL(wo.status, '')) NOT IN ('cancelled', 'canceled')
            ORDER BY se.modified DESC
            """,
            {"wo_names": tuple(wo_names)},
            as_dict=True,
        )

    pp_status_map = {}
    for row in pp_status_rows:
        pp_status_map.setdefault(row.get("sales_order"), []).append({"name": row.get("name"), "status": row.get("status")})

    pp_item_map = {}
    for row in pp_item_rows:
        so_name = row.get("sales_order")
        item_code = row.get("item") or ""
        planned = _num(row.get("planned_qty"))
        produced = _num(row.get("produced_qty"))
        pp_item_map.setdefault(so_name, []).append(
            {
                "item": item_code,
                "planned_qty": planned,
                "produced_qty": produced,
                "pending_qty": max(planned - produced, 0),
                "ordered_qty": _num(ordered_qty_map.get((so_name, item_code))),
            }
        )

    wo_map = {}
    for row in wo_rows:
        wo_map.setdefault(row.get("sales_order"), []).append(
            {
                "name": row.get("name"),
                "status": row.get("status"),
                "item": row.get("item"),
                "qty": _num(row.get("qty")),
                "material_transferred_for_manufacturing": _num(row.get("material_transferred_for_manufacturing")),
                "produced_qty": _num(row.get("produced_qty")),
                "process_loss_qty": _num(row.get("process_loss_qty")),
            }
        )

    jc_map = {}
    for row in jc_rows:
        jc_map.setdefault(row.get("sales_order"), []).append(
            {
                "name": row.get("name"),
                "status": row.get("status"),
                "item": row.get("item"),
                "employee": row.get("employee"),
                "operation": row.get("operation"),
                "for_quantity": _num(row.get("for_quantity")),
                "total_completed_qty": _num(row.get("total_completed_qty")),
                "process_loss_qty": _num(row.get("process_loss_qty")),
            }
        )

    se_map = {}
    for row in se_rows:
        status = "Draft"
        if int(_num(row.get("docstatus"))) == 1:
            status = "Submitted"
        se_map.setdefault(row.get("sales_order"), []).append(
            {
                "name": row.get("name"),
                "status": status,
                "work_order": row.get("work_order"),
                "stock_entry_type": row.get("stock_entry_type"),
                "fg_completed_qty": _num(row.get("fg_completed_qty")),
                "bom_no": row.get("bom_no"),
            }
        )

    rows = []
    for base in so_rows:
        so_name = base.get("sales_order")
        pp_details = pp_item_map.get(so_name) or []
        wo_details = wo_map.get(so_name) or []
        jc_details = jc_map.get(so_name) or []
        se_details = se_map.get(so_name) or []
        pp_statuses = pp_status_map.get(so_name) or []

        pp_planned = sum(_num(x.get("planned_qty")) for x in pp_details)
        pp_produced = sum(_num(x.get("produced_qty")) for x in pp_details)
        wo_qty = sum(_num(x.get("qty")) for x in wo_details)
        wo_produced = sum(_num(x.get("produced_qty")) for x in wo_details)
        jc_for_qty = sum(_num(x.get("for_quantity")) for x in jc_details)
        jc_done = sum(_num(x.get("total_completed_qty")) for x in jc_details)

        pp_pct = (pp_produced * 100.0 / pp_planned) if pp_planned else 0
        wo_pct = (wo_produced * 100.0 / wo_qty) if wo_qty else 0
        jc_pct = (jc_done * 100.0 / jc_for_qty) if jc_for_qty else 0

        rows.append(
            {
                "sales_order": so_name,
                "date": base.get("date"),
                "customer": base.get("customer"),
                "so_status": base.get("so_status"),
                "delivery_status": base.get("delivery_status"),
                "billing_status": base.get("billing_status"),
                "production_plan_status": f"{len(pp_statuses)} plan(s) | {pp_pct:.1f}%",
                "work_order_status": f"{len(wo_details)} WO | {wo_pct:.1f}%",
                "job_card_status": f"{len(jc_details)} JC | {jc_pct:.1f}%",
                "stock_entry_status": f"{len(se_details)} SE",
                "wo_completion_pct": round(wo_pct, 1),
                "production_plan_details": pp_details,
                "work_order_details": wo_details,
                "job_card_details": jc_details,
                "stock_entry_details": se_details,
                "wo_details": wo_details,
                "jc_details": jc_details,
                "production_plans": _status_counts_label(pp_statuses),
                "work_order_completed": round(wo_produced, 2),
                "work_order_total": round(wo_qty, 2),
                "job_card_completed": round(jc_done, 2),
                "job_card_total": round(jc_for_qty, 2),
                "stock_entry_count": len(se_details),
            }
        )

    return {"rows": rows}


def _format_date(value):
    if not value:
        return ""
    try:
        return str(value)
    except Exception:
        return ""


@frappe.whitelist()
def get_purchase_order_item_status(purchase_order=None, from_date=None, to_date=None):
    purchase_order = (purchase_order or "").strip()
    if not purchase_order:
        return {"rows": [], "meta": {}}

    conditions = [
        "po.name = %(purchase_order)s",
        "po.docstatus < 2",
        "LOWER(IFNULL(po.status, '')) NOT IN ('cancelled', 'canceled')",
    ]
    values = {"purchase_order": purchase_order}

    if from_date:
        conditions.append("po.transaction_date >= %(from_date)s")
        values["from_date"] = from_date
    if to_date:
        conditions.append("po.transaction_date <= %(to_date)s")
        values["to_date"] = to_date

    rows = frappe.db.sql(
        f"""
        SELECT
            poi.item_code AS item,
            IFNULL(poi.rate, 0) AS rate,
            IFNULL(poi.qty, 0) AS ordered_qty,
            IFNULL(poi.received_qty, 0) AS received_qty
        FROM `tabPurchase Order Item` poi
        JOIN `tabPurchase Order` po ON po.name = poi.parent
        WHERE {" AND ".join(conditions)}
        ORDER BY poi.idx ASC
        """,
        values,
        as_dict=True,
    )

    po_meta = frappe.db.get_value(
        "Purchase Order",
        purchase_order,
        ["status", "transaction_date", "supplier", "company"],
        as_dict=True,
    ) or {}

    out = []
    for row in rows:
        ordered = _num(row.get("ordered_qty"))
        received = _num(row.get("received_qty"))
        pending = ordered - received
        if pending < 0:
            pending = 0
        out.append(
            {
                "item": row.get("item"),
                "rate": _num(row.get("rate")),
                "ordered_qty": ordered,
                "received_qty": received,
                "pending_qty": pending,
            }
        )

    return {
        "rows": out,
        "meta": {
            "purchase_order": purchase_order,
            "status": po_meta.get("status") or "",
            "date": _format_date(po_meta.get("transaction_date")),
            "supplier": po_meta.get("supplier") or "",
            "company": po_meta.get("company") or "",
        },
    }


@frappe.whitelist()
def get_item_purchase_order_status(item_code=None, from_date=None, to_date=None):
    item_code = (item_code or "").strip()
    if not item_code:
        return {"rows": []}

    conditions = [
        "poi.item_code = %(item_code)s",
        "po.docstatus < 2",
        "LOWER(IFNULL(po.status, '')) NOT IN ('cancelled', 'canceled')",
    ]
    values = {"item_code": item_code}

    if from_date:
        conditions.append("po.transaction_date >= %(from_date)s")
        values["from_date"] = from_date
    if to_date:
        conditions.append("po.transaction_date <= %(to_date)s")
        values["to_date"] = to_date

    rows = frappe.db.sql(
        f"""
        SELECT
            po.name AS purchase_order,
            po.transaction_date AS date,
            po.supplier,
            IFNULL(poi.rate, 0) AS rate,
            IFNULL(poi.qty, 0) AS ordered_qty,
            IFNULL(poi.received_qty, 0) AS received_qty
        FROM `tabPurchase Order Item` poi
        JOIN `tabPurchase Order` po ON po.name = poi.parent
        WHERE {" AND ".join(conditions)}
        ORDER BY po.transaction_date DESC, po.name DESC, poi.idx ASC
        """,
        values,
        as_dict=True,
    )

    out = []
    for row in rows:
        ordered = _num(row.get("ordered_qty"))
        received = _num(row.get("received_qty"))
        pending = ordered - received
        if pending < 0:
            pending = 0
        out.append(
            {
                "purchase_order": row.get("purchase_order"),
                "date": _format_date(row.get("date")),
                "supplier": row.get("supplier") or "",
                "rate": _num(row.get("rate")),
                "ordered_qty": ordered,
                "received_qty": received,
                "pending_qty": pending,
            }
        )

    return {"rows": out}


@frappe.whitelist()
def get_supplier_purchase_order_status(supplier=None, from_date=None, to_date=None):
    supplier = (supplier or "").strip()
    if not supplier:
        return {"rows": []}

    conditions = [
        "po.supplier = %(supplier)s",
        "po.docstatus < 2",
        "LOWER(IFNULL(po.status, '')) NOT IN ('cancelled', 'canceled')",
    ]
    values = {"supplier": supplier}

    if from_date:
        conditions.append("po.transaction_date >= %(from_date)s")
        values["from_date"] = from_date
    if to_date:
        conditions.append("po.transaction_date <= %(to_date)s")
        values["to_date"] = to_date

    rows = frappe.db.sql(
        f"""
        SELECT
            po.name AS purchase_order,
            po.transaction_date AS date,
            poi.item_code AS item,
            IFNULL(poi.rate, 0) AS rate,
            IFNULL(poi.qty, 0) AS ordered_qty,
            IFNULL(poi.received_qty, 0) AS received_qty
        FROM `tabPurchase Order Item` poi
        JOIN `tabPurchase Order` po ON po.name = poi.parent
        WHERE {" AND ".join(conditions)}
        ORDER BY po.transaction_date DESC, po.name DESC, poi.idx ASC
        """,
        values,
        as_dict=True,
    )

    out = []
    for row in rows:
        ordered = _num(row.get("ordered_qty"))
        received = _num(row.get("received_qty"))
        pending = ordered - received
        if pending < 0:
            pending = 0
        out.append(
            {
                "purchase_order": row.get("purchase_order"),
                "date": _format_date(row.get("date")),
                "item": row.get("item") or "",
                "rate": _num(row.get("rate")),
                "ordered_qty": ordered,
                "received_qty": received,
                "pending_qty": pending,
            }
        )

    return {"rows": out}


@frappe.whitelist()
def get_employee_advance_ledger(employee=None, from_date=None, to_date=None):
    employee = (employee or "").strip()
    if not employee:
        return {"rows": [], "gl_rows": []}

    conditions = [
        "ea.employee = %(employee)s",
        "ea.docstatus < 2",
        "LOWER(IFNULL(ea.status, '')) NOT IN ('cancelled', 'canceled')",
    ]
    values = {"employee": employee}

    if from_date:
        conditions.append("ea.posting_date >= %(from_date)s")
        values["from_date"] = from_date
    if to_date:
        conditions.append("ea.posting_date <= %(to_date)s")
        values["to_date"] = to_date

    rows = frappe.db.sql(
        f"""
        SELECT
            ea.name AS employee_advance,
            ea.posting_date AS date,
            IFNULL(ea.purpose, '') AS purpose,
            IFNULL(ea.advance_amount, 0) AS advance_amount,
            IFNULL(ea.paid_amount, 0) AS paid_amount,
            IFNULL(ea.claimed_amount, 0) AS claimed_amount,
            IFNULL(ea.return_amount, 0) AS return_amount,
            IFNULL(ea.pending_amount, 0) AS pending_amount,
            IFNULL(ea.status, '') AS status
        FROM `tabEmployee Advance` ea
        WHERE {" AND ".join(conditions)}
        ORDER BY ea.posting_date DESC, ea.name DESC
        """,
        values,
        as_dict=True,
    )

    summary_values = {"employee": employee}
    summary_conditions = [
        "ea.employee = %(employee)s",
        "ea.docstatus = 1",
        "LOWER(IFNULL(ea.status, '')) NOT IN ('cancelled', 'canceled')",
    ]
    if to_date:
        summary_conditions.append("ea.posting_date <= %(to_date)s")
        summary_values["to_date"] = to_date

    advance_opening = 0.0
    if from_date:
        advance_opening = _num(
            frappe.db.sql(
                """
                SELECT
                    IFNULL(SUM(IFNULL(ea.paid_amount, 0) - IFNULL(ea.claimed_amount, 0) - IFNULL(ea.return_amount, 0)), 0)
                FROM `tabEmployee Advance` ea
                WHERE
                    ea.employee = %(employee)s
                    AND ea.docstatus = 1
                    AND LOWER(IFNULL(ea.status, '')) NOT IN ('cancelled', 'canceled')
                    AND ea.posting_date < %(from_date)s
                """,
                {"employee": employee, "from_date": from_date},
            )[0][0]
            or 0
        )

    advance_totals = frappe.db.sql(
        f"""
        SELECT
            IFNULL(SUM(IFNULL(ea.paid_amount, 0)), 0) AS paid_amount,
            IFNULL(SUM(IFNULL(ea.claimed_amount, 0)), 0) AS claimed_amount,
            IFNULL(SUM(IFNULL(ea.return_amount, 0)), 0) AS return_amount
        FROM `tabEmployee Advance` ea
        WHERE {" AND ".join(summary_conditions)}
        """,
        summary_values,
        as_dict=True,
    )
    advance_totals = (advance_totals or [{}])[0]
    paid_total = _num(advance_totals.get("paid_amount"))
    claimed_total = _num(advance_totals.get("claimed_amount"))
    return_total = _num(advance_totals.get("return_amount"))
    advance_closing = paid_total - claimed_total - return_total
    advance_delta = advance_closing - advance_opening

    employee_advance_account = (
        frappe.db.get_value("Employee", employee, "employee_advance_account") or ""
    ).strip()
    if not employee_advance_account:
        employee_advance_account = (
            frappe.db.sql(
                """
                SELECT IFNULL(ea.advance_account, '')
                FROM `tabEmployee Advance` ea
                WHERE ea.employee = %(employee)s
                    AND IFNULL(ea.advance_account, '') != ''
                ORDER BY ea.posting_date DESC, ea.name DESC
                LIMIT 1
                """,
                {"employee": employee},
            )[0][0]
            or ""
        ).strip()

    gl_base_conditions = [
        "gl.is_cancelled = 0",
        "IFNULL(gl.party_type, '') = 'Employee'",
        "IFNULL(gl.party, '') = %(employee)s",
    ]
    gl_base_values = {"employee": employee}
    if employee_advance_account:
        gl_base_conditions.append("gl.account = %(advance_account)s")
        gl_base_values["advance_account"] = employee_advance_account

    gl_opening = 0.0
    if from_date:
        opening_conditions = list(gl_base_conditions) + ["gl.posting_date < %(from_date)s"]
        opening_values = dict(gl_base_values)
        opening_values["from_date"] = from_date
        gl_opening = _num(
            frappe.db.sql(
                f"""
                SELECT IFNULL(SUM(IFNULL(gl.debit, 0) - IFNULL(gl.credit, 0)), 0)
                FROM `tabGL Entry` gl
                WHERE {" AND ".join(opening_conditions)}
                """,
                opening_values,
            )[0][0]
            or 0
        )

    gl_range_conditions = list(gl_base_conditions)
    gl_range_values = dict(gl_base_values)
    if from_date:
        gl_range_conditions.append("gl.posting_date >= %(from_date)s")
        gl_range_values["from_date"] = from_date
    if to_date:
        gl_range_conditions.append("gl.posting_date <= %(to_date)s")
        gl_range_values["to_date"] = to_date

    gl_rows_raw = frappe.db.sql(
        f"""
        SELECT
            gl.posting_date,
            gl.voucher_type,
            gl.voucher_no,
            gl.account,
            IFNULL(gl.debit, 0) AS debit,
            IFNULL(gl.credit, 0) AS credit,
            IFNULL(gl.remarks, '') AS remarks
        FROM `tabGL Entry` gl
        WHERE {" AND ".join(gl_range_conditions)}
        ORDER BY gl.posting_date ASC, gl.creation ASC, gl.name ASC
        """,
        gl_range_values,
        as_dict=True,
    )

    gl_rows = []
    running_balance = gl_opening
    gl_debit_total = 0.0
    gl_credit_total = 0.0
    for row in gl_rows_raw:
        debit = _num(row.get("debit"))
        credit = _num(row.get("credit"))
        running_balance += debit - credit
        gl_debit_total += debit
        gl_credit_total += credit
        gl_rows.append(
            {
                "date": _format_date(row.get("posting_date")),
                "voucher_type": row.get("voucher_type") or "",
                "voucher_no": row.get("voucher_no") or "",
                "account": row.get("account") or "",
                "debit": debit,
                "credit": credit,
                "remarks": row.get("remarks") or "",
                "running_balance": running_balance,
            }
        )

    gl_closing = gl_opening + gl_debit_total - gl_credit_total
    gl_delta = gl_closing - gl_opening

    out = []
    for row in rows:
        out.append(
            {
                "employee_advance": row.get("employee_advance"),
                "date": _format_date(row.get("date")),
                "purpose": row.get("purpose") or "",
                "advance_amount": _num(row.get("advance_amount")),
                "paid_amount": _num(row.get("paid_amount")),
                "claimed_amount": _num(row.get("claimed_amount")),
                "return_amount": _num(row.get("return_amount")),
                "pending_amount": _num(row.get("pending_amount")),
                "status": row.get("status") or "",
            }
        )

    return {
        "rows": out,
        "summary": {
            "opening_balance": advance_opening,
            "paid_amount": paid_total,
            "claimed_amount": claimed_total,
            "return_amount": return_total,
            "range_delta": advance_delta,
            "closing_balance": advance_closing,
        },
        "gl_rows": gl_rows,
        "gl_summary": {
            "account": employee_advance_account,
            "opening_balance": gl_opening,
            "debit_total": gl_debit_total,
            "credit_total": gl_credit_total,
            "range_delta": gl_delta,
            "closing_balance": gl_closing,
        },
    }
