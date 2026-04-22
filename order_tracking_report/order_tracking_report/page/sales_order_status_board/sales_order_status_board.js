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
							<div data-field="company"></div>
						</div>
						<div>
							<label style="display:block;margin-bottom:6px;font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">${__("Customer")}</label>
							<div data-field="customer"></div>
						</div>
						<div>
							<label style="display:block;margin-bottom:6px;font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">${__("Sales Order")}</label>
							<div data-field="sales_order"></div>
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

		this.linkControls = {
			company: this.makeLinkControl("company", "Company"),
			customer: this.makeLinkControl("customer", "Customer"),
			sales_order: this.makeLinkControl("sales_order", "Sales Order"),
		};
		this.fields = {
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
		return Number.isFinite(number) ? number.toFixed(2) : "0.00";
	}

	fmt0(value) {
		const number = Number(value || 0);
		return Number.isFinite(number) ? Math.round(number).toString() : "0";
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
		this.linkControls.company.set_value(options.company || "");
		this.linkControls.customer.set_value(options.customer || "");
		this.linkControls.sales_order.set_value(options.sales_order || "");
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
			company: this.linkControls.company.get_value() || "",
			customer: this.linkControls.customer.get_value() || "",
			sales_order: this.linkControls.sales_order.get_value() || "",
			from_date: this.fields.from_date.val() || "",
			to_date: this.fields.to_date.val() || "",
			so_status: this.fields.so_status.val() || "",
		};
	}

	makeLinkControl(fieldname, options) {
		const parent = this.$root.find(`[data-field="${fieldname}"]`)[0];
		const control = frappe.ui.form.make_control({
			parent,
			df: {
				fieldname,
				fieldtype: "Link",
				options,
				placeholder: __("Select {0}", [options]),
			},
			render_input: true,
		});
		return control;
	}

	async loadBoard() {
		const values = this.getValues();
		this.$summary.html(__("Loading..."));
		this.$board.html(`<div style="padding:16px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;color:#64748b;">${__("Loading status board...")}</div>`);

		try {
			const response = await frappe.call({
				method: "order_tracking_report.api.get_sales_order_status_board",
				args: values,
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
			const woLabel = `${this.fmt0(woDone)} | ${this.fmt0(woTotal)}`;
			const woColor = woTotal > 0 && woDone >= woTotal ? "#166534" : "#1d4ed8";
			const ppLabel = this.escape(row.production_plan_status || "-");
			const jcLabel = this.escape(row.job_card_status || "-");
			const seLabel = this.escape(row.stock_entry_status || "-");
			return `
				<tr>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;"><a href="/app/sales-order/${encodeURIComponent(row.sales_order || "")}" target="_blank" style="color:#1d4ed8;font-weight:700;text-decoration:none;">${this.escape(row.sales_order || "")}</a></td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;">${this.escape(row.date || "")}</td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;">${this.escape(row.customer || "")}</td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;">${this.soBadge(row.so_status)}</td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;">${this.escape(row.delivery_status || "")}</td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;">${this.escape(row.billing_status || "")}</td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;"><a href="#" data-pp-popup="${index}" style="color:#0f766e;font-weight:800;text-decoration:underline;">${ppLabel}</a></td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;"><a href="#" data-wo-popup="${index}" style="color:${woColor};font-weight:800;text-decoration:underline;">${woLabel}</a></td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;"><a href="#" data-jc-popup="${index}" style="color:#7c3aed;font-weight:800;text-decoration:underline;">${jcLabel}</a></td>
					<td style="padding:8px;border-bottom:1px solid #f1f5f9;"><a href="#" data-se-popup="${index}" style="color:#0f766e;font-weight:800;text-decoration:underline;">${seLabel}</a></td>
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
				this.openWorkOrderPopup(row);
			}
		});
		this.$board.find("[data-pp-popup]").on("click", (event) => {
			event.preventDefault();
			const index = Number(event.currentTarget.getAttribute("data-pp-popup"));
			const row = rows[index];
			if (row) {
				this.openProductionPlanPopup(row);
			}
		});
		this.$board.find("[data-jc-popup]").on("click", (event) => {
			event.preventDefault();
			const index = Number(event.currentTarget.getAttribute("data-jc-popup"));
			const row = rows[index];
			if (row) {
				this.openJobCardPopup(row);
			}
		});
		this.$board.find("[data-se-popup]").on("click", (event) => {
			event.preventDefault();
			const index = Number(event.currentTarget.getAttribute("data-se-popup"));
			const row = rows[index];
			if (row) {
				this.openStockEntryPopup(row);
			}
		});
	}

	openProductionPlanPopup(row) {
		const ppRows = (row.production_plan_details || []).map((item) => ({
			"Item": item.item || "",
			"Planned Qty": this.fmt(item.planned_qty || 0),
			"Produced Qty": this.fmt(item.produced_qty || 0),
			"Pending Qty": this.fmt(item.pending_qty || 0),
			"Ordered Qty": this.fmt(item.ordered_qty || 0),
		}));
		const dialog = new frappe.ui.Dialog({
			title: `${__("Production Plan")} - ${row.sales_order || ""}`,
			size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "body" }],
		});
		dialog.fields_dict.body.$wrapper.html(
			this.tableFromRows(ppRows, ["Item", "Planned Qty", "Produced Qty", "Pending Qty", "Ordered Qty"])
		);
		dialog.show();
	}

	openWorkOrderPopup(row) {
		const woRows = (row.work_order_details || row.wo_details || []).map((item) => ({
			"Item": item.item || "",
			"Qty": this.fmt(item.qty || 0),
			"Material Transferred": this.fmt(item.material_transferred_for_manufacturing || 0),
			"Produced Qty": this.fmt(item.produced_qty || 0),
			"Process Loss Qty": this.fmt(item.process_loss_qty || 0),
		}));
		const dialog = new frappe.ui.Dialog({
			title: `${__("Work Order")} - ${row.sales_order || ""}`,
			size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "body" }],
		});
		dialog.fields_dict.body.$wrapper.html(
			this.tableFromRows(woRows, ["Item", "Qty", "Material Transferred", "Produced Qty", "Process Loss Qty"])
		);
		dialog.show();
	}

	openJobCardPopup(row) {
		const jcRows = (row.job_card_details || row.jc_details || []).map((item) => ({
			"Item": item.item || "",
			"Employee": item.employee || "",
			"Operation": item.operation || "",
			"For Quantity": this.fmt(item.for_quantity || 0),
			"Total Completed Qty": this.fmt(item.total_completed_qty || 0),
			"Process Loss Qty": this.fmt(item.process_loss_qty || 0),
		}));
		const dialog = new frappe.ui.Dialog({
			title: `${__("Job Card")} - ${row.sales_order || ""}`,
			size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "body" }],
		});
		dialog.fields_dict.body.$wrapper.html(
			this.tableFromRows(jcRows, ["Item", "Employee", "Operation", "For Quantity", "Total Completed Qty", "Process Loss Qty"])
		);
		dialog.show();
	}

	openStockEntryPopup(row) {
		const seRows = (row.stock_entry_details || []).map((item) => ({
			"Work Order": item.work_order || "",
			"Stock Entry Type": item.stock_entry_type || "",
			"FG Completed Qty": this.fmt(item.fg_completed_qty || 0),
			"BOM No": item.bom_no || "",
		}));
		const dialog = new frappe.ui.Dialog({
			title: `${__("Stock Entry")} - ${row.sales_order || ""}`,
			size: "large",
			fields: [{ fieldtype: "HTML", fieldname: "body" }],
		});
		dialog.fields_dict.body.$wrapper.html(
			this.tableFromRows(seRows, ["Work Order", "Stock Entry Type", "FG Completed Qty", "BOM No"])
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
