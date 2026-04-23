function otrFmt(value, precision = 2) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

frappe.query_reports["Supplier Wise Purchases Detail"] = {
  tree: true,
  name_field: "_node",
  parent_field: "_parent_node",
  initial_depth: 0,
  filters: [
    {
      fieldname: "group_by",
      label: __("Group By"),
      fieldtype: "Select",
      options: ["Supplier", "Document Type", "Item Group", "Item"],
      default: "Supplier",
      reqd: 1,
    },
    {
      fieldname: "purchase_document",
      label: __("Document"),
      fieldtype: "Select",
      options: ["", "Purchase Order", "Purchase Receipt", "Purchase Invoice"],
    },
    {
      fieldname: "docstatus",
      label: __("Docstatus"),
      fieldtype: "Select",
      options: ["Submitted", "Draft", "Cancelled", "All"],
      default: "Submitted",
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
    { fieldname: "company", label: __("Company"), fieldtype: "Link", options: "Company" },
    { fieldname: "supplier", label: __("Supplier"), fieldtype: "Link", options: "Supplier" },
    { fieldname: "warehouse", label: __("Warehouse"), fieldtype: "Link", options: "Warehouse" },
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

    if (["qty", "rate", "amount"].includes(column.fieldname)) {
      formatted = otrFmt(data[column.fieldname], 2);
    }

    if (column.fieldname === "status") {
      const status = String(data.status || "").toLowerCase();
      let color = "#2563eb";
      if (status.includes("complet") || status.includes("paid")) color = "#15803d";
      else if (status.includes("draft")) color = "#d97706";
      else if (status.includes("cancel")) color = "#dc2626";
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
