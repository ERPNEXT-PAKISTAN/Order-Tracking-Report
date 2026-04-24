frappe.ui.form.on("Delivery Note", {
	refresh(frm) {
		frm.add_custom_button(__("Packing Item List Invoice"), async () => {
			const rows = await frappe.db.get_list("Packing Item List Invoice", {
				filters: { delivery_note: frm.doc.name },
				fields: ["name"],
				order_by: "creation desc",
				limit: 1,
			});

			if (rows && rows.length) {
				frappe.set_route("Form", "Packing Item List Invoice", rows[0].name);
				return;
			}

			const first_so =
				(frm.doc.items || []).find((x) => x.against_sales_order)?.against_sales_order || "";

			frappe.new_doc("Packing Item List Invoice", {
				delivery_note: frm.doc.name,
				sales_order: first_so,
				customer: frm.doc.customer,
				company: frm.doc.company,
				date: frm.doc.posting_date,
				container_no: frm.doc.custom_container_no || "",
				invoice_no: frm.doc.custom_invoice_no || "",
				seal_no: frm.doc.custom_seal_no || "",
			});
		}, __("View"));

		frm.add_custom_button(__("Packing List Invoices"), () => {
			frappe.set_route("List", "Packing Item List Invoice", {
				delivery_note: frm.doc.name,
			});
		}, __("View"));
	},
});
