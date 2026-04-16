frappe.pages["daily-operation-report"].on_page_load = function (wrapper) {
	window.order_tracking_report = window.order_tracking_report || {};
	if (!wrapper.dailyOperationReportPage) {
		wrapper.dailyOperationReportPage = new window.order_tracking_report.DailyOperationReportPage(wrapper);
	}
	wrapper.dailyOperationReportPage.show();
};

window.order_tracking_report = window.order_tracking_report || {};

window.order_tracking_report.DailyOperationReportPage = class DailyOperationReportPage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.reportName = "Daily Operation Report";
		this.routeOptions = frappe.route_options || {};
		frappe.route_options = null;
		this.filters = [];
		this.pageData = null;
		this.collapsedSalesOrders = new Set();
		this.collapsedItems = new Set();
		this.isSettingUpFilters = false;

		frappe.ui.make_app_page({
			parent: wrapper,
			title: __(this.reportName),
			single_column: true,
		});

		this.page = wrapper.page;
		this.$root = $(wrapper).find(".layout-main-section");
		frappe.breadcrumbs.add("Selling");

		this.setupLayout();
		this.setupFilters();
		this.setupActions();
	}

	show() {
		this.refresh();
	}

	setupLayout() {
		this.$root.html(`
			<style>
				.otr-daily-operation-page {
					padding-left: 1in;
					padding-right: 1in;
					max-width: 100%;
					box-sizing: border-box;
				}
				@media (max-width: 1024px) {
					.otr-daily-operation-page {
						padding-left: 16px;
						padding-right: 16px;
					}
				}
				.otr-toggle-btn {
					border: 0;
					background: transparent;
					color: inherit;
					font: inherit;
					padding: 0;
					cursor: pointer;
					text-align: left;
				}
				.otr-matrix-table th,
				.otr-matrix-table td {
					vertical-align: middle;
				}
				.otr-group-cell {
					padding-top: 14px !important;
					padding-bottom: 14px !important;
					vertical-align: middle !important;
				}
				.otr-group-qty {
					display: inline-flex;
					align-items: center;
					gap: 8px;
					min-height: 100%;
					white-space: nowrap;
				}
				.otr-filter-grid {
					display: grid;
					grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
					gap: 12px;
					margin-bottom: 16px;
				}
				.otr-filter-grid .frappe-control {
					margin-bottom: 0;
				}
			</style>
			<div class="otr-daily-operation-page">
				<div style="padding:18px;border:1px solid #d1fae5;border-radius:16px;background:linear-gradient(135deg,#ecfdf5 0%,#f8fffb 100%);margin-bottom:16px;">
					<div style="font-size:20px;font-weight:900;color:#064e3b;">${__(this.reportName)}</div>
					<div style="margin-top:6px;font-size:13px;color:#065f46;font-weight:700;">${__("Sales Order wise operation matrix grouped by item with fixed operation sequence and wastage rows.")}</div>
					<div class="text-muted small" data-report-status style="margin-top:10px;">${__("Ready.")}</div>
				</div>
				<div style="border:1px solid #e5e7eb;border-radius:16px;background:#fff;padding:16px;margin-bottom:16px;">
					<div style="font-size:13px;font-weight:800;color:#0f172a;margin-bottom:12px;">${__("Filters")}</div>
					<div class="otr-filter-grid" data-filters></div>
				</div>
				<div data-summary style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px;"></div>
				<div style="border:1px solid #e5e7eb;border-radius:16px;background:#fff;overflow:hidden;">
					<div data-matrix-container style="overflow:auto;"></div>
				</div>
			</div>
		`);

		this.$status = this.$root.find("[data-report-status]");
		this.$filters = this.$root.find("[data-filters]");
		this.$summary = this.$root.find("[data-summary]");
		this.$matrixContainer = this.$root.find("[data-matrix-container]");
	}

	setupFilters() {
		const defs = this.getFilterDefs();
		this.isSettingUpFilters = true;
		this.filters = defs.map((df) => {
			const $fieldWrapper = $("<div></div>").appendTo(this.$filters);
			const field = frappe.ui.form.make_control({
				parent: $fieldWrapper,
				df: {
					...df,
					onchange: () => this.onFilterChange(df.fieldname),
				},
				render_input: true,
			});
			field.refresh();
			const initialValue = this.routeOptions[df.fieldname] !== undefined ? this.routeOptions[df.fieldname] : df.default;
			if (initialValue !== undefined && initialValue !== null && initialValue !== "") {
				field.set_value(initialValue);
			}
			return field;
		});
		this.isSettingUpFilters = false;
	}

	setupActions() {
		this.page.set_primary_action(__("Refresh"), () => this.refresh(), "refresh");
		this.page.set_secondary_action(__("Reset Filters"), () => this.resetFilters(), "delete");
		this.page.add_inner_button(__("Print Report"), () => this.printReport(), __("Actions"));
		this.page.add_inner_button(__("Excel Export"), () => this.exportExcel(), __("Actions"));
	}

	onFilterChange(fieldname) {
		if (this.isSettingUpFilters) {
			return;
		}

		if (fieldname === "from_date") {
			const fromDate = this.getFilterValue("from_date");
			const toDate = this.getFilterValue("to_date");
			if (fromDate && toDate && fromDate > toDate) {
				this.setFilterValue("to_date", fromDate);
			}
		}
		this.refresh();
	}

	resetFilters() {
		this.filters.forEach((field) => {
			field.set_value(field.df.default || (field.df.fieldtype === "Check" ? 0 : ""));
		});
		this.refresh();
	}

	getFilterDefs() {
		return [
			{
				fieldname: "from_date",
				label: __("From Date"),
				fieldtype: "Date",
				default: frappe.datetime.month_start(),
				reqd: 1,
			},
			{
				fieldname: "to_date",
				label: __("To Date"),
				fieldtype: "Date",
				default: frappe.datetime.month_end(),
				reqd: 1,
			},
			{
				fieldname: "sales_order",
				label: __("Sales Order"),
				fieldtype: "Link",
				options: "Sales Order",
			},
			{
				fieldname: "item",
				label: __("Item"),
				fieldtype: "Link",
				options: "Item",
			},
		];
	}

	getFilters() {
		const values = {};
		this.filters.forEach((field) => {
			const value = field.get_value();
			if (value !== undefined && value !== null && value !== "") {
				values[field.df.fieldname] = value;
			}
		});
		return values;
	}

	getFilterValue(fieldname) {
		const field = this.filters.find((entry) => entry.df.fieldname === fieldname);
		return field ? field.get_value() : null;
	}

	setFilterValue(fieldname, value) {
		const field = this.filters.find((entry) => entry.df.fieldname === fieldname);
		if (field) {
			field.set_value(value);
		}
	}

	async refresh() {
		this.$status.text(__("Loading report..."));
		try {
			const response = await frappe.call({
				method: "order_tracking_report.order_tracking_report.page.daily_operation_report.daily_operation_report.get_daily_operation_page_data",
				args: {
					filters: this.getFilters(),
				},
			});

			const payload = response.message || {};
			this.pageData = payload;
			this.setDefaultItemCollapseState(payload);
			this.renderSummary(payload.summary || []);
			this.renderMatrix(payload);
			this.$status.text(__("Report loaded."));
		} catch (error) {
			console.error(error);
			this.$status.text(__("Failed to load report."));
			frappe.show_alert({ message: __("Failed to load Daily Operation Report."), indicator: "red" }, 6);
		}
	}

	setDefaultItemCollapseState(payload) {
		this.collapsedItems = new Set();
		(payload.groups || []).forEach((salesOrderGroup, salesOrderIndex) => {
			(salesOrderGroup.items || []).forEach((itemGroup, itemIndex) => {
				this.collapsedItems.add(`so-${salesOrderIndex}-item-${itemIndex}`);
			});
		});
	}

	renderSummary(items) {
		if (!items.length) {
			this.$summary.empty();
			return;
		}

		const cards = items.map((item) => {
			const colors = {
				Blue: "#2563eb",
				Green: "#059669",
				Purple: "#7c3aed",
				Orange: "#ea580c",
			};
			return `
				<div style="border:1px solid #e5e7eb;border-radius:14px;background:#fff;padding:14px 16px;">
					<div style="font-size:12px;color:#64748b;font-weight:700;">${frappe.utils.escape_html(__(item.label || ""))}</div>
					<div style="margin-top:6px;font-size:24px;font-weight:900;color:${colors[item.indicator] || "#0f172a"};">${this.formatValue(item.value, item.datatype)}</div>
				</div>
			`;
		});
		this.$summary.html(cards.join(""));
	}

	renderMatrix(payload) {
		const operations = payload.operations || [];
		const groups = payload.groups || [];
		if (!groups.length) {
			this.$matrixContainer.html(`<div style="padding:16px;">${__("No data found.")}</div>`);
			return;
		}

		const matrixHtml = [`
			<table class="table table-bordered otr-matrix-table" style="margin:0;min-width:${Math.max(900, 360 + operations.length * 150)}px;">
				<thead>
					<tr>
						<th style="min-width:260px;"></th>
						<th rowspan="2" style="min-width:140px;text-align:center;color:#1d4ed8;font-weight:800;">${__("Order Qty")}</th>
						<th colspan="${operations.length}" style="text-align:center;color:#1d4ed8;font-weight:800;">${__("Operations")}</th>
					</tr>
					<tr>
						<th>${__("Date")}</th>
						${operations.map((operation) => `<th style="text-align:center;color:#1d4ed8;font-weight:800;">${frappe.utils.escape_html(operation)}</th>`).join("")}
					</tr>
				</thead>
				<tbody>
		`];

		groups.forEach((salesOrderGroup, salesOrderIndex) => {
			const salesOrderKey = `so-${salesOrderIndex}`;
			const salesOrderCollapsed = this.collapsedSalesOrders.has(salesOrderKey);
			matrixHtml.push(`
				<tr>
					<td class="otr-group-cell" style="background:#0f4c1d;color:#fff;font-weight:800;white-space:nowrap;">
						<button class="otr-toggle-btn" data-sales-order-toggle="${salesOrderKey}">${salesOrderCollapsed ? "[+]" : "[-]"} ${frappe.utils.escape_html(salesOrderGroup.sales_order)}</button>
					</td>
					<td class="otr-group-cell" style="background:#0f4c1d;color:#fff;font-weight:800;text-align:center;white-space:nowrap;">
						${this.formatInlineNumber(salesOrderGroup.order_qty || 0)}
					</td>
					${operations.map((operation) => `<td class="otr-group-cell" style="background:#0f4c1d;color:#fff;font-weight:800;text-align:center;white-space:nowrap;">${this.formatValue((salesOrderGroup.totals || {})[operation] || 0, "Float")}</td>`).join("")}
				</tr>
			`);

			if (salesOrderCollapsed) {
				return;
			}

			salesOrderGroup.items.forEach((itemGroup, itemIndex) => {
				const itemKey = `${salesOrderKey}-item-${itemIndex}`;
				const itemCollapsed = this.collapsedItems.has(itemKey);
				matrixHtml.push(`
					<tr>
						<td class="otr-group-cell" style="background:#f8fafc;color:#0f172a;font-weight:700;white-space:nowrap;">
							<button class="otr-toggle-btn" data-item-toggle="${itemKey}">${itemCollapsed ? "[+]" : "[-]"} ${frappe.utils.escape_html(itemGroup.item)}</button>
						</td>
						<td class="otr-group-cell" style="background:#f8fafc;color:#0f172a;font-weight:700;text-align:center;white-space:nowrap;">
							${this.formatInlineNumber(itemGroup.order_qty || 0)}
						</td>
							${operations.map((operation) => `<td class="otr-group-cell" style="background:#f8fafc;color:#1d4ed8;font-weight:800;text-align:center;white-space:nowrap;">${this.formatValue(itemGroup.totals[operation] || 0, "Float")}</td>`).join("")}
					</tr>
				`);

				if (itemCollapsed) {
					return;
				}

				itemGroup.rows.forEach((dateRow) => {
					matrixHtml.push(`
						<tr>
							<td>${frappe.utils.escape_html(this.formatDate(dateRow.date))}</td>
							<td></td>
							${operations.map((operation) => `<td style="text-align:center;">${this.formatValue((dateRow.values || {})[operation] || 0, "Float")}</td>`).join("")}
						</tr>
					`);
				});

				matrixHtml.push(`
					<tr>
						<td style="font-weight:800;color:#b91c1c;">${__("Wastage")}</td>
						<td></td>
						${operations.map((operation) => `<td style="text-align:center;font-weight:800;color:#b91c1c;">${this.formatValue(itemGroup.wastage[operation] || 0, "Float")}</td>`).join("")}
					</tr>
				`);

					matrixHtml.push(`
						<tr>
							<td style="height:16px;background:#fff;"></td>
							<td style="background:#fff;"></td>
							${operations.map(() => `<td style="background:#fff;"></td>`).join("")}
						</tr>
					`);
			});
		});

		matrixHtml.push("</tbody></table>");
		this.$matrixContainer.html(matrixHtml.join(""));
		this.bindToggles();
	}

	bindToggles() {
		this.$matrixContainer.find("[data-sales-order-toggle]").off("click").on("click", (event) => {
			const key = $(event.currentTarget).attr("data-sales-order-toggle");
			if (this.collapsedSalesOrders.has(key)) {
				this.collapsedSalesOrders.delete(key);
			} else {
				this.collapsedSalesOrders.add(key);
			}
			this.renderMatrix(this.pageData || { operations: [], groups: [] });
		});

		this.$matrixContainer.find("[data-item-toggle]").off("click").on("click", (event) => {
			const key = $(event.currentTarget).attr("data-item-toggle");
			if (this.collapsedItems.has(key)) {
				this.collapsedItems.delete(key);
			} else {
				this.collapsedItems.add(key);
			}
			this.renderMatrix(this.pageData || { operations: [], groups: [] });
		});
	}

	formatDate(value) {
		if (!value) {
			return "";
		}
		return frappe.format(value, { fieldtype: "Date" }, { always_show_decimals: false });
	}

	formatValue(value, datatype) {
		if (datatype === "Float") {
			return frappe.format(value || 0, { fieldtype: "Float" }, { always_show_decimals: false });
		}
		if (datatype === "Int") {
			return frappe.format(value || 0, { fieldtype: "Int" }, { always_show_decimals: false });
		}
		return frappe.utils.escape_html(String(value ?? ""));
	}

	formatInlineNumber(value) {
		return frappe.utils.escape_html(
			String(frappe.format(value || 0, { fieldtype: "Float" }, { always_show_decimals: false })).replace(/<[^>]*>/g, "")
		);
	}

	printReport() {
		const payload = this.pageData || { operations: [], groups: [] };
		const operations = payload.operations || [];
		const content = this.buildPrintableHtml(payload, operations);
		const printWindow = window.open("", "_blank", "width=1200,height=900");
		if (!printWindow) {
			return;
		}
		printWindow.document.write(content);
		printWindow.document.close();
		printWindow.focus();
		printWindow.print();
	}

	exportExcel() {
		const payload = this.pageData || { operations: [], groups: [] };
		const operations = payload.operations || [];
		const rows = [["Date", "Order Qty", ...operations]];
		(payload.groups || []).forEach((salesOrderGroup) => {
			rows.push([`Sales Order: ${salesOrderGroup.sales_order}`, salesOrderGroup.order_qty || 0, ...operations.map((operation) => (salesOrderGroup.totals || {})[operation] || 0)]);
			salesOrderGroup.items.forEach((itemGroup) => {
				rows.push([`Item: ${itemGroup.item}`, itemGroup.order_qty || 0, ...operations.map((operation) => itemGroup.totals[operation] || 0)]);
				itemGroup.rows.forEach((dateRow) => {
					rows.push([this.formatDate(dateRow.date), "", ...operations.map((operation) => dateRow.values[operation] || 0)]);
				});
				rows.push(["Wastage", "", ...operations.map((operation) => itemGroup.wastage[operation] || 0)]);
				rows.push([]);
				rows.push([]);
			});
			rows.push([]);
		});

		const csvContent = rows
			.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
			.join("\n");

		const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
		const link = document.createElement("a");
		link.href = URL.createObjectURL(blob);
		link.download = "daily_operation_report.csv";
		link.click();
		URL.revokeObjectURL(link.href);
	}

	buildPrintableHtml(payload, operations) {
		const body = [`<div style="padding:0 1in;">`, `<h2 style="margin:0 0 12px;">${frappe.utils.escape_html(this.reportName)}</h2>`];
		(payload.groups || []).forEach((salesOrderGroup) => {
			body.push(`<table style="width:100%;border-collapse:collapse;margin:16px 0 6px;">`);
			body.push(`<thead><tr><th style="border:1px solid #14532d;padding:6px;text-align:left;background:#0f4c1d;color:#fff;">${__("Date")}</th><th style="border:1px solid #14532d;padding:6px;text-align:center;background:#0f4c1d;color:#fff;">${__("Order Qty")}</th>${operations.map((operation) => `<th style="border:1px solid #14532d;padding:6px;text-align:center;background:#0f4c1d;color:#fff;">${frappe.utils.escape_html(operation)}</th>`).join("")}</tr></thead>`);
			body.push(`<tbody><tr><td style="border:1px solid #14532d;padding:6px;background:#0f4c1d;color:#fff;font-weight:800;">${frappe.utils.escape_html(salesOrderGroup.sales_order)}</td><td style="border:1px solid #14532d;padding:6px;text-align:center;background:#0f4c1d;color:#fff;font-weight:800;">${this.formatValue(salesOrderGroup.order_qty || 0, "Float")}</td>${operations.map((operation) => `<td style="border:1px solid #14532d;padding:6px;text-align:center;background:#0f4c1d;color:#fff;font-weight:800;">${this.formatValue((salesOrderGroup.totals || {})[operation] || 0, "Float")}</td>`).join("")}</tr></tbody>`);
			body.push(`</table>`);
			salesOrderGroup.items.forEach((itemGroup) => {
				body.push(`<table style="width:100%;border-collapse:collapse;margin:8px 0 0;">`);
				body.push(`<tbody><tr><td style="border:1px solid #e5e7eb;padding:8px 10px;background:#f8fafc;font-weight:700;">${frappe.utils.escape_html(itemGroup.item)}</td><td style="border:1px solid #e5e7eb;padding:8px 10px;background:#f8fafc;font-weight:700;text-align:center;">${this.formatValue(itemGroup.order_qty || 0, "Float")}</td>${operations.map((operation) => `<td style="border:1px solid #e5e7eb;padding:8px 10px;background:#f8fafc;color:#1d4ed8;font-weight:800;text-align:center;">${this.formatValue(itemGroup.totals[operation] || 0, "Float")}</td>`).join("")}</tr></tbody>`);
				body.push(`</table>`);
				body.push(`<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">`);
				body.push(`<thead><tr><th style="border:1px solid #cbd5e1;padding:6px;text-align:left;">${__("Date")}</th><th style="border:1px solid #cbd5e1;padding:6px;text-align:center;">${__("Order Qty")}</th>${operations.map((operation) => `<th style="border:1px solid #cbd5e1;padding:6px;text-align:center;">${frappe.utils.escape_html(operation)}</th>`).join("")}</tr></thead><tbody>`);
				itemGroup.rows.forEach((dateRow) => {
					body.push(`<tr><td style="border:1px solid #e2e8f0;padding:6px;">${frappe.utils.escape_html(this.formatDate(dateRow.date))}</td><td style="border:1px solid #e2e8f0;padding:6px;"></td>${operations.map((operation) => `<td style="border:1px solid #e2e8f0;padding:6px;text-align:center;">${this.formatValue(dateRow.values[operation] || 0, "Float")}</td>`).join("")}</tr>`);
				});
				body.push(`<tr><td style="border:1px solid #e2e8f0;padding:6px;color:#b91c1c;font-weight:800;">${__("Wastage")}</td><td style="border:1px solid #e2e8f0;padding:6px;"></td>${operations.map((operation) => `<td style="border:1px solid #e2e8f0;padding:6px;text-align:center;color:#b91c1c;font-weight:800;">${this.formatValue(itemGroup.wastage[operation] || 0, "Float")}</td>`).join("")}</tr>`);
				body.push(`<tr><td style="border:0;height:12px;"></td><td style="border:0;"></td>${operations.map(() => `<td style="border:0;"></td>`).join("")}</tr>`);
				body.push(`</tbody></table>`);
			});
		});
		body.push(`</div>`);
		return `
			<html>
				<head>
					<title>${frappe.utils.escape_html(this.reportName)}</title>
					<style>
						@page { size: A4 landscape; margin: 0.6in 1in; }
						body { font-family: Arial, sans-serif; color: #0f172a; }
					</style>
				</head>
				<body>${body.join("")}</body>
			</html>
		`;
	}

	toNumber(value) {
		const parsed = Number(value || 0);
		return Number.isFinite(parsed) ? parsed : 0;
	}
};
