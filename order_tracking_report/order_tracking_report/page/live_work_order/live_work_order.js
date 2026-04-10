frappe.pages["live-work-order"].on_page_load = function (wrapper) {
	frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Live Work Order"),
		single_column: true,
	});

	wrapper.live_work_order_page = new order_tracking_report.LiveWorkOrderPage(wrapper);
	frappe.breadcrumbs.add("Order Tracking Report");
};

window.order_tracking_report = window.order_tracking_report || {};

order_tracking_report.LiveWorkOrderPage = class LiveWorkOrderPage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = wrapper.page;
		this.routeOptions = frappe.route_options || {};
		frappe.route_options = null;
		setTimeout(() => this.load(), 0);
	}

	async load() {
		this.$root = $(this.wrapper).find(".layout-main-section");
		this.$root.html(`<div class="text-muted">${__("Loading Live Work Order...")}</div>`);

		try {
			const response = await frappe.call({
				method: "order_tracking_report.api.get_custom_html_block_page_payload",
				args: { block_name: "Live Work Order" },
			});
			const payload = response.message || {};
			this.render(payload);
		} catch (error) {
			this.$root.html(`<div class="text-danger">${__("Live Work Order page is not available.")}</div>`);
			frappe.show_alert({ message: __("Failed to load Live Work Order page."), indicator: "red" }, 6);
		}
	}

	render(payload) {
		const html = payload.html || `<div class="text-muted">${__("No page content found.")}</div>`;
		this.$root.html(`<div class="otr-live-work-order-page">${html}</div>`);
		this.applyLayoutOverrides();

		const script = document.createElement("script");
		script.type = "text/javascript";
		script.text = [
			"var root_element = document.getElementById('live_production_root') || document;",
			payload.script || "",
		].join("\n");
		this.$root[0].appendChild(script);

		this.applyRouteFilters();
	}

	applyLayoutOverrides() {
		if (document.getElementById("otr-live-work-order-page-layout")) {
			return;
		}

		const style = document.createElement("style");
		style.id = "otr-live-work-order-page-layout";
		style.textContent = `
			.otr-live-work-order-page {
				max-width: 100%;
				overflow-x: hidden;
			}
			.otr-live-work-order-page .topbar {
				padding: 12px 16px !important;
			}
			.otr-live-work-order-page #live_production_root {
				max-width: 100% !important;
				padding: 16px !important;
			}
			.otr-live-work-order-page #live_production_root label {
				display: block !important;
				font-size: 11px !important;
				font-weight: 800 !important;
				color: #475569 !important;
				text-transform: uppercase !important;
				letter-spacing: 0.04em !important;
				margin-bottom: 4px !important;
			}
			.otr-live-work-order-page #live_production_root select,
			.otr-live-work-order-page #live_production_root input[type="date"],
			.otr-live-work-order-page #live_production_root input[type="text"] {
				width: 100% !important;
				height: 38px !important;
				padding: 8px 10px !important;
				border: 1px solid #cbd5e1 !important;
				border-radius: 10px !important;
				background: #ffffff !important;
				font-size: 13px !important;
				font-weight: 600 !important;
				color: #0f172a !important;
			}
			.otr-live-work-order-page #load_report,
			.otr-live-work-order-page #reset_filters_btn,
			.otr-live-work-order-page #toggle_auto_refresh,
			.otr-live-work-order-page #open_action_center_main,
			.otr-live-work-order-page #open_so_status_board {
				height: 38px !important;
				padding: 8px 14px !important;
				border-radius: 10px !important;
				font-size: 13px !important;
			}
			.otr-live-work-order-page #production_cards_container {
				width: 100% !important;
				max-width: 100% !important;
				min-width: 0 !important;
				grid-template-columns: repeat(2, minmax(320px, 1fr)) !important;
			}
			.otr-live-work-order-page .production-card {
				min-width: 0 !important;
			}
			@media (max-width: 1200px) {
				.otr-live-work-order-page #production_cards_container {
					grid-template-columns: 1fr !important;
				}
			}
		`;
		document.head.appendChild(style);
	}

	applyRouteFilters() {
		const options = this.routeOptions || {};
		if (!options.sales_order && !options.company) {
			return;
		}

		const applyValues = () => {
			const salesOrderField = this.$root.find("#sales_order_filter");
			const companyField = this.$root.find("#company_filter");
			const loadButton = this.$root.find("#load_report");

			if (options.sales_order && salesOrderField.length) {
				if (!salesOrderField.find(`option[value="${options.sales_order}"]`).length) {
					salesOrderField.append(`<option value="${frappe.utils.escape_html(options.sales_order)}">${frappe.utils.escape_html(options.sales_order)}</option>`);
				}
				salesOrderField.val(options.sales_order);
			}
			if (options.company && companyField.length) {
				if (!companyField.find(`option[value="${options.company}"]`).length) {
					companyField.append(`<option value="${frappe.utils.escape_html(options.company)}">${frappe.utils.escape_html(options.company)}</option>`);
				}
				companyField.val(options.company);
			}
			if (loadButton.length) {
				loadButton.trigger("click");
			}
		};

		setTimeout(applyValues, 200);
		setTimeout(applyValues, 800);
	}
};