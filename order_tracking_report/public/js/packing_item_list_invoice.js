frappe.ui.form.on("Packing Item List Invoice", {
	async refresh(frm) {
		apply_child_row_queries(frm);
		frm.set_query("sales_order", () => {
			const filters = { docstatus: ["!=", 2] };
			if (frm.doc.customer) filters.customer = frm.doc.customer;
			if (frm.doc.company) filters.company = frm.doc.company;
			return { filters };
		});
		add_delivery_note_buttons(frm);
		render_packing_summary(frm);
		frm.add_custom_button(__("Print Packing Slip"), () => {
			if (frm.is_new()) {
				frappe.msgprint(__("Save document first."));
				return;
			}
			const url = `/printview?doctype=${encodeURIComponent("Packing Item List Invoice")}`
				+ `&name=${encodeURIComponent(frm.doc.name)}`
				+ `&format=${encodeURIComponent("Packing Slip")}`
				+ `&trigger_print=0&no_letterhead=0`;
			window.open(url, "_blank");
		}, __("View"));
		if (frm.doc.delivery_note && !(frm.doc.packing_items || []).length) {
			await load_delivery_note_data(frm);
		}
	},

	async delivery_note(frm) {
		await load_delivery_note_data(frm);
	},

	async sales_order(frm) {
		if (frm.__skip_sales_order_autoload) {
			frm.__skip_sales_order_autoload = false;
			return;
		}
		await append_sales_order_items(frm);
	},

	packing_items_add(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row) return;
		if (frm.doc.delivery_note && !row.delivery_note) {
			row.delivery_note = frm.doc.delivery_note;
		}
		if (frm.doc.date && !row.date) {
			row.date = frm.doc.date;
		}
		recalculate_carton_series(frm);
		frm.refresh_field("packing_items");
		render_packing_summary(frm);
	},

	packing_items_remove(frm) {
		recalculate_carton_series(frm);
		frm.refresh_field("packing_items");
		render_packing_summary(frm);
	},
});

frappe.ui.form.on("Packing Items List", {
	async delivery_note(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row || !row.delivery_note) return;

		try {
			const dn = await frappe.db.get_doc("Delivery Note", row.delivery_note);
			const first_so = (dn.items || []).find((x) => x.against_sales_order)?.against_sales_order;
			if (first_so && !row.sale_order) {
				await frappe.model.set_value(cdt, cdn, "sale_order", first_so);
			}
			if (!row.date) {
				await frappe.model.set_value(cdt, cdn, "date", dn.posting_date || frm.doc.date || "");
			}
		} catch (e) {
			// ignore fetch error for manual row entry
		}
	},

	pcs_per_ctn(frm) {
		recalculate_carton_series(frm);
		frm.refresh_field("packing_items");
		render_packing_summary(frm);
	},

	ctn(frm) {
		recalculate_carton_series(frm);
		frm.refresh_field("packing_items");
		render_packing_summary(frm);
	},

	total_pcs(frm) {
		render_packing_summary(frm);
	},

	sale_order(frm) {
		render_packing_summary(frm);
	},

	delivery_note(frm) {
		render_packing_summary(frm);
	},
});

const _item_attribute_cache = {};

