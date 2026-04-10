frappe.pages["sales-order-status-board"].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Sales Order Status Board"),
		single_column: true,
	});

	window.order_tracking_report = window.order_tracking_report || {};
	wrapper.sales_order_status_board_page = new window.order_tracking_report.SalesOrderStatusBoardPage(wrapper);
	frappe.breadcrumbs.add("Order Tracking Report");
};

window.order_tracking_report = window.order_tracking_report || {};

window.order_tracking_report.SalesOrderStatusBoardPage = class SalesOrderStatusBoardPage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.routeOptions = frappe.route_options || {};
		frappe.route_options = null;
		setTimeout(() => this.load(), 0);
	}

	async load() {
		this.$root = $(this.wrapper).find(".layout-main-section");
		this.$root.html(`
			<div class="otr-status-board-page" style="display:grid;gap:16px;">
				<div style="padding:18px;border:1px solid #dbeafe;border-radius:16px;background:linear-gradient(135deg,#eff6ff 0%,#f8fbff 100%);">
					<div style="font-size:20px;font-weight:900;color:#0f172a;">${__("Sales Order Status Board")}</div>
					<div style="margin-top:6px;font-size:13px;color:#1d4ed8;font-weight:700;">${__("Live Work Order sales order pipeline shown directly on this page.")}</div>
				</div>
				<div style="padding:16px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;box-shadow:0 10px 30px rgba(15,23,42,0.05);">
					<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:end;">
						<div>
							<label style="display:block;margin-bottom:6px;font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">${__("Company")}</label>
							<input type="text" data-field="company" class="form-control">
						</div>
						<div>
							<label style="display:block;margin-bottom:6px;font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">${__("Customer")}</label>
							<input type="text" data-field="customer" class="form-control">
						</div>
						<div>
							<label style="display:block;margin-bottom:6px;font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">${__("Sales Order")}</label>
							<input type="text" data-field="sales_order" class="form-control">
						</div>
						<div>
							<label style="display:block;margin-bottom:6px;font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">${__("From Date")}</label>
							<input type="date" data-field="from_date" class="form-control">
						</div>
						<div>
							<label style="display:block;margin-bottom:6px;font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">${__("To Date")}</label>
							<input type="date" data-field="to_date" class="form-control">
						</div>
						<div>
							<label style="display:block;margin-bottom:6px;font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">${__("SO Status")}</label>
							<select data-field="so_status" class="form-control">
								<option value=""></option>
								<option value="Draft">${__("Draft")}</option>
								<option value="To Deliver and Bill">${__("To Deliver and Bill")}</option>
								<option value="To Bill">${__("To Bill")}</option>
								<option value="Completed">${__("Completed")}</option>
								<option value="Closed">${__("Closed")}</option>
								<option value="Cancelled">${__("Cancelled")}</option>
							</select>
						</div>
					</div>
					<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
						<button class="btn btn-primary btn-sm" data-action="load">${__("Load Status Board")}</button>
						<button class="btn btn-default btn-sm" data-action="reset">${__("Reset")}</button>
					</div>
				</div>
				<div data-role="summary" style="font-size:12px;color:#64748b;"></div>
				<div data-role="board"></div>
			</div>
		`);

		this.fields = {
			company: this.$root.find('[data-field="company"]'),
			customer: this.$root.find('[data-field="customer"]'),
			sales_order: this.$root.find('[data-field="sales_order"]'),
			from_date: this.$root.find('[data-field="from_date"]'),
			to_date: this.$root.find('[data-field="to_date"]'),
			so_status: this.$root.find('[data-field="so_status"]'),
		};
		this.$summary = this.$root.find('[data-role="summary"]');
		this.$board = this.$root.find('[data-role="board"]');

		this.applyDefaults();
		this.$root.find('[data-action="load"]').on("click", () => this.loadBoard());
		this.$root.find('[data-action="reset"]').on("click", () => {
			this.resetDefaults();
			this.loadBoard();
		});
		this.loadBoard();
	}

	escape(value) {
		return frappe.utils.escape_html(value == null ? "" : String(value));
	}

	fmt(value) {
		const number = Number(value || 0);
		return Number.isFinite(number) ? frappe.format(number, { fieldtype: "Float", precision: 2 }) : "0.00";
	}

	badge(text, bg, color) {
		return `<span style="display:inline-block;padding:3px 8px;border-radius:999px;background:${bg};color:${color};font-weight:700;font-size:11px;">${this.escape(text || "-")}</span>`;
	}

	soBadge(status) {
		const lower = String(status || "").toLowerCase();
		if (lower.includes("completed") || lower.includes("closed")) return this.badge(status, "#dcfce7", "#166534");
		if (lower.includes("cancel")) return this.badge(status, "#fee2e2", "#991b1b");
		if (lower.includes("deliver") || lower.includes("bill")) return this.badge(status, "#fef3c7", "#92400e");
		return this.badge(status || "Draft", "#e0e7ff", "#3730a3");
	}

	pctBadge(pct) {
		const n = Number(pct || 0);
		if (n >= 100) return this.badge(`${n.toFixed(1)}%`, "#dcfce7", "#166534");
		if (n >= 70) return this.badge(`${n.toFixed(1)}%`, "#dbeafe", "#1e3a8a");
		if (n >= 30) return this.badge(`${n.toFixed(1)}%`, "#fef3c7", "#92400e");
		return this.badge(`${n.toFixed(1)}%`, "#fee2e2", "#991b1b");
	}

	applyDefaults() {
		const options = this.routeOptions || {};
		const now = frappe.datetime.now_date();
		const tenDaysAgo = frappe.datetime.add_days(now, -10);
		this.fields.company.val(options.company || "");
		this.fields.customer.val(options.customer || "");
		this.fields.sales_order.val(options.sales_order || "");
		this.fields.from_date.val(options.from_date || tenDaysAgo);
		this.fields.to_date.val(options.to_date || now);
		this.fields.so_status.val(options.so_status || "");
	}

	resetDefaults() {
		this.routeOptions = {};
		this.applyDefaults();
	}

	getValues() {
		return {
			company: this.fields.company.val() || "",
			customer: this.fields.customer.val() || "",
			sales_order: this.fields.sales_order.val() || "",
			from_date: this.fields.from_date.val() || "",
			to_date: this.fields.to_date.val() || "",
			so_status: this.fields.so_status.val() || "",
		};
	}

	async loadBoard() {
		const values = this.getValues();
		this.$summary.html(__("Loading..."));
		this.$board.html(`<div style="padding:16px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;color:#64748b;">${__("Loading status board...")}</div>`);

		try {
			const response = await frappe.call({
				method: "live_production_api",
				args: {
					action: "sales_order_pipeline",
					company: values.company,
					customer: values.customer,
					sales_order: values.sales_order,
					from_date: values.from_date,
					to_date: values.to_date,
					so_status: values.so_status,
				},
			});
			const rows = response?.message?.rows || [];
			this.renderBoard(rows);
		} catch (error) {
			this.$summary.html("");
			this.$board.html(`<div style="padding:16px;border:1px solid #fecaca;border-radius:16px;background:#fef2f2;color:#b91c1c;">${__("Failed to load status board.")}: ${this.escape(error?.message || "Unknown error")}</div>`);
		}
	}

	renderBoard(rows) {
		this.$summary.html(`${__("Rows")}: ${rows.length}`);
		const rowsHtml = rows.map((row, index) => {
			const woDone = Number(row.work_order_completed || 0);
			const woTotal = Number(row.work_order_total || 0);
			const woLabel = `${this.fmt(woDone)}/${this.fmt(woTotal)}`;
			const woColor = woTotal > 0 && woDone >= woTotal ? "#166534" : "#1d4ed8";
			return `
				<tr>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;"><a href="/app/sales-order/${encodeURIComponent(row.sales_order || "")}" target="_blank" style="color:#1d4ed8;font-weight:700;text-decoration:none;">${this.escape(row.sales_order || "")}</a></td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;">${this.escape(row.date || "")}</td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;">${this.escape(row.customer || "")}</td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;">${this.soBadge(row.so_status)}</td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;">${this.escape(row.delivery_status || "")}</td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;">${this.escape(row.billing_status || "")}</td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;">${this.escape(row.production_plans || "")}</td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;"><a href="#" data-wo-popup="${index}" style="color:${woColor};font-weight:800;text-decoration:underline;">${woLabel}</a></td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;">${this.fmt(row.job_card_completed || 0)}/${this.fmt(row.job_card_total || 0)}</td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;">${this.fmt(row.stock_entry_count || 0)}</td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;">${this.pctBadge(row.wo_completion_pct || 0)}</td>
				</tr>
			`;
		}).join("");

		this.$board.html(`
			<div style="overflow:auto;border:1px solid #e5e7eb;border-radius:16px;background:#ffffff;box-shadow:0 12px 30px rgba(15,23,42,0.05);">
				<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:1180px;">
					<thead>
						<tr>
							<th style="text-align:left;padding:10px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">${__("Sales Order")}</th>
							<th style="text-align:left;padding:10px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">${__("Date")}</th>
							<th style="text-align:left;padding:10px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">${__("Customer")}</th>
							<th style="text-align:left;padding:10px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">${__("SO Status")}</th>
							<th style="text-align:left;padding:10px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">${__("Delivery")}</th>
							<th style="text-align:left;padding:10px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">${__("Billing")}</th>
							<th style="text-align:left;padding:10px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">${__("Production Plan")}</th>
							<th style="text-align:left;padding:10px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">${__("Work Orders")}</th>
							<th style="text-align:left;padding:10px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">${__("Job Cards")}</th>
							<th style="text-align:left;padding:10px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">${__("Stock Entries")}</th>
							<th style="text-align:left;padding:10px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">${__("WO Qty %")}</th>
						</tr>
					</thead>
					<tbody>${rowsHtml || `<tr><td colspan="11" style="padding:18px;color:#64748b;">${__("No rows found for the current filters.")}</td></tr>`}</tbody>
				</table>
			</div>
		`);

		this.$board.find("[data-wo-popup]").on("click", (event) => {
			event.preventDefault();
			const index = Number(event.currentTarget.getAttribute("data-wo-popup"));
			const row = rows[index];
			if (row) {
				this.openWoJcPopup(row);
			}
		});
	}

	openWoJcPopup(row) {
		const woRows = (row.wo_details || []).map((item) => ({
			"Work Order": item.name || "",
			"Status": item.status || "",
			"Qty": this.fmt(item.qty || 0),
			"Produced": this.fmt(item.produced_qty || 0),
			"Completion %": `${Number(item.completion_pct || 0).toFixed(1)}%`,
		}));
		const jcRows = (row.jc_details || []).map((item) => ({
			"Job Card": item.name || "",
			"Work Order": item.work_order || "",
			"Status": item.status || "",
			"Operation": item.operation || "",
		}));

		const dialog = new frappe.ui.Dialog({
			title: `${__("WO/JC List")} - ${row.sales_order || ""}`,
			size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "body" }],
		});
		dialog.fields_dict.body.$wrapper.html(
			`<div style="margin:6px 0 6px;font-weight:800;color:#1e293b;">${__("Work Orders")}</div>${this.tableFromRows(woRows, ["Work Order", "Status", "Qty", "Produced", "Completion %"])}
			 <div style="margin:12px 0 6px;font-weight:800;color:#1e293b;">${__("Job Cards")}</div>${this.tableFromRows(jcRows, ["Job Card", "Work Order", "Status", "Operation"])}`
		);
		dialog.show();
	}

	tableFromRows(rows, columns) {
		if (!rows.length) {
			return `<div style="padding:12px;color:#64748b;border:1px solid #e5e7eb;border-radius:10px;background:#f8fafc;">${__("No data found.")}</div>`;
		}
		return `
			<div style="overflow:auto;border:1px solid #e5e7eb;border-radius:10px;">
				<table style="width:100%;border-collapse:collapse;font-size:12px;">
					<thead><tr>${columns.map((column) => `<th style="text-align:left;padding:8px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">${this.escape(column)}</th>`).join("")}</tr></thead>
					<tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td style="padding:8px;border-bottom:1px solid #f1f5f9;">${this.escape(row[column] || "")}</td>`).join("")}</tr>`).join("")}</tbody>
				</table>
			</div>
		`;
	}
};