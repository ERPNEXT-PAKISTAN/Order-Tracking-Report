function otrFmt(value, precision = 2) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

function otrSlug(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function otrGetTemplateAttributeNames(templateItem) {
  if (!templateItem) return Promise.resolve([]);
  return frappe.db
    .get_doc("Item", templateItem)
    .then((doc) => {
      const out = [];
      const seen = new Set();
      (doc?.attributes || []).forEach((r) => {
        const name = String(r?.attribute || "").trim();
        const key = name.toLowerCase();
        if (!name || seen.has(key)) return;
        seen.add(key);
        out.push(name);
      });
      return out;
    })
    .catch(() => []);
}

function otrSyncTemplateAttributeNames(report, templateItem) {
  if (!templateItem) {
    report.__template_attribute_names = null;
    return Promise.resolve();
  }
  return otrGetTemplateAttributeNames(templateItem).then((names) => {
    report.__template_attribute_names = names || [];
    const current = report.get_filter_value("attribute_name");
    if (current && !(report.__template_attribute_names || []).includes(current)) {
      report.set_filter_value("attribute_name", "");
    }
  });
}

function otrGetVariantAttributes(variant) {
  if (!variant) {
    return Promise.resolve({ names: [], values: {} });
  }
  return frappe.db.get_doc("Item", variant).then((variantItem) => {
    const variantAttrs = Array.isArray(variantItem?.attributes) ? variantItem.attributes : [];
    const values = {};
    variantAttrs.forEach((row) => {
      const attrName = String(row?.attribute || "").trim();
      if (!attrName) return;
      values[attrName] = row?.attribute_value || "";
    });

    return {
      variantItem,
      values,
      variantAttrs,
    };
  });
}

function otrGetVariantAttributeContext(variant) {
  return otrGetVariantAttributes(variant)
    .then((base) => {
      const variantItem = base?.variantItem;
      const values = base?.values || {};
      const variantAttrs = Array.isArray(base?.variantAttrs) ? base.variantAttrs : [];
      const names = [];
      const seen = new Set();
      variantAttrs.forEach((row) => {
        const attrName = String(row?.attribute || "").trim();
        const key = attrName.toLowerCase();
        if (!attrName || seen.has(key)) return;
        seen.add(key);
        names.push(attrName);
      });

      return {
        names,
        values,
      };
    })
    .catch(() => ({ names: [], values: {} }));
}

function otrClearDynamicAttributeFilters(report) {
  const kept = [];
  (report.filters || []).forEach((f) => {
    if (f.__is_dynamic_attr_filter) {
      if (f.$wrapper && f.$wrapper.remove) f.$wrapper.remove();
      if (report.page && report.page.fields_dict && f.df?.fieldname) {
        delete report.page.fields_dict[f.df.fieldname];
      }
      return;
    }
    kept.push(f);
  });
  report.filters = kept;
  report.set_filter_value("dynamic_attribute_map", "");
}

function otrBuildDynamicAttributeFilters(report, context) {
  otrClearDynamicAttributeFilters(report);

  const map = {};
  let index = 0;
  const names = Array.isArray(context?.names) ? context.names : [];
  const values = context?.values || {};

  names.forEach((attrNameRaw) => {
    const attrName = String(attrNameRaw || "").trim();
    if (!attrName) return;

    index += 1;
    const fieldname = `attr_dyn_${index}_${otrSlug(attrName).slice(0, 24) || "attr"}`;
    map[fieldname] = attrName;

    const control = report.page.add_field(
      {
        fieldname,
        label: attrName,
        fieldtype: "Data",
      },
      report.page.page_form
    );
    control.__is_dynamic_attr_filter = true;
    control.df = control.df || {};
    control.df.fieldname = fieldname;
    control.df.label = attrName;
    control.df.fieldtype = "Data";
    const defaultValue = values[attrName] || "";
    if (control.$input && control.$input.length) {
      control.$input.val(defaultValue);
      control.value = defaultValue;
      control.last_value = defaultValue;
    } else {
      control.value = defaultValue;
      control.last_value = defaultValue;
    }
    control.df.onchange = function () {
      report.refresh(true);
    };
    report.filters.push(control);
  });

  report.set_filter_value("dynamic_attribute_map", Object.keys(map).length ? JSON.stringify(map) : "");
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
    {
      fieldname: "template_item",
      label: __("Template"),
      fieldtype: "Link",
      options: "Item",
      on_change: function (report) {
        report.set_filter_value("variant", "");
        otrClearDynamicAttributeFilters(report);
        const templateItem = report.get_filter_value("template_item");
        otrSyncTemplateAttributeNames(report, templateItem);
      },
    },
    {
      fieldname: "attribute_name",
      label: __("Attributes"),
      fieldtype: "Link",
      options: "Item Attribute",
    },
    {
      fieldname: "variant",
      label: __("Variant"),
      fieldtype: "Link",
      options: "Item",
      on_change: function (report) {
        const variant = report.get_filter_value("variant");
        otrGetVariantAttributeContext(variant)
          .then((context) => {
            otrBuildDynamicAttributeFilters(report, context || {});
            report.refresh(true);
          })
          .catch(() => {
            otrClearDynamicAttributeFilters(report);
            report.refresh(true);
          });
      },
    },
    { fieldname: "dynamic_attribute_map", label: __("Dynamic Attribute Map"), fieldtype: "Data", hidden: 1 },
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

    report.get_filter("template_item").get_query = function () {
      return {
        filters: {
          has_variants: 1,
          disabled: 0,
        },
      };
    };

    report.get_filter("variant").get_query = function () {
      const template = report.get_filter_value("template_item");
      const filters = {
        has_variants: 0,
        disabled: 0,
      };
      if (template) filters.variant_of = template;
      return { filters };
    };

    report.get_filter("item_code").get_query = function () {
      const template = report.get_filter_value("template_item");
      const filters = { disabled: 0 };
      if (template) filters.variant_of = template;
      return { filters };
    };
    report.get_filter("attribute_name").get_query = function () {
      const names = report.__template_attribute_names;
      if (Array.isArray(names) && names.length) {
        return { filters: { name: ["in", names] } };
      }
      if (Array.isArray(names) && !names.length) {
        return { filters: { name: ["in", [""]] } };
      }
      return { filters: {} };
    };
    otrSyncTemplateAttributeNames(report, report.get_filter_value("template_item"));

    const variant = report.get_filter_value("variant");
    if (variant) {
      otrGetVariantAttributeContext(variant)
        .then((context) => {
          otrBuildDynamicAttributeFilters(report, context || {});
        })
        .catch(() => {
          otrClearDynamicAttributeFilters(report);
        });
    }

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
