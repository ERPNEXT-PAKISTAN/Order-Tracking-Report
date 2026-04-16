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
		this.chart = null;
		this.filters = [];
		this.rows = [];

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
			<div class="otr-daily-operation-page">
				<div style="padding:18px;border:1px solid #d1fae5;border-radius:16px;background:linear-gradient(135deg,#ecfdf5 0%,#f8fffb 100%);margin-bottom:16px;">
					<div style="font-size:20px;font-weight:900;color:#064e3b;">${__(this.reportName)}</div>
					<div style="margin-top:6px;font-size:13px;color:#065f46;font-weight:700;">${__("Sales Order wise operation matrix grouped by item, inside this page.")}</div>
					<div class="text-muted small" data-report-status style="margin-top:10px;">${__("Ready.")}</div>
				</div>
				<div data-summary style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px;"></div>
				<div style="border:1px solid #e5e7eb;border-radius:16px;background:#fff;overflow:hidden;">
					<div data-matrix-container style="overflow:auto;"></div>
				</div>
			</div>
		`);

		this.$status = this.$root.find("[data-report-status]");
		this.$summary = this.$root.find("[data-summary]");
		this.$matrixContainer = this.$root.find("[data-matrix-container]");
	}

	setupFilters() {
		const defs = this.getFilterDefs();
		this.filters = defs.map((df) => {
			const field = this.page.add_field(df);
			if (this.routeOptions[df.fieldname] !== undefined) {
				field.set_value(this.routeOptions[df.fieldname]);
			}
			field.df.onchange = () => this.onFilterChange(df.fieldname);
			return field;
		});
	}

	setupActions() {
		this.page.set_primary_action(__("Refresh"), () => this.refresh(), "refresh");
		this.page.set_secondary_action(__("Reset Filters"), () => this.resetFilters(), "delete");
	}

	onFilterChange(fieldname) {
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
				fieldname: "company",
				label: __("Company"),
				fieldtype: "Link",
				options: "Company",
			},
			{
				fieldname: "customer",
				label: __("Customer"),
				fieldtype: "Data",
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
			{
				fieldname: "operation",
				label: __("Operation"),
				fieldtype: "Link",
				options: "Operation",
			},
			{
				fieldname: "employee",
				label: __("Employee"),
				fieldtype: "Data",
			},
			{
				fieldname: "group_by",
				label: __("Group By"),
				fieldtype: "Select",
				options: ["Sales Order Number by Item"],
				default: "Sales Order Number by Item",
				reqd: 1,
				read_only: 1,
			},
			{
				fieldname: "hide_zero_qty",
				label: __("Hide Zero Qty"),
				fieldtype: "Check",
				default: 1,
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
				method: "frappe.desk.query_report.run",
				type: "GET",
				args: {
					report_name: this.reportName,
					filters: { ...this.getFilters(), group_by: "None" },
					ignore_prepared_report: 1,
					is_tree: 0,
				},
			});

			const payload = response.message || {};
			this.rows = payload.result || [];
			this.renderSummary(payload.report_summary || []);
			this.renderMatrix(this.rows);
			this.$status.text(__("Report loaded."));
		} catch (error) {
			console.error(error);
			this.$status.text(__("Failed to load report."));
			frappe.show_alert({ message: __("Failed to load Daily Operation Report."), indicator: "red" }, 6);
		}
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

	renderMatrix(rows) {
		const detailRows = (rows || []).filter((row) => !row.bold && !this.isBlankRow(row));
		if (!detailRows.length) {
			this.$matrixContainer.html(`<div style="padding:16px;">${__("No data found.")}</div>`);
			return;
		}

		const operations = this.getOperations(detailRows);
		const grouped = this.groupRows(detailRows, operations);
		const matrixHtml = [`
			<table class="table table-bordered" style="margin:0;min-width:${Math.max(680, 180 + operations.length * 130)}px;">
				<thead>
					<tr>
						<th style="min-width:180px;"></th>
						<th colspan="${operations.length}" style="text-align:center;color:#1d4ed8;font-weight:800;">${__("Operations")}</th>
					</tr>
					<tr>
						<th>${__("Date")}</th>
						${operations.map((operation) => `<th style="text-align:center;color:#1d4ed8;font-weight:800;">${frappe.utils.escape_html(operation)}</th>`).join("")}
					</tr>
				</thead>
				<tbody>
		`];

		grouped.forEach((salesOrderGroup) => {
			matrixHtml.push(`
				<tr>
					<td colspan="${operations.length + 1}" style="background:#0f4c1d;color:#fff;font-weight:800;">${frappe.utils.escape_html(salesOrderGroup.salesOrder)}</td>
				</tr>
			`);

			salesOrderGroup.items.forEach((itemGroup) => {
				matrixHtml.push(`
					<tr>
						<td colspan="${operations.length + 1}" style="background:#f8fafc;color:#0f172a;font-weight:700;">${frappe.utils.escape_html(itemGroup.item)}</td>
					</tr>
				`);

				itemGroup.rows.forEach((dateRow) => {
					matrixHtml.push(`
						<tr>
							<td>${frappe.utils.escape_html(this.formatDate(dateRow.date))}</td>
							${operations.map((operation) => `<td style="text-align:center;">${this.formatValue(dateRow.operationQty[operation] || 0, "Float")}</td>`).join("")}
						</tr>
					`);
				});

				matrixHtml.push(`
					<tr>
						<td style="font-weight:800;color:#1d4ed8;">${__("Total Qty")}</td>
						${operations.map((operation) => `<td style="text-align:center;font-weight:800;color:#1d4ed8;">${this.formatValue(itemGroup.totals[operation] || 0, "Float")}</td>`).join("")}
					</tr>
				`);
			});
		});

		matrixHtml.push("</tbody></table>");
		this.$matrixContainer.html(matrixHtml.join(""));
	}

	getOperations(rows) {
		const operations = [];
		rows.forEach((row) => {
			const operation = (row.operation || "").trim();
			if (operation && !operations.includes(operation)) {
				operations.push(operation);
			}
		});
		return operations;
	}

	groupRows(rows, operations) {
		const salesOrderMap = new Map();
		rows.forEach((row) => {
			const salesOrder = (row.sales_order || "No Sales Order").trim() || "No Sales Order";
			const item = (row.item || "No Item").trim() || "No Item";
			const dateKey = this.normalizeDateKey(row.group_or_date);
			const operation = (row.operation || "No Operation").trim() || "No Operation";
			const qty = this.toNumber(row.qty);

			if (!salesOrderMap.has(salesOrder)) {
				salesOrderMap.set(salesOrder, new Map());
			}

			const itemMap = salesOrderMap.get(salesOrder);
			if (!itemMap.has(item)) {
				itemMap.set(item, new Map());
			}

			const dateMap = itemMap.get(item);
			if (!dateMap.has(dateKey)) {
				dateMap.set(dateKey, { date: dateKey, operationQty: {} });
			}

			const dateEntry = dateMap.get(dateKey);
			dateEntry.operationQty[operation] = (dateEntry.operationQty[operation] || 0) + qty;
		});

		return Array.from(salesOrderMap.entries()).map(([salesOrder, itemMap]) => ({
			salesOrder,
			items: Array.from(itemMap.entries()).map(([item, dateMap]) => {
				const rowsForItem = Array.from(dateMap.values()).sort((left, right) => right.date.localeCompare(left.date));
				const totals = {};
				operations.forEach((operation) => {
					totals[operation] = rowsForItem.reduce(
						(sum, row) => sum + this.toNumber(row.operationQty[operation]),
						0
					);
				});
				return { item, rows: rowsForItem, totals };
			}),
		}));
	}

	isBlankRow(row) {
		return Object.keys(row || {}).every((key) => row[key] === "" || row[key] === null || row[key] === undefined);
	}

	normalizeDateKey(value) {
		if (!value) {
			return "";
		}
		return String(value).slice(0, 10);
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

	toNumber(value) {
		const parsed = Number(value || 0);
		return Number.isFinite(parsed) ? parsed : 0;
	}
};
