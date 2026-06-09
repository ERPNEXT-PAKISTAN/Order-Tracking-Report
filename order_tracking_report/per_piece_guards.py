from __future__ import annotations

import frappe
from frappe.utils import flt


def protect_per_piece_salary_mutations(doc, method=None) -> None:
	"""Prevent updates to booked/submitted Per Piece Salary entries."""
	if getattr(doc, "doctype", None) != "Per Piece Salary":
		return
	if doc.is_new():
		return

	old_doc = doc.get_doc_before_save()
	if not old_doc:
		old_doc = frappe.get_doc("Per Piece Salary", doc.name)

	if int(old_doc.docstatus or 0) == 1:
		if _has_material_change(old_doc, doc):
			frappe.throw(
				"Submitted Per Piece Salary entries are locked. "
				"Create a new entry for updated rate/qty instead of editing posted history."
			)
		return


def _has_material_change(old_doc, new_doc) -> bool:
	tracked_parent_fields = (
		"from_date",
		"to_date",
		"po_number",
		"item_group",
		"item",
		"employee",
		"load_by_item",
	)
	for fieldname in tracked_parent_fields:
		if _as_str(old_doc.get(fieldname)) != _as_str(new_doc.get(fieldname)):
			return True

	return _row_signature(old_doc) != _row_signature(new_doc)


def _row_signature(doc) -> list[tuple]:
	rows: list[tuple] = []
	for row in doc.get("perpiece") or []:
		rows.append(
			(
				_as_str(row.get("name")),
				_as_str(row.get("employee")),
				_as_str(row.get("name1")),
				_as_str(row.get("product")),
				_as_str(row.get("process_type")),
				_as_str(row.get("process_size")),
				_as_str(row.get("sales_order")),
				round(flt(row.get("qty")), 6),
				round(flt(row.get("rate")), 6),
				round(flt(row.get("amount")), 6),
			)
		)
	rows.sort()
	return rows


def _as_str(value) -> str:
	return str(value or "").strip()
