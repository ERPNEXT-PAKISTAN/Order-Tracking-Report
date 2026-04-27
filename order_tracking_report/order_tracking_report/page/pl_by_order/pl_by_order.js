frappe.pages["pl-by-order"].on_page_load = function (wrapper) {
	const opts = frappe.route_options || {};
	frappe.route_options = Object.assign({}, opts, { only_pl: 1 });
	setTimeout(() => {
		frappe.set_route("finanicals");
	}, 50);
};
