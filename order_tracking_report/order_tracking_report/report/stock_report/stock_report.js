function otrFormatNumber(value, precision) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

frappe.query_reports["Stock Report"] = {
  tree: true,
  name_field: "_node",
  parent_field: "_parent_node",
  initial_depth: 0,
  filters: [
    {
      fieldname: "group_by",
      label: __("Group By"),
      fieldtype: "Select",
      options: ["Item Group", "Variant"],
      default: "Item Group",
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
      fieldname: "warehouse",
      label: __("Warehouse"),
      fieldtype: "Link",
      options: "Warehouse",
    },
    {
      fieldname: "company",
      label: __("Company"),
      fieldtype: "Link",
      options: "Company",
    },
    {
      fieldname: "variant",
      label: __("Variant"),
      fieldtype: "Link",
      options: "Item",
    },
    {
      fieldname: "attributes",
      label: __("Attributes"),
      fieldtype: "Data",
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

    if (["in_qty", "out_qty", "balance_qty"].includes(column.fieldname)) {
      formatted = otrFormatNumber(data[column.fieldname], 1);
    }

    if (["amount", "avg_rate"].includes(column.fieldname)) {
      formatted = frappe.format(Number(data[column.fieldname] || 0), { fieldtype: "Currency" }, {});
    }

    if (column.fieldname === "balance_qty") {
      const n = Number(data.balance_qty || 0);
      const color = n >= 0 ? "#15803d" : "#dc2626";
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
