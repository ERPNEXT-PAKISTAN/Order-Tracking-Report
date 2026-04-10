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

window.order_tracking_report.ManageSalesOrdersPage = class ManageSalesOrdersPage {
	constructor(wrapper) {
		this.wrapper = wrapper;
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
				</div>
				<div id="otr-manage-sales-orders-host" style="position:absolute;left:-99999px;top:-99999px;width:1px;height:1px;overflow:hidden;"></div>
			</div>
		`);

		this.$host = this.$root.find("#otr-manage-sales-orders-host");
		this.$root.find("[data-open-manager]").on("click", () => this.openManager());

		try {
			const response = await frappe.call({
				method: "order_tracking_report.api.get_custom_html_block_page_payload",
				args: { block_name: "Live Work Order" },
			});
			const payload = response.message || {};
			this.$host.html(payload.html || "");
			const script = document.createElement("script");
			script.type = "text/javascript";
			script.text = [
				"var root_element = document.getElementById('live_production_root') || document;",
				payload.script || "",
			].join("\n");
			this.$host[0].appendChild(script);
			setTimeout(() => this.openManager(), 300);
		} catch (error) {
			this.$root.append(`<div class="text-danger">${__("Failed to load Manage Sales Orders.")}</div>`);
		}
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

	openManager() {
		const handler = window.openExistingManufacturingManager || (typeof openExistingManufacturingManager === "function" ? openExistingManufacturingManager : null);
		if (!handler) {
			frappe.show_alert({ message: __("Manage Sales Orders is not ready yet."), indicator: "orange" }, 4);
			return;
		}
		handler(this.buildSeed());
	}
};