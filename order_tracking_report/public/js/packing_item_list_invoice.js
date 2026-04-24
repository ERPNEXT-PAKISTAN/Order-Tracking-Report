frappe.ui.form.on("Packing Item List Invoice", {
	async refresh(frm) {
		apply_child_row_queries(frm);
		if (frm.doc.delivery_note && !(frm.doc.packing_items || []).length) {
			await load_delivery_note_data(frm);
		}
	},

	async delivery_note(frm) {
		await load_delivery_note_data(frm);
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
	},

	packing_items_remove(frm) {
		recalculate_carton_series(frm);
		frm.refresh_field("packing_items");
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
	},

	ctn(frm) {
		recalculate_carton_series(frm);
		frm.refresh_field("packing_items");
	},
});

const _item_attribute_cache = {};

async function load_delivery_note_data(frm) {
	if (!frm.doc.delivery_note) {
		frm.clear_table("packing_items");
		frm.refresh_field("packing_items");
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

	frm.clear_table("packing_items");

	for (const item_row of dn.items || []) {
		const row = frm.add_child("packing_items");
		const attrs = await get_item_attrs(item_row.item_code);

		row.item = item_row.item_code || "";
		row.description = html_to_text(item_row.description || item_row.item_name || "");
		row.uom = item_row.uom || "";
		row.qty = flt(item_row.qty);
		row.total_pcs = flt(item_row.qty);
		row.delivery_note = dn.name || "";
		row.sale_order = item_row.against_sales_order || "";
		row.date = dn.posting_date || frm.doc.date || "";
		row.comments = html_to_text(item_row.description || "");
		row.color = attrs.color || "";
		row.size = attrs.size || "";

		// Optional mappings if same-named/custom fields exist on Delivery Note Item
		row.carton_number_from = flt(
			item_row.carton_number_from || item_row.custom_carton_number_from || 0
		);
		row.carton_number_to = flt(
			item_row.carton_number_to || item_row.custom_carton_number_to || 0
		);
		row.pcs_per_ctn = flt(item_row.pcs_per_ctn || item_row.custom_pcs_per_ctn || 0);
		row.ctn = flt(item_row.ctn || item_row.custom_ctn || 0);
	}

	frm.refresh_field("packing_items");
	frappe.show_alert(
		{
			message: __("{0} items loaded from {1}", [
				(dn.items || []).length,
				frm.doc.delivery_note,
			]),
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

function apply_child_row_queries(frm) {
	frm.set_query("delivery_note", "packing_items", () => ({
		filters: { docstatus: 1 },
	}));

	frm.set_query("sale_order", "packing_items", () => {
		const filters = { docstatus: ["!=", 2] };
		if (frm.doc.customer) filters.customer = frm.doc.customer;
		if (frm.doc.company) filters.company = frm.doc.company;
		return { filters };
	});
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
