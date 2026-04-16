from __future__ import annotations

import frappe


OPERATIONS_SEQUENCE = ["Cutting", "Stitching", "Quilting", "Packing"]


@frappe.whitelist()
def get_daily_operation_page_data(filters=None):
	filters = frappe._dict(frappe.parse_json(filters) or {})
	detail_rows = _get_detail_rows(filters)
	sales_orders = sorted({(row.get("sales_order") or "").strip() for row in detail_rows if row.get("sales_order")})
	order_qty_map = _get_sales_order_item_qty_map(sales_orders, filters.get("item"))

	groups_map = {}
	total_qty = 0.0

	for row in detail_rows:
		sales_order = (row.get("sales_order") or "No Sales Order").strip() or "No Sales Order"
		item_code = (row.get("item") or "No Item").strip() or "No Item"
		operation = (row.get("operation") or "").strip()
		if operation not in OPERATIONS_SEQUENCE:
			continue

		work_date = str(row.get("work_date") or "")[:10]
		qty = frappe.utils.flt(row.get("qty"))
		total_qty += qty

		sales_order_group = groups_map.setdefault(
			sales_order,
			{
				"sales_order": sales_order,
				"order_qty": 0.0,
				"items_map": {},
			},
		)

		item_group = sales_order_group["items_map"].setdefault(
			item_code,
			{
				"item": item_code,
				"order_qty": frappe.utils.flt(order_qty_map.get((sales_order, item_code))),
				"rows_map": {},
				"totals": {operation_name: 0.0 for operation_name in OPERATIONS_SEQUENCE},
			},
		)

		row_bucket = item_group["rows_map"].setdefault(
			work_date,
			{
				"date": work_date,
				"values": {operation_name: 0.0 for operation_name in OPERATIONS_SEQUENCE},
			},
		)
		row_bucket["values"][operation] += qty
		item_group["totals"][operation] += qty

	groups = []
	total_order_qty = 0.0
	total_items = 0

	for sales_order in sorted(groups_map):
		sales_order_group = groups_map[sales_order]
		items = []
		for item_code in sorted(sales_order_group["items_map"]):
			item_group = sales_order_group["items_map"][item_code]
			rows = sorted(item_group["rows_map"].values(), key=lambda row: row.get("date") or "", reverse=True)
			order_qty = frappe.utils.flt(item_group.get("order_qty"))
			totals = {operation: frappe.utils.flt(item_group["totals"].get(operation)) for operation in OPERATIONS_SEQUENCE}
			wastage = _build_wastage_row(order_qty, totals)
			items.append(
				{
					"item": item_code,
					"order_qty": order_qty,
					"rows": rows,
					"totals": totals,
					"wastage": wastage,
				}
			)
			total_items += 1

		sales_order_group_qty = sum(frappe.utils.flt(item.get("order_qty")) for item in items)
		total_order_qty += sales_order_group_qty
		groups.append(
			{
				"sales_order": sales_order,
				"order_qty": sales_order_group_qty,
				"items": items,
			}
		)

	return {
		"operations": OPERATIONS_SEQUENCE,
		"groups": groups,
		"summary": [
			{"label": "Sales Orders", "value": len(groups), "indicator": "Blue", "datatype": "Int"},
			{"label": "Items", "value": total_items, "indicator": "Purple", "datatype": "Int"},
			{"label": "Order Qty", "value": total_order_qty, "indicator": "Orange", "datatype": "Float"},
			{"label": "Production Qty", "value": total_qty, "indicator": "Green", "datatype": "Float"},
		],
	}


def _get_detail_rows(filters):
	conditions = ["dp.docstatus < 2", "IFNULL(op.item, '') != ''", "IFNULL(op.operations, '') != ''"]
	values = {"operations": tuple(OPERATIONS_SEQUENCE)}

	if filters.get("from_date"):
		conditions.append("COALESCE(op.date, dp.date) >= %(from_date)s")
		values["from_date"] = filters.get("from_date")

	if filters.get("to_date"):
		conditions.append("COALESCE(op.date, dp.date) <= %(to_date)s")
		values["to_date"] = filters.get("to_date")

	if filters.get("sales_order"):
		conditions.append("COALESCE(NULLIF(op.sales_order, ''), NULLIF(dp.sales_order, '')) = %(sales_order)s")
		values["sales_order"] = filters.get("sales_order")

	if filters.get("item"):
		conditions.append("op.item = %(item)s")
		values["item"] = filters.get("item")

	where_sql = " AND ".join(conditions)
	return frappe.db.sql(
		f"""
		SELECT
			COALESCE(NULLIF(op.sales_order, ''), NULLIF(dp.sales_order, '')) AS sales_order,
			op.item AS item,
			DATE(COALESCE(op.date, dp.date)) AS work_date,
			op.operations AS operation,
			SUM(IFNULL(op.qty, 0)) AS qty
		FROM `tabDaily Production` dp
		INNER JOIN `tabOperation Process` op
			ON op.parent = dp.name
			AND op.parenttype = 'Daily Production'
			AND op.parentfield IN ('operations', 'operation_process')
		WHERE {where_sql}
			AND op.operations IN %(operations)s
		GROUP BY
			COALESCE(NULLIF(op.sales_order, ''), NULLIF(dp.sales_order, '')),
			op.item,
			DATE(COALESCE(op.date, dp.date)),
			op.operations
		ORDER BY
			COALESCE(NULLIF(op.sales_order, ''), NULLIF(dp.sales_order, '')) ASC,
			op.item ASC,
			DATE(COALESCE(op.date, dp.date)) DESC,
			FIELD(op.operations, 'Cutting', 'Stitching', 'Quilting', 'Packing')
		""",
		values,
		as_dict=True,
	)


def _get_sales_order_item_qty_map(sales_orders, item_code=None):
	if not sales_orders:
		return {}

	conditions = ["so.name IN %(sales_orders)s", "so.docstatus < 2"]
	values = {"sales_orders": tuple(sales_orders)}
	if item_code:
		conditions.append("soi.item_code = %(item_code)s")
		values["item_code"] = item_code

	rows = frappe.db.sql(
		f"""
		SELECT
			soi.parent AS sales_order,
			soi.item_code AS item_code,
			SUM(IFNULL(soi.qty, 0)) AS qty
		FROM `tabSales Order Item` soi
		INNER JOIN `tabSales Order` so ON so.name = soi.parent
		WHERE {' AND '.join(conditions)}
		GROUP BY soi.parent, soi.item_code
		""",
		values,
		as_dict=True,
	)

	return {
		((row.get("sales_order") or "").strip(), (row.get("item_code") or "").strip()): frappe.utils.flt(row.get("qty"))
		for row in rows
	}


def _build_wastage_row(order_qty, totals):
	cutting = frappe.utils.flt(totals.get("Cutting"))
	stitching = frappe.utils.flt(totals.get("Stitching"))
	quilting = frappe.utils.flt(totals.get("Quilting"))
	packing = frappe.utils.flt(totals.get("Packing"))

	return {
		"Cutting": max(order_qty - cutting, 0),
		"Stitching": max(cutting - stitching, 0),
		"Quilting": max(stitching - quilting, 0),
		"Packing": max(quilting - packing, 0),
	}
