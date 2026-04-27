function otrSalesTrendFormatNumber(value, precision) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

frappe.query_reports["Sales Trend Analysis Report"] = {
  tree: true,
  name_field: "_node",
  parent_field: "_parent_node",
  initial_depth: 0,
  filters: [
    {
      fieldname: "period",
      label: __("Period"),
      fieldtype: "Select",
      options: ["Daily", "Monthly", "Quarterly", "Yearly"],
      default: "Monthly",
      reqd: 1,
    },
    {
      fieldname: "group_by",
      label: __("Group By"),
      fieldtype: "Select",
      options: ["Period", "Sales Order", "Customer", "Item Group", "Item", "Status"],
      default: "Period",
      reqd: 1,
    },
    {
      fieldname: "from_date",
      label: __("From Date"),
      fieldtype: "Date",
      default: frappe.datetime.month_start(),
    },
    {
      fieldname: "to_date",
      label: __("To Date"),
      fieldtype: "Date",
      default: frappe.datetime.month_end(),
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
      fieldtype: "Link",
      options: "Customer",
    },
    {
      fieldname: "status",
      label: __("Status"),
      fieldtype: "Select",
      options: ["", "Draft", "To Deliver and Bill", "To Bill", "To Deliver", "Completed", "Closed"],
    },
    {
      fieldname: "item_group",
      label: __("Item Group"),
      fieldtype: "Link",
      options: "Item Group",
    },
    {
      fieldname: "item_code",
      label: __("Item"),
      fieldtype: "Link",
      options: "Item",
    },
    {
      fieldname: "sales_order",
      label: __("Sales Order"),
      fieldtype: "Link",
      options: "Sales Order",
    },
    {
      fieldname: "expand_all",
      label: __("Expand All"),
      fieldtype: "Check",
      default: 0,
      on_change: function (report) {
        report.report_settings.initial_depth = report.get_filter_value("expand_all") ? 10 : 0;
        report.refresh();
      },
    },
  ],
  onload: function (report) {
    report.report_settings.initial_depth = report.get_filter_value("expand_all") ? 10 : 0;
  },
  formatter: function (value, row, column, data, default_formatter) {
    let formatted = default_formatter(value, row, column, data);
    if (!data) return formatted;

    if (column.fieldname === "qty") {
      formatted = otrSalesTrendFormatNumber(data.qty, 1);
    }

    if (column.fieldname === "status") {
      const statusText = String(data.status || "").toLowerCase();
      let color = "#2563eb";
      if (statusText.includes("completed") || statusText.includes("closed")) color = "#15803d";
      else if (statusText.includes("open") || statusText.includes("pending") || statusText.includes("deliver")) color = "#d97706";
      else if (statusText.includes("draft")) color = "#7c3aed";
      formatted = `<span style="font-weight:700;color:${color};">${formatted}</span>`;
    }

    if (data.is_group_row) {
      if (column.fieldname === "group_value") {
        return `<span style="font-weight:800;color:#1e3a8a;background:#dbeafe;padding:2px 8px;border-radius:4px;">${formatted}</span>`;
      }
      return `<span style="font-weight:700;background:#eff6ff;padding:2px 6px;border-radius:4px;display:inline-block;">${formatted}</span>`;
    }

    return formatted;
  },
};
