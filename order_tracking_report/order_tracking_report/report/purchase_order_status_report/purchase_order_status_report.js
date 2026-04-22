frappe.query_reports["Purchase Order Status Report"] = {
  tree: true,
  name_field: "_node",
  parent_field: "_parent_node",
  initial_depth: 0,
  filters: [
    {
      fieldname: "group_by",
      label: __("Group By"),
      fieldtype: "Select",
      options: ["Purchase Order Number", "Supplier", "Item Group", "Item"],
      default: "Purchase Order Number",
      reqd: 1,
    },
    {
      fieldname: "warehouse",
      label: __("Warehouse"),
      fieldtype: "Link",
      options: "Warehouse",
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
      fieldname: "supplier",
      label: __("Supplier"),
      fieldtype: "Link",
      options: "Supplier",
    },
    {
      fieldname: "status",
      label: __("Status"),
      fieldtype: "Select",
      options: ["", "Draft", "To Receive and Bill", "To Bill", "To Receive", "Completed", "Closed", "Cancelled"],
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

    if (["qty", "received_qty", "pending_qty"].includes(column.fieldname)) {
      const n = Number(data[column.fieldname] || 0);
      formatted = frappe.format(n, { fieldtype: "Float", precision: 1 }, {});
    }

    if (column.fieldname === "status") {
      const statusText = String(data.status || "").toLowerCase();
      let color = "#2563eb";
      if (statusText.includes("completed") || statusText.includes("closed")) color = "#15803d";
      else if (statusText.includes("open") || statusText.includes("pending")) color = "#d97706";
      else if (statusText.includes("cancel")) color = "#dc2626";
      formatted = `<span style="font-weight:700;color:${color};">${formatted}</span>`;
    }

    if (column.fieldname === "pending_qty") {
      const pending = Number(data.pending_qty || 0);
      if (pending > 0) {
        formatted = `<span style="font-weight:700;color:#b45309;">${formatted}</span>`;
      } else {
        formatted = `<span style="font-weight:700;color:#15803d;">${formatted}</span>`;
      }
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
