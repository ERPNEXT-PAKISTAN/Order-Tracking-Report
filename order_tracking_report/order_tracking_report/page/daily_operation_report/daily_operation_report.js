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
		this.columns = [];
		this.data = [];

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
					<div style="margin-top:6px;font-size:13px;color:#065f46;font-weight:700;">${__("Daily Production report with filters, grouping, summary, and chart inside this page.")}</div>
					<div class="text-muted small" data-report-status style="margin-top:10px;">${__("Ready.")}</div>
				</div>
				<div data-summary style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px;"></div>
				<div data-chart-wrapper style="border:1px solid #e5e7eb;border-radius:16px;background:#fff;padding:12px 16px;margin-bottom:16px;display:none;">
					<div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:10px;">${__("Production Trend")}</div>
					<div data-chart style="min-height:260px;"></div>
				</div>
				<div style="border:1px solid #e5e7eb;border-radius:16px;background:#fff;overflow:auto;">
					<table class="table table-bordered" style="margin:0;">
						<thead data-table-head></thead>
						<tbody data-table-body></tbody>
					</table>
				</div>
			</div>
		`);

		this.$status = this.$root.find("[data-report-status]");
		this.$summary = this.$root.find("[data-summary]");
		this.$chartWrapper = this.$root.find("[data-chart-wrapper]");
		this.$chart = this.$root.find("[data-chart]");
		this.$tableHead = this.$root.find("[data-table-head]");
		this.$tableBody = this.$root.find("[data-table-body]");
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
				options: ["None", "Date", "Sales Order", "Item", "Operation", "Employee"],
				default: "Date",
				reqd: 1,
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
					filters: this.getFilters(),
					ignore_prepared_report: 1,
					is_tree: 0,
				},
			});

			const payload = response.message || {};
			this.columns = payload.columns || [];
			this.data = payload.result || [];
			this.renderSummary(payload.report_summary || []);
			this.renderChart(payload.chart || null);
			this.renderTable(this.columns, this.data);
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

	renderChart(chartOptions) {
		if (!chartOptions || !chartOptions.data || !chartOptions.data.labels || !chartOptions.data.labels.length) {
			this.$chartWrapper.hide();
			this.$chart.empty();
			this.chart = null;
			return;
		}

		this.$chartWrapper.show();
		this.$chart.empty();
		this.chart = new frappe.Chart(this.$chart.get(0), {
			data: chartOptions.data,
			type: chartOptions.type || "line",
			height: 260,
			colors: ["#059669"],
		});
	}

	renderTable(columns, rows) {
		if (!columns.length) {
			this.$tableHead.html("");
			this.$tableBody.html(`<tr><td style="padding:16px;" colspan="1">${__("No columns returned.")}</td></tr>`);
			return;
		}

		this.$tableHead.html(`<tr>${columns.map((column) => `<th style="white-space:nowrap;">${frappe.utils.escape_html(__(column.label || column.fieldname || ""))}</th>`).join("")}</tr>`);

		if (!rows.length) {
			this.$tableBody.html(`<tr><td style="padding:16px;" colspan="${columns.length}">${__("No data found.")}</td></tr>`);
			return;
		}

		const bodyHtml = rows.map((row) => {
			const isBlank = Object.keys(row || {}).every((key) => row[key] === "" || row[key] === null || row[key] === undefined);
			if (isBlank) {
				return `<tr><td colspan="${columns.length}" style="padding:8px;background:#f8fafc;"></td></tr>`;
			}

			const cells = columns.map((column) => {
				const rawValue = row[column.fieldname];
				const content = this.renderCell(row, column, rawValue);
				const style = [];
				if (column.fieldname === "group_or_date" && row.indent) {
					style.push(`padding-left:${16 + row.indent * 18}px`);
				}
				if (row.bold) {
					style.push("font-weight:700");
				}
				return `<td style="${style.join(";")}">${content}</td>`;
			}).join("");

			return `<tr>${cells}</tr>`;
		}).join("");

		this.$tableBody.html(bodyHtml);
		this.bindLinkClicks();
	}

	renderCell(row, column, value) {
		if (value === null || value === undefined) {
			return "";
		}

		if (column.fieldtype === "Link" && value) {
			return `<a href="#" data-link-doctype="${frappe.utils.escape_html(column.options || "")}" data-link-name="${frappe.utils.escape_html(String(value))}">${frappe.utils.escape_html(String(value))}</a>`;
		}

		if (column.fieldtype === "Float") {
			return this.formatValue(value, "Float");
		}

		if (column.fieldname === "group_or_date" && value && !row.bold) {
			return frappe.format(value, { fieldtype: "Date" }, { always_show_decimals: false });
		}

		return frappe.utils.escape_html(String(value));
	}

	bindLinkClicks() {
		this.$tableBody.find("[data-link-doctype][data-link-name]").off("click").on("click", function (event) {
			event.preventDefault();
			const doctype = $(this).attr("data-link-doctype");
			const name = $(this).attr("data-link-name");
			if (doctype && name) {
				frappe.set_route("Form", doctype, name);
			}
		});
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
};
