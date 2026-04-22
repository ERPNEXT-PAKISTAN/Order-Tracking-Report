frappe.ui.form.on("Work Order", {
  refresh(frm) {
    if (frm.is_new()) return;

    frm.add_custom_button(__("Daily Operation Summary"), async () => {
      const salesOrder = String(frm.doc.sales_order || "").trim();
      const itemCode = String(frm.doc.production_item || "").trim();
      if (!salesOrder) {
        frappe.show_alert({ message: __("Sales Order is required on Work Order."), indicator: "orange" }, 5);
        return;
      }
      await showDailyOperationSummaryDialog({
        title: __("Daily Operation wise Production"),
        sales_order: salesOrder,
        item_code: itemCode,
      });
    });
  },
});

async function showDailyOperationSummaryDialog({ title, sales_order, item_code }) {
  const dialog = new frappe.ui.Dialog({
    title: title || __("Daily Operation wise Production"),
    size: "extra-large",
    fields: [{ fieldtype: "HTML", fieldname: "body_html" }],
  });

  dialog.fields_dict.body_html.$wrapper.html(`<div class="text-muted">${__("Loading...")}</div>`);
  dialog.show();

  try {
    const response = await frappe.call({
      method: "order_tracking_report.order_tracking_report.page.daily_operation_report.daily_operation_report.get_daily_operation_page_data",
      args: {
        filters: JSON.stringify({ sales_order: sales_order || "" }),
      },
      freeze: false,
    });
    const payload = (response && response.message) ? response.message : {};
    dialog.fields_dict.body_html.$wrapper.html(renderDailyOperationSummary(payload, sales_order, item_code));
  } catch (error) {
    dialog.fields_dict.body_html.$wrapper.html(`<div class="text-danger">${__("Could not load Daily Operation summary.")}</div>`);
  }
}

function renderDailyOperationSummary(payload, salesOrder, itemCode) {
  const operations = (payload && payload.operations) || [];
  const groups = (payload && payload.groups) || [];
  const so = String(salesOrder || "").trim();
  const item = String(itemCode || "").trim();
  const group = groups.find((g) => String(g.sales_order || "").trim() === so) || null;
  const items = group ? (group.items || []) : [];
  const selectedItems = item ? items.filter((x) => String(x.item || "").trim() === item) : items;

  if (!group || !selectedItems.length) {
    return `<div class="text-muted">${__("No Daily Operation data found for this item.")}</div>`;
  }

  const summaryRows = selectedItems
    .map((x) => `<tr><td>${frappe.utils.escape_html(x.item || "")}</td><td style="text-align:right;font-weight:700;">${fmt0(x.order_qty || 0)}</td></tr>`)
    .join("");

  const opHead = operations.map((op) => `<th style="text-align:right;">${frappe.utils.escape_html(op)}</th>`).join("");
  const grand = {};
  operations.forEach((op) => { grand[op] = 0; });
  const opRows = selectedItems.map((x) => {
    const cells = operations.map((op) => {
      const value = Number(((x.totals || {})[op]) || 0);
      grand[op] += value;
      return `<td style="text-align:right;font-weight:700;">${fmt0(value)}</td>`;
    }).join("");
    return `<tr><td style="font-weight:700;">${frappe.utils.escape_html(x.item || "")}</td>${cells}</tr>`;
  }).join("");
  const grandCells = operations.map((op) => `<td style="text-align:right;font-weight:900;color:#1d4ed8;">${fmt0(grand[op] || 0)}</td>`).join("");

  return `
    <div style="padding:10px;border:1px solid #dbeafe;border-radius:10px;background:#eff6ff;color:#1e3a8a;font-size:12px;">
      <b>${__("Sales Order")}:</b> ${frappe.utils.escape_html(so)}${item ? ` &nbsp; | &nbsp; <b>${__("Item")}:</b> ${frappe.utils.escape_html(item)}` : ""}
    </div>
    <div class="table-responsive" style="margin-top:10px;">
      <table class="table table-bordered" style="margin:0;">
        <thead><tr><th>${__("Item")}</th><th style="text-align:right;">${__("Total Qty")}</th></tr></thead>
        <tbody>${summaryRows}</tbody>
      </table>
    </div>
    ${operations.length ? `
      <div style="font-size:12px;font-weight:800;color:#1d4ed8;margin:10px 0 6px;">${__("Operation Total Summary")}</div>
      <div class="table-responsive">
        <table class="table table-bordered" style="margin:0;">
          <thead><tr><th>${__("Item")}</th>${opHead}</tr></thead>
          <tbody>
            ${opRows}
            <tr><td style="font-weight:900;color:#1d4ed8;">${__("Grand Total")}</td>${grandCells}</tr>
          </tbody>
        </table>
      </div>
    ` : ""}
  `;
}

function fmt0(v) {
  return Number(v || 0).toLocaleString();
}
