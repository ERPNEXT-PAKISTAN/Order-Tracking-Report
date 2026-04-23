(function () {
	function esc(v) { return frappe.utils.escape_html(v == null ? "" : String(v)); }
	function n(v) {
		const x = Number(v || 0);
		return Number.isFinite(x)
			? x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
			: "0.00";
	}
	function fromDateDefault() {
		return frappe.datetime.add_days(frappe.datetime.now_date(), -90);
	}
	function renderTable(rows) {
		if (!rows || !rows.length) {
			return `<div style="padding:12px;color:#64748b;">No purchase orders found for this item in selected range.</div>`;
		}
		const body = rows.map((r) => `
			<tr>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;"><a href="/app/purchase-order/${encodeURIComponent(r.purchase_order || "")}" target="_blank">${esc(r.purchase_order || "")}</a></td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;">${esc(r.date || "")}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;">${esc(r.supplier || "")}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${n(r.rate)}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${n(r.ordered_qty)}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${n(r.received_qty)}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#92400e;">${n(r.pending_qty)}</td>
			</tr>
		`).join("");
		return `
			<div style="overflow:auto;border:1px solid #e2e8f0;border-radius:10px;background:#fff;">
				<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:900px;">
					<thead>
						<tr>
							<th style="padding:8px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Purchase Order</th>
							<th style="padding:8px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Date</th>
							<th style="padding:8px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Supplier</th>
							<th style="padding:8px;text-align:right;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Rate</th>
							<th style="padding:8px;text-align:right;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Qty</th>
							<th style="padding:8px;text-align:right;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Received</th>
							<th style="padding:8px;text-align:right;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Pending</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`;
	}

	async function loadItemStatus(frm, fromDate, toDate) {
		const field = frm.get_field("custom_item_purchase_status_html");
		if (!field || !field.$wrapper) return;
		field.$wrapper.find('[data-role="body"]').html(`<div style="padding:10px;color:#64748b;">Loading...</div>`);
		try {
			const r = await frappe.call({
				method: "order_tracking_report.api.get_item_purchase_order_status",
				args: {
					item_code: frm.doc.name,
					from_date: fromDate || "",
					to_date: toDate || "",
				},
			});
			field.$wrapper.find('[data-role="body"]').html(renderTable((r.message || {}).rows || []));
		} catch (e) {
			field.$wrapper.find('[data-role="body"]').html(`<div style="padding:10px;color:#b91c1c;">Failed to load report.</div>`);
		}
	}

	frappe.ui.form.on("Item", {
		refresh(frm) {
			const field = frm.get_field("custom_item_purchase_status_html");
			if (!field || !field.$wrapper) return;
			if (frm.is_new()) {
				field.$wrapper.html(`<div style="padding:8px;color:#64748b;">Save Item to load purchase order status report.</div>`);
				return;
			}
			field.$wrapper.html(`
				<div style="border:1px solid #dbeafe;background:#f8fbff;border-radius:12px;padding:12px;">
					<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
						<div style="font-weight:800;color:#0f172a;">Purchase Order Status by Item</div>
						<div style="display:flex;gap:8px;align-items:end;">
							<div><div style="font-size:11px;color:#64748b;">From Date</div><input data-role="from-date" type="date" class="form-control input-xs" style="height:28px;"></div>
							<div><div style="font-size:11px;color:#64748b;">To Date</div><input data-role="to-date" type="date" class="form-control input-xs" style="height:28px;"></div>
							<button class="btn btn-sm btn-primary" data-role="load">Load</button>
						</div>
					</div>
					<div data-role="body" style="margin-top:8px;"></div>
				</div>
			`);
			const fromInput = field.$wrapper.find('[data-role="from-date"]');
			const toInput = field.$wrapper.find('[data-role="to-date"]');
			fromInput.val(fromDateDefault());
			toInput.val(frappe.datetime.now_date());
			field.$wrapper.find('[data-role="load"]').off("click").on("click", () => {
				loadItemStatus(frm, fromInput.val(), toInput.val());
			});
			loadItemStatus(frm, fromInput.val(), toInput.val());
		},
	});
})();
