frappe.pages["pl-by-order"].on_page_load = function () {
	const opts = frappe.route_options || {};
	frappe.route_options = Object.assign({}, opts, { only_pl: 1 });
	frappe.set_route("finanicals");
};

