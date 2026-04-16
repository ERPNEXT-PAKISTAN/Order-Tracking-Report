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
	const reportUrl = getReportUrl(reportName, routeOptions);

	const $pageBody = $(
		`<div class="otr-helper-page">
			<div style="padding:18px;border:1px solid #d1fae5;border-radius:16px;background:linear-gradient(135deg,#ecfdf5 0%,#f8fffb 100%);margin-bottom:16px;">
				<div style="font-size:20px;font-weight:900;color:#064e3b;">${__(reportName)}</div>
				<div style="margin-top:6px;font-size:13px;color:#065f46;font-weight:700;">${__("Open the Daily Production report with filters, grouping, chart, and summary.")}</div>
				<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
					<button class="btn btn-primary btn-sm" data-reload-report>${__("Reload Report")}</button>
					<a class="btn btn-default btn-sm" href="${reportUrl}" target="_blank" rel="noopener noreferrer">${__("Open Direct")}</a>
				</div>
				<div class="text-muted small" data-report-status style="margin-top:10px;">${__("Loading report...")}</div>
			</div>
			<div style="border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;background:#fff;min-height:75vh;">
				<iframe
					data-report-frame
					src="${reportUrl}"
					style="width:100%;height:75vh;border:0;display:block;background:#fff;"
					loading="eager"
				></iframe>
			</div>
		</div>`
	);

	$root.empty().append($pageBody);
	const $status = $pageBody.find("[data-report-status]");
	const reportFrame = $pageBody.find("[data-report-frame]").get(0);

	const loadEmbeddedReport = () => {
		$status.text(__("Loading report..."));
		reportFrame.src = getReportUrl(reportName, routeOptions);
	};

	reportFrame.addEventListener("load", () => {
		$status.text(__("Report loaded."));
	});

	page.set_primary_action(__("Reload Report"), loadEmbeddedReport, "refresh");
	$pageBody.find("[data-reload-report]").on("click", loadEmbeddedReport);
};

function getReportUrl(reportName, routeOptions) {
	const encodedReportName = encodeURIComponent(reportName);
	const queryString = buildQueryString(routeOptions || {});
	if ((window.location.pathname || "").startsWith("/desk")) {
		return `/desk#query-report/${encodedReportName}${queryString}`;
	}
	return `/app/query-report/${encodedReportName}${queryString}`;
}

function buildQueryString(routeOptions) {
	const queryParams = new URLSearchParams();
	Object.entries(routeOptions || {}).forEach(([key, value]) => {
		if (value === undefined || value === null || value === "") {
			return;
		}
		queryParams.append(key, value);
	});
	const serialized = queryParams.toString();
	return serialized ? `?${serialized}` : "";
}
