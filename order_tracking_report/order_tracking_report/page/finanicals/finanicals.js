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
		this.plWoControls = {};
		this.onlyPlMode = !!(this.routeOptions.only_pl || this.routeOptions.only_pl_mode);
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
		setTimeout(() => {
			if (this.onlyPlMode) {
				this.applyOnlyPlMode();
			}
			this.setupPlByOrder();
			this.setupPlByWo();
			if (this.onlyPlMode) {
				this.openPlByOrderTab();
			}
		}, 0);
	}

	applyOnlyPlMode() {
		const root = this.$root && this.$root[0];
		if (!root) return;
		root.querySelectorAll(".tabs .tab").forEach((tab) => {
			const key = tab.getAttribute("data-tab");
			if (key !== "pl-by-order" && key !== "pl-by-wo") {
				tab.style.display = "none";
			}
		});
		root.querySelectorAll(".content-panel").forEach((panel) => {
			const id = panel.getAttribute("id");
			if (id !== "pl-by-order" && id !== "pl-by-wo") {
				panel.style.display = "none";
			}
		});
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
			tab.textContent = "PL by BOM";
			const overviewTab = tabs.querySelector('[data-tab="overview"]');
			if (overviewTab && overviewTab.nextSibling) {
				tabs.insertBefore(tab, overviewTab.nextSibling);
			} else {
				tabs.appendChild(tab);
			}
		}

		if (tabs && !root.querySelector('[data-tab="pl-by-wo"]')) {
			const tab = doc.createElement("button");
			tab.className = "tab";
			tab.dataset.tab = "pl-by-wo";
			tab.textContent = "PL by WO";
			const bomTab = tabs.querySelector('[data-tab="pl-by-order"]');
			if (bomTab && bomTab.nextSibling) {
				tabs.insertBefore(tab, bomTab.nextSibling);
			} else {
				tabs.appendChild(tab);
			}
		}

		if (!root.querySelector("#pl-by-order")) {
			const panel = doc.createElement("div");
			panel.id = "pl-by-order";
			panel.className = "content-panel";
			panel.innerHTML = `
				<div class="section">
					<h2 class="section-title">PL by BOM</h2>
					<div id="otr-pl-order-shell"></div>
				</div>
			`;
			dashboard.appendChild(panel);
		}

		if (!root.querySelector("#pl-by-wo")) {
			const panel = doc.createElement("div");
			panel.id = "pl-by-wo";
			panel.className = "content-panel";
			panel.innerHTML = `
				<div class="section">
					<h2 class="section-title">PL by WO</h2>
					<div id="otr-pl-wo-shell"></div>
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
			:root {
				--otr-pl-ink: #102a43;
				--otr-pl-muted: #486581;
				--otr-pl-line: #d9e2ec;
				--otr-pl-panel: #ffffff;
				--otr-pl-soft: #f7fbff;
				--otr-pl-section-bg: linear-gradient(180deg, #fdfefe 0%, #f7fbff 100%);
				--otr-pl-accent: #0f766e;
				--otr-pl-accent-soft: #ccfbf1;
				--otr-pl-blue-soft: #e0f2fe;
				--otr-pl-total: #effcf6;
			}
			.otr-pl-order-shell {
				display: flex;
				flex-direction: column;
				gap: 16px;
			}
			.otr-pl-toolbar {
				display: grid;
				grid-template-columns: minmax(220px, 1fr) minmax(220px, 1fr) minmax(150px, 1fr) minmax(150px, 1fr) minmax(170px, 1fr) minmax(170px, 1fr) auto auto;
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
				gap: 8px;
			}
			.otr-pl-card {
				padding: 8px 10px;
				border-radius: 10px;
				border: 1px solid #cbd5e1;
				background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
				box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05);
			}
			.otr-pl-card .label {
				font-size: 10px;
				font-weight: 800;
				letter-spacing: 0.06em;
				text-transform: uppercase;
				color: #64748b;
			}
			.otr-pl-card .value {
				margin-top: 4px;
				font-size: 14px;
				font-weight: 900;
				color: #0f172a;
			}
			.otr-pl-card .sub {
				margin-top: 2px;
				font-size: 11px;
				font-weight: 700;
				color: #475569;
			}
			.otr-pl-grid {
				display: grid;
				grid-template-columns: 1fr;
				gap: 16px;
			}
			.otr-pl-row-2 {
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 16px;
			}
			.otr-pl-section {
				padding: 16px;
				border-radius: 16px;
				border: 1px solid var(--otr-pl-line);
				background: var(--otr-pl-section-bg);
				box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
				position: relative;
			}
			.otr-pl-section h3 {
				margin: 0 0 10px;
				padding: 10px 12px;
				font-size: 16px;
				font-weight: 800;
				color: var(--otr-pl-ink);
				background: rgba(255, 255, 255, 0.92);
				border: 1px solid rgba(217, 226, 236, 0.85);
				border-radius: 12px;
				box-shadow: 0 6px 18px rgba(15, 23, 42, 0.07);
			}
			.otr-pl-statement-section {
				background: linear-gradient(180deg, #f8fffe 0%, #f7fbff 100%);
				border-color: #b6e3df;
			}
			.otr-pl-statement-title {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 12px;
				padding: 10px 12px;
				margin-bottom: 10px;
				border: 1px solid #d7eeea;
				border-radius: 12px;
				background: rgba(248, 255, 254, 0.94);
				backdrop-filter: blur(8px);
				box-shadow: 0 8px 20px rgba(15, 23, 42, 0.07);
			}
			.otr-pl-statement-title h3 {
				margin: 0;
				font-size: 18px;
				letter-spacing: 0.01em;
			}
			.otr-pl-statement-badge {
				padding: 6px 10px;
				border-radius: 999px;
				background: linear-gradient(135deg, #ccfbf1 0%, #e0f2fe 100%);
				color: #0f766e;
				font-size: 11px;
				font-weight: 800;
				letter-spacing: 0.05em;
				text-transform: uppercase;
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
				border: 1px solid #dbe7f0;
				border-radius: 16px;
				background: #ffffff;
				box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
			}
			.otr-pl-table {
				width: 100%;
				border-collapse: collapse;
				font-size: 12px;
				background: #ffffff;
			}
			.otr-pl-statement-section .otr-pl-table thead th {
				position: static;
			}
			.otr-pl-table th {
				padding: 10px 12px;
				background: linear-gradient(135deg, #12344d 0%, #155e75 100%);
				color: #ffffff;
				text-align: left;
				font-size: 11px;
				font-weight: 800;
				letter-spacing: 0.05em;
				text-transform: uppercase;
			}
			.otr-pl-table td {
				padding: 7px 12px;
				border-top: 1px solid #edf2f7;
				color: var(--otr-pl-ink);
				vertical-align: middle;
				line-height: 1.25;
			}
			.otr-pl-table tbody tr:nth-child(even):not(.otr-pl-row-total):not(.otr-pl-row-group-light):not(.otr-pl-row-section) {
				background: #fbfdff;
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
			.otr-pl-group {
				border: 1px solid #dbeafe;
				border-radius: 12px;
				overflow: hidden;
				background: #fff;
			}
			.otr-pl-group + .otr-pl-group {
				margin-top: 10px;
			}
			.otr-pl-group > summary {
				list-style: none;
				cursor: pointer;
				padding: 10px 12px;
				font-weight: 800;
				font-size: 13px;
				color: #0f172a;
				background: linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%);
				border-bottom: 1px solid #bfdbfe;
				display: flex;
				justify-content: space-between;
				align-items: center;
			}
			.otr-pl-group > summary::-webkit-details-marker {
				display: none;
			}
			.otr-pl-group-total {
				font-weight: 900;
				color: #0f766e;
			}
			.otr-pl-table .otr-pl-row-total {
				background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf9 100%);
				font-weight: 800;
				color: #065f46;
			}
			.otr-pl-table .otr-pl-row-group-light {
				background: linear-gradient(135deg, #eff8ff 0%, #f4fbff 100%);
				font-weight: 700;
				color: #075985;
			}
			.otr-pl-table .otr-pl-row-section {
				background: linear-gradient(90deg, #dff7f2 0%, #e9f5ff 100%);
				font-weight: 800;
				color: #0f4c5c;
			}
			.otr-pl-table .otr-pl-row-section td {
				padding-top: 9px;
				padding-bottom: 9px;
			}
			.otr-pl-table .otr-pl-row-indent td:first-child {
				padding-left: 28px;
			}
			.otr-pl-table .otr-pl-row-detail td:first-child {
				padding-left: 32px;
			}
			.otr-pl-toggle {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 22px;
				height: 22px;
				margin-right: 8px;
				border: 1px solid #93c5fd;
				border-radius: 999px;
				background: #ffffff;
				color: #1d4ed8;
				font-size: 14px;
				font-weight: 900;
				line-height: 1;
				cursor: pointer;
				vertical-align: middle;
			}
			.otr-pl-toggle:hover {
				background: #eff6ff;
			}
			.otr-pl-row-hidden {
				display: none;
			}
			.otr-pl-table .otr-pl-cell-dash {
				color: #9fb3c8;
			}
			.otr-pl-table .otr-pl-cell-amount-strong {
				font-weight: 800;
				color: #0b6e4f;
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
			@media print {
				@page {
					size: A4 portrait;
					margin: 10mm;
				}
				body {
					background: #ffffff !important;
				}
				body * {
					-webkit-print-color-adjust: exact !important;
					print-color-adjust: exact !important;
				}
				.otr-pl-toolbar,
				.otr-pl-status,
				.btn,
				.page-head,
				.page-actions,
				.layout-side-section,
				.sidebar,
				.navbar,
				footer {
					display: none !important;
				}
				.otr-finanicals-page,
				.otr-pl-order-shell,
				.otr-pl-grid,
				.otr-pl-row-2 {
					display: block !important;
					gap: 0 !important;
				}
				.otr-pl-card-grid {
					display: grid !important;
					grid-template-columns: repeat(3, 1fr) !important;
					gap: 6mm !important;
					margin-bottom: 6mm;
				}
				.otr-pl-card,
				.otr-pl-section,
				.otr-pl-table-wrap {
					box-shadow: none !important;
				}
				.otr-pl-section {
					margin-bottom: 6mm;
					padding: 10px !important;
					background: #ffffff !important;
					border-color: #cbd5e1 !important;
					page-break-inside: avoid;
					break-inside: avoid;
				}
				.otr-pl-section h3,
				.otr-pl-statement-title,
				.otr-pl-statement-section .otr-pl-table thead th {
					position: static !important;
					backdrop-filter: none !important;
				}
				.otr-pl-row-hidden {
					display: table-row !important;
				}
				.otr-pl-toggle {
					display: none !important;
				}
				.otr-pl-section h3 {
					padding: 0 0 6px 0 !important;
					margin-bottom: 8px !important;
					border: 0 !important;
					border-bottom: 1px solid #cbd5e1 !important;
					border-radius: 0 !important;
					background: transparent !important;
					box-shadow: none !important;
				}
				.otr-pl-statement-title {
					padding: 0 0 8px 0 !important;
					margin-bottom: 8px !important;
					border: 0 !important;
					border-bottom: 1px solid #cbd5e1 !important;
					border-radius: 0 !important;
					background: transparent !important;
					box-shadow: none !important;
				}
				.otr-pl-statement-badge {
					border: 1px solid #cbd5e1;
					background: #f8fafc !important;
					color: #334155 !important;
				}
				.otr-pl-table-wrap {
					overflow: visible !important;
					border-radius: 0 !important;
					border-color: #cbd5e1 !important;
				}
				.otr-pl-table {
					font-size: 10.5px !important;
				}
				.otr-pl-table th,
				.otr-pl-table td {
					padding: 5px 7px !important;
				}
				.otr-pl-table tr,
				.otr-pl-table td,
				.otr-pl-table th {
					page-break-inside: avoid;
					break-inside: avoid;
				}
				.otr-pl-note {
					margin-bottom: 5mm;
					background: #ffffff !important;
					border-color: #cbd5e1 !important;
				}
			}
			@media (max-width: 980px) {
				.otr-pl-toolbar,
				.otr-pl-grid,
				.otr-pl-row-2 {
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
				<div data-field="wastage_pct"></div>
				<div data-field="stitching_oh_pct"></div>
				<div data-field="head_office_exp_pct"></div>
				<div data-field="bank_charges_pct"></div>
				<button class="btn btn-primary btn-sm" data-action="load-pl-order">${__("Load")}</button>
				<button class="btn btn-default btn-sm" data-action="reset-pl-order">${__("Reset")}</button>
				<button class="btn btn-default btn-sm" data-action="print-pl-order">${__("Print")}</button>
			</div>
			<div class="otr-pl-status">${__("Select a Sales Order or Delivery Note to load PL by BOM.")}</div>
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

		this.plControls.wastage_pct = this.makeFloatControl(shell.find('[data-field="wastage_pct"]')[0], {
			fieldname: "wastage_pct",
			label: __("Wastage %"),
			default: this.routeOptions.wastage_pct || 10,
		});

		this.plControls.stitching_oh_pct = this.makeFloatControl(shell.find('[data-field="stitching_oh_pct"]')[0], {
			fieldname: "stitching_oh_pct",
			label: __("Stitching OH %"),
			default: this.routeOptions.stitching_oh_pct || 60,
		});

		this.plControls.head_office_exp_pct = this.makeFloatControl(shell.find('[data-field="head_office_exp_pct"]')[0], {
			fieldname: "head_office_exp_pct",
			label: __("Head Office Expense %age"),
			default: this.routeOptions.head_office_exp_pct || 5,
		});

		this.plControls.bank_charges_pct = this.makeFloatControl(shell.find('[data-field="bank_charges_pct"]')[0], {
			fieldname: "bank_charges_pct",
			label: __("Bank Charges %age"),
			default: this.routeOptions.bank_charges_pct || 3,
		});

		if (this.plControls.wastage_pct.$input) {
			this.plControls.wastage_pct.$input.on("change", () => this.rebuildStatementFromCurrent());
		}
		if (this.plControls.stitching_oh_pct.$input) {
			this.plControls.stitching_oh_pct.$input.on("change", () => this.rebuildStatementFromCurrent());
		}
		if (this.plControls.head_office_exp_pct.$input) {
			this.plControls.head_office_exp_pct.$input.on("change", () => this.rebuildStatementFromCurrent());
		}
		if (this.plControls.bank_charges_pct.$input) {
			this.plControls.bank_charges_pct.$input.on("change", () => this.rebuildStatementFromCurrent());
		}

		shell.find('[data-action="load-pl-order"]').on("click", () => this.loadPlByOrder());
		shell.find('[data-action="reset-pl-order"]').on("click", () => this.resetPlByOrder());
		shell.find('[data-action="print-pl-order"]').on("click", () => window.print());

		if (this.routeOptions.sales_order || this.routeOptions.delivery_note) {
			this.openPlByOrderTab();
			this.loadPlByOrder();
		} else {
			this.renderPlEmptyState();
		}
	}

	setupPlByWo() {
		const shell = this.$root.find("#otr-pl-wo-shell");
		if (!shell.length || shell.data("ready")) {
			return;
		}
		shell.data("ready", true);
		shell.addClass("otr-pl-order-shell");
		shell.html(`
			<div class="otr-pl-toolbar">
				<div data-field="sales_order"></div>
				<div data-field="delivery_note"></div>
				<div data-field="wastage_pct"></div>
				<div data-field="stitching_oh_pct"></div>
				<div data-field="head_office_exp_pct"></div>
				<div data-field="bank_charges_pct"></div>
				<button class="btn btn-primary btn-sm" data-action="load-pl-wo">${__("Load")}</button>
				<button class="btn btn-default btn-sm" data-action="reset-pl-wo">${__("Reset")}</button>
				<button class="btn btn-default btn-sm" data-action="print-pl-wo">${__("Print")}</button>
			</div>
			<div class="otr-pl-status">${__("Select a Sales Order or Delivery Note to load PL by WO.")}</div>
			<div class="otr-pl-content"></div>
		`);

		this.$plWoShell = shell;
		this.$plWoStatus = shell.find(".otr-pl-status");
		this.$plWoContent = shell.find(".otr-pl-content");

		this.plWoControls.sales_order = this.makeLinkControl(shell.find('[data-field="sales_order"]')[0], {
			fieldname: "sales_order",
			label: __("Sales Order"),
			options: "Sales Order",
			value: this.routeOptions.sales_order || "",
		});

		this.plWoControls.delivery_note = this.makeLinkControl(shell.find('[data-field="delivery_note"]')[0], {
			fieldname: "delivery_note",
			label: __("Delivery Note"),
			options: "Delivery Note",
			value: this.routeOptions.delivery_note || "",
		});

		this.plWoControls.wastage_pct = this.makeFloatControl(shell.find('[data-field="wastage_pct"]')[0], {
			fieldname: "wastage_pct",
			label: __("Wastage %"),
			default: this.routeOptions.wastage_pct || 10,
		});

		this.plWoControls.stitching_oh_pct = this.makeFloatControl(shell.find('[data-field="stitching_oh_pct"]')[0], {
			fieldname: "stitching_oh_pct",
			label: __("Stitching OH %"),
			default: this.routeOptions.stitching_oh_pct || 60,
		});

		this.plWoControls.head_office_exp_pct = this.makeFloatControl(shell.find('[data-field="head_office_exp_pct"]')[0], {
			fieldname: "head_office_exp_pct",
			label: __("Head Office Expense %age"),
			default: this.routeOptions.head_office_exp_pct || 5,
		});

		this.plWoControls.bank_charges_pct = this.makeFloatControl(shell.find('[data-field="bank_charges_pct"]')[0], {
			fieldname: "bank_charges_pct",
			label: __("Bank Charges %age"),
			default: this.routeOptions.bank_charges_pct || 3,
		});

		if (this.plWoControls.wastage_pct.$input) {
			this.plWoControls.wastage_pct.$input.on("change", () => this.rebuildStatementFromCurrentWo());
		}
		if (this.plWoControls.stitching_oh_pct.$input) {
			this.plWoControls.stitching_oh_pct.$input.on("change", () => this.rebuildStatementFromCurrentWo());
		}
		if (this.plWoControls.head_office_exp_pct.$input) {
			this.plWoControls.head_office_exp_pct.$input.on("change", () => this.rebuildStatementFromCurrentWo());
		}
		if (this.plWoControls.bank_charges_pct.$input) {
			this.plWoControls.bank_charges_pct.$input.on("change", () => this.rebuildStatementFromCurrentWo());
		}

		shell.find('[data-action="load-pl-wo"]').on("click", () => this.loadPlByWo());
		shell.find('[data-action="reset-pl-wo"]').on("click", () => this.resetPlByWo());
		shell.find('[data-action="print-pl-wo"]').on("click", () => window.print());

		if (this.routeOptions.sales_order || this.routeOptions.delivery_note) {
			this.renderPlWoEmptyState();
		} else {
			this.renderPlWoEmptyState();
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

	makeFloatControl(parent, config) {
		const control = frappe.ui.form.make_control({
			parent,
			df: {
				fieldtype: "Float",
				fieldname: config.fieldname,
				label: config.label,
				default: config.default || 0,
			},
			render_input: true,
		});
		control.set_value(config.default || 0);
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

	openPlByWoTab() {
		const tab = this.$root.find('[data-tab="pl-by-wo"]');
		if (tab.length) {
			tab.trigger("click");
		}
	}

	resetPlByOrder() {
		this.plControls.sales_order.set_value("");
		this.plControls.delivery_note.set_value("");
		this.plControls.wastage_pct.set_value(10);
		this.plControls.stitching_oh_pct.set_value(60);
		this.plControls.head_office_exp_pct.set_value(5);
		this.plControls.bank_charges_pct.set_value(3);
		this.latestPlData = null;
		this.$plStatus.text(__("Select a Sales Order or Delivery Note to load PL by BOM."));
		this.renderPlEmptyState();
	}

	getPercentValue(control) {
		if (!control) {
			return 0;
		}
		const value = Number(control.get_value ? control.get_value() : 0);
		return Number.isFinite(value) ? value : 0;
	}

	rebuildStatementFromCurrent() {
		if (!this.latestPlData) {
			return;
		}
		this.renderPlByOrder(this.latestPlData);
	}

	renderPlEmptyState() {
		this.$plContent.html(`<div class="otr-pl-empty">${__("No PL by BOM data loaded yet.")}</div>`);
	}

	renderPlWoEmptyState() {
		if (!this.$plWoContent) {
			return;
		}
		this.$plWoContent.html(`<div class="otr-pl-empty">${__("No PL by WO data loaded yet.")}</div>`);
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
		this.$plStatus.text(__("Loading BOM-level profit and loss..."));
		this.$plContent.html(`<div class="otr-pl-empty">${__("Loading PL by BOM...")}</div>`);

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
				this.$plStatus.text(__("PL by BOM could not be loaded."));
				this.$plContent.html(`<div class="otr-pl-empty">${frappe.utils.escape_html(data.error || __("Unknown error"))}</div>`);
				frappe.show_alert({ message: __("PL by BOM failed: {0}", [data.error || __("Unknown error")]), indicator: "red" }, 7);
				return;
			}
			if (data.sales_order && !salesOrder && (!data.linked_sales_orders || data.linked_sales_orders.length <= 1)) {
				this.plControls.sales_order.set_value(data.sales_order);
			}
			this.renderPlByOrder(data);
		} catch (error) {
			this.$plStatus.text(__("Failed to load PL by BOM."));
			this.$plContent.html(`<div class="otr-pl-empty">${__("PL by BOM could not be loaded.")}</div>`);
			frappe.show_alert({ message: __("Failed to load PL by BOM."), indicator: "red" }, 5);
		}
	}

	resetPlByWo() {
		this.plWoControls.sales_order.set_value("");
		this.plWoControls.delivery_note.set_value("");
		this.plWoControls.wastage_pct.set_value(10);
		this.plWoControls.stitching_oh_pct.set_value(60);
		this.plWoControls.head_office_exp_pct.set_value(5);
		this.plWoControls.bank_charges_pct.set_value(3);
		this.latestPlWoData = null;
		this.$plWoStatus.text(__("Select a Sales Order or Delivery Note to load PL by WO."));
		this.renderPlWoEmptyState();
	}

	rebuildStatementFromCurrentWo() {
		if (!this.latestPlWoData) {
			return;
		}
		this.renderPlByWo(this.latestPlWoData);
	}

	async loadPlByWo() {
		const salesOrder = this.getControlValue(this.plWoControls.sales_order);
		const deliveryNote = this.getControlValue(this.plWoControls.delivery_note);
		if (!salesOrder && !deliveryNote) {
			frappe.show_alert({ message: __("Enter Sales Order or Delivery Note."), indicator: "orange" }, 4);
			return;
		}

		if (salesOrder && this.plWoControls.sales_order.get_value() !== salesOrder) {
			this.plWoControls.sales_order.set_value(salesOrder);
		}
		if (deliveryNote && this.plWoControls.delivery_note.get_value() !== deliveryNote) {
			this.plWoControls.delivery_note.set_value(deliveryNote);
		}

		this.openPlByWoTab();
		this.$plWoStatus.text(__("Loading work-order consumption profit and loss..."));
		this.$plWoContent.html(`<div class="otr-pl-empty">${__("Loading PL by WO...")}</div>`);

		try {
			const response = await frappe.call({
				method: "order_tracking_report.api.get_sales_order_pl_by_wo",
				args: {
					sales_order: salesOrder,
					delivery_note: deliveryNote,
				},
			});
			const data = response.message || {};
			if (data.error) {
				this.$plWoStatus.text(__("PL by WO could not be loaded."));
				this.$plWoContent.html(`<div class="otr-pl-empty">${frappe.utils.escape_html(data.error || __("Unknown error"))}</div>`);
				frappe.show_alert({ message: __("PL by WO failed: {0}", [data.error || __("Unknown error")]), indicator: "red" }, 7);
				return;
			}
			if (data.sales_order && !salesOrder && (!data.linked_sales_orders || data.linked_sales_orders.length <= 1)) {
				this.plWoControls.sales_order.set_value(data.sales_order);
			}
			this.renderPlByWo(data);
		} catch (error) {
			this.$plWoStatus.text(__("Failed to load PL by WO."));
			this.$plWoContent.html(`<div class="otr-pl-empty">${__("PL by WO could not be loaded.")}</div>`);
			frappe.show_alert({ message: __("Failed to load PL by WO."), indicator: "red" }, 5);
		}
	}

	renderPlByOrder(data) {
		this.latestPlData = data;
		const summary = data.selected_profit_summary || data.profit_summary || {};
		const baseSummary = data.profit_summary || {};
		const labourSummary = data.labour_cost_summary || {};
		const deliveryNotes = data.delivery_note_options || [];
		const invoiceDetails = data.invoice_details || [];
		const itemGroupSummary = data.item_group_summary || [];
		const linkedSalesOrders = data.linked_sales_orders || [];
		const selectedDn = data.selected_delivery_note || "";
		const wastagePct = this.getPercentValue(this.plControls.wastage_pct);
		const stitchingOhPct = this.getPercentValue(this.plControls.stitching_oh_pct);
		const headOfficeExpPct = this.getPercentValue(this.plControls.head_office_exp_pct);
		const bankChargesPct = this.getPercentValue(this.plControls.bank_charges_pct);
		const statementModel = this.buildOrderStatementModel(data, { wastagePct, stitchingOhPct, headOfficeExpPct, bankChargesPct });
		const modeLabel = selectedDn
			? __("Showing Delivery Note level allocation using Sales Order default BOM costs.")
			: __("Showing Sales Order level estimated profit and loss by BOM.");

		const salesOrderText = linkedSalesOrders.length > 1 ? linkedSalesOrders.join(", ") : (data.sales_order || "-");
		this.$plStatus.text(`${__("Sales Order")}: ${salesOrderText}${selectedDn ? ` • ${__("Delivery Note")}: ${selectedDn}` : ""}`);

		const html = `
			<div class="otr-pl-note">${frappe.utils.escape_html(modeLabel)} • ${__("Wastage %")}: ${this.formatPercent(wastagePct)} • ${__("Stitching OH %")}: ${this.formatPercent(stitchingOhPct)} • ${__("Head Office Expense %age")}: ${this.formatPercent(headOfficeExpPct)} • ${__("Bank Charges %age")}: ${this.formatPercent(bankChargesPct)}</div>
			<div class="otr-pl-card-grid">
				${this.renderMetricCard(__("Sales Amount"), this.formatCurrency(summary.sales_amount || 0), selectedDn ? __("Selected delivery note") : __("Sales order total"))}
				${this.renderMetricCard(__("Estimated Material Cost"), this.formatCurrency(summary.estimated_cost || 0), __("From default BOM"))}
					${this.renderMetricCard(__("Estimated Profit"), this.formatCurrency(summary.estimated_profit || 0), `${this.formatPercent(summary.margin_pct || 0)} ${__("margin")}`)}
					${this.renderMetricCard(__("Labour Cost"), this.formatCurrency(labourSummary.total_cost || 0), `${this.formatNumber(labourSummary.total_qty || 0)} ${__("qty")}`)}
					${this.renderMetricCard(__("Expense Claims"), this.formatCurrency(statementModel.expenseClaimsAmount || 0), __("Linked Expense Claim rows"))}
					${this.renderMetricCard(__("Profit After Expenses"), this.formatCurrency((summary.estimated_profit || 0) - (statementModel.expenseClaimsAmount || 0)), "")}
					${this.renderMetricCard(__("Wastage Amount"), this.formatCurrency(statementModel.wastageAmount || 0), `${this.formatPercent(wastagePct)} ${__("of raw material")}`)}
					${this.renderMetricCard(__("Stitching OH Amount"), this.formatCurrency(statementModel.stitchingOhAmount || 0), `${this.formatPercent(stitchingOhPct)} ${__("of CMT labour")}`)}
					${this.renderMetricCard(__("Head Office Expense"), this.formatCurrency(statementModel.headOfficeExpAmount || 0), `${this.formatPercent(headOfficeExpPct)} ${__("of sales")}`)}
					${this.renderMetricCard(__("Bank Charges"), this.formatCurrency(statementModel.bankChargesAmount || 0), `${this.formatPercent(bankChargesPct)} ${__("of sales")}`)}
				${this.renderMetricCard(__("Delivery Notes"), this.formatNumber(deliveryNotes.length), selectedDn ? __("Current selection applied") : __("Linked with this order"))}
					${this.renderMetricCard(__("Base Order Profit"), this.formatCurrency(baseSummary.estimated_profit || 0), `${this.formatPercent(baseSummary.margin_pct || 0)} ${__("margin")}`)}
			</div>
			<div class="otr-pl-grid">
				<div class="otr-pl-section otr-pl-statement-section">
					<div class="otr-pl-statement-title">
						<h3>${__("PL Statement")}</h3>
						<div class="otr-pl-statement-badge">${__("BOM View")}</div>
					</div>
					${this.renderGroupedStatementTable(statementModel, {
						wastagePct,
						stitchingOhPct,
						headOfficeExpPct,
						bankChargesPct,
					})}
				</div>
				<div class="otr-pl-row-2">
					<div class="otr-pl-section">
						<h3>${__("Final Summary")}</h3>
						${this.renderFinalSummaryTable(statementModel)}
					</div>
					<div class="otr-pl-section">
						<h3>${__("Profit and Loss Summary")}</h3>
						${this.renderProfitLossSummaryFromModel(statementModel, {
							wastagePct,
							stitchingOhPct,
							headOfficeExpPct,
							bankChargesPct,
						})}
					</div>
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
				<div class="otr-pl-row-2">
					<div class="otr-pl-section">
						<h3>${selectedDn ? __("Delivery Note Items") : __("Linked Delivery Notes")}</h3>
						${selectedDn ? this.renderDeliveryNoteItemTable(data.delivery_note_items || []) : this.renderDeliveryNoteOptionsTable(deliveryNotes)}
					</div>
					<div class="otr-pl-section">
						<h3>${selectedDn ? __("Linked Sales Invoices") : __("Procurement by Item Group")}</h3>
						${selectedDn ? this.renderInvoiceDetails(invoiceDetails) : this.renderPoItemGroupTable(data.po_item_group_summary || [])}
					</div>
				</div>
				<div class="otr-pl-section">
					<h3>${__("Labour Cost Detail")}</h3>
					${this.renderLabourTable(data.labour_cost_rows || [], labourSummary)}
				</div>
			</div>
		`;

		this.$plContent.html(html);
		this.bindPlStatementInteractions(this.$plContent);
	}

	renderPlByWo(data) {
		this.latestPlWoData = data;
		const summary = data.selected_profit_summary || data.profit_summary || {};
		const baseSummary = data.profit_summary || {};
		const labourSummary = data.labour_cost_summary || {};
		const deliveryNotes = data.delivery_note_options || [];
		const invoiceDetails = data.invoice_details || [];
		const itemGroupSummary = data.item_group_summary || [];
		const linkedSalesOrders = data.linked_sales_orders || [];
		const selectedDn = data.selected_delivery_note || "";
		const wastagePct = this.getPercentValue(this.plWoControls.wastage_pct);
		const stitchingOhPct = this.getPercentValue(this.plWoControls.stitching_oh_pct);
		const headOfficeExpPct = this.getPercentValue(this.plWoControls.head_office_exp_pct);
		const bankChargesPct = this.getPercentValue(this.plWoControls.bank_charges_pct);
		const statementModel = this.buildOrderStatementModel(data, { wastagePct, stitchingOhPct, headOfficeExpPct, bankChargesPct });
		const modeLabel = selectedDn
			? __("Showing Delivery Note level allocation using Work Order consumption costs.")
			: __("Showing Sales Order level estimated profit and loss by Work Order consumption.");

		const salesOrderText = linkedSalesOrders.length > 1 ? linkedSalesOrders.join(", ") : (data.sales_order || "-");
		this.$plWoStatus.text(`${__("Sales Order")}: ${salesOrderText}${selectedDn ? ` • ${__("Delivery Note")}: ${selectedDn}` : ""}`);

		const html = `
			<div class="otr-pl-note">${frappe.utils.escape_html(modeLabel)} • ${__("Wastage %")}: ${this.formatPercent(wastagePct)} • ${__("Stitching OH %")}: ${this.formatPercent(stitchingOhPct)} • ${__("Head Office Expense %age")}: ${this.formatPercent(headOfficeExpPct)} • ${__("Bank Charges %age")}: ${this.formatPercent(bankChargesPct)}</div>
			<div class="otr-pl-card-grid">
				${this.renderMetricCard(__("Sales Amount"), this.formatCurrency(summary.sales_amount || 0), selectedDn ? __("Selected delivery note") : __("Sales order total"))}
				${this.renderMetricCard(__("Material Cost"), this.formatCurrency(summary.estimated_cost || 0), __("From Work Order consumption"))}
				${this.renderMetricCard(__("Estimated Profit"), this.formatCurrency(summary.estimated_profit || 0), `${this.formatPercent(summary.margin_pct || 0)} ${__("margin")}`)}
				${this.renderMetricCard(__("Labour Cost"), this.formatCurrency(labourSummary.total_cost || 0), `${this.formatNumber(labourSummary.total_qty || 0)} ${__("qty")}`)}
				${this.renderMetricCard(__("Expense Claims"), this.formatCurrency(statementModel.expenseClaimsAmount || 0), __("Linked Expense Claim rows"))}
				${this.renderMetricCard(__("Profit After Expenses"), this.formatCurrency((summary.estimated_profit || 0) - (statementModel.expenseClaimsAmount || 0)), "")}
				${this.renderMetricCard(__("Wastage Amount"), this.formatCurrency(statementModel.wastageAmount || 0), `${this.formatPercent(wastagePct)} ${__("of raw material")}`)}
				${this.renderMetricCard(__("Stitching OH Amount"), this.formatCurrency(statementModel.stitchingOhAmount || 0), `${this.formatPercent(stitchingOhPct)} ${__("of CMT labour")}`)}
				${this.renderMetricCard(__("Head Office Expense"), this.formatCurrency(statementModel.headOfficeExpAmount || 0), `${this.formatPercent(headOfficeExpPct)} ${__("of sales")}`)}
				${this.renderMetricCard(__("Bank Charges"), this.formatCurrency(statementModel.bankChargesAmount || 0), `${this.formatPercent(bankChargesPct)} ${__("of sales")}`)}
				${this.renderMetricCard(__("Delivery Notes"), this.formatNumber(deliveryNotes.length), selectedDn ? __("Current selection applied") : __("Linked with this order"))}
				${this.renderMetricCard(__("Base Order Profit"), this.formatCurrency(baseSummary.estimated_profit || 0), `${this.formatPercent(baseSummary.margin_pct || 0)} ${__("margin")}`)}
			</div>
			<div class="otr-pl-grid">
				<div class="otr-pl-section otr-pl-statement-section">
					<div class="otr-pl-statement-title">
						<h3>${__("PL Statement")}</h3>
						<div class="otr-pl-statement-badge">${__("WO View")}</div>
					</div>
					${this.renderGroupedStatementTable(statementModel, {
						wastagePct,
						stitchingOhPct,
						headOfficeExpPct,
						bankChargesPct,
					})}
				</div>
				<div class="otr-pl-row-2">
					<div class="otr-pl-section">
						<h3>${__("Final Summary")}</h3>
						${this.renderFinalSummaryTable(statementModel)}
					</div>
					<div class="otr-pl-section">
						<h3>${__("Profit and Loss Summary")}</h3>
						${this.renderProfitLossSummaryFromModel(statementModel, {
							wastagePct,
							stitchingOhPct,
							headOfficeExpPct,
							bankChargesPct,
						})}
					</div>
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
				<div class="otr-pl-row-2">
					<div class="otr-pl-section">
						<h3>${selectedDn ? __("Delivery Note Items") : __("Linked Delivery Notes")}</h3>
						${selectedDn ? this.renderDeliveryNoteItemTable(data.delivery_note_items || []) : this.renderDeliveryNoteOptionsTable(deliveryNotes)}
					</div>
					<div class="otr-pl-section">
						<h3>${selectedDn ? __("Linked Sales Invoices") : __("Procurement by Item Group")}</h3>
						${selectedDn ? this.renderInvoiceDetails(invoiceDetails) : this.renderPoItemGroupTable(data.po_item_group_summary || [])}
					</div>
				</div>
				<div class="otr-pl-section">
					<h3>${__("Labour Cost Detail")}</h3>
					${this.renderLabourTable(data.labour_cost_rows || [], labourSummary)}
				</div>
			</div>
		`;

		this.$plWoContent.html(html);
		this.bindPlStatementInteractions(this.$plWoContent);
	}

	bindPlStatementInteractions($container) {
		if (!$container || !$container.length) {
			return;
		}
		$container.find(".otr-pl-toggle").off("click").on("click", (event) => {
			event.preventDefault();
			const $button = $(event.currentTarget);
			const groupKey = $button.attr("data-group-key");
			if (!groupKey) {
				return;
			}
			const isExpanded = $button.attr("aria-expanded") === "true";
			const nextExpanded = !isExpanded;
			$button.attr("aria-expanded", nextExpanded ? "true" : "false");
			$button.find(".otr-pl-toggle-icon").text(nextExpanded ? "-" : "+");
			$container.find(`[data-parent-group="${groupKey}"]`).toggleClass("otr-pl-row-hidden", !nextExpanded);
		});
	}

	buildOrderStatementModel(data, options = {}) {
		const wastagePct = Number(options.wastagePct || 0);
		const stitchingOhPct = Number(options.stitchingOhPct || 0);
		const headOfficeExpPct = Number(options.headOfficeExpPct || 0);
		const bankChargesPct = Number(options.bankChargesPct || 0);
		const selectedProfitRows = data.selected_profit_by_item || [];
		const bomRows = data.bom_rows || [];
		const labourSummary = data.labour_cost_summary || {};
		const salesOrderExpenses = data.sales_order_expenses || [];

		const salesRows = selectedProfitRows.map((row) => {
			const qty = Number(row.qty || 0);
			const amount = Number(row.sales_amount || 0);
			return {
				label: row.item_code || "-",
				qty,
				rate: qty ? amount / qty : 0,
				amount,
			};
		});
		const totalSales = salesRows.reduce((sum, row) => sum + row.amount, 0);

		const materialBasis = {};
		for (const row of bomRows) {
			const key = (row.material_item_code || "-").trim() || "-";
			const groupLabel = (row.material_item_group || "Unclassified").trim() || "Unclassified";
			const qty = Number(row.required_qty || 0);
			const rate = Number(row.last_purchase_rate || 0);
			if (!materialBasis[key]) {
				materialBasis[key] = { label: key, group: groupLabel, qty: 0, rate: rate || 0 };
			}
			materialBasis[key].qty += qty;
		}
		const materialRows = Object.values(materialBasis).map((row) => {
			const amount = row.qty * (row.rate || 0);
			return {
				label: row.label,
				group: row.group,
				qty: row.qty,
				rate: row.rate || 0,
				amount,
			};
		});
		const totalMaterialCost = materialRows.reduce((sum, row) => sum + row.amount, 0);

		const materialGroups = [];
		const materialGroupMap = {};
		for (const row of materialRows) {
			const group = row.group || "Unclassified";
			if (!materialGroupMap[group]) {
				materialGroupMap[group] = [];
			}
			materialGroupMap[group].push(row);
		}
		Object.keys(materialGroupMap).sort().forEach((group) => {
			const rows = materialGroupMap[group];
			const qty = rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
			const amount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
			materialGroups.push({
				key: frappe.scrub(group || "unclassified"),
				label: `${group}`,
				qty,
				amount,
				items: rows.sort((a, b) => String(a.label || "").localeCompare(String(b.label || ""))),
			});
		});

		const wastageAmount = totalMaterialCost * (wastagePct / 100);
		const cmtLabourAmount = Number(labourSummary.total_cost || 0);
		const expenseClaimsAmount = (salesOrderExpenses || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
		const stitchingOhAmount = cmtLabourAmount * (stitchingOhPct / 100);
		const headOfficeExpAmount = totalSales * (headOfficeExpPct / 100);
		const bankChargesAmount = totalSales * (bankChargesPct / 100);
		const totalExpense = totalMaterialCost + wastageAmount + cmtLabourAmount + expenseClaimsAmount + stitchingOhAmount + headOfficeExpAmount + bankChargesAmount;
		const netProfit = totalSales - totalExpense;

		return {
			salesRows,
			materialGroups,
			totalSales,
			totalMaterialCost,
			wastageAmount,
			cmtLabourAmount,
			expenseClaimsAmount,
			stitchingOhAmount,
			headOfficeExpAmount,
			bankChargesAmount,
			totalExpense,
			netProfit,
		};
	}

	renderGroupedStatementTable(model, percentages = {}) {
		const overheadRows = [
			{ label: __("Wastage"), percentage: percentages.wastagePct || 0, amount: model.wastageAmount },
			{ label: __("Stitching OH %age"), percentage: percentages.stitchingOhPct || 0, amount: model.stitchingOhAmount },
			{ label: __("Head Office Expense %age"), percentage: percentages.headOfficeExpPct || 0, amount: model.headOfficeExpAmount },
			{ label: __("Bank Charges %age"), percentage: percentages.bankChargesPct || 0, amount: model.bankChargesAmount },
		];
		const totalOverhead = overheadRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

		const rows = [];
		const dashCell = `<span class="otr-pl-cell-dash">-</span>`;
		const sectionRow = (label) => `
			<tr class="otr-pl-row-section">
				<td><strong>${frappe.utils.escape_html(label)}</strong></td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right">${dashCell}</td>
			</tr>
		`;

		rows.push(sectionRow(__("Sales Items")));
		for (const row of model.salesRows || []) {
			rows.push(`
				<tr class="otr-pl-row-detail">
					<td>${frappe.utils.escape_html(row.label || "-")}</td>
					<td class="text-right">${row.qty ? this.formatNumber(row.qty) : "-"}</td>
					<td class="text-right">${row.rate ? this.formatRate(row.rate) : "-"}</td>
					<td class="text-right">${this.formatCurrency(row.amount || 0)}</td>
					<td class="text-right">${dashCell}</td>
				</tr>
			`);
		}
		rows.push(`
			<tr class="otr-pl-row-total">
				<td>${__("Total Sales")}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right otr-pl-cell-amount-strong">${this.formatCurrency(model.totalSales)}</td>
				<td class="text-right">${this.formatCurrency(model.totalSales)}</td>
			</tr>
		`);

		rows.push(sectionRow(__("Raw Materials")));
		for (const group of model.materialGroups || []) {
			rows.push(`
				<tr class="otr-pl-row-group-light">
					<td><button type="button" class="otr-pl-toggle" data-group-key="${frappe.utils.escape_html(group.key)}" aria-expanded="false"><span class="otr-pl-toggle-icon">+</span></button><strong>${frappe.utils.escape_html(group.label || "-")}</strong></td>
					<td class="text-right">${group.qty ? this.formatNumber(group.qty) : "-"}</td>
					<td class="text-right">${dashCell}</td>
					<td class="text-right otr-pl-cell-amount-strong">${this.formatCurrency(group.amount || 0)}</td>
					<td class="text-right">${dashCell}</td>
				</tr>
			`);
			for (const item of group.items || []) {
				rows.push(`
					<tr class="otr-pl-row-detail otr-pl-row-hidden" data-parent-group="${frappe.utils.escape_html(group.key)}">
						<td>${frappe.utils.escape_html(item.label || "-")}</td>
						<td class="text-right">${item.qty ? this.formatNumber(item.qty) : "-"}</td>
						<td class="text-right">${item.rate ? this.formatRate(item.rate) : "-"}</td>
						<td class="text-right">${this.formatCurrency(item.amount || 0)}</td>
						<td class="text-right">${dashCell}</td>
					</tr>
				`);
			}
		}
		rows.push(`
			<tr class="otr-pl-row-total">
				<td>${__("Total Raw Material")}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right otr-pl-cell-amount-strong">${this.formatCurrency(model.totalMaterialCost)}</td>
				<td class="text-right">${this.formatCurrency(model.totalMaterialCost)}</td>
			</tr>
		`);

		rows.push(sectionRow(__("Expenses")));
		rows.push(`
			<tr class="otr-pl-row-indent">
				<td>${__("CMT Labour Cost")}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right">${this.formatCurrency(model.cmtLabourAmount)}</td>
				<td class="text-right">${dashCell}</td>
			</tr>
		`);
		rows.push(`
			<tr class="otr-pl-row-indent">
				<td>${__("Expense Claims")}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right">${this.formatCurrency(model.expenseClaimsAmount)}</td>
				<td class="text-right">${dashCell}</td>
			</tr>
		`);

		rows.push(sectionRow(__("Estimated Overhead")));
		for (const row of overheadRows) {
			rows.push(`
				<tr class="otr-pl-row-indent">
					<td>${frappe.utils.escape_html(`${row.label || "-"}${row.percentage ? ` (${this.formatPercent(row.percentage)})` : ""}`)}</td>
					<td class="text-right">${dashCell}</td>
					<td class="text-right">${dashCell}</td>
					<td class="text-right">${this.formatCurrency(row.amount || 0)}</td>
					<td class="text-right">${dashCell}</td>
				</tr>
			`);
		}
		rows.push(`
			<tr class="otr-pl-row-total">
				<td>${__("Total Estimated Overhead")}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right otr-pl-cell-amount-strong">${this.formatCurrency(totalOverhead)}</td>
				<td class="text-right">${this.formatCurrency(totalOverhead)}</td>
			</tr>
		`);

		rows.push(sectionRow(__("Final Summary")));
		rows.push(`
			<tr class="otr-pl-row-indent">
				<td>${__("Sales Less Total Expense")}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right">${this.formatCurrency(model.totalExpense)}</td>
				<td class="text-right">${this.formatCurrency(model.totalSales - model.totalExpense)}</td>
			</tr>
		`);
		rows.push(`
			<tr class="otr-pl-row-indent">
				<td>${__("Grand Total Expense")}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right">${this.formatCurrency(model.totalExpense)}</td>
				<td class="text-right">${dashCell}</td>
			</tr>
		`);
		rows.push(`
			<tr class="otr-pl-row-total">
				<td>${__("Net Profit")}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right">${dashCell}</td>
				<td class="text-right otr-pl-cell-amount-strong">${this.formatCurrency(model.netProfit)}</td>
				<td class="text-right">${this.formatCurrency(model.netProfit)}</td>
			</tr>
		`);

		return this.wrapTable(`
			<thead>
				<tr>
					<th>${__("Particular")}</th>
					<th class="text-right">${__("Qty")}</th>
					<th class="text-right">${__("Price/Rate")}</th>
					<th class="text-right">${__("Amount")}</th>
					<th class="text-right">${__("Total")}</th>
				</tr>
			</thead>
			<tbody>${rows.join("")}</tbody>
		`);
	}

	renderStatementLineTable(rows, options = {}) {
		const title = options.title || "";
		const totalLabel = options.totalLabel || __("Total");
		const totalAmount = Number(options.totalAmount || 0);
		const body = (rows || []).map((row) => `
			<tr class="${row.isGroup ? "otr-pl-row-group-light" : ""}">
				<td>${row.isGroup ? `<strong>${frappe.utils.escape_html(row.label || "-")}</strong>` : frappe.utils.escape_html(row.label || "-")}</td>
				<td class="text-right">${row.qty ? this.formatNumber(row.qty) : "-"}</td>
				<td class="text-right">${row.rate ? this.formatRate(row.rate) : "-"}</td>
				<td class="text-right">${this.formatCurrency(row.amount || 0)}</td>
				<td class="text-right">-</td>
			</tr>
		`).join("");

		const table = this.wrapTable(`
			<thead><tr><th>${__("Particular")}</th><th class="text-right">${__("Qty")}</th><th class="text-right">${__("Price/Rate")}</th><th class="text-right">${__("Amount")}</th><th class="text-right">${__("Total")}</th></tr></thead>
			<tbody>
				${body}
				<tr class="otr-pl-row-total"><td>${frappe.utils.escape_html(totalLabel)}</td><td class="text-right">-</td><td class="text-right">-</td><td class="text-right">${this.formatCurrency(totalAmount)}</td><td class="text-right">${this.formatCurrency(totalAmount)}</td></tr>
			</tbody>
		`);
		return `<details class="otr-pl-group" open><summary><span>${frappe.utils.escape_html(title)}</span><span class="otr-pl-group-total">${this.formatCurrency(totalAmount)}</span></summary>${table}</details>`;
	}

	renderOverheadTable(rows, options = {}) {
		const title = options.title || "";
		const totalLabel = options.totalLabel || __("Total");
		const totalAmount = Number(options.totalAmount || 0);
		const body = (rows || []).map((row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.label || "-")}</td>
				<td class="text-right">${row.percentage ? this.formatPercent(row.percentage) : "-"}</td>
				<td class="text-right">${this.formatCurrency(row.amount || 0)}</td>
				<td class="text-right">-</td>
			</tr>
		`).join("");

		const table = this.wrapTable(`
			<thead><tr><th>${__("Particular")}</th><th class="text-right">${__("Percentage")}</th><th class="text-right">${__("Amount")}</th><th class="text-right">${__("Total")}</th></tr></thead>
			<tbody>
				${body}
				<tr class="otr-pl-row-total"><td>${frappe.utils.escape_html(totalLabel)}</td><td class="text-right">-</td><td class="text-right">${this.formatCurrency(totalAmount)}</td><td class="text-right">${this.formatCurrency(totalAmount)}</td></tr>
			</tbody>
		`);
		return `<details class="otr-pl-group" open><summary><span>${frappe.utils.escape_html(title)}</span><span class="otr-pl-group-total">${this.formatCurrency(totalAmount)}</span></summary>${table}</details>`;
	}

	renderFinalSummaryTable(model) {
		return this.wrapTable(`
			<thead><tr><th>${__("Particular")}</th><th class="text-right">${__("Amount")}</th><th class="text-right">${__("Total")}</th></tr></thead>
			<tbody>
				<tr><td>${__("Total Sales")}</td><td class="text-right">${this.formatCurrency(model.totalSales)}</td><td class="text-right">${this.formatCurrency(model.totalSales)}</td></tr>
				<tr><td>${__("Less: Expense Claims")}</td><td class="text-right">${this.formatCurrency(model.expenseClaimsAmount)}</td><td class="text-right">${this.formatCurrency(model.totalSales - model.expenseClaimsAmount)}</td></tr>
				<tr><td>${__("Less: Total Expense")}</td><td class="text-right">${this.formatCurrency(model.totalExpense)}</td><td class="text-right">${this.formatCurrency(model.totalSales - model.totalExpense)}</td></tr>
				<tr class="otr-pl-row-total"><td>${__("Net Profit")}</td><td class="text-right">${this.formatCurrency(model.netProfit)}</td><td class="text-right">${this.formatCurrency(model.netProfit)}</td></tr>
			</tbody>
		`);
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

	renderProfitLossSummaryFromModel(model, percentages = {}) {
		const totalOverhead = Number(model.wastageAmount || 0)
			+ Number(model.stitchingOhAmount || 0)
			+ Number(model.headOfficeExpAmount || 0)
			+ Number(model.bankChargesAmount || 0);

		const rows = [
			{ type: "section", label: __("Sales Items") },
			{ label: __("Total Sales"), amount: model.totalSales },
			{ type: "section", label: __("Raw Materials") },
			{ label: __("Total Raw Material"), amount: model.totalMaterialCost },
			{ type: "section", label: __("Expenses") },
			{ label: __("CMT Labour Cost"), amount: model.cmtLabourAmount },
			{ label: __("Expense Claims"), amount: model.expenseClaimsAmount },
			{ type: "section", label: __("Estimated Overhead") },
			{ label: __("Wastage ({0})", [this.formatPercent(percentages.wastagePct || 0)]), amount: model.wastageAmount },
			{ label: __("Stitching OH %age ({0})", [this.formatPercent(percentages.stitchingOhPct || 0)]), amount: model.stitchingOhAmount },
			{ label: __("Head Office Expense %age ({0})", [this.formatPercent(percentages.headOfficeExpPct || 0)]), amount: model.headOfficeExpAmount },
			{ label: __("Bank Charges %age ({0})", [this.formatPercent(percentages.bankChargesPct || 0)]), amount: model.bankChargesAmount },
			{ label: __("Total Estimated Overhead"), amount: totalOverhead, total: 1 },
			{ type: "section", label: __("Final Summary") },
			{ label: __("Grand Total Expense"), amount: model.totalExpense, total: 1 },
			{ label: __("Net Profit"), amount: model.netProfit, total: 1 },
		];

		const body = rows.map((row) => {
			if (row.type === "section") {
				return `<tr class="otr-pl-row-section"><td><strong>${frappe.utils.escape_html(row.label || "-")}</strong></td><td class="text-right"><span class="otr-pl-cell-dash">-</span></td></tr>`;
			}
			return `<tr class="${row.total ? "otr-pl-row-total" : "otr-pl-row-indent"}"><td>${frappe.utils.escape_html(row.label || "-")}</td><td class="text-right ${row.total ? "otr-pl-cell-amount-strong" : ""}">${this.formatCurrency(row.amount || 0)}</td></tr>`;
		}).join("");

		return this.wrapTable(`
			<thead><tr><th>${__("Statement Head")}</th><th class="text-right">${__("Amount")}</th></tr></thead>
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
				<td>${row.entry_no ? this.renderDocLink("Expense Claim", row.entry_no) : "-"}</td>
				<td>${frappe.utils.escape_html(row.label || "-")}</td>
				<td>${frappe.utils.escape_html(row.source || "-")}</td>
				<td class="text-right">${this.formatCurrency(row.amount || 0)}</td>
			</tr>
		`).join("");
		return this.wrapTable(`
			<thead><tr><th>${__("Entry No")}</th><th>${__("Expense")}</th><th>${__("Source")}</th><th class="text-right">${__("Amount")}</th></tr></thead>
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
		if (!rows.length) {
			return `<div class="otr-pl-empty">${__("No labour rows found.")}</div>`;
		}
		const body = rows.map((row) => `
			<tr>
				<td>${frappe.utils.escape_html(row.employee || row.name1 || "-")}</td>
				<td>${frappe.utils.escape_html(row.product || "-")}</td>
				<td>${frappe.utils.escape_html(row.process_type || "-")}</td>
				<td class="text-right">${this.formatNumber(row.qty || 0)}</td>
				<td class="text-right">${this.formatCurrency(row.rate || 0)}</td>
				<td class="text-right">${this.formatCurrency(row.labour_cost || 0)}</td>
			</tr>
		`).join("");
		return this.wrapTable(`
			<thead><tr><th>${__("Employee")}</th><th>${__("Item")}</th><th>${__("Process")}</th><th class="text-right">${__("Qty")}</th><th class="text-right">${__("Rate")}</th><th class="text-right">${__("Labour Cost")}</th></tr></thead>
			<tbody>
				${body}
				<tr class="otr-pl-row-total"><td>${__("Total")}</td><td><span class="otr-pl-cell-dash">-</span></td><td><span class="otr-pl-cell-dash">-</span></td><td class="text-right">${this.formatNumber(summary.total_qty || 0)}</td><td class="text-right"><span class="otr-pl-cell-dash">-</span></td><td class="text-right">${this.formatCurrency(summary.total_cost || 0)}</td></tr>
			</tbody>
		`);
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

	formatRate(value) {
		const number = Number(value || 0);
		if (!Number.isFinite(number)) {
			return "Rs 0.0";
		}
		return `Rs ${number.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
	}

	formatPercent(value) {
		return `${this.formatNumber(value || 0)}%`;
	}
};