async function load_delivery_note_data(frm) {
	if (!frm.doc.delivery_note) {
		return;
	}

	let dn = null;
	try {
		dn = await frappe.db.get_doc("Delivery Note", frm.doc.delivery_note);
	} catch (e) {
		frappe.msgprint(
			__("Unable to load Delivery Note {0}. Check permission or document name.", [
				frm.doc.delivery_note,
			])
		);
		return;
	}
	if (!dn) return;

	frm.set_value("customer", dn.customer || "");
	frm.set_value("company", dn.company || "");
	frm.set_value("date", dn.posting_date || frm.doc.date || frappe.datetime.get_today());
	frm.set_value("container_no", dn.custom_container_no || "");
	frm.set_value("invoice_no", dn.custom_invoice_no || "");
	frm.set_value("seal_no", dn.custom_seal_no || "");
	let added = 0;
	for (const item_row of dn.items || []) {
		const row_so = item_row.against_sales_order || dn.against_sales_order || "";
		if (has_matching_row(frm, item_row.item_code, dn.name || "", row_so)) {
			continue;
		}

		const row = frm.add_child("packing_items");
		const attrs = await get_item_attrs(item_row.item_code);
		const resolved_description = resolve_item_description(item_row);
		const resolved_comments = resolve_item_comments(item_row);
		const resolved_color = resolve_item_color(item_row, attrs);
		const resolved_size = resolve_item_size(item_row, attrs);
		const resolved_weight = resolve_item_weight(item_row, attrs);

		row.item = item_row.item_code || "";
		row.description = resolved_description;
		row.uom = item_row.uom || "";
		row.qty = flt(item_row.qty);
		row.total_pcs = flt(item_row.qty);
		row.delivery_note = dn.name || "";
		set_child_sales_order(
			row,
			row_so || frm.doc.sales_order || ""
		);
		row.date = dn.posting_date || frm.doc.date || "";
		row.comments = resolved_comments;
		row.color = resolved_color;
		row.size = resolved_size;
		set_child_weight(row, resolved_weight.gross_weight, resolved_weight.net_weight);

		// Optional mappings if same-named/custom fields exist on Delivery Note Item
		row.carton_number_from = flt(
			item_row.carton_number_from || item_row.custom_carton_number_from || 0
		);
		row.carton_number_to = flt(
			item_row.carton_number_to || item_row.custom_carton_number_to || 0
		);
		row.pcs_per_ctn = flt(item_row.pcs_per_ctn || item_row.custom_pcs_per_ctn || 0);
		row.ctn = flt(item_row.ctn || item_row.custom_ctn || 0);
		added++;
	}

	recalculate_carton_series(frm);
	frm.refresh_field("packing_items");
	render_packing_summary(frm);
	frappe.show_alert(
		{
			message: __("{0} items loaded from {1}", [
				added,
				frm.doc.delivery_note,
			]),
			indicator: "green",
		},
		5
	);
}

async function append_sales_order_items(frm) {
	const so_name = frm.doc.sales_order;
	if (!so_name) return;

	let so = null;
	try {
		so = await frappe.db.get_doc("Sales Order", so_name);
	} catch (e) {
		frappe.msgprint(
			__("Unable to load Sales Order {0}. Check permission or document name.", [so_name])
		);
		return;
	}
	if (!so) return;
	const item_codes = (so.items || []).map((x) => x.item_code).filter(Boolean);
	const delivery_note_map = await get_delivery_note_map_for_sales_order(so_name, item_codes);
	const default_dn = delivery_note_map.__default || "";
	delete delivery_note_map.__default;
	const first_delivery_note = default_dn || Object.values(delivery_note_map || {}).find(Boolean) || "";

	let added = 0;
	for (const item_row of so.items || []) {
		const row_dn = delivery_note_map[item_row.item_code] || first_delivery_note || "";
		if (has_matching_row(frm, item_row.item_code, row_dn, so.name || "")) {
			continue;
		}

		const row = frm.add_child("packing_items");
		const attrs = await get_item_attrs(item_row.item_code);
		const resolved_description = resolve_item_description(item_row);
		const resolved_comments = resolve_item_comments(item_row);
		const resolved_color = resolve_item_color(item_row, attrs);
		const resolved_size = resolve_item_size(item_row, attrs);
		const resolved_weight = resolve_item_weight(item_row, attrs);

		row.item = item_row.item_code || "";
		row.description = resolved_description;
		row.uom = item_row.uom || "";
		row.qty = flt(item_row.qty);
		row.total_pcs = flt(item_row.qty);
		row.delivery_note = row_dn;
		set_child_sales_order(row, so.name || "");
		row.date = so.transaction_date || frm.doc.date || frappe.datetime.get_today();
		row.comments = resolved_comments;
		row.color = resolved_color;
		row.size = resolved_size;
		set_child_weight(row, resolved_weight.gross_weight, resolved_weight.net_weight);
		added++;
	}

	recalculate_carton_series(frm);
	frm.refresh_field("packing_items");
	render_packing_summary(frm);
	if (!frm.doc.customer && so.customer) frm.set_value("customer", so.customer);
	if (!frm.doc.company && so.company) frm.set_value("company", so.company);
	if (!frm.doc.date && so.transaction_date) frm.set_value("date", so.transaction_date);

	frappe.show_alert(
		{
			message: __("{0} items added from {1}", [added, so_name]),
			indicator: "green",
		},
		5
	);
}

