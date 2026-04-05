frappe.query_reports["Purchase Order updated Status"] = {
  filters: [
    {
      fieldname: "group_by",
      label: __("Group By"),
      fieldtype: "Select",
      options: ["Item Group", "Item", "Supplier"],
      default: "Item Group",
      reqd: 1,
    },
    {
      fieldname: "from_date",
      label: __("From Date"),
      fieldtype: "Date",
    },
    {
      fieldname: "to_date",
      label: __("To Date"),
      fieldtype: "Date",
    },
    {
      fieldname: "supplier",
      label: __("Supplier"),
      fieldtype: "Link",
      options: "Supplier",
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
  ],
  formatter: function (value, row, column, data, default_formatter) {
    const formatted = default_formatter(value, row, column, data);
    if (!data) return formatted;

    if (["po_qty", "received_qty", "pending_qty"].includes(column.fieldname)) {
      const n = Number(data[column.fieldname] || 0);
      return frappe.format(Math.round(n), { fieldtype: "Int" }, { always_show_decimals: false });
    }
    return formatted;
  },
};
