frappe.pages["manage-sales-orders"].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Manage Sales Orders"),
		single_column: true,
	});

	window.order_tracking_report = window.order_tracking_report || {};
	wrapper.manage_sales_orders_page = new window.order_tracking_report.ManageSalesOrdersPage(wrapper);
	frappe.breadcrumbs.add("Order Tracking Report");
};

window.order_tracking_report = window.order_tracking_report || {};

window.order_tracking_report.manageSalesOrdersBridgePromise = window.order_tracking_report.manageSalesOrdersBridgePromise || null;

window.order_tracking_report.ManageSalesOrdersPage = class ManageSalesOrdersPage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = wrapper.page;
		this.routeOptions = frappe.route_options || {};
		frappe.route_options = null;
		setTimeout(() => this.load(), 0);
	}

	async load() {
		this.$root = $(this.wrapper).find(".layout-main-section");
		this.$root.html(`
			<div class="otr-helper-page">
				<div style="padding:18px;border:1px solid #dbeafe;border-radius:16px;background:linear-gradient(135deg,#eff6ff 0%,#f8fbff 100%);margin-bottom:16px;">
					<div style="font-size:20px;font-weight:900;color:#0f172a;">${__("Manage Sales Orders")}</div>
					<div style="margin-top:6px;font-size:13px;color:#1d4ed8;font-weight:700;">${__("Uses the same Manage Existing Docs popup and next-step actions from Live Work Order, for all sales orders.")}</div>
					<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
						<button class="btn btn-primary btn-sm" data-open-manager>${__("Open Manage Sales Orders")}</button>
					</div>
					<div class="text-muted small" data-manage-status style="margin-top:10px;">${__("Loading manager tools...")}</div>
				</div>
			</div>
		`);

		this.$status = this.$root.find("[data-manage-status]");
		this.$root.find("[data-open-manager]").on("click", () => this.openManager());

		try {
			await this.ensureManagerBridge();
			this.setStatus(__("Manage Sales Orders is ready."), "green");
			setTimeout(() => this.openManager(), 200);
		} catch (error) {
			this.setStatus(__("Failed to load Manage Sales Orders."), "red");
			frappe.show_alert({ message: __("Failed to load Manage Sales Orders page."), indicator: "red" }, 6);
			this.openStatusReportFallback();
		}
	}

	setStatus(message, indicator) {
		if (!this.$status || !this.$status.length) {
			return;
		}
		const colors = {
			green: "#166534",
			orange: "#9a3412",
			red: "#b91c1c",
		};
		this.$status.text(message).css("color", colors[indicator] || "#475569");
	}

	async ensureManagerBridge() {
		const handler = this.getManagerHandler();
		if (handler) {
			return handler;
		}

		if (!window.order_tracking_report.manageSalesOrdersBridgePromise) {
			window.order_tracking_report.manageSalesOrdersBridgePromise = this.loadManagerBridge();
		}

		return window.order_tracking_report.manageSalesOrdersBridgePromise;
	}

	async loadManagerBridge() {
		const response = await frappe.call({
			method: "order_tracking_report.api.get_custom_html_block_page_payload",
			args: { block_name: "Live Work Order" },
		});
		const payload = response.message || {};
		const host = this.ensureHiddenBridgeHost();
		host.innerHTML = payload.html || "";

		const script = document.createElement("script");
		script.type = "text/javascript";
		script.text = [
			"var root_element = document.getElementById('live_production_root') || document;",
			payload.script || "",
		].join("\n");
		host.appendChild(script);

		return new Promise((resolve, reject) => {
			let attempts = 0;
			const checkReady = () => {
				const readyHandler = this.getManagerHandler();
				if (readyHandler) {
					resolve(readyHandler);
					return;
				}
				attempts += 1;
				if (attempts >= 40) {
					window.order_tracking_report.manageSalesOrdersBridgePromise = null;
					reject(new Error("Manage Sales Orders bridge did not initialize"));
					return;
				}
				setTimeout(checkReady, 150);
			};
			checkReady();
		});
	}

	ensureHiddenBridgeHost() {
		let host = document.getElementById("otr-manage-sales-orders-bridge-host");
		if (host) {
			return host;
		}

		host = document.createElement("div");
		host.id = "otr-manage-sales-orders-bridge-host";
		host.style.position = "absolute";
		host.style.left = "-99999px";
		host.style.top = "-99999px";
		host.style.width = "1px";
		host.style.height = "1px";
		host.style.overflow = "hidden";
		document.body.appendChild(host);
		return host;
	}

	buildSeed() {
		const options = this.routeOptions || {};
		return {
			company: options.company || "",
			customer: options.customer || "",
			sales_order: options.sales_order || "",
			item_code: options.item_code || options.item || "",
			production_plan: options.production_plan || "",
			work_order: options.work_order || "",
			job_card: options.job_card || "",
			qty: options.qty || 1,
		};
	}

	getManagerHandler() {
		return window.openExistingManufacturingManager
			|| (typeof openExistingManufacturingManager === "function" ? openExistingManufacturingManager : null);
	}

	openManager() {
		const handler = this.getManagerHandler();
		if (!handler) {
			this.setStatus(__("Manage Sales Orders is not ready yet."), "orange");
			frappe.show_alert({ message: __("Manage Sales Orders is not ready. Opening Sales Order Status Report."), indicator: "orange" }, 5);
			this.openStatusReportFallback();
			return;
		}
		this.setStatus(__("Opening manager..."), "green");
		handler(this.buildSeed());
	}

	openStatusReportFallback() {
		const seed = this.buildSeed();
		frappe.route_options = {
			company: seed.company || "",
			customer: seed.customer || "",
			sales_order: seed.sales_order || "",
		};
		frappe.set_route("query-report", "Sales Order Status Report");
	}
};