async function get_item_attrs(item_code) {
	if (!item_code) return {};
	if (_item_attribute_cache[item_code]) return _item_attribute_cache[item_code];

	const result = {};
	try {
		const item = await frappe.db.get_doc("Item", item_code);
		for (const attr of item.attributes || []) {
			const attr_name = (attr.attribute || "").toLowerCase();
			const attr_value = attr.attribute_value || "";

			if (!result.color && (attr_name.includes("color") || attr_name.includes("colour"))) {
				result.color = attr_value;
			}
			if (!result.size && attr_name.includes("size")) {
				result.size = attr_value;
			}
		}
		result.gross_weight =
			item.custom_gross_weight_uom ||
			item.gross_weight ||
			item.custom_gross_weight ||
			"";
		result.net_weight = item.custom_net_weight || item.net_weight || "";
	} catch (e) {
		// Keep silent: attribute enrichment is optional.
	}

	_item_attribute_cache[item_code] = result;
	return result;
}

function html_to_text(value) {
	if (!value) return "";
	if (typeof value !== "string") return value;
	const parser = new DOMParser();
	const doc = parser.parseFromString(value, "text/html");
	return (doc.body && doc.body.textContent ? doc.body.textContent : value).trim();
}

function first_non_empty(...values) {
	for (const val of values) {
		if (val === null || val === undefined) continue;
		if (typeof val === "string" && !val.trim()) continue;
		return val;
	}
	return "";
}

function resolve_item_description(item_row) {
	// Source-truth only: do not fallback to item name/code.
	return html_to_text(item_row?.description || "");
}

function resolve_item_comments(item_row) {
	return html_to_text(
		first_non_empty(
			item_row.custom_comments,
			item_row.custom_comment,
			item_row.comments,
			item_row.remark,
			item_row.remarks,
			""
		)
	);
}

function resolve_item_color(item_row, attrs = {}) {
	return first_non_empty(
		item_row.custom_designcolor,
		item_row.color,
		item_row.colour,
		item_row.custom_color,
		item_row.custom_colour,
		attrs.color,
		""
	);
}

function resolve_item_size(item_row, attrs = {}) {
	return first_non_empty(
		item_row.size,
		item_row.custom_size,
		attrs.size,
		""
	);
}

function resolve_item_weight(item_row, attrs = {}) {
	return {
		gross_weight: first_non_empty(
			item_row.gross_weight,
			item_row.custom_gross_weight,
			item_row.custom_gross_weight_uom,
			attrs.gross_weight,
			""
		),
		net_weight: first_non_empty(
			item_row.net_weight,
			item_row.custom_net_weight,
			attrs.net_weight,
			""
		),
	};
}

function apply_child_row_queries(frm) {
	frm.set_query("delivery_note", "packing_items", () => ({
		filters: { docstatus: 1 },
	}));

	const so_query = () => {
		const filters = { docstatus: ["!=", 2] };
		if (frm.doc.customer) filters.customer = frm.doc.customer;
		if (frm.doc.company) filters.company = frm.doc.company;
		return { filters };
	};
	frm.set_query("sale_order", "packing_items", so_query);
	frm.set_query("sales_order", "packing_items", so_query);
}

function recalculate_carton_series(frm) {
	const rows = (frm.doc.packing_items || []).slice().sort((a, b) => (a.idx || 0) - (b.idx || 0));
	let next_from = 1;

	for (const row of rows) {
		const ctn = flt(row.ctn);
		const pcs_per_ctn = flt(row.pcs_per_ctn);

		row.carton_number_from = next_from;
		row.carton_number_to = ctn > 0 ? next_from + ctn - 1 : next_from;
		row.total_pcs = pcs_per_ctn * ctn;

		next_from = row.carton_number_to + 1;
	}
}

function set_child_sales_order(row, value) {
	const so_value = value || "";
	// Always set child field used in this doctype
	row.sale_order = so_value;
	// Backward compatibility if a sales_order field exists on some sites
	row.sales_order = so_value;
}

