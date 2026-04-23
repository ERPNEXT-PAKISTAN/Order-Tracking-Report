function otrConsumptionFmt(value, precision = 2) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

frappe.query_reports["Consumption Report"] = {
  tree: true,
  name_field: "_node",
  parent_field: "_parent_node",
  initial_depth: 0,
  filters: [
    {
      fieldname: "group_by",
      label: __("Group By"),
      fieldtype: "Select",
      options: ["Work Order", "Stock Entry Type", "Warehouse", "Item Group", "Item"],
      default: "Work Order",
      reqd: 1,
    },
    { fieldname: "from_date", label: __("From Date"), fieldtype: "Date", default: frappe.datetime.month_start() },
    { fieldname: "to_date", label: __("To Date"), fieldtype: "Date", default: frappe.datetime.month_end() },
    { fieldname: "company", label: __("Company"), fieldtype: "Link", options: "Company" },
    { fieldname: "sales_order", label: __("Sales Order"), fieldtype: "Link", options: "Sales Order" },
    { fieldname: "work_order", label: __("Work Order"), fieldtype: "Link", options: "Work Order" },
    {
      fieldname: "stock_entry_type",
      label: __("Stock Entry Type"),
      fieldtype: "Select",
      options: ["", "Material Consumption for Manufacture", "Material Transfer for Manufacture", "Manufacture", "Repack"],
    },
    { fieldname: "warehouse", label: __("Location / Warehouse"), fieldtype: "Link", options: "Warehouse" },
    { fieldname: "item_group", label: __("Item Group"), fieldtype: "Link", options: "Item Group" },
    { fieldname: "item_code", label: __("Item"), fieldtype: "Link", options: "Item" },
    { fieldname: "variant", label: __("Variant"), fieldtype: "Link", options: "Item" },
    { fieldname: "attributes", label: __("Attributes"), fieldtype: "Data" },
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

    if (["consumption_qty", "amount", "avg_rate"].includes(column.fieldname)) {
      formatted = otrConsumptionFmt(data[column.fieldname], 2);
    }

    if (column.fieldname === "stock_entry_type" && data.stock_entry_type) {
      formatted = `<span style="font-weight:700;color:#0f4c81;">${formatted}</span>`;
    }

    if (data.is_group_row) {
      if (column.fieldname === "group_value") {
        return `<span style="font-weight:800;color:#7c2d12;background:#ffedd5;padding:2px 8px;border-radius:4px;">${formatted}</span>`;
      }
      return `<span style="font-weight:700;background:#fff7ed;padding:2px 6px;border-radius:4px;display:inline-block;">${formatted}</span>`;
    }

    return formatted;
  },
};
