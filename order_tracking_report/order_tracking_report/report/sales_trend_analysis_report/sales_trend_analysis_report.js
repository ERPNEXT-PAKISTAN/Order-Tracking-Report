function otrSalesTrendFormatNumber(value, precision) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

function salesTrendGroupByOptions(sourceType) {
  if (sourceType === "Sales Orders") return ["Sales Order", "Customer", "Item Group", "Item"];
  if (sourceType === "Delivery Notes") return ["Delivery Note", "Customer", "Item Group", "Item"];
  return ["Sales Invoice", "Customer", "Item Group", "Item"];
}

function salesTrendSourceDoctype(sourceType) {
  if (sourceType === "Sales Orders") return "Sales Order";
  if (sourceType === "Delivery Notes") return "Delivery Note";
  return "Sales Invoice";
}

frappe.query_reports["Sales Trend Analysis Report"] = {
  tree: true,
  name_field: "_node",
  parent_field: "_parent_node",
  initial_depth: 1,
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
      fieldname: "source_type",
      label: __("Source"),
      fieldtype: "Select",
      options: ["Sales Orders", "Delivery Notes", "Sales Invoices"],
      default: "Sales Invoices",
      reqd: 1,
      on_change: function (report) {
        const sourceType = report.get_filter_value("source_type");
        const opts = salesTrendGroupByOptions(sourceType);
        const groupFilter = report.get_filter("group_by");
        groupFilter.df.options = opts;
        groupFilter.refresh();
        const sourceDocFilter = report.get_filter("source_document");
        sourceDocFilter.df.options = salesTrendSourceDoctype(sourceType);
        sourceDocFilter.refresh();
        report.set_filter_value("source_document", "");
        const current = report.get_filter_value("group_by");
        if (!opts.includes(current)) {
          report.set_filter_value("group_by", opts[0]);
        }
      },
    },
    {
      fieldname: "show_by",
      label: __("Show By"),
      fieldtype: "Select",
      options: ["Qty", "Amount"],
      default: "Qty",
      reqd: 1,
    },
    {
      fieldname: "group_by",
      label: __("Group By"),
      fieldtype: "Select",
      options: ["Sales Invoice", "Customer", "Item Group", "Item"],
      default: "Sales Invoice",
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
      fieldname: "source_document",
      label: __("Document No"),
      fieldtype: "Link",
      options: "Sales Invoice",
    },
    {
      fieldname: "expand_all",
      label: __("Expand All"),
      fieldtype: "Check",
      default: 0,
      on_change: function (report) {
        report.report_settings.initial_depth = report.get_filter_value("expand_all") ? 10 : 1;
        report.refresh();
      },
    },
  ],
  onload: function (report) {
    report.report_settings.initial_depth = report.get_filter_value("expand_all") ? 10 : 1;
    const sourceType = report.get_filter_value("source_type");
    const opts = salesTrendGroupByOptions(sourceType);
    const groupFilter = report.get_filter("group_by");
    groupFilter.df.options = opts;
    groupFilter.refresh();
    const sourceDocFilter = report.get_filter("source_document");
    sourceDocFilter.df.options = salesTrendSourceDoctype(sourceType);
    sourceDocFilter.refresh();
    if (!opts.includes(report.get_filter_value("group_by"))) {
      report.set_filter_value("group_by", opts[0]);
    }
  },
  formatter: function (value, row, column, data, default_formatter) {
    let formatted = default_formatter(value, row, column, data);
    if (!data) return formatted;

    if (column.fieldtype === "Float") {
      formatted = otrSalesTrendFormatNumber(data[column.fieldname], 1);
    }

    const level = Number(data._level || 0);
    const levelStyles = {
      0: { bg: "#dbeafe", fg: "#1e3a8a", weight: 800 },
      1: { bg: "#dcfce7", fg: "#166534", weight: 800 },
      2: { bg: "#fef3c7", fg: "#92400e", weight: 700 },
      3: { bg: "transparent", fg: "#111827", weight: 400 },
    };
    const style = levelStyles[level] || levelStyles[3];
    const indentPx = level * 18;
    const isGroupedLevel = level <= 2;

    if (column.fieldname === "group_value") {
      if (isGroupedLevel) {
        return `<span style="display:inline-block;padding-left:${indentPx}px;background:${style.bg};color:${style.fg};padding:2px 8px;border-radius:4px;">${formatted}</span>`;
      }
      return `<span style="display:inline-block;padding-left:${indentPx}px;color:${style.fg};font-weight:${style.weight};">${formatted}</span>`;
    }

    if (column.fieldname === "total_value" || column.fieldtype === "Float" || column.fieldtype === "Currency") {
      if (isGroupedLevel) {
        return `<span style="font-weight:700;color:${style.fg};background:${style.bg};padding:1px 6px;border-radius:4px;display:inline-block;">${formatted}</span>`;
      }
      return `<span style="font-weight:400;color:#111827;">${formatted}</span>`;
    }

    return formatted;
  },
};
