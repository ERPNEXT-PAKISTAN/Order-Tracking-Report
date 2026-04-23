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

	function statusBadge(status) {
		const s = String(status || "").toLowerCase();
		let bg = "#e2e8f0";
		let fg = "#1e293b";
		if (s.includes("paid") || s.includes("return")) { bg = "#dcfce7"; fg = "#166534"; }
		else if (s.includes("claim")) { bg = "#fef3c7"; fg = "#92400e"; }
		else if (s.includes("submit")) { bg = "#dbeafe"; fg = "#1e40af"; }
		return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${bg};color:${fg};font-weight:700;">${esc(status || "Open")}</span>`;
	}

	function renderTable(rows) {
		if (!rows || !rows.length) {
			return `<div style="padding:12px;color:#64748b;">No employee advance records found in selected range.</div>`;
		}

		const body = rows.map((r) => `
			<tr>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;">
					<a href="/app/employee-advance/${encodeURIComponent(r.employee_advance || "")}" target="_blank">${esc(r.employee_advance || "")}</a>
				</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;">${esc(r.date || "")}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;">${esc(r.purpose || "")}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${n(r.advance_amount)}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${n(r.paid_amount)}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${n(r.claimed_amount)}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${n(r.return_amount)}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#92400e;">${n(r.pending_amount)}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;">${statusBadge(r.status)}</td>
			</tr>
		`).join("");

		return `
			<div style="overflow:auto;border:1px solid #e2e8f0;border-radius:10px;background:#fff;">
				<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:1100px;">
					<thead>
						<tr>
							<th style="padding:8px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Employee Advance</th>
							<th style="padding:8px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Date</th>
							<th style="padding:8px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Purpose</th>
							<th style="padding:8px;text-align:right;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Advance Amount</th>
							<th style="padding:8px;text-align:right;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Paid</th>
							<th style="padding:8px;text-align:right;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Claimed</th>
							<th style="padding:8px;text-align:right;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Return</th>
							<th style="padding:8px;text-align:right;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Pending</th>
							<th style="padding:8px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Status</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`;
	}

	function renderSummary(summary) {
		const s = summary || {};
		return `
			<div style="overflow:auto;border:1px solid #dbeafe;border-radius:10px;background:#eff6ff;">
				<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:760px;">
					<thead>
						<tr>
							<th style="padding:8px;text-align:right;border-bottom:1px solid #bfdbfe;">Opening Balance</th>
							<th style="padding:8px;text-align:right;border-bottom:1px solid #bfdbfe;">Paid Amount</th>
							<th style="padding:8px;text-align:right;border-bottom:1px solid #bfdbfe;">Claimed Amount</th>
							<th style="padding:8px;text-align:right;border-bottom:1px solid #bfdbfe;">Return Amount</th>
							<th style="padding:8px;text-align:right;border-bottom:1px solid #bfdbfe;">Net Change</th>
							<th style="padding:8px;text-align:right;border-bottom:1px solid #bfdbfe;">Closing Balance</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td style="padding:8px;text-align:right;">${n(s.opening_balance)}</td>
							<td style="padding:8px;text-align:right;">${n(s.paid_amount)}</td>
							<td style="padding:8px;text-align:right;">${n(s.claimed_amount)}</td>
							<td style="padding:8px;text-align:right;">${n(s.return_amount)}</td>
							<td style="padding:8px;text-align:right;font-weight:700;color:${Number(s.range_delta || 0) >= 0 ? "#166534" : "#b91c1c"};">${n(s.range_delta)}</td>
							<td style="padding:8px;text-align:right;font-weight:800;color:#1e40af;">${n(s.closing_balance)}</td>
						</tr>
					</tbody>
				</table>
			</div>
		`;
	}

	function toRoute(doctype) {
		return String(doctype || "").trim().toLowerCase().replace(/\s+/g, "-");
	}

	function renderGlSummary(summary) {
		const s = summary || {};
		return `
			<div style="overflow:auto;border:1px solid #c7d2fe;border-radius:10px;background:#eef2ff;">
				<div style="padding:8px 10px;font-size:12px;color:#1e3a8a;font-weight:700;">
					GL Ledger ${s.account ? `(${esc(s.account)})` : ""}
				</div>
				<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:760px;">
					<thead>
						<tr>
							<th style="padding:8px;text-align:right;border-bottom:1px solid #bfdbfe;">Opening Balance</th>
							<th style="padding:8px;text-align:right;border-bottom:1px solid #bfdbfe;">Debit Total</th>
							<th style="padding:8px;text-align:right;border-bottom:1px solid #bfdbfe;">Credit Total</th>
							<th style="padding:8px;text-align:right;border-bottom:1px solid #bfdbfe;">Net Change</th>
							<th style="padding:8px;text-align:right;border-bottom:1px solid #bfdbfe;">Closing Balance</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td style="padding:8px;text-align:right;">${n(s.opening_balance)}</td>
							<td style="padding:8px;text-align:right;">${n(s.debit_total)}</td>
							<td style="padding:8px;text-align:right;">${n(s.credit_total)}</td>
							<td style="padding:8px;text-align:right;font-weight:700;color:${Number(s.range_delta || 0) >= 0 ? "#166534" : "#b91c1c"};">${n(s.range_delta)}</td>
							<td style="padding:8px;text-align:right;font-weight:800;color:#1e40af;">${n(s.closing_balance)}</td>
						</tr>
					</tbody>
				</table>
			</div>
		`;
	}

	function renderGlTable(rows) {
		if (!rows || !rows.length) {
			return `<div style="padding:12px;color:#64748b;">No GL entries found for this employee in selected range.</div>`;
		}
		const body = rows.map((r) => `
			<tr>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;">${esc(r.date || "")}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;">${esc(r.voucher_type || "")}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;">
					<a href="/app/${toRoute(r.voucher_type)}/${encodeURIComponent(r.voucher_no || "")}" target="_blank">${esc(r.voucher_no || "")}</a>
				</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;">${esc(r.account || "")}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${n(r.debit)}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${n(r.credit)}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#1e40af;">${n(r.running_balance)}</td>
				<td style="padding:8px;border-bottom:1px solid #e2e8f0;">${esc(r.remarks || "")}</td>
			</tr>
		`).join("");

		return `
			<div style="overflow:auto;border:1px solid #e2e8f0;border-radius:10px;background:#fff;">
				<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:1200px;">
					<thead>
						<tr>
							<th style="padding:8px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Date</th>
							<th style="padding:8px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Voucher Type</th>
							<th style="padding:8px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Voucher No</th>
							<th style="padding:8px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Account</th>
							<th style="padding:8px;text-align:right;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Debit</th>
							<th style="padding:8px;text-align:right;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Credit</th>
							<th style="padding:8px;text-align:right;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Balance</th>
							<th style="padding:8px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Remarks</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`;
	}

	async function loadAdvanceLedger(frm, fromDate, toDate) {
		const field = frm.get_field("custom_employee_advance_ledger_html");
		if (!field || !field.$wrapper) return;
		field.$wrapper.find('[data-role="body"]').html(`<div style="padding:10px;color:#64748b;">Loading...</div>`);
		field.$wrapper.find('[data-role="gl-body"]').html(`<div style="padding:10px;color:#64748b;">Loading...</div>`);
		field.$wrapper.find('[data-role="summary"]').html("");
		field.$wrapper.find('[data-role="gl-summary"]').html("");

		try {
			const r = await frappe.call({
				method: "order_tracking_report.api.get_employee_advance_ledger",
				args: {
					employee: frm.doc.name,
					from_date: fromDate || "",
					to_date: toDate || "",
				},
			});
			const message = r.message || {};
			field.$wrapper.find('[data-role="summary"]').html(renderSummary(message.summary || {}));
			field.$wrapper.find('[data-role="body"]').html(renderTable(message.rows || []));
			field.$wrapper.find('[data-role="gl-summary"]').html(renderGlSummary(message.gl_summary || {}));
			field.$wrapper.find('[data-role="gl-body"]').html(renderGlTable(message.gl_rows || []));
		} catch (e) {
			field.$wrapper.find('[data-role="body"]').html(`<div style="padding:10px;color:#b91c1c;">Failed to load employee advance ledger.</div>`);
			field.$wrapper.find('[data-role="gl-body"]').html(`<div style="padding:10px;color:#b91c1c;">Failed to load GL ledger.</div>`);
			field.$wrapper.find('[data-role="summary"]').html("");
			field.$wrapper.find('[data-role="gl-summary"]').html("");
		}
	}

	frappe.ui.form.on("Employee", {
		refresh(frm) {
			const field = frm.get_field("custom_employee_advance_ledger_html");
			if (!field || !field.$wrapper) return;

			if (frm.is_new()) {
				field.$wrapper.html(`<div style="padding:8px;color:#64748b;">Save Employee to load advance ledger.</div>`);
				return;
			}

			field.$wrapper.html(`
				<div style="border:1px solid #dbeafe;background:#f8fbff;border-radius:12px;padding:12px;">
					<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
						<div style="font-weight:800;color:#0f172a;">Employee Advance Ledger</div>
						<div style="display:flex;gap:8px;align-items:end;">
							<div><div style="font-size:11px;color:#64748b;">From Date</div><input data-role="from-date" type="date" class="form-control input-xs" style="height:28px;"></div>
							<div><div style="font-size:11px;color:#64748b;">To Date</div><input data-role="to-date" type="date" class="form-control input-xs" style="height:28px;"></div>
							<button class="btn btn-sm btn-primary" data-role="load">Load</button>
						</div>
					</div>
					<div style="margin-top:8px;" data-role="summary"></div>
					<div data-role="body" style="margin-top:8px;"></div>
					<div style="margin-top:12px;" data-role="gl-summary"></div>
					<div data-role="gl-body" style="margin-top:8px;"></div>
				</div>
			`);

			const fromInput = field.$wrapper.find('[data-role="from-date"]');
			const toInput = field.$wrapper.find('[data-role="to-date"]');
			fromInput.val(fromDateDefault());
			toInput.val(frappe.datetime.now_date());

			field.$wrapper.find('[data-role="load"]').off("click").on("click", () => {
				loadAdvanceLedger(frm, fromInput.val(), toInput.val());
			});
			loadAdvanceLedger(frm, fromInput.val(), toInput.val());
		},
	});
})();
