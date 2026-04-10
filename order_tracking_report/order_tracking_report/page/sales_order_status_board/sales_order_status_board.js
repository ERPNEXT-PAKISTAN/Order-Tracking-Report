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
					<div style="font-size:18px;font-weight:900;color:#0f172a;">${__("Sales Order Status Board")}</div>
					<div style="margin-top:4px;font-size:13px;color:#1d4ed8;font-weight:700;">${__("This page uses the same Sales Order Status Board logic from Live Work Order.")}</div>
					<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
						<button class="btn btn-primary btn-sm" data-open-status-board>${__("Open Status Board")}</button>
						<span style="font-size:12px;color:#475569;">${__("If you close the dialog, use this button to reopen it.")}</span>
					</div>
				</div>
				<div id="otr-status-board-host" style="position:absolute;left:-99999px;top:-99999px;width:1px;height:1px;overflow:hidden;"></div>
			</div>
		`);

		this.$host = this.$root.find("#otr-status-board-host");
		this.$root.find("[data-open-status-board]").on("click", () => this.openStatusBoard());

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
		this.applyLiveDefaults();
		setTimeout(() => this.openStatusBoard(), 300);
		setTimeout(() => this.openStatusBoard(), 900);
	}

	ensureOption($field, value) {
		if (!$field || !$field.length || !value) return;
		if (!$field.find(`option[value="${value}"]`).length) {
			$field.append(`<option value="${frappe.utils.escape_html(value)}">${frappe.utils.escape_html(value)}</option>`);
		}
	}

	applyLiveDefaults() {
		const options = this.routeOptions || {};
		const $company = this.$host.find("#company_filter");
		const $salesOrder = this.$host.find("#sales_order_filter");
		const $fromDate = this.$host.find("#from_date");
		const $toDate = this.$host.find("#to_date");

		if (options.company && $company.length) {
			this.ensureOption($company, options.company);
			$company.val(options.company).trigger("change");
		}
		if (options.sales_order && $salesOrder.length) {
			this.ensureOption($salesOrder, options.sales_order);
			$salesOrder.val(options.sales_order).trigger("change");
		}
		if (options.from_date && $fromDate.length) {
			$fromDate.val(options.from_date);
		}
		if (options.to_date && $toDate.length) {
			$toDate.val(options.to_date);
		}
	}

	openStatusBoard() {
		if (typeof window.openSalesOrderStatusBoard === "function") {
			this.applyLiveDefaults();
			window.openSalesOrderStatusBoard();
			return;
		}
		frappe.show_alert({ message: __("Sales Order Status Board is not ready yet."), indicator: "orange" }, 4);
	}
};