function set_child_weight(row, gross_weight, net_weight) {
	if ("gross_weight" in row) row.gross_weight = gross_weight || "";
	if ("net_weight" in row) row.net_weight = net_weight || "";
}

function has_matching_row(frm, item_code, delivery_note, sales_order) {
	const item = (item_code || "").trim();
	const dn = (delivery_note || "").trim();
	const so = (sales_order || "").trim();
	return (frm.doc.packing_items || []).some((r) => {
		return (
			(r.item || "").trim() === item
			&& (r.delivery_note || "").trim() === dn
			&& ((r.sale_order || r.sales_order || "").trim() === so)
		);
	});
}

async function get_delivery_note_map_for_sales_order(so_name, item_codes) {
	if (!so_name || !item_codes || !item_codes.length) return {};

	try {
		const response = await frappe.call({
			method: "order_tracking_report.api.get_submitted_delivery_note_map_for_sales_order",
			args: {
				sales_order: so_name,
				item_codes,
			},
		});
		return response?.message || {};
	} catch (e) {
		// no-op: if mapping fails, we still load SO items
		return {};
	}
}

function add_delivery_note_buttons(frm) {
	frm.add_custom_button(__("Open Delivery Note"), () => {
		if (!frm.doc.delivery_note) {
			frappe.msgprint(__("Select Delivery Note first."));
			return;
		}
		frappe.set_route("Form", "Delivery Note", frm.doc.delivery_note);
	}, __("View"));

	frm.add_custom_button(__("Delivery Note Packing List"), () => {
		if (!frm.doc.delivery_note) {
			frappe.msgprint(__("Select Delivery Note first."));
			return;
		}
		frappe.set_route("List", "Packing Item List Invoice", {
			delivery_note: frm.doc.delivery_note,
		});
	}, __("View"));
}

function render_packing_summary(frm) {
	const field = frm.get_field("packing_summary");
	if (!field || !field.$wrapper) return;

	const rows = frm.doc.packing_items || [];
	if (!rows.length) {
		field.$wrapper.html(`<div class="text-muted">${__("No packing rows yet.")}</div>`);
		return;
	}

	const grouped = {};
	for (const r of rows) {
		const item = (r.item || "").trim();
		const so = (r.sale_order || r.sales_order || "").trim();
		const key = item;
		if (!grouped[key]) {
			grouped[key] = { item, total_pcs: 0, sales_orders: new Set() };
		}
		grouped[key].total_pcs += flt(r.total_pcs || 0);
		if (so) grouped[key].sales_orders.add(so);
	}

	const list = Object.values(grouped).map((r) => ({
		item: r.item,
		total_pcs: r.total_pcs,
		sales_order_text: Array.from(r.sales_orders).join(", "),
	}));
	const grand_total = list.reduce((a, b) => a + flt(b.total_pcs), 0);

	const html = `
		<style>
			.pks-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
			.pks-table th, .pks-table td { border: 1px solid #d1d5db; padding: 6px 8px; font-size: 12px; }
			.pks-table th { background: #f8fafc; font-weight: 700; }
			.pks-right { text-align: right; }
			.pks-total td { font-weight: 700; background: #f9fafb; }
		</style>
		<table class="pks-table">
			<thead>
				<tr>
					<th>${__("Item Name")}</th>
					<th>${__("Total Pcs")}</th>
					<th>${__("Sales Order")}</th>
				</tr>
			</thead>
			<tbody>
				${list
					.map(
						(r) => `
						<tr>
							<td>${frappe.utils.escape_html(r.item || "")}</td>
							<td class="pks-right">${frappe.format(r.total_pcs, { fieldtype: "Float", precision: 0 })}</td>
							<td>${frappe.utils.escape_html(r.sales_order_text || "")}</td>
						</tr>
					`
					)
					.join("")}
				<tr class="pks-total">
					<td>${__("Grand Total")}</td>
					<td class="pks-right">${frappe.format(grand_total, { fieldtype: "Float", precision: 0 })}</td>
					<td></td>
				</tr>
			</tbody>
		</table>
	`;
	field.$wrapper.html(html);
}
