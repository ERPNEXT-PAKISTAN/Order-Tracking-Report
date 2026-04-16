frappe.query_reports["Daily Operation Report"] = {
  filters: [
    {
      fieldname: "from_date",
      label: __("From Date"),
      fieldtype: "Date",
      default: frappe.datetime.month_start(),
      reqd: 1,
    },
    {
      fieldname: "to_date",
      label: __("To Date"),
      fieldtype: "Date",
      default: frappe.datetime.month_end(),
      reqd: 1,
    },
    {
      fieldname: "company",
      label: __("Company"),
      fieldtype: "Link",
      options: "Company",
    },
    {
      fieldname: "customer",
      label: __("Customer"),
      fieldtype: "Data",
    },
    {
      fieldname: "sales_order",
      label: __("Sales Order"),
      fieldtype: "Link",
      options: "Sales Order",
    },
    {
      fieldname: "item",
      label: __("Item"),
      fieldtype: "Link",
      options: "Item",
    },
    {
      fieldname: "operation",
      label: __("Operation"),
      fieldtype: "Link",
      options: "Operation",
    },
    {
      fieldname: "employee",
      label: __("Employee"),
      fieldtype: "Data",
    },
    {
      fieldname: "group_by",
      label: __("Group By"),
      fieldtype: "Select",
      options: ["None", "Date", "Sales Order", "Item", "Operation", "Employee"],
      default: "Date",
      reqd: 1,
    },
    {
      fieldname: "hide_zero_qty",
      label: __("Hide Zero Qty"),
      fieldtype: "Check",
      default: 1,
    },
  ],

  onload: function (report) {
    const fromDate = report.get_filter_value("from_date");
    const toDate = report.get_filter_value("to_date");
    if (fromDate && toDate && fromDate > toDate) {
      report.set_filter_value("to_date", fromDate);
    }
  },
};
