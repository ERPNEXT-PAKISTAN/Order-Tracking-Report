frappe.pages["sales-order-live"].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Sales Order Live"),
		single_column: true,
	});

	if (!window.order_tracking_report) {
		window.order_tracking_report = {};
	}

	wrapper.sales_order_live = new window.order_tracking_report.SalesOrderLivePage(wrapper);
	frappe.breadcrumbs.add("Order Tracking Report");
};

window.order_tracking_report = window.order_tracking_report || {};

window.order_tracking_report.SalesOrderLivePage = class SalesOrderLivePage {
	constructor(wrapper) {
		const routeOptions = frappe.route_options || {};
		this.wrapper = wrapper;
		this.page = wrapper.page;
		this.state = {
			company: routeOptions.company || frappe.defaults.get_user_default("Company") || "",
			customer: routeOptions.customer || "",
			sales_order: routeOptions.sales_order || "",
			from_date: frappe.datetime.add_days(frappe.datetime.get_today(), -30),
			to_date: frappe.datetime.get_today(),
			recent_limit: 30,
			recent_step: 30,
			auto_refresh: false,
			refresh_seconds: 60,
		};
		frappe.route_options = null;
		this.autoRefreshTimer = null;
		this.recentRows = [];
		this.dashboard = null;
		this.salesOrderDoc = null;
		setTimeout(() => this.setup(), 0);
	}

	setup() {
		this.buildToolbar();
		this.buildShell();
		this.bindWindowEvents();
		this.refresh();
	}

	buildToolbar() {
		this.companyField = this.page.add_field({
			fieldtype: "Link",
			fieldname: "company",
			label: __("Company"),
			options: "Company",
			default: this.state.company,
			change: () => {
				this.state.company = this.companyField.get_value() || "";
				this.refreshRecentOnly();
			},
		});

		this.customerField = this.page.add_field({
			fieldtype: "Link",
			fieldname: "customer",
			label: __("Customer"),
			options: "Customer",
			change: () => {
				this.state.customer = this.customerField.get_value() || "";
				this.refreshRecentOnly();
			},
		});

		this.salesOrderField = this.page.add_field({
			fieldtype: "Link",
			fieldname: "sales_order",
			label: __("Sales Order"),
			options: "Sales Order",
			change: () => {
				this.state.sales_order = this.salesOrderField.get_value() || "";
				this.refresh();
			},
		});

		this.salesOrderField.get_query = () => {
			const filters = {};
			if (this.state.company) filters.company = this.state.company;
			if (this.state.customer) filters.customer = this.state.customer;
			return { filters };
		};

		this.page.set_primary_action(__("Load"), () => this.refresh(), "fa fa-refresh");
		this.page.set_secondary_action(__("Open Sales Order"), () => this.openSelectedSalesOrder());
		this.page.add_action_icon("fa fa-history", () => this.toggleAutoRefresh(), __("Toggle Auto Refresh"));
		if (this.page.add_menu_item) {
			this.page.add_menu_item(__("Load More Orders"), () => this.loadMoreRecentOrders());
			this.page.add_menu_item(__("Reset Filters"), () => this.resetFilters());
		}
	}

	buildShell() {
		this.$root = $(this.wrapper).find(".layout-main-section");
		this.$root.html(`
			<div class="sales-order-live-page">
				<div class="sol-shell">
					<div class="sol-hero">
						<div class="sol-hero-top">
							<div class="sol-hero-main">
								<h1 class="sol-title">${__("Sales Order Live Control")}</h1>
								<div class="sol-subtitle">${__("Live status page for Sales Order connection, procurement, manufacturing, planning, employees, and workstations.")}</div>
								<div class="sol-pill-row" id="sol-page-pills"></div>
							</div>
							<div class="sol-filter-panel">
								<div class="sol-filter-title">${__("Report Filter")}</div>
								<div class="sol-filter-subtitle">${__("Select From Date and To Date, then load the report from the selected range.")}</div>
								<div class="sol-filter-grid">
									<label class="sol-filter-field">
										<span>${__("From Date")}</span>
										<input type="date" id="sol-filter-from-date" value="${this.state.from_date}">
									</label>
									<label class="sol-filter-field">
										<span>${__("To Date")}</span>
										<input type="date" id="sol-filter-to-date" value="${this.state.to_date}">
									</label>
								</div>
								<div class="sol-filter-actions">
									<button class="btn btn-primary btn-sm" data-action="apply-date-filter">${__("Load Report")}</button>
									<button class="btn btn-default btn-sm" data-action="reset-date-filter">${__("Reset")}</button>
								</div>
							</div>
						</div>
						<div id="sol-recent-wrap"></div>
					</div>
					<div id="sol-dashboard-wrap"></div>
				</div>
			</div>
		`);

		this.$pills = this.$root.find("#sol-page-pills");
		this.$recent = this.$root.find("#sol-recent-wrap");
		this.$dashboard = this.$root.find("#sol-dashboard-wrap");
		this.$fromDateInput = this.$root.find("#sol-filter-from-date");
		this.$toDateInput = this.$root.find("#sol-filter-to-date");
		this.renderPagePills();
		this.bindHeroFilters();
		this.renderEmptyState();
	}

	bindWindowEvents() {
		$(window).off("beforeunload.sales-order-live");
		$(window).on("beforeunload.sales-order-live", () => this.stopAutoRefresh());
	}

	renderPagePills() {
		const pills = [
			this.renderPill(this.state.company || __("All Companies")),
			this.renderPill(this.state.customer || __("All Customers")),
			this.renderPill(this.state.auto_refresh ? __("Auto Refresh On") : __("Auto Refresh Off")),
			this.renderPill(`${__("Range")}: ${this.state.from_date} -> ${this.state.to_date}`),
		];
		this.$pills.html(pills.join(""));
		this.syncHeroDateFilters();
	}

	bindHeroFilters() {
		this.$root.find('[data-action="apply-date-filter"]').on("click", () => this.applyDateFilter());
		this.$root.find('[data-action="reset-date-filter"]').on("click", () => this.resetFilters());
	}

	syncHeroDateFilters() {
		if (this.$fromDateInput && this.$fromDateInput.length) {
			this.$fromDateInput.val(this.state.from_date || "");
		}
		if (this.$toDateInput && this.$toDateInput.length) {
			this.$toDateInput.val(this.state.to_date || "");
		}
	}

	applyDateFilter() {
		const fromDate = (this.$fromDateInput && this.$fromDateInput.val()) || this.state.from_date;
		const toDate = (this.$toDateInput && this.$toDateInput.val()) || this.state.to_date;
		this.state.from_date = fromDate || frappe.datetime.add_days(frappe.datetime.get_today(), -30);
		this.state.to_date = toDate || frappe.datetime.get_today();
		this.refresh();
	}

	renderPill(label) {
		return `<span class="sol-pill">${frappe.utils.escape_html(label || "")}</span>`;
	}

	renderEmptyState() {
		this.$dashboard.html(`<div class="sol-empty">${__("Select a Sales Order or click one from the recent list to load the live dashboard.")}</div>`);
	}

	async refreshRecentOnly() {
		this.renderPagePills();
		await this.loadRecentSalesOrders();
		if (this.state.sales_order) {
			await this.loadSelectedSalesOrder();
		}
	}

	async refresh() {
		this.renderPagePills();
		await this.loadRecentSalesOrders();
		if (this.state.sales_order) {
			await this.loadSelectedSalesOrder();
		} else {
			this.renderEmptyState();
		}
	}

	async loadRecentSalesOrders() {
		this.$recent.html(`<div class="sol-note">${__("Loading recent Sales Orders...")}</div>`);
		const filters = {};
		if (this.state.company) filters.company = this.state.company;
		if (this.state.customer) filters.customer = this.state.customer;
		if (this.state.from_date && this.state.to_date) {
			filters.transaction_date = ["between", [this.state.from_date, this.state.to_date]];
		}

		try {
			this.recentRows = await frappe.db.get_list("Sales Order", {
				filters,
				fields: [
					"name",
					"customer",
					"company",
					"transaction_date",
					"delivery_date",
					"status",
					"delivery_status",
					"billing_status",
					"grand_total",
				],
				order_by: "modified desc",
				limit: this.state.recent_limit,
			});
		} catch (error) {
			this.recentRows = [];
			frappe.show_alert({ message: __("Failed to load recent Sales Orders."), indicator: "red" }, 5);
		}

		this.renderRecentSalesOrders();
	}

	renderRecentSalesOrders() {
		if (!this.recentRows.length) {
			this.$recent.html(`<div class="sol-empty">${__("No Sales Orders found for the current filters.")}</div>`);
			return;
		}

		const cards = this.recentRows.map((row) => {
			const active = row.name === this.state.sales_order ? " is-active" : "";
			return `
				<div class="sol-recent-card${active}" data-sales-order="${frappe.utils.escape_html(row.name || "")}">
					<div class="sol-recent-name">${frappe.utils.escape_html(row.name || "")}</div>
					<div class="sol-recent-meta">${frappe.utils.escape_html(row.customer || "-")}</div>
					<div class="sol-recent-meta">${this.renderChip(row.status, this.statusColor(row.status))}</div>
					<div class="sol-recent-meta">${__("Delivery")}: ${frappe.utils.escape_html(row.delivery_status || "-")}</div>
					<div class="sol-recent-meta">${__("Billing")}: ${frappe.utils.escape_html(row.billing_status || "-")}</div>
				</div>
			`;
		}).join("");

		this.$recent.html(`
			<div class="sol-card">
				<div class="sol-card-head">
					<div class="sol-card-title">${__("Recent Sales Orders")}</div>
					<div class="sol-card-sub">${__("Click any card to load the live dashboard. Use Company, Customer, Sales Order, and Date Range filters above, or load more orders below.")}</div>
				</div>
				<div class="sol-recent-grid">${cards}</div>
				<div class="sol-action-row">
					<button class="btn btn-default btn-sm" data-action="load-more-orders">${__("Load More Orders")}</button>
					<button class="btn btn-default btn-sm" data-action="clear-selected-order">${__("Clear Selected Order")}</button>
					<span class="sol-card-sub">${__("Showing up to")} ${this.state.recent_limit} ${__("orders")}</span>
				</div>
			</div>
		`);

		this.$recent.find("[data-sales-order]").on("click", (event) => {
			const salesOrder = $(event.currentTarget).attr("data-sales-order") || "";
			if (!salesOrder) return;
			this.state.sales_order = salesOrder;
			this.salesOrderField.set_value(salesOrder);
			this.loadSelectedSalesOrder();
			this.renderRecentSalesOrders();
		});

		this.$recent.find('[data-action="load-more-orders"]').on("click", () => this.loadMoreRecentOrders());
		this.$recent.find('[data-action="clear-selected-order"]').on("click", () => this.clearSelectedSalesOrder());
	}

	async loadSelectedSalesOrder() {
		if (!this.state.sales_order) {
			this.renderEmptyState();
			return;
		}

		this.$dashboard.html(`<div class="sol-note">${__("Loading live Sales Order dashboard...")}</div>`);

		try {
			const [dashboardResponse, docResponse] = await Promise.all([
				frappe.call({
					method: "order_tracking_report.api.custom_so_execution_status",
					args: { sales_order: this.state.sales_order },
				}),
				frappe.call({
					method: "frappe.client.get",
					args: { doctype: "Sales Order", name: this.state.sales_order },
				}),
			]);

			this.dashboard = dashboardResponse.message || {};
			this.salesOrderDoc = docResponse.message || {};
			this.renderDashboard();
		} catch (error) {
			this.dashboard = null;
			this.salesOrderDoc = null;
			this.$dashboard.html(`<div class="sol-empty">${__("Failed to load the Sales Order dashboard.")}</div>`);
			frappe.show_alert({ message: __("Failed to load Sales Order live data."), indicator: "red" }, 6);
		}
	}

	renderDashboard() {
		const data = this.dashboard || {};
		const doc = this.salesOrderDoc || {};
		const totals = data.production_totals || {};
		const profitSummary = data.profit_summary || {};
		const deliveryPrediction = data.delivery_prediction || {};
		const poOverview = (data.custom_po_analytics || {}).overview || {};
		const productionRows = this.buildProductionRows(data.production_tree || []);
		const itemRows = data.order_item_summary || [];
		const purchaseRows = data.purchase_flow_rows || [];
		const profitRows = data.profit_by_item || [];
		const materialShortageRows = data.material_shortage || [];
		const poStatusRows = (data.custom_po_analytics || {}).po_status_rows || [];
		const poGroupRows = (data.custom_po_analytics || {}).item_group_rows || [];
		const timelineRows = data.gantt_timeline || [];
		const bomRows = this.buildBomRows(data.bom_tree || []);
		const customPoTrackingRows = data.custom_po_tracking || [];
		const labourRows = data.labour_cost_employee_item_wise || [];
		const labourSummary = data.labour_cost_summary || {};
		const poAmountGroupRows = data.po_item_group_summary || [];
		const employeeRows = data.employee_efficiency || [];
		const workstationRows = data.machine_utilization || [];
		const recentProcurement = data.procurement || [];
		const deliveryRows = data.sales_fulfillment_hierarchy || [];
		const relatedLinks = this.renderRelatedLinks(data, doc);

		const kpis = [
			this.renderKpi(__("Ordered Qty"), this.formatNumber(totals.total_qty || 0)),
			this.renderKpi(__("Produced Qty"), this.formatNumber(totals.produced_qty || 0)),
			this.renderKpi(__("Pending Qty"), this.formatNumber(totals.pending_qty || 0)),
			this.renderKpi(__("Completion"), `${this.formatPercent(totals.completion_pct || 0)}%`),
			this.renderKpi(__("Sales Amount"), this.formatCurrency(profitSummary.sales_amount || doc.grand_total || 0)),
			this.renderKpi(__("Estimated Profit"), this.formatCurrency(profitSummary.estimated_profit || 0)),
			this.renderKpi(__("Delayed WO"), this.formatNumber(totals.delayed_work_orders || 0)),
			this.renderKpi(__("PO Created"), this.formatNumber(poOverview.po_created_rows || 0)),
			this.renderKpi(__("PO Pending"), this.formatNumber(poOverview.po_pending_rows || 0)),
			this.renderKpi(__("Employees"), this.formatNumber(employeeRows.length || 0)),
			this.renderKpi(__("Delivery Risk"), deliveryPrediction.risk || __("Unknown")),
			this.renderKpi(__("Date Range"), `${this.state.from_date} -> ${this.state.to_date}`),
		];

		const summaryCards = [
			this.renderMini(__("Company"), doc.company || "-"),
			this.renderMini(__("Sales Order"), doc.name || "-"),
			this.renderMini(__("From Date"), this.state.from_date || "-"),
			this.renderMini(__("To Date"), this.state.to_date || "-"),
			this.renderMini(__("Production Plan"), productionRows[0]?.production_plan || "—"),
			this.renderMini(__("Work Order"), productionRows[0]?.work_order || "—"),
			this.renderMini(__("Items"), itemRows.length ? this.formatNumber(itemRows.length) : __("Multiple")),
			this.renderMini(__("Delivery Risk"), deliveryPrediction.risk || "-"),
		];

		this.$dashboard.html(`
			<div class="sol-shell">
				<div class="sol-hero">
					<div class="sol-hero-top">
						<div>
							<div class="sol-title">${frappe.utils.escape_html(doc.name || this.state.sales_order || "")}</div>
							<div class="sol-subtitle">${frappe.utils.escape_html(doc.customer_name || doc.customer || "-")} · ${frappe.utils.escape_html(doc.company || "-")}</div>
						</div>
						<div class="sol-pill-row">
							${this.renderChip(doc.status || __("Unknown"), this.statusColor(doc.status))}
							${this.renderChip(doc.delivery_status || __("No Delivery Status"), "blue")}
							${this.renderChip(doc.billing_status || __("No Billing Status"), "purple")}
						</div>
					</div>
					<div class="sol-summary-grid">${summaryCards.join("")}</div>
					<div class="sol-note">${__("Recommended flow: Sales Order -> Production Plan -> Work Order -> Material Transfer -> Job Cards -> Manufacture -> Delivery / Billing.")}</div>
				</div>

				<div class="sol-kpi-grid">${kpis.join("")}</div>

				${this.renderSectionBlock(
					__("Manufacturing Control Center"),
					__("Top-level control view from the Sales Order connection report with selected date range and live execution status."),
					"blue",
					this.renderManufacturingControlCenter(doc, totals, deliveryPrediction, productionRows, itemRows)
				)}

				<div class="sol-section-grid">
					${this.renderCard(__("Connection Snapshot"), __("Core Sales Order, delivery, billing, and amount information."), this.renderSnapshotList(doc, totals, poOverview))}
					${this.renderCard(__("Procurement Summary"), __("Quick PO / PR / PI counts and custom PO progress."), this.renderProcurementSummary(recentProcurement, poOverview, purchaseRows))}
				</div>

				${this.renderSectionBlock(
					__("Profit and Loss Section"),
					__("Estimated sales amount, BOM-based cost, item margin detail, PO amount summary, and labour cost."),
					"green",
					`<div class="sol-section-grid">${this.renderCard(__("Profit Dashboard"), __("Estimated cost from default BOM and sales amount."), this.renderProfitSummary(profitSummary))}${this.renderCard(__("Profit by Item"), __("Item-wise estimated cost and margin view."), this.renderProfitByItemTable(profitRows))}</div><div class="sol-section-grid">${this.renderCard(__("PO Amount by Item Group"), __("Purchase Order amount summary linked with this Sales Order."), this.renderPoAmountGroupTable(poAmountGroupRows))}${this.renderCard(__("Employee Item-wise Labour Cost"), __("Per-piece labour impact by employee, item, and process."), this.renderLabourCostTable(labourRows, labourSummary))}</div>`
				)}

				${this.renderSectionBlock(
					__("Purchase Order Section"),
					__("PO analytics, material shortage, custom PO tracking, and PO-wise status from the connection report."),
					"purple",
					`<div class="sol-stack">${this.renderCard(__("PO Analytics"), __("Item-group-wise PO status overview from the Sales Order PO tab."), this.renderPoAnalyticsOverview(poOverview, poGroupRows))}${this.renderCard(__("Custom PO Tracking"), __("Rows from the Sales Order PO tracking table."), this.renderCustomPoTrackingTable(customPoTrackingRows))}${this.renderCard(__("Material Shortage & Purchase Suggestion"), __("Grouped raw material shortage with last supplier and purchase suggestion."), this.renderMaterialShortageTable(materialShortageRows))}${this.renderCard(__("PO-Wise Status Report"), __("Supplier-collapsed PO creation status detail."), this.renderPoStatusTable(poStatusRows))}</div>`
				)}

				${this.renderCard(__("All Related Links"), __("Same related documents flow as the Sales Order Connection tab, with direct links to every connected document."), relatedLinks)}

				${this.renderSectionBlock(
					__("Production Section"),
					__("Detailed production, timeline, machine, and employee execution from the Sales Order connection report."),
					"orange",
					`<div class="sol-stack">${this.renderCard(__("Manufacturing Live Flow"), __("Production Plan, Work Orders, Job Cards, operations, and employee logs linked with this Sales Order."), this.renderProductionTable(productionRows))}${this.renderCard(__("Production Timeline"), __("Work Orders, Delivery Notes, and Sales Invoices over time."), this.renderTimelineTable(timelineRows))}${this.renderCard(__("Workstation Live View"), __("Workstation utilization from Job Card time logs."), this.renderWorkstationTable(workstationRows))}${this.renderCard(__("Employee Live View"), __("Completed quantity versus time spent."), this.renderEmployeeTable(employeeRows))}</div>`
				)}

				${this.renderSectionBlock(
					__("BOM and Raw Material Section"),
					__("Flattened BOM tree with raw material requirement, stock, and shortage visibility."),
					"cyan",
					this.renderCard(__("BOM & Raw Materials"), __("Item and BOM merged for easier reading."), this.renderBomTable(bomRows))
				)}

				${this.renderSectionBlock(
					__("Dispatch Section"),
					__("Order item planning, delivery and billing flow, and delivery risk prediction."),
					"red",
					`<div class="sol-stack">${this.renderCard(__("Sales Order Items Planning"), __("Ordered, delivered, invoiced, and pending quantity by Sales Order item."), this.renderPlanningTable(itemRows))}${this.renderCard(__("Delivery Risk Prediction"), __("Delivery delay warning based on completion and target date."), this.renderDeliveryPredictionCard(deliveryPrediction))}${this.renderCard(__("PO / Procurement Live Status"), __("Purchase flow tracker from PO to PR and PI."), this.renderPurchaseFlowTable(purchaseRows))}${this.renderCard(__("Delivery and Billing Flow"), __("Delivery Notes and Sales Invoices linked with this Sales Order."), this.renderDeliveryTable(deliveryRows))}</div>`
				)}
			</div>
		`);
	}

	renderSectionBlock(title, subtitle, colorClass, body) {
		return `
			<div class="sol-section-block ${colorClass || "slate"}">
				<div class="sol-section-banner">
					<div>
						<div class="sol-section-title">${frappe.utils.escape_html(title || "")}</div>
						<div class="sol-section-subtitle">${frappe.utils.escape_html(subtitle || "")}</div>
					</div>
				</div>
				<div class="sol-section-body">${body}</div>
			</div>
		`;
	}

	renderCard(title, subtitle, body) {
		return `
			<div class="sol-card">
				<div class="sol-card-head">
					<div class="sol-card-title">${frappe.utils.escape_html(title || "")}</div>
					<div class="sol-card-sub">${frappe.utils.escape_html(subtitle || "")}</div>
				</div>
				${body}
			</div>
		`;
	}

	renderMini(title, value) {
		return `<div class="sol-mini"><div class="sol-mini-title">${frappe.utils.escape_html(title || "")}</div><div class="sol-mini-value">${frappe.utils.escape_html(value || "")}</div></div>`;
	}

	renderKpi(title, value) {
		return `<div class="sol-kpi"><div class="sol-kpi-title">${frappe.utils.escape_html(title || "")}</div><div class="sol-kpi-value">${frappe.utils.escape_html(value || "")}</div></div>`;
	}

	renderChip(label, color) {
		return `<span class="sol-chip ${color || "slate"}">${frappe.utils.escape_html(label || "")}</span>`;
	}

	renderSnapshotList(doc, totals, poOverview) {
		const entries = [
			[__("Customer"), doc.customer_name || doc.customer || "-"],
			[__("Transaction Date"), doc.transaction_date || "-"],
			[__("Delivery Date"), doc.delivery_date || "-"],
			[__("From Date"), this.state.from_date || "-"],
			[__("To Date"), this.state.to_date || "-"],
			[__("Grand Total"), this.formatCurrency(doc.grand_total || 0)],
			[__("Completion %"), `${this.formatPercent(totals.completion_pct || 0)}%`],
			[__("PO Received %"), `${this.formatPercent(poOverview.received_pct || 0)}%`],
		];
		return `<div class="sol-list">${entries.map((entry) => `<div class="sol-list-item"><div class="label">${frappe.utils.escape_html(entry[0])}</div><div class="value">${frappe.utils.escape_html(entry[1])}</div></div>`).join("")}</div>`;
	}

	renderManufacturingControlCenter(doc, totals, deliveryPrediction, productionRows, itemRows) {
		const entries = [
			[__("Company"), doc.company || "-"],
			[__("Sales Order"), doc.name || "-"],
			[__("Date Range"), `${this.state.from_date || "-"} -> ${this.state.to_date || "-"}`],
			[__("Delivery Date"), doc.delivery_date || "-"],
			[__("Production Plans"), this.formatNumber(new Set(productionRows.map((row) => row.production_plan).filter(Boolean)).size)],
			[__("Work Orders"), this.formatNumber(productionRows.length)],
			[__("Items"), this.formatNumber(itemRows.length)],
			[__("Delivery Risk"), deliveryPrediction.risk || "-"],
			[__("Pending Qty"), this.formatNumber(totals.pending_qty || 0)],
		];
		return `<div class="sol-list sol-list-grid">${entries.map((entry) => `<div class="sol-list-item"><div class="label">${frappe.utils.escape_html(entry[0])}</div><div class="value">${frappe.utils.escape_html(entry[1])}</div></div>`).join("")}</div>`;
	}

	renderProfitSummary(summary) {
		const entries = [
			[__("Sales Amount"), this.formatCurrency(summary.sales_amount || 0)],
			[__("Estimated Cost"), this.formatCurrency(summary.estimated_cost || 0)],
			[__("Estimated Profit"), this.formatCurrency(summary.estimated_profit || 0)],
			[__("Margin %"), `${this.formatPercent(summary.margin_pct || 0)}%`],
		];
		return `<div class="sol-list">${entries.map((entry) => `<div class="sol-list-item"><div class="label">${frappe.utils.escape_html(entry[0])}</div><div class="value">${frappe.utils.escape_html(entry[1])}</div></div>`).join("")}</div>`;
	}

	renderProfitByItemTable(rows) {
		if (!rows.length) {
			return `<div class="sol-empty">${__("No profit-by-item rows found.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.item_code || "-")}</td>
				<td class="text-right">${this.formatNumber(row.qty || 0)}</td>
				<td>${frappe.utils.escape_html(row.default_bom || "-")}</td>
				<td class="text-right">${this.formatCurrency(row.sales_amount || 0)}</td>
				<td class="text-right">${this.formatCurrency(row.estimated_cost || 0)}</td>
				<td class="text-right">${this.formatCurrency(row.estimated_profit || 0)}</td>
				<td class="text-right">${this.formatPercent(row.margin_pct || 0)}%</td>
			</tr>
		`).join("");
		return this.wrapTable(`
			<thead><tr><th>${__("Item")}</th><th class="text-right">${__("Qty")}</th><th>${__("BOM")}</th><th class="text-right">${__("Sales")}</th><th class="text-right">${__("Cost")}</th><th class="text-right">${__("Profit")}</th><th class="text-right">${__("Margin")}</th></tr></thead><tbody>${body}</tbody>
		`);
	}

	renderPoAmountGroupTable(rows) {
		if (!rows.length) {
			return `<div class="sol-empty">${__("No PO amount summary rows found.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.item_group || row.group_name || "-")}</td>
				<td class="text-right">${this.formatNumber(row.qty || row.total_qty || 0)}</td>
				<td class="text-right">${this.formatCurrency(row.amount || row.total_amount || 0)}</td>
			</tr>
		`).join("");
		return this.wrapTable(`
			<thead><tr><th>${__("Item Group")}</th><th class="text-right">${__("Qty")}</th><th class="text-right">${__("Amount")}</th></tr></thead><tbody>${body}</tbody>
		`);
	}

	renderLabourCostTable(rows, summary) {
		const summaryHtml = `<div class="sol-inline-summary"><span>${__("Total Qty")}: <b>${this.formatNumber(summary.total_qty || 0)}</b></span><span>${__("Total Cost")}: <b>${this.formatCurrency(summary.total_cost || 0)}</b></span></div>`;
		if (!rows.length) {
			return `${summaryHtml}<div class="sol-empty">${__("No labour cost rows found.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.employee || row.name1 || "-")}</td>
				<td>${frappe.utils.escape_html(row.product || "-")}</td>
				<td>${frappe.utils.escape_html(row.process_type || "-")}</td>
				<td class="text-right">${this.formatNumber(row.qty || 0)}</td>
				<td class="text-right">${this.formatCurrency(row.labour_cost || 0)}</td>
				<td class="text-right">${this.formatCurrency(row.rate || 0)}</td>
			</tr>
		`).join("");
		return `${summaryHtml}${this.wrapTable(`<thead><tr><th>${__("Employee")}</th><th>${__("Item")}</th><th>${__("Process")}</th><th class="text-right">${__("Qty")}</th><th class="text-right">${__("Labour Cost")}</th><th class="text-right">${__("Rate")}</th></tr></thead><tbody>${body}</tbody>`)}`;
	}

	renderPoAnalyticsOverview(overview, rows) {
		const entries = [
			[__("Ordered Qty"), this.formatNumber(overview.ordered_qty || 0)],
			[__("Received Qty"), this.formatNumber(overview.received_qty || 0)],
			[__("Pending Qty"), this.formatNumber(overview.pending_qty || 0)],
			[__("Received %"), `${this.formatPercent(overview.received_pct || 0)}%`],
			[__("Pending %"), `${this.formatPercent(overview.pending_pct || 0)}%`],
			[__("Rows"), this.formatNumber(overview.total_rows || 0)],
		];
		const table = rows.length ? this.renderPoGroupTable(rows) : `<div class="sol-empty">${__("No PO analytics item-group rows found.")}</div>`;
		return `<div class="sol-list">${entries.map((entry) => `<div class="sol-list-item"><div class="label">${frappe.utils.escape_html(entry[0])}</div><div class="value">${frappe.utils.escape_html(entry[1])}</div></div>`).join("")}</div><div style="margin-top:12px;">${table}</div>`;
	}

	renderPoGroupTable(rows) {
		const body = rows.map((row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.item_group || "-")}</td>
				<td>${frappe.utils.escape_html(row.item || "-")}</td>
				<td>${frappe.utils.escape_html(row.supplier_name || "-")}</td>
				<td>${row.order_number ? this.renderDocLink("Purchase Order", row.order_number) : `<span class="text-muted">${__("Not Created")}</span>`}</td>
				<td class="text-right">${this.formatNumber(row.ordered_qty || 0)}</td>
				<td class="text-right">${this.formatNumber(row.pending_qty || 0)}</td>
				<td>${this.renderChip(row.po_status || __("Pending"), this.statusColor(row.po_status))}</td>
			</tr>
		`).join("");
		return this.wrapTable(`<thead><tr><th>${__("Item Group")}</th><th>${__("Item")}</th><th>${__("Supplier")}</th><th>${__("PO")}</th><th class="text-right">${__("Ordered")}</th><th class="text-right">${__("Pending")}</th><th>${__("Status")}</th></tr></thead><tbody>${body}</tbody>`);
	}

	renderCustomPoTrackingTable(rows) {
		if (!rows.length) {
			return `<div class="sol-empty">${__("No custom PO tracking rows found.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${row.name ? this.renderDocLink(row.doctype || "Purchase Order", row.name) : `<span class="text-muted">${__("Pending")}</span>`}</td>
				<td>${this.renderChip(row.status || __("Pending"), this.statusColor(row.status))}</td>
				<td class="text-right">${this.formatNumber(row.qty || 0)}</td>
				<td>${frappe.utils.escape_html(row.details || "-")}</td>
			</tr>
		`).join("");
		return this.wrapTable(`<thead><tr><th>${__("Document")}</th><th>${__("Status")}</th><th class="text-right">${__("Qty")}</th><th>${__("Details")}</th></tr></thead><tbody>${body}</tbody>`);
	}

	renderMaterialShortageTable(rows) {
		if (!rows.length) {
			return `<div class="sol-empty">${__("No material shortage rows found.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.item_group || "-")}</td>
				<td>${frappe.utils.escape_html(row.item_code || "-")}</td>
				<td class="text-right">${this.formatNumber(row.required_qty || 0)}</td>
				<td class="text-right">${this.formatNumber(row.stock_qty || 0)}</td>
				<td class="text-right">${this.formatNumber(row.shortage_qty || 0)}</td>
				<td class="text-right">${this.formatNumber(row.purchase_suggestion_qty || 0)}</td>
				<td>${frappe.utils.escape_html(row.last_supplier || "-")}</td>
			</tr>
		`).join("");
		return this.wrapTable(`<thead><tr><th>${__("Item Group")}</th><th>${__("Item")}</th><th class="text-right">${__("Required")}</th><th class="text-right">${__("Stock")}</th><th class="text-right">${__("Shortage")}</th><th class="text-right">${__("Suggestion")}</th><th>${__("Last Supplier")}</th></tr></thead><tbody>${body}</tbody>`);
	}

	renderPoStatusTable(rows) {
		if (!rows.length) {
			return `<div class="sol-empty">${__("No PO-wise status rows found.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${row.purchase_order ? this.renderDocLink("Purchase Order", row.purchase_order) : `<span class="text-muted">${__("Not Created")}</span>`}</td>
				<td>${frappe.utils.escape_html(row.supplier || "-")}</td>
				<td>${this.renderChip(row.status || __("Pending"), this.statusColor(row.status))}</td>
				<td class="text-right">${this.formatNumber(row.row_count || 0)}</td>
				<td class="text-right">${this.formatNumber(row.ordered_qty || 0)}</td>
				<td class="text-right">${this.formatNumber(row.pending_qty || 0)}</td>
			</tr>
		`).join("");
		return this.wrapTable(`<thead><tr><th>${__("Purchase Order")}</th><th>${__("Supplier")}</th><th>${__("Status")}</th><th class="text-right">${__("Rows")}</th><th class="text-right">${__("Ordered")}</th><th class="text-right">${__("Pending")}</th></tr></thead><tbody>${body}</tbody>`);
	}

	renderTimelineTable(rows) {
		if (!rows.length) {
			return `<div class="sol-empty">${__("No production timeline rows found.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.doctype || "-")}</td>
				<td>${this.renderDocLink(row.doctype || "", row.name || "")}</td>
				<td>${frappe.utils.escape_html(row.item || "-")}</td>
				<td>${frappe.utils.escape_html(row.start_date || "-")}</td>
				<td>${frappe.utils.escape_html(row.end_date || "-")}</td>
				<td>${this.renderChip(row.status || __("-"), this.statusColor(row.status))}</td>
				<td class="text-right">${this.formatPercent(row.progress || 0)}%</td>
			</tr>
		`).join("");
		return this.wrapTable(`<thead><tr><th>${__("Type")}</th><th>${__("Document")}</th><th>${__("Item")}</th><th>${__("Start")}</th><th>${__("End")}</th><th>${__("Status")}</th><th class="text-right">${__("Progress")}</th></tr></thead><tbody>${body}</tbody>`);
	}

	buildBomRows(tree) {
		const rows = [];
		(tree || []).forEach((itemRow) => {
			(itemRow.boms || []).forEach((bomRow) => {
				(bomRow.raw_materials || []).forEach((materialRow) => {
					rows.push({
						item_code: itemRow.item_code || "",
						order_qty: itemRow.order_qty || 0,
						bom: bomRow.bom || "",
						material_item_code: materialRow.item_code || "",
						required_qty: materialRow.required_qty || 0,
						stock_qty: materialRow.stock_qty || 0,
						shortage_qty: materialRow.shortage_qty || 0,
					});
				});
			});
		});
		return rows;
	}

	renderBomTable(rows) {
		if (!rows.length) {
			return `<div class="sol-empty">${__("No BOM rows found.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.item_code || "-")}</td>
				<td class="text-right">${this.formatNumber(row.order_qty || 0)}</td>
				<td>${frappe.utils.escape_html(row.bom || "-")}</td>
				<td>${frappe.utils.escape_html(row.material_item_code || "-")}</td>
				<td class="text-right">${this.formatNumber(row.required_qty || 0)}</td>
				<td class="text-right">${this.formatNumber(row.stock_qty || 0)}</td>
				<td class="text-right">${this.formatNumber(row.shortage_qty || 0)}</td>
			</tr>
		`).join("");
		return this.wrapTable(`<thead><tr><th>${__("FG Item")}</th><th class="text-right">${__("Order Qty")}</th><th>${__("BOM")}</th><th>${__("Raw Material")}</th><th class="text-right">${__("Required")}</th><th class="text-right">${__("Stock")}</th><th class="text-right">${__("Shortage")}</th></tr></thead><tbody>${body}</tbody>`);
	}

	renderDeliveryPredictionCard(prediction) {
		const entries = [
			[__("Risk"), prediction.risk || "-"],
			[__("Delivery Date"), prediction.delivery_date || "-"],
			[__("Today"), prediction.today || "-"],
			[__("Completion %"), `${this.formatPercent(prediction.completion_pct || 0)}%`],
			[__("Pending Qty"), this.formatNumber(prediction.pending_qty || 0)],
			[__("Reason"), prediction.reason || "-"],
		];
		return `<div class="sol-list">${entries.map((entry) => `<div class="sol-list-item"><div class="label">${frappe.utils.escape_html(entry[0])}</div><div class="value">${frappe.utils.escape_html(entry[1])}</div></div>`).join("")}</div>`;
	}

	wrapTable(innerHtml) {
		return `<div class="sol-table-wrap"><table>${innerHtml}</table></div>`;
	}

	renderProcurementSummary(procurementRows, poOverview, purchaseRows) {
		const poCount = purchaseRows.filter((row) => row.purchase_order).length;
		const prCount = purchaseRows.filter((row) => row.purchase_receipts).length;
		const piCount = purchaseRows.filter((row) => row.purchase_invoices).length;
		const entries = [
			[__("Linked Purchase Orders"), this.formatNumber(poCount)],
			[__("Linked Purchase Receipts"), this.formatNumber(prCount)],
			[__("Linked Purchase Invoices"), this.formatNumber(piCount)],
			[__("PO Created Rows"), this.formatNumber(poOverview.po_created_rows || 0)],
			[__("PO Pending Rows"), this.formatNumber(poOverview.po_pending_rows || 0)],
			[__("Procurement Documents"), this.formatNumber((procurementRows || []).length)],
		];
		return `<div class="sol-list">${entries.map((entry) => `<div class="sol-list-item"><div class="label">${frappe.utils.escape_html(entry[0])}</div><div class="value">${frappe.utils.escape_html(entry[1])}</div></div>`).join("")}</div>`;
	}

	buildProductionRows(tree) {
		const rows = [];
		(tree || []).forEach((node) => {
			const pp = node.production_plan || {};
			(node.work_orders || []).forEach((wo) => {
				rows.push({
					production_plan: pp.name || "Unassigned",
					production_plan_status: pp.status || "-",
					work_order: wo.name || "",
					work_order_status: wo.status || "",
					item: wo.production_item || "",
					qty: wo.qty || 0,
					produced_qty: wo.produced_qty || 0,
					job_card_count: (wo.job_cards || []).length,
					job_cards: (wo.job_cards || []).map((row) => row.name).filter(Boolean),
					operation_count: (wo.operations || []).length,
					employee_count: (wo.employee_summary || []).length,
				});
			});
		});
		return rows;
	}

	renderProductionTable(rows) {
		if (!rows.length) {
			return `<div class="sol-empty">${__("No production records linked with this Sales Order.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${row.production_plan && row.production_plan !== "Unassigned" ? `<a href="/app/production-plan/${encodeURIComponent(row.production_plan)}" target="_blank">${frappe.utils.escape_html(row.production_plan)}</a>` : frappe.utils.escape_html(row.production_plan)}</td>
				<td>${this.renderChip(row.production_plan_status, this.statusColor(row.production_plan_status))}</td>
				<td><a href="/app/work-order/${encodeURIComponent(row.work_order || "")}" target="_blank">${frappe.utils.escape_html(row.work_order)}</a></td>
				<td>${this.renderChip(row.work_order_status, this.statusColor(row.work_order_status))}</td>
				<td>${frappe.utils.escape_html(row.item || "-")}</td>
				<td class="text-right">${this.formatNumber(row.qty || 0)}</td>
				<td class="text-right">${this.formatNumber(row.produced_qty || 0)}</td>
				<td class="text-right">${this.formatNumber(row.job_card_count || 0)}</td>
				<td class="text-right">${this.formatNumber(row.operation_count || 0)}</td>
				<td class="text-right">${this.formatNumber(row.employee_count || 0)}</td>
			</tr>
		`).join("");

		return `
			<div class="sol-table-wrap">
				<table>
					<thead>
						<tr>
							<th>${__("Production Plan")}</th>
							<th>${__("PP Status")}</th>
							<th>${__("Work Order")}</th>
							<th>${__("WO Status")}</th>
							<th>${__("Item")}</th>
							<th class="text-right">${__("Qty")}</th>
							<th class="text-right">${__("Produced")}</th>
							<th class="text-right">${__("Job Cards")}</th>
							<th class="text-right">${__("Operations")}</th>
							<th class="text-right">${__("Employees")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`;
	}

	renderPlanningTable(rows) {
		if (!rows.length) {
			return `<div class="sol-empty">${__("No Sales Order item rows found.")}</div>`;
		}
		const body = rows.map((row) => {
			const ordered = row.ordered_qty || row.qty || 0;
			const delivered = row.delivered_qty || 0;
			const invoiced = row.invoiced_qty || 0;
			const pending = row.pending_qty || 0;
			return `
				<tr>
					<td>${frappe.utils.escape_html(row.item_name || row.item_code || "-")}</td>
					<td>${frappe.utils.escape_html(row.item_code || "-")}</td>
					<td class="text-right">${this.formatNumber(ordered)}</td>
					<td class="text-right">${this.formatNumber(delivered)}</td>
					<td class="text-right">${this.formatNumber(invoiced)}</td>
					<td class="text-right">${this.formatNumber(pending)}</td>
				</tr>
			`;
		}).join("");

		return `
			<div class="sol-table-wrap">
				<table>
					<thead>
						<tr>
							<th>${__("Item")}</th>
							<th>${__("Item Code")}</th>
							<th class="text-right">${__("Ordered")}</th>
							<th class="text-right">${__("Delivered")}</th>
							<th class="text-right">${__("Invoiced")}</th>
							<th class="text-right">${__("Pending")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`;
	}

	renderPurchaseFlowTable(rows) {
		if (!rows.length) {
			return `<div class="sol-empty">${__("No purchase flow rows found.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${row.purchase_order ? `<a href="/app/purchase-order/${encodeURIComponent(row.purchase_order)}" target="_blank">${frappe.utils.escape_html(row.purchase_order)}</a>` : `<span class="text-muted">${__("Not Created")}</span>`}</td>
				<td>${frappe.utils.escape_html(row.supplier || "-")}</td>
				<td>${this.renderChip(row.po_status || __("Pending"), this.statusColor(row.po_status))}</td>
				<td class="text-right">${this.formatNumber(row.ordered_qty || 0)}</td>
				<td class="text-right">${this.formatNumber(row.received_qty || 0)}</td>
				<td class="text-right">${this.formatNumber(row.pending_qty || 0)}</td>
				<td>${this.renderDocLinksFromText("Purchase Receipt", row.purchase_receipts)}</td>
				<td>${row.pr_status ? this.renderChip(row.pr_status, this.statusColor(row.pr_status)) : "-"}</td>
				<td>${this.renderDocLinksFromText("Purchase Invoice", row.purchase_invoices)}</td>
				<td>${row.pi_status ? this.renderChip(row.pi_status, this.statusColor(row.pi_status)) : "-"}</td>
			</tr>
		`).join("");

		return `
			<div class="sol-table-wrap">
				<table>
					<thead>
						<tr>
							<th>${__("Purchase Order")}</th>
							<th>${__("Supplier")}</th>
							<th>${__("Status")}</th>
							<th class="text-right">${__("Ordered")}</th>
							<th class="text-right">${__("Received")}</th>
							<th class="text-right">${__("Pending")}</th>
							<th>${__("Purchase Receipts")}</th>
							<th>${__("PR Status")}</th>
							<th>${__("Purchase Invoices")}</th>
							<th>${__("PI Status")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`;
	}

	renderDeliveryTable(rows) {
		if (!rows.length) {
			return `<div class="sol-empty">${__("No delivery or billing records found.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${row.delivery_note ? `<a href="/app/delivery-note/${encodeURIComponent(row.delivery_note)}" target="_blank">${frappe.utils.escape_html(row.delivery_note)}</a>` : __("Unlinked Invoices")}</td>
				<td>${this.renderChip(row.status || __("-"), this.statusColor(row.status))}</td>
				<td>${frappe.utils.escape_html(row.posting_date || "-")}</td>
				<td>${this.renderInvoiceLinks(row.invoices || [])}</td>
			</tr>
		`).join("");

		return `
			<div class="sol-table-wrap">
				<table>
					<thead>
						<tr>
							<th>${__("Delivery Note")}</th>
							<th>${__("Status")}</th>
							<th>${__("Posting Date")}</th>
							<th class="text-right">${__("Invoices")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`;
	}

	renderEmployeeTable(rows) {
		if (!rows.length) {
			return `<div class="sol-empty">${__("No employee efficiency rows found.")}</div>`;
		}
		const body = rows.slice(0, 25).map((row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.employee || "-")}</td>
				<td>${frappe.utils.escape_html(row.operations || row.operation || "-")}</td>
				<td class="text-right">${this.formatNumber(row.completed_qty || 0)}</td>
				<td class="text-right">${this.formatNumber(row.time_in_mins || 0)}</td>
			</tr>
		`).join("");

		return `
			<div class="sol-table-wrap">
				<table>
					<thead>
						<tr>
							<th>${__("Employee")}</th>
							<th>${__("Operations")}</th>
							<th class="text-right">${__("Completed Qty")}</th>
							<th class="text-right">${__("Time (Mins)")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`;
	}

	renderWorkstationTable(rows) {
		if (!rows.length) {
			return `<div class="sol-empty">${__("No workstation utilization rows found.")}</div>`;
		}
		const body = rows.slice(0, 25).map((row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.workstation || "-")}</td>
				<td class="text-right">${this.formatNumber(row.time_in_mins || 0)}</td>
				<td class="text-right">${this.formatNumber(row.completed_qty || 0)}</td>
			</tr>
		`).join("");

		return `
			<div class="sol-table-wrap">
				<table>
					<thead>
						<tr>
							<th>${__("Workstation")}</th>
							<th class="text-right">${__("Time (Mins)")}</th>
							<th class="text-right">${__("Completed Qty")}</th>
						</tr>
					</thead>
					<tbody>${body}</tbody>
				</table>
			</div>
		`;
	}

	statusColor(status) {
		const value = String(status || "").toLowerCase();
		if (value.includes("complete") || value.includes("closed")) return "green";
		if (value.includes("progress") || value.includes("deliver") || value.includes("bill")) return "blue";
		if (value.includes("pending") || value.includes("draft") || value.includes("open")) return "orange";
		if (value.includes("cancel")) return "red";
		if (value.includes("submit")) return "purple";
		return "slate";
	}

	formatNumber(value) {
		return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
	}

	formatPercent(value) {
		return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
	}

	formatCurrency(value) {
		return typeof format_currency === "function"
			? format_currency(value || 0)
			: this.formatNumber(value || 0);
	}

	loadMoreRecentOrders() {
		this.state.recent_limit += this.state.recent_step;
		this.refreshRecentOnly();
	}

	clearSelectedSalesOrder() {
		this.state.sales_order = "";
		this.salesOrderField.set_value("");
		this.renderRecentSalesOrders();
		this.renderEmptyState();
	}

	resetFilters() {
		this.state.company = frappe.defaults.get_user_default("Company") || "";
		this.state.customer = "";
		this.state.sales_order = "";
		this.state.from_date = frappe.datetime.add_days(frappe.datetime.get_today(), -30);
		this.state.to_date = frappe.datetime.get_today();
		this.state.recent_limit = this.state.recent_step;
		this.companyField.set_value(this.state.company);
		this.customerField.set_value("");
		this.salesOrderField.set_value("");
		this.syncHeroDateFilters();
		this.refresh();
	}

	renderRelatedLinks(data, doc) {
		const groups = new Map([
			[__("Sales Order"), { doctype: "Sales Order", names: new Set(doc?.name ? [doc.name] : []) }],
			[__("Production Plan"), { doctype: "Production Plan", names: new Set() }],
			[__("Work Order"), { doctype: "Work Order", names: new Set() }],
			[__("Job Card"), { doctype: "Job Card", names: new Set() }],
			[__("Purchase Order"), { doctype: "Purchase Order", names: new Set() }],
			[__("Purchase Receipt"), { doctype: "Purchase Receipt", names: new Set() }],
			[__("Purchase Invoice"), { doctype: "Purchase Invoice", names: new Set() }],
			[__("Delivery Note"), { doctype: "Delivery Note", names: new Set() }],
			[__("Sales Invoice"), { doctype: "Sales Invoice", names: new Set() }],
		]);

		(data.production_tree || []).forEach((node) => {
			const ppName = node?.production_plan?.name;
			if (ppName) groups.get(__("Production Plan")).names.add(ppName);
			(node.work_orders || []).forEach((wo) => {
				if (wo?.name) groups.get(__("Work Order")).names.add(wo.name);
				(wo.job_cards || []).forEach((jc) => {
					if (jc?.name) groups.get(__("Job Card")).names.add(jc.name);
				});
			});
		});

		(data.procurement || []).forEach((row) => {
			if (row?.doctype && row?.name) {
				const group = groups.get(__(row.doctype));
				if (group) group.names.add(row.name);
			}
		});

		(data.purchase_flow_rows || []).forEach((row) => {
			if (row?.purchase_order) groups.get(__("Purchase Order")).names.add(row.purchase_order);
			this.splitDocNames(row?.purchase_receipts).forEach((name) => groups.get(__("Purchase Receipt")).names.add(name));
			this.splitDocNames(row?.purchase_invoices).forEach((name) => groups.get(__("Purchase Invoice")).names.add(name));
		});

		(data.sales_fulfillment_hierarchy || []).forEach((row) => {
			if (row?.delivery_note) groups.get(__("Delivery Note")).names.add(row.delivery_note);
			(row.invoices || []).forEach((invoice) => {
				if (invoice?.name) groups.get(__("Sales Invoice")).names.add(invoice.name);
			});
		});

		const cards = Array.from(groups.entries()).map(([label, group]) => {
			const names = Array.from(group.names).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
			return `
				<div class="sol-link-group">
					<div class="sol-mini-title">${frappe.utils.escape_html(label)}</div>
					<div class="sol-link-count">${this.formatNumber(names.length)}</div>
					<div class="sol-link-cloud">${this.renderDocLinkList(group.doctype, names)}</div>
				</div>
			`;
		}).join("");

		return `<div class="sol-link-groups">${cards}</div>`;
	}

	splitDocNames(value) {
		return String(value || "")
			.split(",")
			.map((name) => name.trim())
			.filter(Boolean);
	}

	renderInvoiceLinks(invoices) {
		const names = (invoices || []).map((row) => row?.name).filter(Boolean);
		return this.renderDocLinkList("Sales Invoice", names);
	}

	renderDocLinksFromText(doctype, value) {
		return this.renderDocLinkList(doctype, this.splitDocNames(value));
	}

	renderDocLinkList(doctype, names) {
		if (!names || !names.length) {
			return `<span class="text-muted">${__("—")}</span>`;
		}
		return names.map((name) => this.renderDocLink(doctype, name)).join("");
	}

	renderDocLink(doctype, name) {
		const route = this.getDocRoute(doctype, name);
		if (!route || !name) {
			return `<span class="sol-doc-chip">${frappe.utils.escape_html(name || "")}</span>`;
		}
		return `<a class="sol-doc-chip" href="${route}" target="_blank">${frappe.utils.escape_html(name)}</a>`;
	}

	getDocRoute(doctype, name) {
		const slugMap = {
			"Sales Order": "sales-order",
			"Production Plan": "production-plan",
			"Work Order": "work-order",
			"Job Card": "job-card",
			"Purchase Order": "purchase-order",
			"Purchase Receipt": "purchase-receipt",
			"Purchase Invoice": "purchase-invoice",
			"Delivery Note": "delivery-note",
			"Sales Invoice": "sales-invoice",
			"": "",
		};
		const slug = slugMap[doctype];
		return slug && name ? `/app/${slug}/${encodeURIComponent(name)}` : "";
	}

	openSelectedSalesOrder() {
		if (!this.state.sales_order) {
			frappe.show_alert({ message: __("Select a Sales Order first."), indicator: "orange" }, 4);
			return;
		}
		frappe.set_route("Form", "Sales Order", this.state.sales_order);
	}

	toggleAutoRefresh() {
		this.state.auto_refresh = !this.state.auto_refresh;
		this.renderPagePills();
		if (this.state.auto_refresh) {
			this.startAutoRefresh();
			frappe.show_alert({ message: __("Auto refresh enabled."), indicator: "green" }, 3);
		} else {
			this.stopAutoRefresh();
			frappe.show_alert({ message: __("Auto refresh disabled."), indicator: "blue" }, 3);
		}
	}

	startAutoRefresh() {
		this.stopAutoRefresh();
		this.autoRefreshTimer = window.setInterval(() => {
			if (this.state.sales_order) {
				this.loadSelectedSalesOrder();
			}
		}, this.state.refresh_seconds * 1000);
	}

	stopAutoRefresh() {
		if (this.autoRefreshTimer) {
			window.clearInterval(this.autoRefreshTimer);
			this.autoRefreshTimer = null;
		}
	}
};
