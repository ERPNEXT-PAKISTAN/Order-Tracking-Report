frappe.pages["finanicals"].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Finanicals"),
		single_column: true,
	});

	window.order_tracking_report = window.order_tracking_report || {};
	wrapper.finanicals_page = new window.order_tracking_report.FinanicalsPage(wrapper);
	frappe.breadcrumbs.add("Order Tracking Report");
};

window.order_tracking_report = window.order_tracking_report || {};

window.order_tracking_report.FinanicalsPage = class FinanicalsPage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = wrapper.page;
		this.routeOptions = frappe.route_options || {};
		frappe.route_options = null;
		this.plControls = {};
		setTimeout(() => this.load(), 0);
	}

	async load() {
		this.$root = $(this.wrapper).find(".layout-main-section");
		this.$root.html(`<div class="text-muted">${__("Loading Finanicals...")}</div>`);

		try {
			const response = await frappe.call({
				method: "order_tracking_report.api.get_web_page_payload",
				args: { page_name: "finanicals" },
			});
			const payload = response.message || {};
			this.render(payload);
		} catch (error) {
			this.$root.html(`<div class="text-danger">${__("Finanicals page is not available.")}</div>`);
			frappe.show_alert({ message: __("Failed to load Finanicals page."), indicator: "red" }, 6);
		}
	}

	render(payload) {
		const html = this.injectPlByOrderPanel(payload.html || `<div class="text-muted">${__("No page content found.")}</div>`);
		this.$root.html(`<div class="otr-finanicals-page">${html}</div>`);
		this.installPayloadStyles(payload.styles || "");
		this.installLocalStyles();
		this.executePayloadScript(payload.script || "");
		setTimeout(() => this.setupPlByOrder(), 0);
	}

	injectPlByOrderPanel(html) {
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div id="otr-finanicals-payload">${html}</div>`, "text/html");
		const root = doc.getElementById("otr-finanicals-payload");
		if (!root) {
			return html;
		}

		const tabs = root.querySelector(".tabs");
		const dashboard = root.querySelector(".dashboard-container") || root;
		if (tabs && !root.querySelector('[data-tab="pl-by-order"]')) {
			const tab = doc.createElement("button");
			tab.className = "tab";
			tab.dataset.tab = "pl-by-order";
			tab.textContent = "PL by Order";
			tabs.appendChild(tab);
		}

		if (!root.querySelector("#pl-by-order")) {
			const panel = doc.createElement("div");
			panel.id = "pl-by-order";
			panel.className = "content-panel";
			panel.innerHTML = `
				<div class="section">
					<h2 class="section-title">PL by Order</h2>
					<div id="otr-pl-order-shell"></div>
				</div>
			`;
			dashboard.appendChild(panel);
		}

		return root.innerHTML;
	}

	installPayloadStyles(cssText) {
		const styleId = "otr-finanicals-payload-style";
		let style = document.getElementById(styleId);
		if (!style) {
			style = document.createElement("style");
			style.id = styleId;
			document.head.appendChild(style);
		}
		style.textContent = cssText || "";
	}

	installLocalStyles() {
		if (document.getElementById("otr-finanicals-local-style")) {
			return;
		}

		const style = document.createElement("style");
		style.id = "otr-finanicals-local-style";
		style.textContent = `
			.otr-pl-order-shell {
				display: flex;
				flex-direction: column;
				gap: 16px;
			}
			.otr-pl-toolbar {
				display: grid;
				grid-template-columns: minmax(220px, 1fr) minmax(220px, 1fr) auto auto;
				gap: 12px;
				align-items: end;
				padding: 14px;
				background: linear-gradient(135deg, #ecfeff 0%, #f8fafc 100%);
				border: 1px solid #cbd5e1;
				border-radius: 14px;
			}
			.otr-pl-toolbar .frappe-control {
				margin-bottom: 0;
			}
			.otr-pl-status {
				font-size: 13px;
				font-weight: 700;
				color: #475569;
			}
			.otr-pl-card-grid {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
				gap: 12px;
			}
			.otr-pl-card {
				padding: 14px;
				border-radius: 14px;
				border: 1px solid #cbd5e1;
				background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
				box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
			}
			.otr-pl-card .label {
				font-size: 11px;
				font-weight: 800;
				letter-spacing: 0.06em;
				text-transform: uppercase;
				color: #64748b;
			}
			.otr-pl-card .value {
				margin-top: 6px;
				font-size: 24px;
				font-weight: 900;
				color: #0f172a;
			}
			.otr-pl-card .sub {
				margin-top: 4px;
				font-size: 12px;
				font-weight: 700;
				color: #475569;
			}
			.otr-pl-grid {
				display: grid;
				grid-template-columns: 1fr;
				gap: 16px;
			}
			.otr-pl-section {
				padding: 14px;
				border-radius: 14px;
				border: 1px solid #cbd5e1;
				background: #ffffff;
				box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
			}
			.otr-pl-section h3 {
				margin: 0 0 10px;
				font-size: 15px;
				font-weight: 800;
				color: #0f172a;
			}
			.otr-pl-empty {
				padding: 18px;
				text-align: center;
				border: 1px dashed #cbd5e1;
				border-radius: 12px;
				color: #64748b;
				font-weight: 700;
			}
			.otr-pl-table-wrap {
				overflow-x: auto;
				border: 1px solid #e2e8f0;
				border-radius: 12px;
			}
			.otr-pl-table {
				width: 100%;
				border-collapse: collapse;
				font-size: 13px;
			}
			.otr-pl-table th {
				padding: 10px 12px;
				background: linear-gradient(135deg, #0f172a 0%, #164e63 100%);
				color: #ffffff;
				text-align: left;
				font-size: 11px;
				font-weight: 800;
				letter-spacing: 0.05em;
				text-transform: uppercase;
			}
			.otr-pl-table td {
				padding: 9px 12px;
				border-top: 1px solid #e2e8f0;
			}
			.otr-pl-table td.text-right,
			.otr-pl-table th.text-right {
				text-align: right;
			}
			.otr-pl-table .otr-pl-h-row-group {
				background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
				color: #ffffff;
				font-weight: 800;
			}
			.otr-pl-table .otr-pl-h-row-item {
				background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
				font-weight: 800;
				color: #1e3a8a;
			}
			.otr-pl-table .otr-pl-h-row-subhead {
				background: #ecfeff;
				font-weight: 800;
				color: #155e75;
			}
			.otr-pl-table .otr-pl-h-row-material-group {
				background: #f1f5f9;
				font-weight: 800;
				color: #334155;
			}
			.otr-pl-table .otr-pl-h-row-sales,
			.otr-pl-table .otr-pl-h-row-material,
			.otr-pl-table .otr-pl-h-row-expense {
				background: #ffffff;
			}
			.otr-pl-table .otr-pl-h-label {
				white-space: nowrap;
			}
			.otr-pl-note {
				padding: 12px 14px;
				border-radius: 12px;
				background: #f8fafc;
				border: 1px solid #e2e8f0;
				font-size: 13px;
				font-weight: 700;
				color: #334155;
			}
			.otr-pl-doc-link {
				font-weight: 700;
				color: #0f766e;
				text-decoration: none;
			}
			.otr-pl-doc-link:hover {
				text-decoration: underline;
			}
			@media (max-width: 980px) {
				.otr-pl-toolbar,
				.otr-pl-grid {
					grid-template-columns: 1fr;
				}
			}
		`;
		document.head.appendChild(style);
	}

	executePayloadScript(scriptText) {
		if (!scriptText) {
			return;
		}
		const script = document.createElement("script");
		script.type = "text/javascript";
		script.text = scriptText;
		this.$root[0].appendChild(script);
	}

	setupPlByOrder() {
		const shell = this.$root.find("#otr-pl-order-shell");
		if (!shell.length || shell.data("ready")) {
			return;
		}
		shell.data("ready", true);
		shell.addClass("otr-pl-order-shell");
		shell.html(`
			<div class="otr-pl-toolbar">
				<div data-field="sales_order"></div>
				<div data-field="delivery_note"></div>
				<button class="btn btn-primary btn-sm" data-action="load-pl-order">${__("Load")}</button>
				<button class="btn btn-default btn-sm" data-action="reset-pl-order">${__("Reset")}</button>
			</div>
			<div class="otr-pl-status">${__("Select a Sales Order or Delivery Note to load PL by Order.")}</div>
			<div class="otr-pl-content"></div>
		`);

		this.$plShell = shell;
		this.$plStatus = shell.find(".otr-pl-status");
		this.$plContent = shell.find(".otr-pl-content");

		this.plControls.sales_order = this.makeLinkControl(shell.find('[data-field="sales_order"]')[0], {
			fieldname: "sales_order",
			label: __("Sales Order"),
			options: "Sales Order",
			value: this.routeOptions.sales_order || "",
		});

		this.plControls.delivery_note = this.makeLinkControl(shell.find('[data-field="delivery_note"]')[0], {
			fieldname: "delivery_note",
			label: __("Delivery Note"),
			options: "Delivery Note",
			value: this.routeOptions.delivery_note || "",
		});

		shell.find('[data-action="load-pl-order"]').on("click", () => this.loadPlByOrder());
		shell.find('[data-action="reset-pl-order"]').on("click", () => this.resetPlByOrder());

		if (this.routeOptions.sales_order || this.routeOptions.delivery_note) {
			this.openPlByOrderTab();
			this.loadPlByOrder();
		} else {
			this.renderPlEmptyState();
		}
	}

	makeLinkControl(parent, config) {
		const control = frappe.ui.form.make_control({
			parent,
			df: {
				fieldtype: "Link",
				fieldname: config.fieldname,
				label: config.label,
				options: config.options,
			},
			render_input: true,
		});
		control.set_value(config.value || "");
		return control;
	}

	getControlValue(control) {
		if (!control) {
			return "";
		}

		const committedValue = (control.get_value && control.get_value()) || "";
		const inputValue = (control.$input && control.$input.val && control.$input.val()) || "";
		return String(committedValue || inputValue || "").trim();
	}

	openPlByOrderTab() {
		const tab = this.$root.find('[data-tab="pl-by-order"]');
		if (tab.length) {
			tab.trigger("click");
		}
	}

	resetPlByOrder() {
		this.plControls.sales_order.set_value("");
		this.plControls.delivery_note.set_value("");
		this.$plStatus.text(__("Select a Sales Order or Delivery Note to load PL by Order."));
		this.renderPlEmptyState();
	}

	renderPlEmptyState() {
		this.$plContent.html(`<div class="otr-pl-empty">${__("No PL by Order data loaded yet.")}</div>`);
	}

	async loadPlByOrder() {
		const salesOrder = this.getControlValue(this.plControls.sales_order);
		const deliveryNote = this.getControlValue(this.plControls.delivery_note);
		if (!salesOrder && !deliveryNote) {
			frappe.show_alert({ message: __("Enter Sales Order or Delivery Note."), indicator: "orange" }, 4);
			return;
		}

		if (salesOrder && this.plControls.sales_order.get_value() !== salesOrder) {
			this.plControls.sales_order.set_value(salesOrder);
		}
		if (deliveryNote && this.plControls.delivery_note.get_value() !== deliveryNote) {
			this.plControls.delivery_note.set_value(deliveryNote);
		}

		this.openPlByOrderTab();
		this.$plStatus.text(__("Loading order-level profit and loss..."));
		this.$plContent.html(`<div class="otr-pl-empty">${__("Loading PL by Order...")}</div>`);

		try {
			const response = await frappe.call({
				method: "order_tracking_report.api.get_sales_order_pl_by_order",
				args: {
					sales_order: salesOrder,
					delivery_note: deliveryNote,
				},
			});
			const data = response.message || {};
			if (data.error) {
				this.$plStatus.text(__("PL by Order could not be loaded."));
				this.$plContent.html(`<div class="otr-pl-empty">${frappe.utils.escape_html(data.error || __("Unknown error"))}</div>`);
				frappe.show_alert({ message: __("PL by Order failed: {0}", [data.error || __("Unknown error")]), indicator: "red" }, 7);
				return;
			}
			if (data.sales_order && !salesOrder && (!data.linked_sales_orders || data.linked_sales_orders.length <= 1)) {
				this.plControls.sales_order.set_value(data.sales_order);
			}
			this.renderPlByOrder(data);
		} catch (error) {
			this.$plStatus.text(__("Failed to load PL by Order."));
			this.$plContent.html(`<div class="otr-pl-empty">${__("PL by Order could not be loaded.")}</div>`);
			frappe.show_alert({ message: __("Failed to load PL by Order."), indicator: "red" }, 5);
		}
	}

	renderPlByOrder(data) {
		const summary = data.selected_profit_summary || data.profit_summary || {};
		const baseSummary = data.profit_summary || {};
		const labourSummary = data.labour_cost_summary || {};
		const deliveryNotes = data.delivery_note_options || [];
		const invoiceDetails = data.invoice_details || [];
		const statementRows = data.statement_rows || [];
		const itemGroupSummary = data.item_group_summary || [];
		const hierarchicalStatementRows = data.hierarchical_statement_rows || [];
		const linkedSalesOrders = data.linked_sales_orders || [];
		const selectedDn = data.selected_delivery_note || "";
		const modeLabel = selectedDn
			? __("Showing Delivery Note level allocation using Sales Order default BOM costs.")
			: __("Showing Sales Order level estimated profit and loss.");

		const salesOrderText = linkedSalesOrders.length > 1 ? linkedSalesOrders.join(", ") : (data.sales_order || "-");
		this.$plStatus.text(`${__("Sales Order")}: ${salesOrderText}${selectedDn ? ` • ${__("Delivery Note")}: ${selectedDn}` : ""}`);

		const html = `
			<div class="otr-pl-note">${frappe.utils.escape_html(modeLabel)}</div>
			<div class="otr-pl-card-grid">
				${this.renderMetricCard(__("Sales Amount"), this.formatCurrency(summary.sales_amount || 0), selectedDn ? __("Selected delivery note") : __("Sales order total"))}
				${this.renderMetricCard(__("Estimated Material Cost"), this.formatCurrency(summary.estimated_cost || 0), __("From default BOM"))}
					${this.renderMetricCard(__("Estimated Profit"), this.formatCurrency(summary.estimated_profit || 0), `${this.formatPercent(summary.margin_pct || 0)} ${__("margin")}`)}
					${this.renderMetricCard(__("Labour Cost"), this.formatCurrency(labourSummary.total_cost || 0), `${this.formatNumber(labourSummary.total_qty || 0)} ${__("qty")}`)}
				${this.renderMetricCard(__("Delivery Notes"), this.formatNumber(deliveryNotes.length), selectedDn ? __("Current selection applied") : __("Linked with this order"))}
					${this.renderMetricCard(__("Base Order Profit"), this.formatCurrency(baseSummary.estimated_profit || 0), `${this.formatPercent(baseSummary.margin_pct || 0)} ${__("margin")}`)}
			</div>
			<div class="otr-pl-grid">
				<div class="otr-pl-section">
					<h3>${__("PL Statement by Item Hierarchy")}</h3>
					${this.renderHierarchicalStatementTable(hierarchicalStatementRows)}
				</div>
				<div class="otr-pl-section">
					<h3>${__("Profit and Loss Summary")}</h3>
					${this.renderStatementTable(statementRows)}
				</div>
				<div class="otr-pl-section">
					<h3>${__("Item Group Wise Summary")}</h3>
					${this.renderItemGroupSummaryTable(itemGroupSummary)}
				</div>
				<div class="otr-pl-section">
					<h3>${__("Profit by Item")}</h3>
					${this.renderProfitTable(data.selected_profit_by_item || [])}
				</div>
				<div class="otr-pl-section">
					<h3>${__("Related Expenses")}</h3>
					${this.renderRelatedExpensesTable(data.related_expenses || [])}
				</div>
				<div class="otr-pl-section">
					<h3>${selectedDn ? __("Delivery Note Items") : __("Linked Delivery Notes")}</h3>
					${selectedDn ? this.renderDeliveryNoteItemTable(data.delivery_note_items || []) : this.renderDeliveryNoteOptionsTable(deliveryNotes)}
				</div>
					<div class="otr-pl-section">
						<h3>${selectedDn ? __("Linked Sales Invoices") : __("Procurement by Item Group")}</h3>
						${selectedDn ? this.renderInvoiceDetails(invoiceDetails) : this.renderPoItemGroupTable(data.po_item_group_summary || [])}
					</div>
				<div class="otr-pl-section">
					<h3>${__("BOM and Raw Materials")}</h3>
					${this.renderBomTable(data.bom_rows || [])}
				</div>
				<div class="otr-pl-section">
					<h3>${__("Labour Cost Detail")}</h3>
					${this.renderLabourTable(data.labour_cost_rows || [], labourSummary)}
				</div>
			</div>
		`;

		this.$plContent.html(html);
	}

	renderMetricCard(label, value, sub) {
		return `
			<div class="otr-pl-card">
				<div class="label">${frappe.utils.escape_html(label)}</div>
				<div class="value">${frappe.utils.escape_html(value)}</div>
				<div class="sub">${frappe.utils.escape_html(sub || "")}</div>
			</div>
		`;
	}

	renderProfitTable(rows) {
		if (!rows.length) {
			return `<div class="otr-pl-empty">${__("No profit rows found.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.item_code || "-")}</td>
					<td>${frappe.utils.escape_html(row.item_group || "-")}</td>
				<td class="text-right">${this.formatNumber(row.qty || 0)}</td>
				<td>${frappe.utils.escape_html(row.default_bom || "-")}</td>
				<td class="text-right">${this.formatCurrency(row.sales_amount || 0)}</td>
				<td class="text-right">${this.formatCurrency(row.estimated_cost || 0)}</td>
				<td class="text-right">${this.formatCurrency(row.estimated_profit || 0)}</td>
					<td class="text-right">${this.formatPercent(row.margin_pct || 0)}</td>
			</tr>
		`).join("");
		return this.wrapTable(`
				<thead><tr><th>${__("Item")}</th><th>${__("Item Group")}</th><th class="text-right">${__("Qty")}</th><th>${__("BOM")}</th><th class="text-right">${__("Sales")}</th><th class="text-right">${__("Cost")}</th><th class="text-right">${__("Profit")}</th><th class="text-right">${__("Margin")}</th></tr></thead>
			<tbody>${body}</tbody>
		`);
	}

		renderStatementTable(rows) {
			if (!rows.length) {
				return `<div class="otr-pl-empty">${__("No statement rows found.")}</div>`;
			}
			const body = rows.map((row) => `
				<tr>
					<td>${frappe.utils.escape_html(row.label || "-")}</td>
					<td class="text-right">${this.formatCurrency(row.amount || 0)}</td>
				</tr>
			`).join("");
			return this.wrapTable(`
				<thead><tr><th>${__("Statement Row")}</th><th class="text-right">${__("Amount")}</th></tr></thead>
				<tbody>${body}</tbody>
			`);
		}

		renderHierarchicalStatementTable(rows) {
			if (!rows.length) {
				return `<div class="otr-pl-empty">${__("No hierarchical statement rows found.")}</div>`;
			}

			const body = rows.map((row) => {
				const level = Math.max(Number(row.level || 0), 0);
				const rowType = row.row_type || "detail";
				const indent = 14 + (level * 22);
				const rowClass = `otr-pl-h-row-${frappe.utils.escape_html(rowType)}`;
				return `
					<tr class="${rowClass}">
						<td class="otr-pl-h-label" style="padding-left: ${indent}px">${frappe.utils.escape_html(row.label || "-")}</td>
						<td class="text-right">${this.formatNumber(row.qty || 0)}</td>
						<td class="text-right">${this.formatCurrency(row.rate || 0)}</td>
						<td class="text-right">${this.formatCurrency(row.sales_amount || 0)}</td>
						<td class="text-right">${this.formatCurrency(row.material_cost || 0)}</td>
						<td class="text-right">${this.formatCurrency(row.labour_cost || 0)}</td>
						<td class="text-right">${this.formatCurrency(row.procurement_amount || 0)}</td>
						<td class="text-right">${this.formatCurrency(row.profit_amount || 0)}</td>
					</tr>
				`;
			}).join("");

			return this.wrapTable(`
				<thead><tr><th>${__("Head")}</th><th class="text-right">${__("Qty")}</th><th class="text-right">${__("Price")}</th><th class="text-right">${__("Sales")}</th><th class="text-right">${__("Raw Material Cost")}</th><th class="text-right">${__("Labour")}</th><th class="text-right">${__("Procurement")}</th><th class="text-right">${__("Profit")}</th></tr></thead>
				<tbody>${body}</tbody>
			`);
		}

		renderItemGroupSummaryTable(rows) {
			if (!rows.length) {
				return `<div class="otr-pl-empty">${__("No item group summary found.")}</div>`;
			}
			const body = rows.map((row) => `
				<tr>
					<td>${frappe.utils.escape_html(row.item_group || "-")}</td>
					<td class="text-right">${this.formatNumber(row.qty || 0)}</td>
					<td class="text-right">${this.formatCurrency(row.sales_amount || 0)}</td>
					<td class="text-right">${this.formatCurrency(row.estimated_cost || 0)}</td>
					<td class="text-right">${this.formatCurrency(row.estimated_profit || 0)}</td>
					<td class="text-right">${this.formatPercent(row.margin_pct || 0)}</td>
				</tr>
			`).join("");
			return this.wrapTable(`
				<thead><tr><th>${__("Item Group")}</th><th class="text-right">${__("Qty")}</th><th class="text-right">${__("Sales")}</th><th class="text-right">${__("Cost")}</th><th class="text-right">${__("Profit")}</th><th class="text-right">${__("Margin")}</th></tr></thead>
				<tbody>${body}</tbody>
			`);
		}

	renderRelatedExpensesTable(rows) {
		if (!rows.length) {
			return `<div class="otr-pl-empty">${__("No related expense rows found.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.label || "-")}</td>
				<td>${frappe.utils.escape_html(row.source || "-")}</td>
				<td class="text-right">${this.formatCurrency(row.amount || 0)}</td>
			</tr>
		`).join("");
		return this.wrapTable(`
			<thead><tr><th>${__("Expense")}</th><th>${__("Source")}</th><th class="text-right">${__("Amount")}</th></tr></thead>
			<tbody>${body}</tbody>
		`);
	}

	renderDeliveryNoteOptionsTable(rows) {
		if (!rows.length) {
			return `<div class="otr-pl-empty">${__("No linked Delivery Notes found.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${this.renderDocLink("Delivery Note", row.delivery_note)}</td>
				<td>${frappe.utils.escape_html(row.posting_date || "-")}</td>
				<td>${frappe.utils.escape_html(row.status || "-")}</td>
				<td class="text-right">${this.formatNumber(row.invoice_count || 0)}</td>
			</tr>
		`).join("");
		return this.wrapTable(`
			<thead><tr><th>${__("Delivery Note")}</th><th>${__("Date")}</th><th>${__("Status")}</th><th class="text-right">${__("Invoices")}</th></tr></thead>
			<tbody>${body}</tbody>
		`);
	}

	renderDeliveryNoteItemTable(rows) {
		if (!rows.length) {
			return `<div class="otr-pl-empty">${__("No Delivery Note item rows found.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.item_code || "-")}</td>
					<td>${frappe.utils.escape_html(row.item_group || "-")}</td>
				<td class="text-right">${this.formatNumber(row.qty || 0)}</td>
				<td class="text-right">${this.formatCurrency(row.rate || 0)}</td>
				<td class="text-right">${this.formatCurrency(row.amount || 0)}</td>
			</tr>
		`).join("");
		return this.wrapTable(`
				<thead><tr><th>${__("Item")}</th><th>${__("Item Group")}</th><th class="text-right">${__("Qty")}</th><th class="text-right">${__("Rate")}</th><th class="text-right">${__("Amount")}</th></tr></thead>
			<tbody>${body}</tbody>
		`);
	}

	renderInvoiceDetails(rows) {
		if (!rows.length) {
			return `<div class="otr-pl-empty">${__("No linked Sales Invoices found for this Delivery Note.")}</div>`;
		}
		const body = rows.map((row) => {
			const meta = row.meta || {};
			return `
				<tr>
					<td>${this.renderDocLink("Sales Invoice", row.name)}</td>
					<td>${frappe.utils.escape_html(meta.posting_date || "-")}</td>
					<td>${frappe.utils.escape_html(meta.status || "-")}</td>
					<td class="text-right">${this.formatCurrency(meta.rounded_total || meta.grand_total || 0)}</td>
				</tr>
			`;
		}).join("");
		return this.wrapTable(`
			<thead><tr><th>${__("Sales Invoice")}</th><th>${__("Date")}</th><th>${__("Status")}</th><th class="text-right">${__("Amount")}</th></tr></thead>
			<tbody>${body}</tbody>
		`);
	}

	renderPoItemGroupTable(rows) {
		if (!rows.length) {
			return `<div class="otr-pl-empty">${__("No procurement amount rows found.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.item_group || "-")}</td>
				<td class="text-right">${this.formatCurrency(row.po_amount || 0)}</td>
			</tr>
		`).join("");
		return this.wrapTable(`
			<thead><tr><th>${__("Item Group")}</th><th class="text-right">${__("PO Amount")}</th></tr></thead>
			<tbody>${body}</tbody>
		`);
	}

	renderBomTable(rows) {
		if (!rows.length) {
			return `<div class="otr-pl-empty">${__("No BOM or raw material rows found.")}</div>`;
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
		return this.wrapTable(`
			<thead><tr><th>${__("FG Item")}</th><th class="text-right">${__("Qty")}</th><th>${__("BOM")}</th><th>${__("Raw Material")}</th><th class="text-right">${__("Required")}</th><th class="text-right">${__("Stock")}</th><th class="text-right">${__("Shortage")}</th></tr></thead>
			<tbody>${body}</tbody>
		`);
	}

	renderLabourTable(rows, summary) {
		const summaryLine = `<div class="otr-pl-note">${__("Total Qty")}: ${this.formatNumber(summary.total_qty || 0)} • ${__("Total Cost")}: ${this.formatCurrency(summary.total_cost || 0)}</div>`;
		if (!rows.length) {
			return `${summaryLine}<div class="otr-pl-empty">${__("No labour rows found.")}</div>`;
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
		return `${summaryLine}${this.wrapTable(`
			<thead><tr><th>${__("Employee")}</th><th>${__("Item")}</th><th>${__("Process")}</th><th class="text-right">${__("Qty")}</th><th class="text-right">${__("Labour Cost")}</th><th class="text-right">${__("Rate")}</th></tr></thead>
			<tbody>${body}</tbody>
		`)}`;
	}

	renderDocLink(doctype, name) {
		if (!doctype || !name) {
			return frappe.utils.escape_html(name || "-");
		}
		const route = `/app/${frappe.router.slug(doctype)}/${encodeURIComponent(name)}`;
		return `<a class="otr-pl-doc-link" href="${route}">${frappe.utils.escape_html(name)}</a>`;
	}

	wrapTable(innerHtml) {
		return `<div class="otr-pl-table-wrap"><table class="otr-pl-table">${innerHtml}</table></div>`;
	}

	formatNumber(value) {
		const number = Number(value || 0);
		return Number.isFinite(number) ? number.toLocaleString("en-US", { maximumFractionDigits: 0, minimumFractionDigits: 0 }) : "0";
	}

	formatCurrency(value) {
		return `Rs ${this.formatNumber(value || 0)}`;
	}

	formatPercent(value) {
		return `${this.formatNumber(value || 0)}%`;
	}
};