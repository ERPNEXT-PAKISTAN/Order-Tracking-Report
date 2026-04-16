frappe.pages["daily-operation-report"].on_page_load = function (wrapper) {
	const reportName = "Daily Operation Report";

	frappe.ui.make_app_page({
		parent: wrapper,
		title: __(reportName),
		single_column: true,
	});

	const page = wrapper.page;
	const $root = $(wrapper).find(".layout-main-section");
	frappe.breadcrumbs.add("Selling");

	const routeOptions = frappe.route_options || {};
	frappe.route_options = null;
	const reportUrl = getReportUrl(reportName);

	const $pageBody = $(
		`<div class="otr-helper-page">
			<div style="padding:18px;border:1px solid #d1fae5;border-radius:16px;background:linear-gradient(135deg,#ecfdf5 0%,#f8fffb 100%);margin-bottom:16px;">
				<div style="font-size:20px;font-weight:900;color:#064e3b;">${__(reportName)}</div>
				<div style="margin-top:6px;font-size:13px;color:#065f46;font-weight:700;">${__("Open the Daily Production report with filters, grouping, chart, and summary.")}</div>
				<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
					<button class="btn btn-primary btn-sm" data-open-report>${__("Open Report")}</button>
					<a class="btn btn-default btn-sm" href="${reportUrl}">${__("Open Direct")}</a>
				</div>
				<div class="text-muted small" data-report-status style="margin-top:10px;">${__("Preparing report page...")}</div>
			</div>
		</div>`
	);

	$root.empty().append($pageBody);
	const $status = $pageBody.find("[data-report-status]");

	const openReport = () => {
		$status.text(__("Opening report..."));
		const currentLocation = `${window.location.pathname}${window.location.hash || ""}`;
		try {
			frappe.route_options = routeOptions;
			frappe.set_route("query-report", reportName);
		} catch (error) {
			window.location.href = reportUrl;
			return;
		}

		setTimeout(() => {
			const nextLocation = `${window.location.pathname}${window.location.hash || ""}`;
			if (nextLocation === currentLocation) {
				window.location.href = reportUrl;
			}
		}, 250);
	};

	page.set_primary_action(__("Open Report"), openReport, "go-to");
	$pageBody.find("[data-open-report]").on("click", openReport);

	setTimeout(openReport, 150);
};

function getReportUrl(reportName) {
	const encodedReportName = encodeURIComponent(reportName);
	if ((window.location.pathname || "").startsWith("/desk")) {
		return `/desk#query-report/${encodedReportName}`;
	}
	return `/app/query-report/${encodedReportName}`;
}
