frappe.pages["existing-manufacturing-documents"].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Existing Manufacturing Documents"),
		single_column: true,
	});

	window.order_tracking_report = window.order_tracking_report || {};
	wrapper.existing_manufacturing_documents_page = new window.order_tracking_report.ExistingManufacturingDocumentsPage(wrapper);
	frappe.breadcrumbs.add("Order Tracking Report");
};

window.order_tracking_report = window.order_tracking_report || {};

window.order_tracking_report.ExistingManufacturingDocumentsPage = class ExistingManufacturingDocumentsPage {
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
				<div class="otr-helper-note" style="padding:16px;border:1px solid #dbeafe;border-radius:16px;background:linear-gradient(90deg,#eff6ff,#f8fbff);margin-bottom:16px;">
					<div style="font-size:18px;font-weight:900;color:#0f172a;">${__("Existing Manufacturing Documents")}</div>
					<div style="margin-top:4px;font-size:13px;color:#1d4ed8;font-weight:700;">${__("This page uses the same Manage Existing Docs logic from Live Work Order.")}</div>
					<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
						<button class="btn btn-primary btn-sm" data-open-existing-docs>${__("Open Existing Documents")}</button>
						<span style="font-size:12px;color:#475569;">${__("If you close the dialog, use this button to reopen it.")}</span>
					</div>
				</div>
				<div id="otr-existing-docs-host" style="position:absolute;left:-99999px;top:-99999px;width:1px;height:1px;overflow:hidden;"></div>
			</div>
		`);

		this.$host = this.$root.find("#otr-existing-docs-host");
		this.$root.find("[data-open-existing-docs]").on("click", () => this.openExistingDocuments());

		try {
			const response = await frappe.call({
				method: "order_tracking_report.api.get_custom_html_block_page_payload",
				args: { block_name: "Live Work Order" },
			});
			this.renderPayload(response.message || {});
		} catch (error) {
			this.$root.append(`<div class="text-danger">${__("Failed to load the shared Live Work Order logic.")}</div>`);
		}
	}

	renderPayload(payload) {
		this.$host.html(`<div class="otr-hidden-live-root">${payload.html || ""}</div>`);
		const script = document.createElement("script");
		script.type = "text/javascript";
		script.text = [
			"var root_element = document.getElementById('live_production_root') || document;",
			payload.script || "",
		].join("\n");
		this.$host[0].appendChild(script);
		setTimeout(() => this.openExistingDocuments(), 300);
		setTimeout(() => this.openExistingDocuments(), 900);
	}

	buildSeed() {
		const options = this.routeOptions || {};
		return {
			company: options.company || "",
			customer: options.customer || "",
			item_code: options.item_code || options.item || "",
			sales_order: options.sales_order || "",
			production_plan: options.production_plan || "",
			work_order: options.work_order || "",
			job_card: options.job_card || "",
			qty: options.qty || 1,
		};
	}

	openExistingDocuments() {
		const handler = window.openExistingManufacturingManager || (typeof openExistingManufacturingManager === "function" ? openExistingManufacturingManager : null);
		if (!handler) {
			frappe.show_alert({ message: __("Existing Manufacturing Documents is not ready yet."), indicator: "orange" }, 4);
			return;
		}
		handler(this.buildSeed());
	}
};