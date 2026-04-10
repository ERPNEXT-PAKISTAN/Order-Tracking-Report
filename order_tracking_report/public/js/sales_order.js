frappe.ui.form.on("Sales Order", {
  refresh(frm) {
    const f = frm.get_field("custom_detail_status");
    if (!f) return;

    if (frm.is_new()) {
      f.$wrapper.html(`<div class="text-muted">Save Sales Order to view dashboard.</div>`);
      return;
    }

    frm.add_custom_button(__("Refresh Detail Status"), () => {
      frm.trigger("render_execution_dashboard");
    }, __("View"));

    frm.trigger("render_execution_dashboard");
  },

  render_execution_dashboard(frm) {
    const f = frm.get_field("custom_detail_status");
    if (!f) return;

    f.$wrapper.html(`<div class="text-muted">Loading report...</div>`);

    frappe.call({
      method: "order_tracking_report.api.custom_so_execution_status",
      args: { sales_order: frm.doc.name },
      callback: (r) => {
        const data = (r && r.message) ? r.message : {};
        f.$wrapper.html(buildDashboard(frm, data));
        bindToggles(f.$wrapper);
        bindPopupLinks(f.$wrapper);
        bindSectionToggles(f.$wrapper);
        bindMaterialShortageCreatePo(f.$wrapper, frm, data);
        bindDashboardActionButtons(f.$wrapper, frm, data);
      },
      error: () => {
        f.$wrapper.html(`<div class="text-danger">Detail status dashboard is not available.</div>`);
      }
    });
  }
});

function esc(s){ return frappe.utils.escape_html(s == null ? "" : String(s)); }
function slug(doctype){ return String(doctype||"").toLowerCase().split(" ").join("-"); }
function num(v){ return v == null ? 0 : v; }
function flt(v){ return frappe.format ? frappe.format(v || 0, {fieldtype:"Float"}) : (v || 0); }
function fmtCurrency(v){
  try { return format_currency(v || 0); } catch(e){ return flt(v || 0); }
}
function fmtDT(v){ if(!v) return ""; try{ return frappe.datetime.str_to_user(v); }catch(e){ return String(v); } }
function pctColor(v){
  v = Number(v || 0);
  if (v >= 100) return "#16a34a";
  if (v >= 70) return "#2563eb";
  if (v >= 40) return "#f59e0b";
  return "#dc2626";
}
function riskBadge(risk){
  const s = risk || "Low";
  const map = {"Low":"badge-success","Medium":"badge-warning","High":"badge-danger"};
  return `<span class="badge ${map[s]||"badge-secondary"}" style="padding:5px 9px;border-radius:999px;">${esc(s)}</span>`;
}
function badge(status){
  const s = status || "—";
  const map = {
    "Completed":"badge-success",
    "In Progress":"badge-warning",
    "Draft":"badge-secondary",
    "Stopped":"badge-danger",
    "Cancelled":"badge-dark",
    "Submitted":"badge-info",
    "Active":"badge-success",
    "Open":"badge-primary",
    "To Receive and Bill":"badge-warning",
    "To Bill":"badge-primary",
    "To Receive":"badge-warning",
    "Not Started":"badge-secondary",
    "Partly Completed":"badge-warning",
    "Closed":"badge-dark"
  };
  return `<span class="badge ${map[s]||"badge-secondary"}" style="padding:5px 9px;border-radius:999px;">${esc(s)}</span>`;
}
function docLink(doctype,name){
  if(!doctype || !name) return "—";
  return `<a href="/app/${slug(doctype)}/${encodeURIComponent(name)}" target="_blank" rel="noopener noreferrer">${esc(name)}</a>`;
}
function docPopupLink(doctype,name){
  if(!doctype || !name) return "—";
  return `<a href="#" data-doc-popup="1" data-doctype="${esc(doctype)}" data-docname="${esc(name)}">${esc(name)}</a>`;
}

function css(){
return `
<style>
  .so-hdr{border-radius:16px;padding:14px 16px;color:#fff;background:linear-gradient(90deg,#2563eb,#06b6d4);box-shadow:0 10px 25px rgba(2,132,199,.25);margin-bottom:12px;}
  .so-title{font-weight:900;font-size:16px;}
  .so-sub{opacity:.9;font-size:12px;margin-top:2px;}
  .so-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:12px;}
  .so-kpi{background:#fff;border:1px solid #eef2ff;border-radius:14px;padding:10px 12px;box-shadow:0 6px 18px rgba(15,23,42,.06);}
  .so-kpi .lbl{font-size:11px;color:#64748b;font-weight:800;}
  .so-kpi .val{font-size:18px;font-weight:900;margin-top:2px;color:#0f172a;}
  .so-card{border-radius:16px;border:1px solid #eef2ff;background:#fff;box-shadow:0 8px 22px rgba(15,23,42,.06);margin-bottom:12px;}
  .so-card-h{padding:10px 14px;border-bottom:1px solid #f1f5f9;background:linear-gradient(90deg,#f8fafc,#eef2ff);border-top-left-radius:16px;border-top-right-radius:16px;}
  .so-card-h .t{font-weight:900;color:#0f172a;}
  .so-card-h .s{font-size:12px;color:#64748b;}
  .so-card-b{padding:12px 14px;}
  .so-toggle{cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:8px;background:linear-gradient(90deg,#fff,#f8fafc);}
  .so-toggle .l{display:flex;align-items:center;gap:8px;font-weight:900;color:#0f172a;}
  .so-toggle .r{font-size:12px;color:#64748b;}
  .so-panel{margin:0 0 12px 0;padding-left:8px;}
  .so-table thead th{color:#1d4ed8 !important;background:#eef2ff !important;border-color:#bfdbfe !important;font-weight:900 !important;font-size:12px !important;text-align:center !important;vertical-align:middle !important;}
  .so-table td{font-size:12px;vertical-align:top;}
  .muted{color:#64748b;}
  .so-progress{height:12px;border-radius:999px;background:#e2e8f0;overflow:hidden;}
  .so-progress > span{display:block;height:12px;border-radius:999px;}
  .so-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}
  .so-mini-card{border:1px solid #e5e7eb;border-radius:14px;padding:10px;background:#fff;}
  .so-mini-title{font-size:12px;color:#64748b;font-weight:800;}
  .so-mini-val{font-size:18px;font-weight:900;color:#0f172a;}
  .so-timeline{display:flex;flex-direction:column;gap:10px;}
  .so-time-row{display:grid;grid-template-columns:180px 140px 1fr 120px;gap:10px;align-items:center;border:1px solid #e5e7eb;border-radius:12px;padding:8px 10px;background:#fff;}
  .so-time-bar{height:14px;background:#e5e7eb;border-radius:999px;overflow:hidden;}
  .so-time-bar > span{display:block;height:14px;border-radius:999px;}
  .so-bar-label{font-size:11px;color:#475569;}
  .so-chart-row{margin-bottom:10px;}
  .so-chart-lbl{display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;}
  .so-danger{color:#dc2626;font-weight:900;}
  .so-success{color:#16a34a;font-weight:900;}
  .so-warning{color:#d97706;font-weight:900;}
  .so-popup-head{background:linear-gradient(90deg,#1d4ed8,#06b6d4);color:#fff;border-radius:14px;padding:12px;margin-bottom:12px;}
  .so-popup-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px;}
  .so-popup-box{background:rgba(255,255,255,.15);border-radius:12px;padding:8px 10px;}
  .so-popup-box .k{font-size:11px;opacity:.9;}
  .so-popup-box .v{font-size:14px;font-weight:900;}
  .so-summary-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;}
  .so-summary-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;background:#eef2ff;color:#1e293b;font-size:11px;font-weight:800;white-space:nowrap;}
  .so-summary-chip.kpi{background:#f1f5f9;}
</style>`;
}

function bindToggles($wrap){
  $wrap.find("[data-toggle='so']").off("click").on("click", function(){
    const target = $(this).attr("data-target");
    const $p = $wrap.find(`[data-panel='${target}']`);
    $p.toggle();
    $(this).find("[data-icon]").text($p.is(":visible") ? "▾" : "▸");
  });
}

function bindPopupLinks($wrap){
  $wrap.find("[data-doc-popup='1']").off("click").on("click", function(e){
    e.preventDefault();
    const doctype = $(this).attr("data-doctype");
    const docname = $(this).attr("data-docname");
    openDocItems(doctype, docname);
  });
}

function bindMaterialShortageCreatePo($wrap, frm){
  $wrap.find("[data-ms-create-po='1']").off("click").on("click", function(e){
    e.preventDefault();
    const item = ($(this).attr("data-item") || "").trim();
    const defaultQty = flt($(this).attr("data-qty") || 0);
    const description = ($(this).attr("data-description") || "").trim();
    if (!item || defaultQty <= 0) {
      frappe.msgprint(__("Invalid row for Create PO."));
      return;
    }

    // Route this action through the same PO Tools -> PO Item Data Entry window.
    open_po_item_data_entry(frm, {
      item_code: item,
      qty: defaultQty,
      descriptions: description || item,
      select_for_po: 1,
    });
  });
}

function openDocItems(doctype, docname){
  frappe.call({
    method: "order_tracking_report.api.custom_so_execution_status",
    args: {
      action: "doc_items",
      doctype: doctype,
      docname: docname
    },
    callback: function(r){
      const meta = (r && r.message && r.message.meta) ? r.message.meta : {};
      const rows = (r && r.message && r.message.items) ? r.message.items : [];

      let head = `
        <div class="so-popup-head">
          <div style="font-size:18px;font-weight:900;">${esc(doctype)} - ${esc(docname)}</div>
          <div class="so-popup-grid">
            <div class="so-popup-box">
              <div class="k">Posting Date</div>
              <div class="v">${esc(fmtDT(meta.posting_date || meta.transaction_date || "")) || "—"}</div>
            </div>
            <div class="so-popup-box">
              <div class="k">Status</div>
              <div class="v">${esc(meta.status || "—")}</div>
            </div>
            <div class="so-popup-box">
              <div class="k">Transporter / Party</div>
              <div class="v">${esc(meta.transporter || meta.supplier || meta.customer || "—")}</div>
            </div>
            <div class="so-popup-box">
              <div class="k">Vehicle No</div>
              <div class="v">${esc(meta.vehicle_no || "—")}</div>
            </div>
            <div class="so-popup-box">
              <div class="k">LR No</div>
              <div class="v">${esc(meta.lr_no || "—")}</div>
            </div>
            <div class="so-popup-box">
              <div class="k">Total</div>
              <div class="v">${fmtCurrency(meta.rounded_total || meta.grand_total || 0)}</div>
            </div>
          </div>
        </div>
      `;

      let html = `
        ${head}
        <div class="table-responsive">
        <table class="table table-bordered">
          <thead>
            <tr>
              <th>Item</th>
              <th style="text-align:right;">Qty</th>
              <th style="text-align:right;">Rate</th>
              <th style="text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>
      `;
      if(rows.length){
        rows.forEach(x=>{
          html += `
            <tr>
              <td>${esc(x.item_code || "")}</td>
              <td style="text-align:right;">${flt(x.qty)}</td>
              <td style="text-align:right;">${fmtCurrency(x.rate)}</td>
              <td style="text-align:right;">${fmtCurrency(x.amount)}</td>
            </tr>
          `;
        });
      } else {
        html += `<tr><td colspan="4" class="text-muted">No items found.</td></tr>`;
      }
      html += `</tbody></table></div>`;

      frappe.msgprint({
        title: `${doctype} - ${docname}`,
        message: html,
        wide: true
      });
    }
  });
}

function toggleHeader(title,right,key){
  return `<div class="so-toggle" data-toggle="so" data-target="${esc(key)}">
    <div class="l"><span data-icon>▾</span> ${title}</div>
    <div class="r">${right||""}</div>
  </div>`;
}
function panel(html,key,show=true){
  return `<div class="so-panel" data-panel="${esc(key)}" style="display:${show?"block":"none"};">${html}</div>`;
}
function card(title,subtitle,html){
  return `<div class="so-card">
    <div class="so-card-h"><div class="t">${esc(title)}</div><div class="s">${esc(subtitle||"")}</div></div>
    <div class="so-card-b">${html}</div>
  </div>`;
}
function progressBar(value){
  const v = Math.max(0, Math.min(100, Number(value || 0)));
  return `
    <div class="so-progress">
      <span style="width:${v}%;background:${pctColor(v)};"></span>
    </div>
    <div class="so-bar-label" style="margin-top:4px;">${v}%</div>
  `;
}
function kpis(t){
  t = t || {};
  return `<div class="so-kpis">
    <div class="so-kpi"><div class="lbl">TOTAL QTY</div><div class="val">${flt(t.total_qty)}</div></div>
    <div class="so-kpi"><div class="lbl">PRODUCED QTY</div><div class="val">${flt(t.produced_qty)}</div></div>
    <div class="so-kpi"><div class="lbl">PENDING QTY</div><div class="val">${flt(t.pending_qty)}</div></div>
    <div class="so-kpi"><div class="lbl">COMPLETION</div><div class="val">${esc(t.completion_pct||0)}%</div></div>
    <div class="so-kpi"><div class="lbl">DELAYED WO</div><div class="val">${flt(t.delayed_work_orders||0)}</div></div>
  </div>`;
}

function jobCardTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${docLink("Job Card", r.name)}</td>
      <td>${badge(r.status)}</td>
      <td class="muted">${esc(r.operation||"")}</td>
      <td class="muted">${esc(r.workstation||"")}</td>
    </tr>
  `).join("") : `<tr><td colspan="4" class="text-muted">No Job Cards.</td></tr>`;
  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead><tr><th style="width:220px;">Job Card</th><th style="width:140px;">Status</th><th>Operation</th><th>Workstation</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function operationTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.operation||"")}</td>
      <td>${badge(r.status)}</td>
      <td class="muted">${esc(r.workstation||"")}</td>
      <td style="text-align:right;">${flt(r.completed_qty)}</td>
    </tr>
  `).join("") : `<tr><td colspan="4" class="text-muted">No Operations.</td></tr>`;
  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead><tr><th>Operation</th><th style="width:140px;">Status</th><th>Workstation</th><th style="width:160px;text-align:right;">Completed Qty</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function woItemsTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.item_code||"")}</td>
      <td style="text-align:right;">${flt(r.required_qty)}</td>
      <td style="text-align:right;">${flt(r.transferred_qty)}</td>
      <td style="text-align:right;">${flt(r.consumed_qty)}</td>
      <td style="text-align:right;">${flt(r.returned_qty)}</td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="text-muted">No WO Items.</td></tr>`;
  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead><tr>
        <th>Item</th>
        <th style="width:120px;text-align:right;">Req</th>
        <th style="width:120px;text-align:right;">Trans</th>
        <th style="width:120px;text-align:right;">Cons</th>
        <th style="width:120px;text-align:right;">Ret</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function empSummaryTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.employee||"")}</td>
      <td class="muted">${esc(r.operations||"")}</td>
      <td class="muted">${esc(r.workstations||"")}</td>
      <td style="text-align:right;">${flt(r.time_in_mins)}</td>
      <td style="text-align:right;font-weight:900;">${flt(r.produced_qty)}</td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="text-muted">No employee summary.</td></tr>`;
  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead><tr><th>Employee</th><th>Operations</th><th>Workstations</th><th style="width:140px;text-align:right;">Time</th><th style="width:160px;text-align:right;">Produced Qty</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function empLogsTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${docLink("Job Card", r.job_card)}</td>
      <td>${esc(r.employee||"")}</td>
      <td>${esc(r.operation||"")}</td>
      <td>${esc(r.workstation||"")}</td>
      <td class="muted">${esc(fmtDT(r.from_time))}</td>
      <td class="muted">${esc(fmtDT(r.to_time))}</td>
      <td style="text-align:right;">${flt(r.time_in_mins)}</td>
      <td style="text-align:right;font-weight:900;">${flt(r.completed_qty)}</td>
      <td>${esc(r.item_name||"")}</td>
    </tr>
  `).join("") : `<tr><td colspan="9" class="text-muted">No employee logs.</td></tr>`;

  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead><tr>
        <th style="width:170px;">Job Card</th>
        <th style="width:150px;">Employee</th>
        <th style="width:150px;">Operation</th>
        <th style="width:140px;">Workstation</th>
        <th style="width:170px;">From</th>
        <th style="width:170px;">To</th>
        <th style="width:120px;text-align:right;">Time</th>
        <th style="width:140px;text-align:right;">Completed Qty</th>
        <th>Item</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function bomTree(tree){
  tree = tree || [];
  if(!tree.length) return `<div class="text-muted">No Active BOM found.</div>`;

  let html = "";
  tree.forEach((itemNode,i)=>{
    const keyItem = `bom_item_${i}_${itemNode.item_code}`;
    html += toggleHeader(`Item: ${esc(itemNode.item_code)}`, `${flt(itemNode.order_qty || 0)} Order Qty • ${(itemNode.boms||[]).length} BOM(s)`, keyItem);

    let bhtml = "";
    (itemNode.boms||[]).forEach((b,j)=>{
      const keyBom = `bom_${i}_${j}_${b.bom}`;
      const rms = b.raw_materials || [];
      const rmBody = rms.length ? rms.map(x=>`
        <tr>
          <td>${esc(x.item_code||"")}</td>
          <td style="text-align:right;">${flt(x.bom_qty)}</td>
          <td style="text-align:right;">${flt(x.required_qty)}</td>
          <td style="text-align:right;">${flt(x.stock_qty)}</td>
          <td style="text-align:right;" class="${Number(x.shortage_qty||0)>0?'so-danger':'so-success'}">${flt(x.shortage_qty)}</td>
        </tr>
      `).join("") : `<tr><td colspan="5" class="text-muted">No BOM Items.</td></tr>`;

      bhtml += toggleHeader(`BOM: ${esc(b.bom)}`, `${rms.length} RM`, keyBom);
      bhtml += panel(`
        <div style="margin-bottom:6px;">${docLink("BOM", b.bom)}</div>
        <div class="table-responsive">
          <table class="table table-bordered so-table" style="margin:0;">
            <thead>
              <tr>
                <th>Raw Material</th>
                <th style="width:140px;text-align:right;">Qty / BOM</th>
                <th style="width:150px;text-align:right;">Required for Order</th>
                <th style="width:120px;text-align:right;">Stock</th>
                <th style="width:120px;text-align:right;">Shortage</th>
              </tr>
            </thead>
            <tbody>${rmBody}</tbody>
          </table>
        </div>
      `, keyBom, true);
    });

    html += panel(bhtml || `<div class="text-muted">No BOMs.</div>`, keyItem, true);
  });

  return html;
}

function productionTree(tree){
  tree = tree || [];
  if(!tree.length) return `<div class="text-muted">No production records found.</div>`;

  let html = "";
  tree.forEach((ppNode,i)=>{
    const pp = ppNode.production_plan || {};
    const wos = ppNode.work_orders || [];
    const keyPP = `pp_${i}_${pp.name}`;

    html += toggleHeader(`Production Plan: ${esc(pp.name)}`, `${badge(pp.status)} • ${wos.length} WO`, keyPP);

    let woh = "";
    wos.forEach((wo,j)=>{
      const keyWO = `wo_${i}_${j}_${wo.name}`;

      const top = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div>
            <div style="font-weight:900;font-size:13px;">${docLink("Work Order", wo.name)}</div>
            <div class="muted">Item: ${esc(wo.production_item||"")}</div>
            <div class="muted">Plan: ${esc(fmtDT(wo.planned_start_date))} → ${esc(fmtDT(wo.planned_end_date))}</div>
            ${wo.is_delayed ? `<div class="so-danger">Delayed Work Order</div>` : ``}
            <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
              <button class="btn btn-xs btn-warning" data-plan-action="mt" data-item="${esc(wo.production_item || "")}">Material Transfer</button>
              <button class="btn btn-xs btn-primary" data-plan-action="mfg" data-item="${esc(wo.production_item || "")}">Manufacture</button>
              <button class="btn btn-xs btn-success" data-plan-action="dn" data-item="${esc(wo.production_item || "")}">Delivery Note</button>
              <button class="btn btn-xs btn-default" data-plan-action="view" data-item="${esc(wo.production_item || "")}">View</button>
            </div>
          </div>
          <div style="text-align:right;min-width:230px;">
            <div>${badge(wo.status)}</div>
            <div class="muted" style="margin-top:6px;">
              Total <b>${flt(wo.qty)}</b> • Done <b>${flt(wo.produced_qty)}</b> • Pending <b>${flt(wo.pending_qty)}</b>
            </div>
            <div style="margin-top:8px;">${progressBar(wo.completion_pct)}</div>
          </div>
        </div>
      `;

      woh += toggleHeader(`Work Order: ${esc(wo.name)}`, `Qty ${flt(wo.qty)} • Done ${flt(wo.produced_qty)} • ${esc(wo.completion_pct||0)}%`, keyWO);
      woh += panel(`
        ${top}
        <div style="margin-top:12px;font-weight:900;">Job Cards</div>
        ${jobCardTable(wo.job_cards||[])}
        <div style="margin-top:12px;font-weight:900;">Operations</div>
        ${operationTable(wo.operations||[])}
        <div style="margin-top:12px;font-weight:900;">Work Order Items (Materials)</div>
        ${woItemsTable(wo.wo_items||[])}
        <div style="margin-top:12px;font-weight:900;">Employees (Summary)</div>
        ${empSummaryTable(wo.employee_summary||[])}
        <div style="margin-top:12px;font-weight:900;">Employees (Detailed Logs) — ${esc(wo.name)}</div>
        ${empLogsTable(wo.employee_logs||[])}
      `, keyWO, true);
    });

    html += panel(woh || `<div class="text-muted">No Work Orders.</div>`, keyPP, true);
  });

  return html;
}

function materialShortageTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.fg_item||"")}</td>
      <td>${esc(r.item_code||"")}</td>
      <td style="text-align:right;">${flt(r.qty_per_bom)}</td>
      <td style="text-align:right;">${flt(r.required_qty)}</td>
      <td style="text-align:right;">${flt(r.stock_qty)}</td>
      <td style="text-align:right;" class="${Number(r.shortage_qty||0)>0?'so-danger':'so-success'}">${flt(r.shortage_qty)}</td>
      <td style="text-align:right;" class="${Number(r.purchase_suggestion_qty||0)>0?'so-warning':'so-success'}">${flt(r.purchase_suggestion_qty)}</td>
    </tr>
  `).join("") : `<tr><td colspan="7" class="text-muted">No shortage found.</td></tr>`;

  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead>
        <tr>
          <th>FG Item</th>
          <th>Raw Material</th>
          <th style="width:120px;text-align:right;">Qty / BOM</th>
          <th style="width:140px;text-align:right;">Required</th>
          <th style="width:120px;text-align:right;">Stock</th>
          <th style="width:120px;text-align:right;">Shortage</th>
          <th style="width:160px;text-align:right;">Purchase Suggestion</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function deliveryHierarchy(rows){
  rows = rows || [];
  if(!rows.length) return `<div class="text-muted">No delivery or billing records.</div>`;

  const body = rows.map(d=>{
    const dnCell = d.delivery_note
      ? `${docPopupLink("Delivery Note", d.delivery_note)}<div class="muted">${badge(d.status)} • ${esc(fmtDT(d.posting_date))}</div>`
      : `<span class="muted">Invoices without Delivery Note</span>`;

    const invs = (d.invoices || []).length
      ? (d.invoices || []).map(i => `
          <div style="margin-bottom:6px;">
            ${docPopupLink("Sales Invoice", i.name)}
            <span class="muted"> ${badge(i.status)} • ${esc(fmtDT(i.posting_date))}</span>
          </div>
        `).join("")
      : `<span class="text-muted">No invoices</span>`;

    return `<tr><td>${dnCell}</td><td>${invs}</td></tr>`;
  }).join("");

  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead><tr><th style="width:280px;">Delivery Note</th><th>Invoices</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function orderItemSummaryTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.item_code || "")}</td>
      <td>${esc(r.item_name || "")}</td>
      <td style="text-align:right;">${flt(r.ordered_qty)}</td>
      <td style="text-align:right;">${flt(r.delivered_qty)}</td>
      <td style="text-align:right;">${flt(r.invoiced_qty)}</td>
      <td style="text-align:right;" class="${Number(r.pending_qty||0)>0?'so-warning':'so-success'}">${flt(r.pending_qty)}</td>
    </tr>
  `).join("") : `<tr><td colspan="6" class="text-muted">No item summary found.</td></tr>`;

  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead>
        <tr>
          <th>Item Code</th>
          <th>Item Name</th>
          <th style="width:120px;text-align:right;">Ordered</th>
          <th style="width:120px;text-align:right;">Delivered</th>
          <th style="width:120px;text-align:right;">Invoiced</th>
          <th style="width:120px;text-align:right;">Pending</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function machineUtilization(rows){
  rows = rows || [];
  if(!rows.length) return `<div class="text-muted">No machine utilization found.</div>`;

  const maxVal = rows.length ? Math.max(...rows.map(r => Number(r.time_in_mins || 0)), 1) : 1;
  return rows.map(r=>{
    const mins = Number(r.time_in_mins || 0);
    const pct = Math.min(100, Math.round((mins / maxVal) * 100));
    return `
      <div class="so-chart-row">
        <div class="so-chart-lbl">
          <span>${esc(r.workstation || "—")}</span>
          <span>${flt(mins)} mins</span>
        </div>
        <div class="so-progress"><span style="width:${pct}%;background:#2563eb;"></span></div>
      </div>
    `;
  }).join("");
}

function employeeEfficiency(rows){
  rows = rows || [];
  if(!rows.length) return `<div class="text-muted">No employee efficiency found.</div>`;

  const body = rows.map(r=>`
    <tr>
      <td>${esc(r.employee||"")}</td>
      <td>${esc(r.operations||"")}</td>
      <td style="text-align:right;">${flt(r.time_in_mins)}</td>
      <td style="text-align:right;">${flt(r.completed_qty)}</td>
      <td style="text-align:right;font-weight:900;">${flt(r.qty_per_hour)}</td>
    </tr>
  `).join("");

  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead><tr><th>Employee</th><th>Operations</th><th style="width:130px;text-align:right;">Time</th><th style="width:140px;text-align:right;">Completed Qty</th><th style="width:130px;text-align:right;">Qty / Hour</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function timelineView(rows){
  rows = rows || [];
  if(!rows.length) return `<div class="text-muted">No timeline data found.</div>`;

  const body = rows.map(r=>{
    const progress = Math.max(0, Math.min(100, Number(r.progress || 0)));
    let color = "#2563eb";
    if (r.doctype === "Delivery Note") color = "#16a34a";
    if (r.doctype === "Sales Invoice") color = "#0ea5e9";
    if (r.is_delayed) color = "#dc2626";

    return `
      <div class="so-time-row">
        <div>
          <div style="font-weight:900;">${esc(r.doctype || "")}</div>
          <div>${docLink(r.doctype, r.name)}</div>
        </div>
        <div class="muted">
          <div>${esc(r.item || "")}</div>
          <div>${badge(r.status)}</div>
        </div>
        <div>
          <div class="so-time-bar"><span style="width:${progress}%;background:${color};"></span></div>
          <div class="so-bar-label">${esc(fmtDT(r.start_date))} → ${esc(fmtDT(r.end_date))}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:900;color:${color};">${progress}%</div>
          ${r.is_delayed ? `<div class="so-danger">Delayed</div>` : ``}
        </div>
      </div>
    `;
  }).join("");

  return `<div class="so-timeline">${body}</div>`;
}

function deliveryPredictionCard(p){
  p = p || {};
  return `
    <div class="so-grid-3">
      <div class="so-mini-card">
        <div class="so-mini-title">DELIVERY DATE</div>
        <div class="so-mini-val">${esc(fmtDT(p.delivery_date || "")) || "—"}</div>
      </div>
      <div class="so-mini-card">
        <div class="so-mini-title">COMPLETION</div>
        <div class="so-mini-val">${esc(p.completion_pct || 0)}%</div>
      </div>
      <div class="so-mini-card">
        <div class="so-mini-title">RISK</div>
        <div class="so-mini-val">${riskBadge(p.risk || "Low")}</div>
      </div>
    </div>
    <div style="margin-top:10px;" class="${(p.risk||'Low') === 'High' ? 'so-danger' : ((p.risk||'Low') === 'Medium' ? 'so-warning' : 'so-success')}">
      ${esc(p.reason || "")}
    </div>
  `;
}

function profitSummaryCard(s){
  s = s || {};
  return `
    <div class="so-grid-3">
      <div class="so-mini-card">
        <div class="so-mini-title">SALES</div>
        <div class="so-mini-val">${fmtCurrency(s.sales_amount || 0)}</div>
      </div>
      <div class="so-mini-card">
        <div class="so-mini-title">ESTIMATED COST</div>
        <div class="so-mini-val">${fmtCurrency(s.estimated_cost || 0)}</div>
      </div>
      <div class="so-mini-card">
        <div class="so-mini-title">ESTIMATED PROFIT</div>
        <div class="so-mini-val">${fmtCurrency(s.estimated_profit || 0)}</div>
      </div>
    </div>
    <div style="margin-top:10px;font-weight:900;">Margin: ${esc(s.margin_pct || 0)}%</div>
  `;
}

function profitByItemTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.item_code||"")}</td>
      <td style="text-align:right;">${flt(r.qty)}</td>
      <td>${esc(r.default_bom || "—")}</td>
      <td style="text-align:right;">${fmtCurrency(r.bom_unit_cost)}</td>
      <td style="text-align:right;">${fmtCurrency(r.sales_amount)}</td>
      <td style="text-align:right;">${fmtCurrency(r.estimated_cost)}</td>
      <td style="text-align:right;">${fmtCurrency(r.estimated_profit)}</td>
      <td style="text-align:right;">${esc(r.margin_pct||0)}%</td>
    </tr>
  `).join("") : `<tr><td colspan="8" class="text-muted">No profit records.</td></tr>`;

  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead><tr><th>Item</th><th style="width:100px;text-align:right;">Qty</th><th>Default BOM</th><th style="width:120px;text-align:right;">BOM Cost</th><th style="width:150px;text-align:right;">Sales</th><th style="width:150px;text-align:right;">Est. Cost</th><th style="width:150px;text-align:right;">Est. Profit</th><th style="width:110px;text-align:right;">Margin %</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}



function poAnalyticsOverviewCard(overview){
  const o = overview || {};
  return `
    <div class="so-grid-3" style="grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;">
      <div class="so-mini-card"><div class="so-mini-title">ORDERED QTY</div><div class="so-mini-val">${_n0(o.ordered_qty || 0)}</div></div>
      <div class="so-mini-card"><div class="so-mini-title">RECEIVED QTY</div><div class="so-mini-val">${_n0(o.received_qty || 0)}</div></div>
      <div class="so-mini-card"><div class="so-mini-title">PENDING QTY</div><div class="so-mini-val">${_n0(o.pending_qty || 0)}</div></div>
      <div class="so-mini-card"><div class="so-mini-title">RECEIVED %</div><div class="so-mini-val">${esc(o.received_pct || 0)}%</div></div>
      <div class="so-mini-card"><div class="so-mini-title">PENDING %</div><div class="so-mini-val">${esc(o.pending_pct || 0)}%</div></div>
      <div class="so-mini-card"><div class="so-mini-title">PO CREATED / PENDING</div><div class="so-mini-val">${_n0(o.po_created_rows || 0)} / ${_n0(o.po_pending_rows || 0)}</div></div>
    </div>
  `;
}

function poStatusDetailTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${r.purchase_order ? docPopupLink("Purchase Order", r.purchase_order) : `<span class="text-muted">Not Created</span>`}</td>
      <td>${esc(r.supplier || "-")}</td>
      <td>${badge(r.status)}</td>
      <td style="text-align:right;">${flt(r.ordered_qty)}</td>
      <td style="text-align:right;">${flt(r.received_qty)}</td>
      <td style="text-align:right;">${flt(r.pending_qty)}</td>
      <td style="text-align:right;">${esc(r.received_pct || 0)}%</td>
      <td style="text-align:right;">${esc(r.pending_pct || 0)}%</td>
    </tr>
  `).join("") : `<tr><td colspan="8" class="text-muted">No PO analytics found.</td></tr>`;

  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
    <thead><tr>
      <th>Purchase Order</th><th>Supplier</th><th>Status</th>
      <th style="text-align:right;">Ordered Qty</th>
      <th style="text-align:right;">Received Qty</th>
      <th style="text-align:right;">Pending Qty</th>
      <th style="text-align:right;">Received %</th>
      <th style="text-align:right;">Pending %</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function poItemGroupTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.item_group || "Uncategorized")}</td>
      <td style="text-align:right;">${flt(r.ordered_qty)}</td>
      <td style="text-align:right;">${flt(r.received_qty)}</td>
      <td style="text-align:right;">${flt(r.pending_qty)}</td>
      <td style="text-align:right;">${esc(r.received_pct || 0)}%</td>
      <td style="text-align:right;">${esc(r.pending_pct || 0)}%</td>
    </tr>
  `).join("") : `<tr><td colspan="6" class="text-muted">No item-group analytics found.</td></tr>`;

  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
    <thead><tr>
      <th>Item Group</th>
      <th style="text-align:right;">Ordered Qty</th>
      <th style="text-align:right;">Received Qty</th>
      <th style="text-align:right;">Pending Qty</th>
      <th style="text-align:right;">Received %</th>
      <th style="text-align:right;">Pending %</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function poAnalyticsSection(data){
  const d = data || {};
  return `
    ${poAnalyticsOverviewCard(d.overview || {})}
    <div style="margin-top:12px;font-weight:900;">PO-Wise Detail Status</div>
    ${poStatusDetailTable(d.po_status_rows || [])}
    <div style="margin-top:12px;font-weight:900;">Item Group-Wise PO Status</div>
    ${poItemGroupTable(d.item_group_rows || [])}
  `;
}

function buildDashboard(frm, data){
  const totals = data.production_totals || {};
  return `
    ${css()}
    <div class="so-hdr">
      <div class="so-title">Sales Order Execution Report</div>
      <div class="so-sub">Sales Order: <b>${esc(frm.doc.name)}</b></div>
      ${kpis(totals)}
    </div>

    ${card("Delivery Risk Prediction", "Delivery delay warning based on completion and delivery date", deliveryPredictionCard(data.delivery_prediction || {}))}
    ${card("Profit Dashboard", "Estimated cost from default BOM and sales amount", `
      ${profitSummaryCard(data.profit_summary || {})}
      <div style="margin-top:12px;font-weight:900;">Profit by Item</div>
      ${profitByItemTable(data.profit_by_item || [])}
    `)}
    ${card("Order Item Summary", "Ordered, delivered, invoiced and pending quantity by item", orderItemSummaryTable(data.order_item_summary || []))}
    ${card("Production Timeline", "Work Orders, Delivery Notes and Invoices timeline", timelineView(data.gantt_timeline || []))}
    ${card("Production", "Production Plan → Work Order → Job Cards / Operations / Employees / Materials", productionTree(data.production_tree||[]))}
    ${card("BOM & Raw Materials", "Active default BOM only, grouped Item → BOM → Raw Materials", bomTree(data.bom_tree||[]))}
    ${card("Material Shortage & Purchase Suggestion", "Shortage based on stock vs required raw material for sales order", materialShortageTable(data.material_shortage || []))}
    ${card("Machine Utilization", "Workstation time from Job Card Time Logs", machineUtilization(data.machine_utilization || []))}
    ${card("Employee Efficiency", "Completed quantity vs time spent", employeeEfficiency(data.employee_efficiency || []))}
    ${card("PO Analytics (From PO Tab)", "Received and Pending status (%) from custom_po_item linked purchase flow", poAnalyticsSection(data.custom_po_analytics || {}))}
    ${card("Procurement", "Purchase Order / Purchase Receipt / Purchase Invoice", data.procurement && data.procurement.length ? `<div class="table-responsive"><table class="table table-bordered so-table"><thead><tr><th>Document</th><th>Status</th><th style="text-align:right;">Qty</th><th>Details</th></tr></thead><tbody>${data.procurement.map(r=>`<tr><td><div style="font-weight:900">${esc(r.doctype||"")}</div><div>${docLink(r.doctype, r.name)}</div></td><td>${badge(r.status)}</td><td style="text-align:right;">${esc(r.qty||"")}</td><td class="muted">${esc(r.details||"")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="text-muted">No records.</div>`)}
    ${card("Delivery & Billing", "Delivery Note → Invoices, click document number to open popup item details", deliveryHierarchy(data.sales_fulfillment_hierarchy||[]))}
  `;
}


function sectionHeading(title, color){
  return `<div style="margin:14px 0 8px 0;padding:10px 12px;border-radius:12px;background:${color};color:#fff;font-size:14px;font-weight:900;letter-spacing:.2px;">${esc(title)}</div>`;
}

function purchaseFlowTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${r.purchase_order ? docPopupLink("Purchase Order", r.purchase_order) : `<span class="text-muted">Not Created</span>`}</td>
      <td>${esc(r.supplier || "-")}</td>
      <td>${badge(r.po_status)}</td>
      <td style="text-align:right;">${flt(r.ordered_qty)}</td>
      <td style="text-align:right;">${flt(r.received_qty)}</td>
      <td style="text-align:right;">${flt(r.pending_qty)}</td>
      <td style="text-align:right;">${esc(r.received_pct || 0)}%</td>
      <td style="text-align:right;">${esc(r.pending_pct || 0)}%</td>
      <td style="text-align:right;">${fmtCurrency(r.po_cost || 0)}</td>
      <td>${esc(r.purchase_receipts || "-")}</td>
      <td>${esc(r.pr_status || "-")}</td>
      <td>${esc(r.purchase_invoices || "-")}</td>
      <td>${esc(r.pi_status || "-")}</td>
    </tr>
  `).join("") : `<tr><td colspan="13" class="text-muted">No purchase flow records.</td></tr>`;

  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
    <thead><tr>
      <th>PO Number</th><th>Supplier</th><th>PO Status</th>
      <th style="text-align:right;">Ordered</th><th style="text-align:right;">Received</th><th style="text-align:right;">Pending</th>
      <th style="text-align:right;">Rec %</th><th style="text-align:right;">Pend %</th>
      <th style="text-align:right;">PO Cost</th>
      <th>Purchase Receipt</th><th>PR Status</th>
      <th>Purchase Invoice</th><th>PI Status</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function labourCostTable(rows, summary){
  rows = rows || [];
  summary = summary || {};
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.employee || "-")}</td>
      <td>${esc(r.name1 || "-")}</td>
      <td>${esc(r.product || "-")}</td>
      <td>${esc(r.process_type || "-")}</td>
      <td style="text-align:right;">${flt(r.qty)}</td>
      <td style="text-align:right;">${flt(r.rate)}</td>
      <td style="text-align:right;">${fmtCurrency(r.labour_cost || 0)}</td>
    </tr>
  `).join("") : `<tr><td colspan="7" class="text-muted">No employee item-wise labour cost for this Sales Order.</td></tr>`;

  return `
    <div style="display:flex;gap:12px;margin-bottom:10px;">
      <div class="so-mini-card"><div class="so-mini-title">LABOUR QTY</div><div class="so-mini-val">${flt(summary.total_qty || 0)}</div></div>
      <div class="so-mini-card"><div class="so-mini-title">TOTAL LABOUR COST</div><div class="so-mini-val">${fmtCurrency(summary.total_cost || 0)}</div></div>
    </div>
    <div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
      <thead><tr><th>Employee</th><th>Name</th><th>Item</th><th>Process</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Labour Cost</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>
  `;
}

// override grouped shortage view
function materialShortageTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.item_group || "Uncategorized")}</td>
      <td>${esc(r.item_code || "")}</td>
      <td style="text-align:right;">${flt(r.qty_per_bom)}</td>
      <td style="text-align:right;">${flt(r.required_qty)}</td>
      <td style="text-align:right;">${flt(r.stock_qty)}</td>
      <td style="text-align:right;" class="${Number(r.shortage_qty||0)>0?'so-danger':'so-success'}">${flt(r.shortage_qty)}</td>
      <td style="text-align:right;" class="${Number(r.purchase_suggestion_qty||0)>0?'so-warning':'so-success'}">${flt(r.purchase_suggestion_qty)}</td>
    </tr>
  `).join("") : `<tr><td colspan="7" class="text-muted">No grouped shortage found.</td></tr>`;

  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead>
        <tr>
          <th>Item Group</th>
          <th>Raw Material</th>
          <th style="width:120px;text-align:right;">Total Qty/BOM</th>
          <th style="width:140px;text-align:right;">Total Required</th>
          <th style="width:120px;text-align:right;">Total Stock</th>
          <th style="width:120px;text-align:right;">Total Shortage</th>
          <th style="width:170px;text-align:right;">Purchase Suggestion</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

// override item-group table to include subgroup items
function poItemGroupTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.item_group || "Uncategorized")}</td>
      <td class="muted">${esc(r.items || "-")}</td>
      <td style="text-align:right;">${flt(r.ordered_qty)}</td>
      <td style="text-align:right;">${flt(r.received_qty)}</td>
      <td style="text-align:right;">${flt(r.pending_qty)}</td>
      <td style="text-align:right;">${esc(r.received_pct || 0)}%</td>
      <td style="text-align:right;">${esc(r.pending_pct || 0)}%</td>
    </tr>
  `).join("") : `<tr><td colspan="7" class="text-muted">No item-group analytics found.</td></tr>`;

  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
    <thead><tr>
      <th>Item Group</th>
      <th>Items (Subgroup)</th>
      <th style="text-align:right;">Ordered Qty</th>
      <th style="text-align:right;">Received Qty</th>
      <th style="text-align:right;">Pending Qty</th>
      <th style="text-align:right;">Received %</th>
      <th style="text-align:right;">Pending %</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

// override main dashboard layout for grouped professional sections
function buildDashboard(frm, data){
  const totals = data.production_totals || {};
  return `
    ${css()}
    <div class="so-hdr">
      <div class="so-title">Sales Order Connection Report</div>
      <div class="so-sub">Sales Order: <b>${esc(frm.doc.name)}</b></div>
      ${kpis(totals)}
    </div>

    ${sectionHeading("Profit and Loss Section", "linear-gradient(90deg,#0f766e,#14b8a6)")}
    ${card("Profit Dashboard", "Estimated cost from default BOM and sales amount", `
      ${profitSummaryCard(data.profit_summary || {})}
      <div style="margin-top:12px;font-weight:900;">Profit by Item</div>
      ${profitByItemTable(data.profit_by_item || [])}
    `)}
    ${card("Employee Item-wise Labour Cost", "From per-piece-report > Employee item-wise", labourCostTable(data.labour_cost_employee_item_wise || [], data.labour_cost_summary || {}))}

    ${sectionHeading("Production Section", "linear-gradient(90deg,#1d4ed8,#2563eb)")}
    ${card("Production", "Production Plan -> Work Order -> Job Cards / Operations / Employees / Materials", productionTree(data.production_tree||[]))}
    ${card("Production Timeline", "Work Orders, Delivery Notes and Invoices timeline", timelineView(data.gantt_timeline || []))}
    ${card("Machine Utilization", "Workstation time from Job Card Time Logs", machineUtilization(data.machine_utilization || []))}
    ${card("Employee Efficiency", "Completed quantity vs time spent", employeeEfficiency(data.employee_efficiency || []))}

    ${sectionHeading("Purchase Order Section", "linear-gradient(90deg,#7c3aed,#9333ea)")}
    ${card("PO Analytics (From PO Tab)", "Received and Pending status (%) from custom_po_item linked purchase flow", poAnalyticsSection(data.custom_po_analytics || {}))}
    ${card("Purchase Flow Tracker", "PO + Purchase Receipt + Purchase Invoice in one row with PO cost", purchaseFlowTable(data.purchase_flow_rows || []))}
    ${card("Material Shortage & Purchase Suggestion", "Grouped by Item Group and merged same raw material", materialShortageTable(data.material_shortage || []))}

    ${sectionHeading("Dispatch Section", "linear-gradient(90deg,#ea580c,#f97316)")}
    ${card("Order Item Summary", "Ordered, delivered, invoiced and pending quantity by item", orderItemSummaryTable(data.order_item_summary || []))}
    ${card("Delivery & Billing", "Delivery Note -> Invoices, click document number for popup detail", deliveryHierarchy(data.sales_fulfillment_hierarchy||[]))}
    ${card("Delivery Risk Prediction", "Delivery delay warning based on completion and delivery date", deliveryPredictionCard(data.delivery_prediction || {}))}

    ${sectionHeading("BOM and Raw Material Section", "linear-gradient(90deg,#0891b2,#06b6d4)")}
    ${card("BOM & Raw Materials", "Active default BOM only, grouped Item -> BOM -> Raw Materials", bomTree(data.bom_tree||[]))}
  `;
}



function bindSectionToggles($wrap){
  $wrap.find('[data-section-toggle="1"]').off('click').on('click', function(){
    const key = $(this).attr('data-section-key');
    const $body = $wrap.find(`[data-section-body="${key}"]`);
    const $icon = $(this).find('[data-section-icon]');
    $body.toggle();
    $icon.text($body.is(':visible') ? '▾' : '▸');
  });

  $wrap.find('[data-section-expand="1"]').off('click').on('click', function(e){
    e.stopPropagation();
    const key = $(this).attr('data-section-key');
    const $body = $wrap.find(`[data-section-body="${key}"]`);
    $body.show();
    $wrap.find(`[data-section-toggle="1"][data-section-key="${key}"] [data-section-icon]`).text('▾');
  });

  $wrap.find('[data-section-collapse="1"]').off('click').on('click', function(e){
    e.stopPropagation();
    const key = $(this).attr('data-section-key');
    const $body = $wrap.find(`[data-section-body="${key}"]`);
    $body.hide();
    $wrap.find(`[data-section-toggle="1"][data-section-key="${key}"] [data-section-icon]`).text('▸');
  });
}

function sectionBlock(key, title, color, content, show=true){
  return `
    <div style="margin:14px 0 8px 0;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
      <div data-section-toggle="1" data-section-key="${esc(key)}" style="cursor:pointer;padding:10px 12px;background:${color};color:#fff;font-size:14px;font-weight:900;display:flex;justify-content:space-between;align-items:center;">
        <div><span data-section-icon>${show ? '▾' : '▸'}</span> ${esc(title)}</div>
        <div style="display:flex;gap:8px;">
          <button type="button" data-section-expand="1" data-section-key="${esc(key)}" class="btn btn-xs" style="background:rgba(255,255,255,.2);border:0;color:#fff;">Expand</button>
          <button type="button" data-section-collapse="1" data-section-key="${esc(key)}" class="btn btn-xs" style="background:rgba(255,255,255,.2);border:0;color:#fff;">Collapse</button>
        </div>
      </div>
      <div data-section-body="${esc(key)}" style="display:${show ? 'block' : 'none'};padding-top:8px;">
        ${content}
      </div>
    </div>
  `;
}

function materialShortageTable(rows){
  rows = rows || [];
  if(!rows.length){
    return `<div class="text-muted">No grouped shortage found.</div>`;
  }

  const groupMap = {};
  rows.forEach((r) => {
    const g = r.item_group || 'Uncategorized';
    if (!groupMap[g]) groupMap[g] = [];
    groupMap[g].push(r);
  });

  const groups = Object.keys(groupMap).sort();
  let body = '';
  groups.forEach((g) => {
    body += `<tr><td colspan="6" style="font-weight:900;background:#eef2ff;color:#1e3a8a;">${esc(g)}</td></tr>`;
    (groupMap[g] || []).forEach((r) => {
      body += `
        <tr>
          <td>${esc(r.item_code || '')}</td>
          <td style="text-align:right;">${flt(r.qty_per_bom)}</td>
          <td style="text-align:right;">${flt(r.required_qty)}</td>
          <td style="text-align:right;">${flt(r.stock_qty)}</td>
          <td style="text-align:right;" class="${Number(r.shortage_qty||0)>0?'so-danger':'so-success'}">${flt(r.shortage_qty)}</td>
          <td style="text-align:right;" class="${Number(r.purchase_suggestion_qty||0)>0?'so-warning':'so-success'}">${flt(r.purchase_suggestion_qty)}</td>
        </tr>
      `;
    });
  });

  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead>
        <tr>
          <th>Raw Material</th>
          <th style="width:120px;text-align:right;">Total Qty/BOM</th>
          <th style="width:140px;text-align:right;">Total Required</th>
          <th style="width:120px;text-align:right;">Total Stock</th>
          <th style="width:120px;text-align:right;">Total Shortage</th>
          <th style="width:170px;text-align:right;">Purchase Suggestion</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function buildDashboard(frm, data){
  const totals = data.production_totals || {};
  return `
    ${css()}
    <div class="so-hdr">
      <div class="so-title">Sales Order Connection Report</div>
      <div class="so-sub">Sales Order: <b>${esc(frm.doc.name)}</b></div>
      ${kpis(totals)}
    </div>

    ${sectionBlock('profit', 'Profit and Loss Section', 'linear-gradient(90deg,#0f766e,#14b8a6)', `
      ${card("Profit Dashboard", "Estimated cost from default BOM and sales amount", `
        ${profitSummaryCard(data.profit_summary || {})}
        <div style="margin-top:12px;font-weight:900;">Profit by Item</div>
        ${profitByItemTable(data.profit_by_item || [])}
      `)}
      ${card("Employee Item-wise Labour Cost", "From per-piece-report > Employee item-wise", labourCostTable(data.labour_cost_employee_item_wise || [], data.labour_cost_summary || {}))}
    `, true)}

    ${sectionBlock('production', 'Production Section', 'linear-gradient(90deg,#1d4ed8,#2563eb)', `
      ${card("Production", "Production Plan -> Work Order -> Job Cards / Operations / Employees / Materials", productionTree(data.production_tree||[]))}
      ${card("Production Timeline", "Work Orders, Delivery Notes and Invoices timeline", timelineView(data.gantt_timeline || []))}
      ${card("Machine Utilization", "Workstation time from Job Card Time Logs", machineUtilization(data.machine_utilization || []))}
      ${card("Employee Efficiency", "Completed quantity vs time spent", employeeEfficiency(data.employee_efficiency || []))}
    `, true)}

    ${sectionBlock('purchase', 'Purchase Order Section', 'linear-gradient(90deg,#7c3aed,#9333ea)', `
      ${card("PO Analytics (From PO Tab)", "Received and Pending status (%) from custom_po_item linked purchase flow", poAnalyticsSection(data.custom_po_analytics || {}))}
      ${card("Purchase Flow Tracker", "PO + Purchase Receipt + Purchase Invoice in one row with PO cost", purchaseFlowTable(data.purchase_flow_rows || []))}
      ${card("Material Shortage & Purchase Suggestion", "Grouped by Item Group with child raw materials", materialShortageTable(data.material_shortage || []))}
    `, true)}

    ${sectionBlock('dispatch', 'Dispatch Section', 'linear-gradient(90deg,#ea580c,#f97316)', `
      ${card("Order Item Summary", "Ordered, delivered, invoiced and pending quantity by item", orderItemSummaryTable(data.order_item_summary || []))}
      ${card("Delivery & Billing", "Delivery Note -> Invoices, click document number for popup detail", deliveryHierarchy(data.sales_fulfillment_hierarchy||[]))}
      ${card("Delivery Risk Prediction", "Delivery delay warning based on completion and delivery date", deliveryPredictionCard(data.delivery_prediction || {}))}
    `, true)}

    ${sectionBlock('bom', 'BOM and Raw Material Section', 'linear-gradient(90deg,#0891b2,#06b6d4)', `
      ${card("BOM & Raw Materials", "Active default BOM only, grouped Item -> BOM -> Raw Materials", bomTree(data.bom_tree||[]))}
    `, false)}
  `;
}


function sectionBlock(key, title, color, content, show=true){
  return `
    <div style="margin:14px 0 8px 0;border-radius:12px;overflow:hidden;border:1px solid #cbd5e1;">
      <div data-section-toggle="1" data-section-key="${esc(key)}" style="cursor:pointer;padding:10px 12px;background:${color};color:#fff;font-size:14px;font-weight:900;display:flex;justify-content:space-between;align-items:center;">
        <div><span data-section-icon>${show ? '▾' : '▸'}</span> ${esc(title)}</div>
        <div style="display:flex;gap:8px;">
          <button type="button" data-section-expand="1" data-section-key="${esc(key)}" class="btn btn-xs" style="background:#111827;border:1px solid #0b1220;color:#fff;font-weight:700;">Expand</button>
          <button type="button" data-section-collapse="1" data-section-key="${esc(key)}" class="btn btn-xs" style="background:#111827;border:1px solid #0b1220;color:#fff;font-weight:700;">Collapse</button>
        </div>
      </div>
      <div data-section-body="${esc(key)}" style="display:${show ? 'block' : 'none'};padding-top:8px;">
        ${content}
      </div>
    </div>
  `;
}

function materialShortageTable(rows){
  rows = rows || [];
  if(!rows.length){
    return `<div class="text-muted">No grouped shortage found.</div>`;
  }

  const groupMap = {};
  rows.forEach((r) => {
    const g = r.item_group || 'Uncategorized';
    if (!groupMap[g]) groupMap[g] = [];
    groupMap[g].push(r);
  });

  const groups = Object.keys(groupMap).sort();
  let body = '';
  groups.forEach((g) => {
    body += `<tr><td colspan="9" style="font-weight:900;background:#eef2ff;color:#1e3a8a;">${esc(g)}</td></tr>`;
    (groupMap[g] || []).forEach((r) => {
      body += `
        <tr>
          <td>${esc(r.item_code || '')}</td>
          <td style="text-align:right;">${flt(r.qty_per_bom)}</td>
          <td style="text-align:right;">${flt(r.required_qty)}</td>
          <td style="text-align:right;">${flt(r.stock_qty)}</td>
          <td style="text-align:right;" class="${Number(r.shortage_qty||0)>0?'so-danger':'so-success'}">${flt(r.shortage_qty)}</td>
          <td style="text-align:right;" class="${Number(r.purchase_suggestion_qty||0)>0?'so-warning':'so-success'}">${flt(r.purchase_suggestion_qty)}</td>
          <td style="text-align:right;">${flt(r.po_qty)}</td>
          <td style="text-align:right;">${flt(r.pr_qty)}</td>
          <td style="text-align:right;" class="${Number(r.pending_po_qty||0)>0?'so-warning':'so-success'}">${flt(r.pending_po_qty)}</td>
        </tr>
      `;
    });
  });

  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead>
        <tr>
          <th>Raw Material</th>
          <th style="width:120px;text-align:right;">Qty/BOM</th>
          <th style="width:120px;text-align:right;">Required</th>
          <th style="width:120px;text-align:right;">Stock</th>
          <th style="width:120px;text-align:right;">Shortage</th>
          <th style="width:140px;text-align:right;">Purchase Suggestion</th>
          <th style="width:110px;text-align:right;">PO Qty</th>
          <th style="width:110px;text-align:right;">PR Qty</th>
          <th style="width:130px;text-align:right;">Pending PO Qty</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function poItemGroupTable(rows){
  rows = rows || [];
  if(!rows.length){
    return `<div class="text-muted">No item-group analytics found.</div>`;
  }
  const groupMap = {};
  rows.forEach((r)=>{
    const g = r.item_group || 'Uncategorized';
    if(!groupMap[g]) groupMap[g] = [];
    groupMap[g].push(r);
  });

  let body = '';
  Object.keys(groupMap).sort().forEach((g)=>{
    body += `<tr><td colspan="9" style="font-weight:900;background:#eef2ff;color:#1e3a8a;">${esc(g)}</td></tr>`;
    groupMap[g].forEach((r)=>{
      body += `
        <tr>
          <td class="muted">${esc(r.items || "-")}</td>
          <td>${esc(r.supplier_names || "-")}</td>
          <td>${esc(r.order_numbers || "-")}</td>
          <td style="text-align:right;">${flt(r.ordered_qty)}</td>
          <td style="text-align:right;">${flt(r.received_qty)}</td>
          <td style="text-align:right;">${flt(r.pending_qty)}</td>
          <td style="text-align:right;">${esc(r.received_pct || 0)}%</td>
          <td style="text-align:right;">${esc(r.pending_pct || 0)}%</td>
          <td>${badge(r.po_status || '')}</td>
        </tr>
      `;
    });
  });

  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
    <thead><tr>
      <th>Items</th>
      <th>Supplier Name</th>
      <th>Order Number</th>
      <th style="text-align:right;">Ordered Qty</th>
      <th style="text-align:right;">Received Qty</th>
      <th style="text-align:right;">Pending Qty</th>
      <th style="text-align:right;">Received %</th>
      <th style="text-align:right;">Pending %</th>
      <th>PO Status</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function poAnalyticsSection(data){
  const d = data || {};
  return `
    ${poAnalyticsOverviewCard(d.overview || {})}
    <div style="margin-top:12px;font-weight:900;">PO-Wise Detail Status</div>
    ${poStatusDetailTable(d.po_status_rows || [])}
    <div style="margin-top:12px;font-weight:900;">Item Group-Wise PO Status</div>
    ${poItemGroupTable(d.item_group_rows || [])}
  `;
}

function bomTree(tree){
  tree = tree || [];
  if(!tree.length) return `<div class="text-muted">No Active BOM found.</div>`;

  let html = "";
  tree.forEach((itemNode,i)=>{
    (itemNode.boms||[]).forEach((b,j)=>{
      const key = `bom_mix_${i}_${j}`;
      const rms = b.raw_materials || [];
      const rmBody = rms.length ? rms.map(x=>`
        <tr>
          <td>${esc(x.item_code||"")}</td>
          <td style="text-align:right;">${flt(x.bom_qty)}</td>
          <td style="text-align:right;">${flt(x.required_qty)}</td>
          <td style="text-align:right;">${flt(x.stock_qty)}</td>
          <td style="text-align:right;" class="${Number(x.shortage_qty||0)>0?'so-danger':'so-success'}">${flt(x.shortage_qty)}</td>
        </tr>
      `).join("") : `<tr><td colspan="5" class="text-muted">No BOM Items.</td></tr>`;

      html += toggleHeader(`Item: ${esc(itemNode.item_code)} | BOM: ${esc(b.bom)}`, `${flt(itemNode.order_qty || 0)} SO Qty • ${rms.length} RM`, key);
      html += panel(`
        <div class="table-responsive">
          <table class="table table-bordered so-table" style="margin:0;">
            <thead>
              <tr>
                <th>Raw Material</th>
                <th style="width:140px;text-align:right;">Qty / BOM</th>
                <th style="width:150px;text-align:right;">Required for Order</th>
                <th style="width:120px;text-align:right;">Stock</th>
                <th style="width:120px;text-align:right;">Shortage</th>
              </tr>
            </thead>
            <tbody>${rmBody}</tbody>
          </table>
        </div>
      `, key, false);
    });
  });

  return html;
}

function profitGroupPurchaseTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.item_group || 'Uncategorized')}</td>
      <td style="text-align:right;">${fmtCurrency(r.po_amount || 0)}</td>
    </tr>
  `).join("") : `<tr><td colspan="2" class="text-muted">No purchase-order amount found for this Sales Order.</td></tr>`;
  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
    <thead><tr><th>Item Group</th><th style="text-align:right;">PO Amount</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function buildDashboard(frm, data){
  const totals = data.production_totals || {};
  return `
    ${css()}
    <div class="so-hdr">
      <div class="so-title">Sales Order Connection Report</div>
      <div class="so-sub">Sales Order: <b>${esc(frm.doc.name)}</b></div>
      ${kpis(totals)}
    </div>

    ${sectionBlock('profit', 'Profit and Loss Section', 'linear-gradient(90deg,#0f766e,#14b8a6)', `
      ${card("Profit Dashboard", "Estimated cost from default BOM and sales amount", `
        ${profitSummaryCard(data.profit_summary || {})}
        <div style="margin-top:12px;font-weight:900;">Profit by Item</div>
        ${profitByItemTable(data.profit_by_item || [])}
      `)}
      ${card("PO Amount by Item Group", "Purchase Order amount summary linked with this Sales Order", profitGroupPurchaseTable(data.po_item_group_summary || []))}
      ${card("Employee Item-wise Labour Cost", "From per-piece-report > Employee item-wise", labourCostTable(data.labour_cost_employee_item_wise || [], data.labour_cost_summary || {}))}
    `, false)}

    ${sectionBlock('purchase', 'Purchase Order Section', 'linear-gradient(90deg,#7c3aed,#9333ea)', `
      ${card("PO Analytics (From PO Tab)", "Received and Pending status (%) from custom_po_item linked purchase flow", poAnalyticsSection(data.custom_po_analytics || {}))}
      ${card("Purchase Flow Tracker", "PO + Purchase Receipt + Purchase Invoice in one row with PO cost", purchaseFlowTable(data.purchase_flow_rows || []))}
      ${card("Material Shortage & Purchase Suggestion", "Grouped by Item Group with PO and PR planning progress", materialShortageTable(data.material_shortage || []))}
    `, false)}

    ${sectionBlock('production', 'Production Section', 'linear-gradient(90deg,#7a3e00,#a16207)', `
      ${card("Production", "Production Plan -> Work Order -> Job Cards / Operations / Employees / Materials", productionTree(data.production_tree||[]))}
      ${card("Production Timeline", "Work Orders, Delivery Notes and Invoices timeline", timelineView(data.gantt_timeline || []))}
      ${card("Machine Utilization", "Workstation time from Job Card Time Logs", machineUtilization(data.machine_utilization || []))}
      ${card("Employee Efficiency", "Completed quantity vs time spent", employeeEfficiency(data.employee_efficiency || []))}
    `, false)}

    ${sectionBlock('bom', 'BOM and Raw Material Section', 'linear-gradient(90deg,#0891b2,#06b6d4)', `
      ${card("BOM & Raw Materials", "Item and BOM merged for easier reading", bomTree(data.bom_tree||[]))}
    `, false)}

    ${sectionBlock('dispatch', 'Dispatch Section', 'linear-gradient(90deg,#ea580c,#f97316)', `
      ${card("Order Item Summary", "Ordered, delivered, invoiced and pending quantity by item", orderItemSummaryTable(data.order_item_summary || []))}
      ${card("Delivery & Billing", "Delivery Note -> Invoices, click document number for popup detail", deliveryHierarchy(data.sales_fulfillment_hierarchy||[]))}
      ${card("Delivery Risk Prediction", "Delivery delay warning based on completion and delivery date", deliveryPredictionCard(data.delivery_prediction || {}))}
    `, false)}
  `;
}


function labourCostTable(rows, summary){
  rows = rows || [];
  summary = summary || {};
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.employee || "-")}</td>
      <td>${esc(r.name1 || "-")}</td>
      <td>${esc(r.product || "-")}</td>
      <td>${esc(r.process_type || "-")}</td>
      <td style="text-align:right;">${flt(r.qty)}</td>
      <td style="text-align:right;">${flt(r.rate)}</td>
      <td style="text-align:right;">${fmtCurrency(r.labour_cost || 0)}</td>
    </tr>
  `).join("") : `<tr><td colspan="7" class="text-muted">No employee item-wise labour cost for this Sales Order.</td></tr>`;

  return `
    <div style="display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:12px;margin-bottom:12px;">
      <div class="so-mini-card" style="height:132px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:14px 16px;">
        <div class="so-mini-title">LABOUR QTY</div>
        <div class="so-mini-val" style="font-size:30px;line-height:1.1;">${flt(summary.total_qty || 0)}</div>
      </div>
      <div class="so-mini-card" style="height:132px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:14px 16px;">
        <div class="so-mini-title">TOTAL LABOUR COST</div>
        <div class="so-mini-val" style="font-size:30px;line-height:1.1;">${fmtCurrency(summary.total_cost || 0)}</div>
      </div>
    </div>
    <div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
      <thead><tr><th>Employee</th><th>Name</th><th>Item</th><th>Process</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Labour Cost</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>
  `;
}

function poItemGroupTable(rows){
  rows = rows || [];
  if(!rows.length){
    return `<div class="text-muted">No item-group analytics found.</div>`;
  }
  const groupMap = {};
  rows.forEach((r)=>{
    const g = r.item_group || 'Uncategorized';
    if(!groupMap[g]) groupMap[g] = [];
    groupMap[g].push(r);
  });

  let body = '';
  Object.keys(groupMap).sort().forEach((g)=>{
    body += `<tr><td colspan="9" style="font-weight:900;background:#eef2ff;color:#1e3a8a;">${esc(g)}</td></tr>`;
    (groupMap[g] || []).sort((a,b)=>{
      const ai = String(a.item || "");
      const bi = String(b.item || "");
      const ao = String(a.order_number || "");
      const bo = String(b.order_number || "");
      const as = String(a.supplier_name || "");
      const bs = String(b.supplier_name || "");
      return ai.localeCompare(bi) || ao.localeCompare(bo) || as.localeCompare(bs);
    }).forEach((r)=>{
      body += `
        <tr>
          <td>${esc(r.item || "-")}</td>
          <td>${esc(r.supplier_name || "-")}</td>
          <td>${r.order_number ? docPopupLink("Purchase Order", r.order_number) : `<span class="text-muted">-</span>`}</td>
          <td style="text-align:right;">${flt(r.ordered_qty)}</td>
          <td style="text-align:right;">${flt(r.received_qty)}</td>
          <td style="text-align:right;">${flt(r.pending_qty)}</td>
          <td style="text-align:right;">${esc(r.received_pct || 0)}%</td>
          <td style="text-align:right;">${esc(r.pending_pct || 0)}%</td>
          <td>${badge(r.po_status || '')}</td>
        </tr>
      `;
    });
  });

  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
    <thead><tr>
      <th>Item</th>
      <th>Supplier Name</th>
      <th>Order Number</th>
      <th style="text-align:right;">Ordered Qty</th>
      <th style="text-align:right;">Received Qty</th>
      <th style="text-align:right;">Pending Qty</th>
      <th style="text-align:right;">Received %</th>
      <th style="text-align:right;">Pending %</th>
      <th>PO Status</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function materialShortageTable(rows){
  rows = rows || [];
  if(!rows.length){
    return `<div class="text-muted">No grouped shortage found.</div>`;
  }

  const groupMap = {};
  rows.forEach((r) => {
    const g = r.item_group || 'Uncategorized';
    if (!groupMap[g]) groupMap[g] = [];
    groupMap[g].push(r);
  });

  const groups = Object.keys(groupMap).sort();
  let body = '';
  groups.forEach((g) => {
    body += `<tr><td colspan="9" style="font-weight:900;background:#eef2ff;color:#1e3a8a;">${esc(g)}</td></tr>`;
    (groupMap[g] || []).forEach((r) => {
      body += `
        <tr>
          <td>${esc(r.item_code || '')}</td>
          <td style="text-align:right;">${flt(r.qty_per_bom)}</td>
          <td style="text-align:right;">${flt(r.required_qty)}</td>
          <td style="text-align:right;background:#f1f5f9;">${(Number(r.stock_qty || 0)).toFixed(0)}</td>
          <td style="text-align:right;" class="${Number(r.shortage_qty||0)>0?'so-danger':'so-success'}">${flt(r.shortage_qty)}</td>
          <td style="text-align:right;" class="${Number(r.purchase_suggestion_qty||0)>0?'so-warning':'so-success'}">${flt(r.purchase_suggestion_qty)}</td>
          <td style="text-align:right;">${flt(r.po_qty)}</td>
          <td style="text-align:right;">${flt(r.pr_qty)}</td>
          <td style="text-align:right;" class="${Number(r.pending_po_qty||0)>0?'so-warning':'so-success'}">${flt(r.pending_po_qty)}</td>
        </tr>
      `;
    });
  });

  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead>
        <tr>
          <th>Raw Material</th>
          <th style="width:120px;text-align:right;">Qty/BOM</th>
          <th style="width:130px;text-align:right;">Required</th>
          <th style="width:100px;text-align:right;">Stock</th>
          <th style="width:120px;text-align:right;">Shortage</th>
          <th style="width:150px;text-align:right;">Purchase Suggestion</th>
          <th style="width:100px;text-align:right;">PO Qty</th>
          <th style="width:100px;text-align:right;">PR Qty</th>
          <th style="width:130px;text-align:right;">Pending PO Qty</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function bomTree(tree){
  tree = tree || [];
  if(!tree.length) return `<div class="text-muted">No Active BOM found.</div>`;

  let html = "";
  tree.forEach((itemNode,i)=>{
    (itemNode.boms||[]).forEach((b,j)=>{
      const key = `bom_mix_${i}_${j}`;
      const rms = b.raw_materials || [];
      const rmBody = rms.length ? rms.map(x=>`
        <tr>
          <td>${esc(x.item_code||"")}</td>
          <td style="text-align:right;">${flt(x.bom_qty)}</td>
          <td style="text-align:right;">${flt(x.required_qty)}</td>
          <td style="text-align:right;">${flt(x.stock_qty)}</td>
          <td style="text-align:right;" class="${Number(x.shortage_qty||0)>0?'so-danger':'so-success'}">${flt(x.shortage_qty)}</td>
        </tr>
      `).join("") : `<tr><td colspan="5" class="text-muted">No BOM Items.</td></tr>`;

      const ttl = `<span style="color:#111827;font-weight:900;">Item: ${esc(itemNode.item_code)}</span> <span style="color:#6b7280;">|</span> <span style="color:#b45309;font-weight:900;">BOM: ${esc(b.bom)}</span>`;
      html += toggleHeader(ttl, `${flt(itemNode.order_qty || 0)} SO Qty • ${rms.length} RM`, key);
      html += panel(`
        <div class="table-responsive">
          <table class="table table-bordered so-table" style="margin:0;">
            <thead>
              <tr>
                <th>Raw Material</th>
                <th style="width:140px;text-align:right;">Qty / BOM</th>
                <th style="width:150px;text-align:right;">Required for Order</th>
                <th style="width:120px;text-align:right;">Stock</th>
                <th style="width:120px;text-align:right;">Shortage</th>
              </tr>
            </thead>
            <tbody>${rmBody}</tbody>
          </table>
        </div>
      `, key, false);
    });
  });

  return html;
}

function poTotalAmount(rows){
  rows = rows || [];
  return rows.reduce((a,r)=>a + Number(r.po_amount || 0), 0);
}

function buildDashboard(frm, data){
  const totals = data.production_totals || {};
  const poTotal = poTotalAmount(data.po_item_group_summary || []);
  return `
    ${css()}
    <div class="so-hdr">
      <div class="so-title">Sales Order Connection Report</div>
      <div class="so-sub">Sales Order: <b>${esc(frm.doc.name)}</b></div>
      ${kpis(totals)}
    </div>

    ${sectionBlock('profit', 'Profit and Loss Section', 'linear-gradient(90deg,#0f766e,#14b8a6)', `
      ${card("Profit Dashboard", "Estimated cost from default BOM and sales amount", `
        ${profitSummaryCard(data.profit_summary || {})}
        <div style="margin-top:12px;font-weight:900;">Profit by Item</div>
        ${profitByItemTable(data.profit_by_item || [])}
      `)}
      ${card("Purchase Order Total Amount", "Total amount of Purchase Orders linked with this Sales Order", `<div class="so-mini-card"><div class="so-mini-title">TOTAL PO AMOUNT</div><div class="so-mini-val" style="font-size:26px;">${fmtCurrency(poTotal)}</div></div>`)}
      ${card("PO Amount by Item Group", "Purchase Order amount summary linked with this Sales Order", profitGroupPurchaseTable(data.po_item_group_summary || []))}
      ${card("Employee Item-wise Labour Cost", "From per-piece-report > Employee item-wise", labourCostTable(data.labour_cost_employee_item_wise || [], data.labour_cost_summary || {}))}
    `, false)}

    ${sectionBlock('purchase', 'Purchase Order Section', 'linear-gradient(90deg,#7c3aed,#9333ea)', `
      ${card("PO Analytics (From PO Tab)", "Received and Pending status (%) from custom_po_item linked purchase flow", poAnalyticsSection(data.custom_po_analytics || {}))}
      ${card("Purchase Flow Tracker", "PO + Purchase Receipt + Purchase Invoice in one row with PO cost", purchaseFlowTable(data.purchase_flow_rows || []))}
      ${card("Material Shortage & Purchase Suggestion", "Grouped by Item Group with PO and PR planning progress", materialShortageTable(data.material_shortage || []))}
    `, false)}

    ${sectionBlock('production', 'Production Section', 'linear-gradient(90deg,#7a3e00,#a16207)', `
      ${card("Production", "Production Plan -> Work Order -> Job Cards / Operations / Employees / Materials", productionTree(data.production_tree||[]))}
      ${card("Production Timeline", "Work Orders, Delivery Notes and Invoices timeline", timelineView(data.gantt_timeline || []))}
      ${card("Machine Utilization", "Workstation time from Job Card Time Logs", machineUtilization(data.machine_utilization || []))}
      ${card("Employee Efficiency", "Completed quantity vs time spent", employeeEfficiency(data.employee_efficiency || []))}
    `, false)}

    ${sectionBlock('bom', 'BOM and Raw Material Section', 'linear-gradient(90deg,#0891b2,#06b6d4)', `
      ${card("BOM & Raw Materials", "Item and BOM merged for easier reading", bomTree(data.bom_tree||[]))}
    `, false)}

    ${sectionBlock('dispatch', 'Dispatch Section', 'linear-gradient(90deg,#ea580c,#f97316)', `
      ${card("Order Item Summary", "Ordered, delivered, invoiced and pending quantity by item", orderItemSummaryTable(data.order_item_summary || []))}
      ${card("Delivery & Billing", "Delivery Note -> Invoices, click document number for popup detail", deliveryHierarchy(data.sales_fulfillment_hierarchy||[]))}
      ${card("Delivery Risk Prediction", "Delivery delay warning based on completion and delivery date", deliveryPredictionCard(data.delivery_prediction || {}))}
    `, false)}
  `;
}

function create_po_from_rows(frm, row_names) {
  frappe.call({
    method: "order_tracking_report.api.create_po_from_sales_order_po_tab",
    args: {
      source_name: frm.doc.name,
      row_names: (row_names || []).join(","),
    },
    freeze: true,
    freeze_message: __("Creating Purchase Order..."),
    callback(r) {
      const created = Array.isArray(r.message) ? r.message : [];
      if (!created.length) {
        frm.reload_doc();
        return;
      }

      frm.reload_doc();

      if (created.length === 1) {
        frappe.set_route("Form", "Purchase Order", created[0].name);
        return;
      }

      let html = "<ul>";
      created.forEach((row) => {
        html += `<li><a href="/app/purchase-order/${encodeURIComponent(row.name)}" target="_blank">${row.name}</a> - ${row.supplier}</li>`;
      });
      html += "</ul>";

      frappe.msgprint({
        title: __("Purchase Orders Created"),
        message: html,
      });
    },
  });
}

function get_selected_pending_rows(frm) {
  return (frm.doc.custom_po_item || []).filter((row) => cint(row.select_for_po) && !row.purchase_order);
}

function validate_rows_before_create(rows) {
  const errors = [];
  (rows || []).forEach((row) => {
    if (!row.item) {
      errors.push(__("Row #{0}: Item is required", [row.idx]));
    }
    if (flt(row.qty) <= 0) {
      errors.push(__("Row #{0}: Qty must be greater than zero", [row.idx]));
    }
  });
  return errors;
}

function open_po_item_data_entry(frm, prefill) {
  if (frm.doc.docstatus === 2) {
    frappe.msgprint(__("Cancelled Sales Order is not allowed."));
    return;
  }

  let items_data = [];
  let item_map = {};
  let last_item_code = "";
  const toNum = (v) => {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const s = String(v).replace(/,/g, "").trim();
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  const toInt = (v) => (cint(v) ? 1 : 0);
  const stripHtml = (v) => {
    const s = String(v || "");
    return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  };

  const dialog = new frappe.ui.Dialog({
    title: __("PO Item Data Entry"),
    size: "extra-large",
    fields: [
      { fieldname: "header_html", fieldtype: "HTML" },
      { fieldname: "meta_html", fieldtype: "HTML" },
      { fieldtype: "Section Break", label: __("Item Filters") },
      { label: __("Supplier"), fieldname: "supplier", fieldtype: "Link", options: "Supplier", reqd: 1 },
      { fieldtype: "Column Break" },
      { label: __("Item Group"), fieldname: "item_group", fieldtype: "Link", options: "Item Group" },
      { fieldtype: "Section Break", label: __("Quick Add") },
      { label: __("Item"), fieldname: "item_code", fieldtype: "Link", options: "Item", reqd: 1 },
      { fieldtype: "Column Break" },
      { label: __("Qty"), fieldname: "qty", fieldtype: "Float", default: 1, reqd: 1, precision: 0 },
      { fieldtype: "Column Break" },
      { label: __("Select for PO"), fieldname: "select_for_po", fieldtype: "Check", default: 1 },
      { fieldtype: "Column Break" },
      { label: __("Description"), fieldname: "descriptions", fieldtype: "Data" },
      { fieldtype: "Column Break" },
      { label: __("Comments"), fieldname: "comments", fieldtype: "Data" },
      { fieldtype: "Column Break" },
      {
        fieldtype: "Button",
        label: __("Add Row (Enter)"),
        fieldname: "add_item_btn",
      },
      { fieldtype: "Section Break", label: __("Rows to Insert") },
      {
        fieldname: "items_table",
        fieldtype: "Table",
        cannot_add_rows: true,
        in_place_edit: false,
        data: [],
        fields: [
          { fieldtype: "Data", fieldname: "item_code", label: __("Item"), in_list_view: 1, read_only: 1 },
          { fieldtype: "Data", fieldname: "item_name", label: __("Item Name"), in_list_view: 1, read_only: 1 },
          { fieldtype: "Data", fieldname: "supplier", label: __("Supplier"), in_list_view: 1, read_only: 1 },
          { fieldtype: "Float", fieldname: "qty", label: __("Qty"), in_list_view: 1 },
          { fieldtype: "Check", fieldname: "select_for_po", label: __("Select"), in_list_view: 1 },
          { fieldtype: "Data", fieldname: "descriptions", label: __("Description"), in_list_view: 1 },
          { fieldtype: "Data", fieldname: "comments", label: __("Comments"), in_list_view: 1 },
        ],
      },
    ],
  });

  dialog.fields_dict.warehouse.get_query = () => ({
    filters: {
      company: frm.doc.company || undefined,
      disabled: 0,
    },
  });

  dialog.fields_dict.header_html.$wrapper.html(`
    <div style="display:flex;gap:12px;align-items:center;padding:12px;border-radius:14px;background:linear-gradient(135deg,#f1f5f9,#e2e8f0);border:1px solid #cbd5e1;margin-bottom:10px">
      <div style="width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#fff;font-size:18px">PO</div>
      <div style="flex:1">
        <div style="font-weight:900;font-size:16px">${frappe.utils.escape_html(__("PO Item Data Entry"))}</div>
        <div style="color:#475569;font-size:12px">${frappe.utils.escape_html(__("Add multiple rows to PO Item table from one screen."))}</div>
      </div>
      <div style="font-size:12px;color:#475569">${frappe.utils.escape_html(__("Sales Order"))}: <b>${frappe.utils.escape_html(frm.doc.name || __("New"))}</b></div>
    </div>
  `);

  function render_meta() {
    const rowCount = items_data.length;
    const totalQty = items_data.reduce((a, r) => a + toNum(r.qty), 0);
    dialog.fields_dict.meta_html.$wrapper.html(`
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 10px;">
        <span style="padding:4px 10px;border-radius:999px;background:#e2e8f0;color:#0f172a;font-weight:700;font-size:12px;">Rows: ${rowCount}</span>
        <span style="padding:4px 10px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-weight:700;font-size:12px;">Total Qty: ${frappe.format(totalQty, { fieldtype: "Float" })}</span>
        <span style="padding:4px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:700;font-size:12px;">Ready for Insert</span>
      </div>
    `);
  }

  async function load_items() {
    const item_group = dialog.get_value("item_group");
    const filters = { disabled: 0, is_purchase_item: 1 };
    if (item_group) filters.item_group = item_group;

    const r = await frappe.call({
      method: "frappe.client.get_list",
      args: {
        doctype: "Item",
        fields: ["name", "item_name", "description"],
        filters,
        order_by: "name asc",
        limit_page_length: 500,
      },
    });

    const rows = (r && r.message) ? r.message : [];
    item_map = {};
    const codes = rows.map((d) => {
      item_map[d.name] = d;
      return d.name;
    });

    const item_control = dialog.fields_dict.item_code;
    item_control.get_query = () => ({ filters });
    if (typeof item_control.set_data === "function") item_control.set_data(codes);
    item_control.refresh();
  }

  function refresh_grid() {
    dialog.fields_dict.items_table.df.data = items_data;
    if (dialog.fields_dict.items_table.grid) {
      dialog.fields_dict.items_table.grid.df.data = items_data;
    }
    dialog.fields_dict.items_table.grid.refresh();
    render_meta();
  }

  function get_dialog_values() {
    return {
      supplier: dialog.get_value("supplier") || "",
      item_code: dialog.get_value("item_code") || "",
      qty: toNum(dialog.get_value("qty")),
      descriptions: dialog.get_value("descriptions") || "",
      comments: dialog.get_value("comments") || "",
      select_for_po: toInt(dialog.get_value("select_for_po")),
    };
  }

  async function add_row() {
    const v = get_dialog_values();
    if (!v.item_code) {
      frappe.show_alert({ message: __("Select Item"), indicator: "orange" });
      return;
    }
    if (!v.supplier) {
      frappe.show_alert({ message: __("Select Supplier"), indicator: "orange" });
      return;
    }
    if (toNum(v.qty) <= 0) {
      frappe.msgprint(__("Qty must be greater than zero"));
      return;
    }

    let item_meta = item_map[v.item_code] || null;
    if (!item_meta) {
      const r = await frappe.db.get_value("Item", v.item_code, ["item_name", "description"]);
      const msg = (r && r.message) ? r.message : {};
      item_meta = { name: v.item_code, item_name: msg.item_name || "", description: msg.description || "" };
      item_map[v.item_code] = item_meta;
    }

    items_data.push({
      item_code: v.item_code,
      item_name: item_meta.item_name || "",
      supplier: v.supplier || "",
      qty: toNum(v.qty),
      descriptions: v.descriptions || stripHtml(item_meta.description || ""),
      comments: v.comments || "",
      select_for_po: toInt(v.select_for_po),
    });

    refresh_grid();
    dialog.set_value("item_code", "");
    dialog.set_value("qty", 1);
    dialog.set_value("descriptions", "");
    dialog.set_value("comments", "");
    setTimeout(() => dialog.fields_dict.item_code.$input.focus(), 20);
  }

  dialog.fields_dict.item_group.df.onchange = function () {
    load_items();
    dialog.set_value("item_code", "");
  };

  dialog.fields_dict.item_code.df.onchange = function () {
    const code = dialog.get_value("item_code");
    if (!code) return;
    const item_meta = item_map[code] || {};
    if (!dialog.get_value("descriptions") && item_meta.description) {
      dialog.set_value("descriptions", stripHtml(item_meta.description));
    }
  };

  dialog.fields_dict.add_item_btn.$input.off("click").on("click", (e) => {
    e.preventDefault();
    add_row();
    return false;
  });
  dialog.$wrapper.on("keydown", (e) => {
    if (e.key !== "Enter") return;
    const in_grid = $(e.target).closest(".grid").length > 0;
    const is_textarea = e.target && e.target.tagName === "TEXTAREA";
    if (in_grid || is_textarea) return;
    e.preventDefault();
    add_row();
  });

  dialog.set_primary_action(__("Insert to PO Item Table"), () => {
    if (!items_data.length) {
      frappe.msgprint(__("Add at least one row."));
      return;
    }
    const missingSupplier = items_data.filter((r) => !(r.supplier || "").trim());
    if (missingSupplier.length) {
      frappe.msgprint(__("Supplier is required for all rows before insert."));
      return;
    }
    items_data.forEach((r) => {
      const row = frm.add_child("custom_po_item");
      row.item = r.item_code;
      row.supplier = r.supplier || "";
      row.qty = toNum(r.qty);
      row.descriptions = r.descriptions || "";
      row.comments = r.comments || "";
      row.select_for_po = toInt(r.select_for_po);
    });
    frm.refresh_field("custom_po_item");
    frappe.show_alert({ message: __("Rows inserted in PO Item table"), indicator: "green" }, 4);
    dialog.hide();
  });

  dialog.show();
  dialog.$wrapper.find(".modal-dialog").css("max-width", "1120px");
  // Compact professional single-line quick add layout
  dialog.$wrapper.find('[data-fieldname="qty"]').closest(".form-column").css("max-width", "140px");
  dialog.$wrapper.find('[data-fieldname="select_for_po"]').closest(".form-column").css("max-width", "140px");
  dialog.$wrapper.find('[data-fieldname="add_item_btn"]').closest(".form-column").css({ "max-width": "180px", "display": "flex", "align-items": "flex-end" });
  dialog.$wrapper.find('[data-fieldname="add_item_btn"] .btn').css({ "width": "100%", "font-weight": "700" });
  setTimeout(() => {
    load_items();
    render_meta();
    if (prefill && typeof prefill === "object") {
      if (prefill.item_code) dialog.set_value("item_code", prefill.item_code);
      if (prefill.qty) dialog.set_value("qty", flt(prefill.qty));
      if (prefill.descriptions) dialog.set_value("descriptions", prefill.descriptions);
      if (typeof prefill.select_for_po !== "undefined") {
        dialog.set_value("select_for_po", cint(prefill.select_for_po) ? 1 : 0);
      }
    }
    dialog.fields_dict.item_code.$input.focus();
  }, 120);
}

frappe.ui.form.on("Sales Order", {
  refresh(frm) {
    // Keep ERPNext native Create menu visible/primary.
    setTimeout(() => {
      if (frm.page && frm.page.set_inner_btn_group_as_primary) {
        frm.page.set_inner_btn_group_as_primary(__("Create"));
      }
    }, 200);

    if (frm.fields_dict.custom_po_item && frm.fields_dict.custom_po_item.grid) {
      const g = frm.fields_dict.custom_po_item.grid;
      g.update_docfield_property("warehouse", "read_only", 0);
      g.update_docfield_property("warehouse", "in_list_view", 1);
      g.update_docfield_property("warehouse", "columns", 2);
      g.update_docfield_property("supplier", "columns", 2);
      g.update_docfield_property("item", "columns", 2);
      g.update_docfield_property("qty", "columns", 2);
    }

    if (frm.doc.docstatus === 2) return;

    frm.add_custom_button(__("PO Item Data Entry"), () => {
      open_po_item_data_entry(frm);
    }, __("PO Tools"));

    if (!frappe.model.can_create("Purchase Order")) return;
    if (!(frm.doc.custom_po_item || []).length) return;

    frm.add_custom_button(__("Purchase Order (Selected Rows)"), () => {
      const selectedPendingRows = get_selected_pending_rows(frm);
      if (!selectedPendingRows.length) {
        frappe.msgprint(__("Select at least one pending row using Select for PO."));
        return;
      }

      const errors = validate_rows_before_create(selectedPendingRows);
      if (errors.length) {
        frappe.msgprint({
          title: __("Cannot Create Purchase Order"),
          indicator: "red",
          message: errors.join("<br>"),
        });
        return;
      }

      create_po_from_rows(frm, selectedPendingRows.map((row) => row.name));
    }, __("PO Tools"));
  },
});

// Final UI overrides (latest requested behavior)
function _int(v) { return Math.round(Number(v || 0)); }
function _n0(v) { return _int(v).toLocaleString(); }
function _money0(v) {
  try { return format_currency(_int(v || 0), null, 0); } catch (e) { return _n0(v); }
}

function bindMaterialShortageCreatePo($wrap, frm){
  $wrap.find("[data-ms-create-po='1']").off("click").on("click", function(e){
    e.preventDefault();
    const item = ($(this).attr("data-item") || "").trim();
    const defaultQty = flt($(this).attr("data-qty") || 0);
    const description = ($(this).attr("data-description") || "").trim();
    const wp = flt($(this).attr("data-wp") || 0);
    const wq = flt($(this).attr("data-wq") || 0);
    if (!item || defaultQty <= 0) {
      frappe.msgprint(__("Invalid row for Create PO."));
      return;
    }
    open_po_item_data_entry(frm, {
      item_code: item,
      qty: defaultQty,
      descriptions: description || item,
      select_for_po: 1,
      custom_wastage_percentage: wp,
      custom_wastage_qty: wq,
    });
  });
}

function open_po_item_data_entry(frm, prefill) {
  if (frm.doc.docstatus === 2) {
    frappe.msgprint(__("Cancelled Sales Order is not allowed."));
    return;
  }

  let items_data = [];
  let item_map = {};
  let last_item_code = "";
  const toNum = (v) => {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const s = String(v).replace(/,/g, "").trim();
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  const toInt = (v) => (cint(v) ? 1 : 0);
  const stripHtml = (v) => String(v || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  const dialog = new frappe.ui.Dialog({
    title: __("PO Item Data Entry"),
    size: "extra-large",
    fields: [
      { fieldname: "header_html", fieldtype: "HTML" },
      { fieldname: "meta_html", fieldtype: "HTML" },
      { fieldtype: "Section Break", label: __("Item Filters") },
      { label: __("Supplier"), fieldname: "supplier", fieldtype: "Link", options: "Supplier", reqd: 1 },
      { fieldtype: "Column Break" },
      { label: __("Item Group"), fieldname: "item_group", fieldtype: "Link", options: "Item Group" },
      { fieldtype: "Column Break" },
      { label: __("Warehouse"), fieldname: "warehouse", fieldtype: "Link", options: "Warehouse" },
      { fieldtype: "Column Break" },
      { label: __("Rate"), fieldname: "rate", fieldtype: "Currency", default: 0 },
      { fieldtype: "Column Break" },
      { label: __("Select for PO"), fieldname: "select_for_po", fieldtype: "Check", default: 1 },
      { fieldtype: "Section Break", label: __("Quick Add") },
      { label: __("Item"), fieldname: "item_code", fieldtype: "Link", options: "Item", reqd: 1 },
      { fieldtype: "Column Break" },
      { label: __("Qty"), fieldname: "qty", fieldtype: "Float", default: 1, reqd: 1, precision: 0 },
      { fieldtype: "Column Break" },
      { label: __("Wastage %"), fieldname: "custom_wastage_percentage", fieldtype: "Float", precision: 2 },
      { fieldtype: "Column Break" },
      { label: __("Wastage Qty"), fieldname: "custom_wastage_qty", fieldtype: "Float", precision: 0, read_only: 1 },
      { fieldtype: "Column Break" },
      { label: __("Extra Qty"), fieldname: "extra_qty", fieldtype: "Float", default: 0, precision: 0 },
      { fieldtype: "Column Break" },
      { label: __("PO Qty"), fieldname: "po_qty", fieldtype: "Float", precision: 0, read_only: 1 },
      { fieldtype: "Section Break" },
      { label: __("Description"), fieldname: "descriptions", fieldtype: "Data" },
      { fieldtype: "Column Break" },
      { label: __("Comments"), fieldname: "comments", fieldtype: "Data" },
      { fieldtype: "Column Break" },
      { fieldtype: "Button", label: __("Add Row (Enter)"), fieldname: "add_item_btn" },
      { fieldtype: "Section Break", label: __("Rows to Insert") },
      {
        fieldname: "items_table",
        fieldtype: "Table",
        cannot_add_rows: true,
        in_place_edit: false,
        data: [],
        fields: [
          { fieldtype: "Data", fieldname: "item_code", label: __("Item"), in_list_view: 1, read_only: 1 },
          { fieldtype: "Data", fieldname: "item_name", label: __("Item Name"), in_list_view: 1, read_only: 1 },
          { fieldtype: "Data", fieldname: "supplier", label: __("Supplier"), in_list_view: 1, read_only: 1 },
          { fieldtype: "Data", fieldname: "warehouse", label: __("Warehouse"), in_list_view: 1, read_only: 1 },
          { fieldtype: "Currency", fieldname: "rate", label: __("Rate"), in_list_view: 1 },
          { fieldtype: "Float", fieldname: "base_qty", label: __("Qty"), in_list_view: 1 },
          { fieldtype: "Float", fieldname: "custom_wastage_percentage", label: __("Wastage %"), in_list_view: 1 },
          { fieldtype: "Float", fieldname: "custom_wastage_qty", label: __("Wastage Qty"), in_list_view: 1 },
          { fieldtype: "Float", fieldname: "extra_qty", label: __("Extra Qty"), in_list_view: 1 },
          { fieldtype: "Float", fieldname: "po_qty", label: __("PO Qty"), in_list_view: 1 },
          { fieldtype: "Check", fieldname: "select_for_po", label: __("Select"), in_list_view: 1 },
          { fieldtype: "Data", fieldname: "descriptions", label: __("Description"), in_list_view: 1 },
          { fieldtype: "Data", fieldname: "comments", label: __("Comments"), in_list_view: 1 },
        ],
      },
    ],
  });

  dialog.fields_dict.warehouse.get_query = () => ({
    filters: {
      company: frm.doc.company || undefined,
      disabled: 0,
    },
  });

  dialog.fields_dict.header_html.$wrapper.html(`
    <div style="display:flex;gap:12px;align-items:center;padding:12px;border-radius:14px;background:linear-gradient(135deg,#f1f5f9,#e2e8f0);border:1px solid #cbd5e1;margin-bottom:8px">
      <div style="width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#fff;font-size:18px">PO</div>
      <div style="flex:1">
        <div style="font-weight:900;font-size:16px">${frappe.utils.escape_html(__("PO Item Data Entry"))}</div>
        <div style="color:#475569;font-size:12px">${frappe.utils.escape_html(__("Add multiple rows to PO Item table from one screen."))}</div>
      </div>
      <div style="font-size:12px;color:#475569">${frappe.utils.escape_html(__("Sales Order"))}: <b>${frappe.utils.escape_html(frm.doc.name || __("New"))}</b></div>
    </div>
  `);

  function render_meta() {
    const rowCount = items_data.length;
    const totalQty = items_data.reduce((a, r) => a + toNum(r.po_qty || r.qty), 0);
    const ratio = Math.min(100, Math.max(0, rowCount ? 60 + rowCount * 5 : 8));
    dialog.fields_dict.meta_html.$wrapper.html(`
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="padding:4px 10px;border-radius:999px;background:#e2e8f0;color:#0f172a;font-weight:700;font-size:12px;">Rows: ${rowCount}</span>
        <span style="padding:4px 10px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-weight:700;font-size:12px;">Total Qty: ${_n0(totalQty)}</span>
        <span style="padding:4px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:700;font-size:12px;">Ready for Insert</span>
      </div>
      <div style="margin-top:8px;width:100%;height:8px;border-radius:999px;background:#e2e8f0;overflow:hidden;">
        <div style="height:8px;width:${ratio}%;background:linear-gradient(90deg,#16a34a,#22c55e);"></div>
      </div>
    `);
  }

  async function load_items() {
    const item_group = dialog.get_value("item_group");
    const filters = { disabled: 0, is_purchase_item: 1 };
    if (item_group) filters.item_group = item_group;
    const r = await frappe.call({
      method: "frappe.client.get_list",
      args: { doctype: "Item", fields: ["name", "item_name", "description", "last_purchase_rate"], filters, order_by: "name asc", limit_page_length: 500 },
    });
    const rows = (r && r.message) ? r.message : [];
    item_map = {};
    rows.forEach((d) => { item_map[d.name] = d; });
    dialog.fields_dict.item_code.get_query = () => ({ filters });
    dialog.fields_dict.item_code.refresh();
    if (!dialog.get_value("item_code")) {
      if (last_item_code && item_map[last_item_code]) {
        dialog.set_value("item_code", last_item_code);
      } else if (rows.length) {
        dialog.set_value("item_code", rows[0].name);
      }
    }
  }

  function refresh_grid() {
    dialog.fields_dict.items_table.df.data = items_data;
    if (dialog.fields_dict.items_table.grid) {
      dialog.fields_dict.items_table.grid.df.data = items_data;
    }
    dialog.fields_dict.items_table.grid.refresh();
    render_meta();
  }

  function recalc_qty_fields() {
    const qty = toNum(dialog.get_value("qty"));
    const wp = toNum(dialog.get_value("custom_wastage_percentage"));
    const extra = toNum(dialog.get_value("extra_qty"));
    const wq = (qty * wp) / 100;
    const poQty = qty + wq + extra;
    dialog.set_value("custom_wastage_qty", wq);
    dialog.set_value("po_qty", poQty);
  }

  async function add_row() {
    const supplier = (dialog.get_value("supplier") || "").trim();
    const warehouse = (dialog.get_value("warehouse") || "").trim();
    const item_code = (dialog.get_value("item_code") || "").trim();
    const qty_raw = dialog.get_value("qty");
    const qty = toNum(qty_raw || 1);
    const descriptions = dialog.get_value("descriptions") || "";
    const comments = dialog.get_value("comments") || "";
    const select_for_po = toInt(dialog.get_value("select_for_po"));
    const rate = toNum(dialog.get_value("rate"));
    const custom_wastage_percentage = toNum(dialog.get_value("custom_wastage_percentage"));
    const custom_wastage_qty = (qty * custom_wastage_percentage) / 100;
    const extra_qty = toNum(dialog.get_value("extra_qty"));
    const po_qty = qty + custom_wastage_qty + extra_qty;

    if (!supplier) {
      frappe.show_alert({ message: __("Select Supplier"), indicator: "orange" });
      return;
    }
    if (!item_code) {
      frappe.show_alert({ message: __("Select Item"), indicator: "orange" });
      return;
    }
    if (qty <= 0) {
      frappe.msgprint(__("Qty must be greater than zero"));
      return;
    }

    let item_meta = item_map[item_code] || null;
    if (!item_meta) {
      const r = await frappe.db.get_value("Item", item_code, ["item_name", "description"]);
      const msg = (r && r.message) ? r.message : {};
      item_meta = { name: item_code, item_name: msg.item_name || "", description: msg.description || "" };
      item_map[item_code] = item_meta;
    }

    items_data.push({
      item_code,
      item_name: item_meta.item_name || "",
      supplier,
      warehouse,
      rate,
      base_qty: qty,
      qty: po_qty,
      descriptions: descriptions || stripHtml(item_meta.description || ""),
      comments: comments || "",
      select_for_po,
      custom_wastage_percentage,
      custom_wastage_qty,
      extra_qty,
      po_qty,
    });

    last_item_code = item_code;
    refresh_grid();
    dialog.set_value("item_code", last_item_code);
    dialog.set_value("qty", 1);
    dialog.set_value("custom_wastage_percentage", 0);
    dialog.set_value("custom_wastage_qty", 0);
    dialog.set_value("extra_qty", 0);
    dialog.set_value("po_qty", 1);
    dialog.set_value("descriptions", "");
    dialog.set_value("comments", "");
    setTimeout(() => dialog.fields_dict.item_code.$input.focus(), 20);
  }

  dialog.fields_dict.item_group.df.onchange = function () { load_items(); dialog.set_value("item_code", ""); };
  dialog.fields_dict.qty.df.onchange = recalc_qty_fields;
  dialog.fields_dict.custom_wastage_percentage.df.onchange = recalc_qty_fields;
  dialog.fields_dict.extra_qty.df.onchange = recalc_qty_fields;
  dialog.fields_dict.item_code.df.onchange = function () {
    const code = dialog.get_value("item_code");
    if (!code) return;
    const item_meta = item_map[code] || {};
    if (!dialog.get_value("descriptions") && item_meta.description) dialog.set_value("descriptions", stripHtml(item_meta.description));
    if (!toNum(dialog.get_value("rate")) && toNum(item_meta.last_purchase_rate)) dialog.set_value("rate", toNum(item_meta.last_purchase_rate));
    if (!toNum(dialog.get_value("rate"))) {
      frappe.call({
        method: "order_tracking_report.api.get_last_purchase_rate",
        args: {
          item_code: code,
          supplier: dialog.get_value("supplier") || "",
          company: frm.doc.company || "",
        },
        callback: (r) => {
          const rate = toNum((r && r.message && r.message.rate) || 0);
          if (rate > 0 && !toNum(dialog.get_value("rate"))) dialog.set_value("rate", rate);
        },
      });
    }
  };

  dialog.fields_dict.supplier.df.onchange = function () {
    const code = dialog.get_value("item_code");
    if (!code) return;
    if (toNum(dialog.get_value("rate")) > 0) return;
    frappe.call({
      method: "order_tracking_report.api.get_last_purchase_rate",
      args: {
        item_code: code,
        supplier: dialog.get_value("supplier") || "",
        company: frm.doc.company || "",
      },
      callback: (r) => {
        const rate = toNum((r && r.message && r.message.rate) || 0);
        if (rate > 0) dialog.set_value("rate", rate);
      },
    });
  };

  function bind_add_row_button() {
    const addBtnField = dialog.fields_dict.add_item_btn;
    const $buttons = addBtnField.$wrapper.find("button, .btn");
    $buttons.off("click.po_row").on("click.po_row", async (e) => {
      e.preventDefault();
      try {
        await add_row();
      } catch (err) {
        frappe.msgprint(__("Unable to add row. Please try again."));
        console.error(err);
      }
      return false;
    }).css({ background: "#2563eb", border: "1px solid #1d4ed8", color: "#fff", fontWeight: "700" });
  }

  dialog.$wrapper.on("keydown", (e) => {
    if (e.key !== "Enter") return;
    const in_grid = $(e.target).closest(".grid").length > 0;
    const is_textarea = e.target && e.target.tagName === "TEXTAREA";
    if (in_grid || is_textarea) return;
    e.preventDefault();
    add_row();
  });

  dialog.set_primary_action(__("Insert to PO Item Table"), () => {
    if (!items_data.length) {
      frappe.msgprint(__("Add at least one row."));
      return;
    }
    items_data.forEach((r) => {
      const row = frm.add_child("custom_po_item");
      row.item = r.item_code;
      row.supplier = r.supplier || "";
      row.warehouse = r.warehouse || "";
      row.rate = toNum(r.rate);
      row.qty = toNum(r.po_qty || r.qty);
      row.custom_base_qty = toNum(r.base_qty);
      row.descriptions = r.descriptions || "";
      row.comments = r.comments || "";
      row.select_for_po = toInt(r.select_for_po);
      row.custom_wastage_percentage = toNum(r.custom_wastage_percentage);
      row.custom_wastage_qty = toNum(r.custom_wastage_qty);
      row.custom_extra_qty = toNum(r.extra_qty);
      row.custom_po_qty = toNum(r.po_qty || r.qty);
    });
    frm.refresh_field("custom_po_item");
    frappe.show_alert({ message: __("Rows inserted in PO Item table"), indicator: "green" }, 4);
    dialog.hide();
  });

  dialog.show();
  dialog.$wrapper.find(".modal-dialog").css({ width: "98vw", maxWidth: "98vw" });
  dialog.$wrapper.find('[data-fieldname="qty"]').closest(".form-column").css("max-width", "140px");
  dialog.$wrapper.find('[data-fieldname="select_for_po"]').closest(".form-column").css("max-width", "180px");
  dialog.$wrapper.find('[data-fieldname="add_item_btn"]').closest(".form-column").css({ maxWidth: "210px", display: "flex", alignItems: "flex-end" });
  const $tbl = dialog.$wrapper.find('[data-fieldname="items_table"]').closest(".frappe-control");
  $tbl.closest(".form-column").css({ flex: "0 0 100%", maxWidth: "100%" });
  dialog.$wrapper.find('[data-fieldname="items_table"]').closest(".form-group, .frappe-control, .form-column").css({ width: "100%" });
  $tbl.css({ width: "100%" });
  $tbl.find(".grid-body").css({ maxHeight: "340px", overflowY: "auto", overflowX: "auto", width: "100%" });
  $tbl.find(".grid-body .rows, .grid-heading-row").css({ width: "100%" });
  $tbl.find(".grid-heading-row .grid-row, .grid-body .grid-row").css({ width: "100%" });

  // Bind after dialog render so click always works
  bind_add_row_button();
  ["qty", "custom_wastage_percentage", "extra_qty"].forEach((fn) => {
    const f = dialog.fields_dict[fn];
    if (f && f.$input) {
      f.$input.off("input.po_calc change.po_calc").on("input.po_calc change.po_calc", recalc_qty_fields);
    }
  });

  setTimeout(() => {
    load_items();
    render_meta();
    if (prefill && typeof prefill === "object") {
      if (Array.isArray(prefill.rows) && prefill.rows.length) {
        const firstSupplier = (prefill.rows.find((r) => r && r.supplier) || {}).supplier;
        if (firstSupplier && !dialog.get_value("supplier")) dialog.set_value("supplier", firstSupplier);
        prefill.rows.forEach((row) => {
          const baseQty = toNum(row.base_qty || row.qty || 0);
          const wp = toNum(row.custom_wastage_percentage || row.wastage_pct || 0);
          const wq = toNum(row.custom_wastage_qty || row.wastage_qty || ((baseQty * wp) / 100));
          const extra = toNum(row.extra_qty || 0);
          const poQty = toNum(row.po_qty || (baseQty + wq + extra));
          items_data.push({
            item_code: row.item_code || "",
            item_name: row.item_name || "",
            supplier: row.supplier || dialog.get_value("supplier") || "",
            warehouse: row.warehouse || dialog.get_value("warehouse") || "",
            rate: toNum(row.rate || 0),
            base_qty: baseQty,
            qty: poQty,
            descriptions: row.descriptions || row.description || row.item_code || "",
            comments: row.comments || "",
            select_for_po: toInt(typeof row.select_for_po !== "undefined" ? row.select_for_po : 1),
            custom_wastage_percentage: wp,
            custom_wastage_qty: wq,
            extra_qty: extra,
            po_qty: poQty,
          });
        });
        refresh_grid();
      }
      if (prefill.item_code) dialog.set_value("item_code", prefill.item_code);
      if (prefill.supplier) dialog.set_value("supplier", prefill.supplier);
      if (prefill.warehouse) dialog.set_value("warehouse", prefill.warehouse);
      if (typeof prefill.rate !== "undefined") dialog.set_value("rate", flt(prefill.rate));
      if (prefill.qty) dialog.set_value("qty", flt(prefill.qty));
      if (prefill.descriptions) dialog.set_value("descriptions", prefill.descriptions);
      if (typeof prefill.select_for_po !== "undefined") dialog.set_value("select_for_po", cint(prefill.select_for_po) ? 1 : 0);
      if (typeof prefill.custom_wastage_percentage !== "undefined") dialog.set_value("custom_wastage_percentage", flt(prefill.custom_wastage_percentage));
      if (typeof prefill.custom_wastage_qty !== "undefined") dialog.set_value("custom_wastage_qty", flt(prefill.custom_wastage_qty));
      if (typeof prefill.extra_qty !== "undefined") dialog.set_value("extra_qty", flt(prefill.extra_qty));
    }
    last_item_code = dialog.get_value("item_code") || last_item_code;
    bind_add_row_button();
    recalc_qty_fields();
    dialog.fields_dict.item_code.$input.focus();
  }, 150);
}

function purchaseFlowTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map((r) => `
    <tr>
      <td>${r.purchase_order ? docLink("Purchase Order", r.purchase_order) : `<span class="text-muted">Not Created</span>`}</td>
      <td>${esc(r.supplier || "-")}</td>
      <td>${badge(r.po_status)}</td>
      <td style="text-align:right;">${flt(r.ordered_qty)}</td>
      <td style="text-align:right;">${flt(r.received_qty)}</td>
      <td style="text-align:right;">${flt(r.pending_qty)}</td>
      <td style="text-align:right;">${esc(r.received_pct || 0)}%</td>
      <td style="text-align:right;">${esc(r.pending_pct || 0)}%</td>
      <td style="text-align:right;">${_money0(r.po_cost || 0)}</td>
      <td>${_csvDocLinks("Purchase Receipt", r.purchase_receipts)}</td>
      <td>${esc(r.pr_status || "-")}</td>
      <td>${_csvDocLinks("Purchase Invoice", r.purchase_invoices)}</td>
      <td>${esc(r.pi_status || "-")}</td>
    </tr>
  `).join("") : `<tr><td colspan="13" class="text-muted">No purchase flow records.</td></tr>`;
  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
    <thead><tr>
      <th>PO Number</th><th>Supplier</th><th>PO Status</th>
      <th style="text-align:right;">Ordered</th><th style="text-align:right;">Received</th><th style="text-align:right;">Pending</th>
      <th style="text-align:right;">Rec %</th><th style="text-align:right;">Pend %</th>
      <th style="text-align:right;">PO Cost</th>
      <th>Purchase Receipts</th><th>PR Status</th>
      <th>Purchase Invoices</th><th>PI Status</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function materialShortageTable(rows){
  rows = rows || [];
  if(!rows.length) return `<div class="text-muted">No grouped shortage found.</div>`;
  const groupMap = {};
  rows.forEach((r) => { const g = r.item_group || "Uncategorized"; if (!groupMap[g]) groupMap[g] = []; groupMap[g].push(r); });
  const groups = Object.keys(groupMap).sort();
  let body = "";
  groups.forEach((g, i) => {
    const key = `ms_group_${i}_${String(g).replace(/[^a-zA-Z0-9]/g, "_")}`;
    const list = groupMap[g] || [];
    const req = list.reduce((a, r) => a + Number(r.required_qty || 0), 0);
    const wsb = list.reduce((a, r) => a + Number(r.wastage_qty || 0), 0);
    const stk = list.reduce((a, r) => a + Number(r.stock_qty || 0), 0);
    const sht = list.reduce((a, r) => a + Number(r.shortage_qty || 0), 0);
    const sug = sht + wsb;
    const poq = list.reduce((a, r) => a + Number(r.po_qty || 0), 0);
    const wpct = Number((list[0] && list[0].wastage_pct) || 0);
    const wsp = (poq * wpct) / 100;
    const prq = list.reduce((a, r) => a + Number(r.pr_qty || 0), 0);
    const ppq = list.reduce((a, r) => a + Number(r.pending_po_qty || 0), 0);
    body += `
      <tr class="so-group-row" data-toggle="so" data-target="${esc(key)}" style="cursor:pointer;background:#f8fafc;">
        <td style="font-weight:900;width:13%;min-width:160px;"><span data-icon>▸</span> ${esc(g)}</td>
        <td style="text-align:right;">-</td>
        <td style="text-align:right;">${_n0(req)}</td>
        <td style="text-align:right;">${_n0(wsb)}</td>
        <td style="text-align:right;background:#f1f5f9;">${_n0(stk)}</td>
        <td style="text-align:right;" class="${sht>0?'so-danger':'so-success'}">${_n0(sht)}</td>
        <td style="text-align:right;">${_n0(sug)}</td>
        <td style="text-align:right;">${_n0(poq)}</td>
        <td style="text-align:right;">${_n0(wsp)}</td>
        <td style="text-align:right;">${_n0(prq)}</td>
        <td style="text-align:right;" class="${ppq>0?'so-warning':'so-success'}">${_n0(ppq)}</td>
        <td>
          ${suggested > 0 ? `<button class="btn btn-xs btn-primary" data-ms-create-po-group="1" data-group="${esc(g)}">${__("Create PO")}</button>` : `<span class="text-muted">-</span>`}
        </td>
      </tr>
    `;
    list.forEach((r) => {
      const createQty = Number(r.shortage_qty || 0) + Number(r.wastage_qty || 0);
      const wp = Number(r.wastage_pct || 0);
      const wpo = Number(r.po_qty || 0) * wp / 100;
      body += `
        <tr data-panel="${esc(key)}" style="display:none;">
          <td style="padding-left:26px;width:13%;min-width:160px;">${esc(r.item_code || "")}</td>
          <td style="text-align:right;">${(Number(r.qty_per_bom || 0)).toFixed(2)}</td>
          <td style="text-align:right;">${_n0(r.required_qty)}</td>
          <td style="text-align:right;">${_n0(r.wastage_qty || 0)}</td>
          <td style="text-align:right;background:#f1f5f9;">${_n0(r.stock_qty)}</td>
          <td style="text-align:right;" class="${Number(r.shortage_qty||0)>0?'so-danger':'so-success'}">${_n0(r.shortage_qty)}</td>
          <td style="text-align:right;">${_n0((Number(r.shortage_qty || 0) + Number(r.wastage_qty || 0)))}</td>
          <td style="text-align:right;">${_n0(r.po_qty)}</td>
          <td style="text-align:right;">${_n0(wpo)}</td>
          <td style="text-align:right;">${_n0(r.pr_qty)}</td>
          <td style="text-align:right;" class="${Number(r.pending_po_qty||0)>0?'so-warning':'so-success'}">${_n0(r.pending_po_qty)}</td>
          <td>
            ${createQty > 0 ? `<button class="btn btn-xs btn-primary" data-ms-create-po="1" data-item="${esc(r.item_code || "")}" data-qty="${esc(createQty)}" data-description="${esc(r.item_code || "")}" data-wp="${esc(wp)}" data-wq="${esc(r.wastage_qty || 0)}">${__("Create PO")}</button>` : `<span class="text-muted">-</span>`}
          </td>
        </tr>
      `;
    });
  });
  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead>
        <tr>
          <th style="width:13%;min-width:160px;">Item Group / Raw Material</th>
          <th style="width:120px;text-align:right;">Qty/BOM</th>
          <th style="width:130px;text-align:right;">Required</th>
          <th style="width:130px;text-align:right;">Wastage on BOM</th>
          <th style="width:100px;text-align:right;">Stock</th>
          <th style="width:120px;text-align:right;">Shortage</th>
          <th style="width:130px;text-align:right;">Suggested Qty</th>
          <th style="width:100px;text-align:right;">PO Qty</th>
          <th style="width:130px;text-align:right;">Wastage on PO</th>
          <th style="width:100px;text-align:right;">PR Qty</th>
          <th style="width:130px;text-align:right;">Pending PO Qty</th>
          <th style="width:120px;">Create PO</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function profitSummaryCard(s){
  s = s || {};
  return `
    <div class="so-grid-3">
      <div class="so-mini-card"><div class="so-mini-title">SALES</div><div class="so-mini-val">${_money0(s.sales_amount || 0)}</div></div>
      <div class="so-mini-card"><div class="so-mini-title">ESTIMATED COST</div><div class="so-mini-val">${_money0(s.estimated_cost || 0)}</div></div>
      <div class="so-mini-card"><div class="so-mini-title">ESTIMATED PROFIT</div><div class="so-mini-val">${_money0(s.estimated_profit || 0)}</div></div>
    </div>
    <div style="margin-top:10px;font-weight:900;">Margin: ${_n0(s.margin_pct || 0)}%</div>
  `;
}

function profitByItemTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.item_code||"")}</td>
      <td style="text-align:right;">${_n0(r.qty)}</td>
      <td>${esc(r.default_bom || "—")}</td>
      <td style="text-align:right;">${_money0(r.bom_unit_cost)}</td>
      <td style="text-align:right;">${_money0(r.sales_amount)}</td>
      <td style="text-align:right;">${_money0(r.estimated_cost)}</td>
      <td style="text-align:right;">${_money0(r.estimated_profit)}</td>
      <td style="text-align:right;">${_n0(r.margin_pct||0)}%</td>
    </tr>
  `).join("") : `<tr><td colspan="8" class="text-muted">No profit records.</td></tr>`;
  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
    <thead><tr><th>Item</th><th style="width:100px;text-align:right;">Qty</th><th>Default BOM</th><th style="width:120px;text-align:right;">BOM Cost</th><th style="width:150px;text-align:right;">Sales</th><th style="width:150px;text-align:right;">Est. Cost</th><th style="width:150px;text-align:right;">Est. Profit</th><th style="width:110px;text-align:right;">Margin %</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

function profitGroupPurchaseTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `<tr><td>${esc(r.item_group || 'Uncategorized')}</td><td style="text-align:right;">${_money0(r.po_amount || 0)}</td></tr>`).join("")
    : `<tr><td colspan="2" class="text-muted">No purchase-order amount found for this Sales Order.</td></tr>`;
  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;"><thead><tr><th>Item Group</th><th style="text-align:right;">PO Amount</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function labourCostTable(rows, summary){
  rows = rows || []; summary = summary || {};
  const body = rows.length ? rows.map(r => `
    <tr><td>${esc(r.employee || "-")}</td><td>${esc(r.name1 || "-")}</td><td>${esc(r.product || "-")}</td><td>${esc(r.process_type || "-")}</td>
    <td style="text-align:right;">${_n0(r.qty)}</td><td style="text-align:right;">${_n0(r.rate)}</td><td style="text-align:right;">${_money0(r.labour_cost || 0)}</td></tr>
  `).join("") : `<tr><td colspan="7" class="text-muted">No employee item-wise labour cost for this Sales Order.</td></tr>`;
  return `
    <div style="display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:12px;margin-bottom:12px;">
      <div class="so-mini-card" style="height:132px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:14px 16px;"><div class="so-mini-title">LABOUR QTY</div><div class="so-mini-val" style="font-size:30px;line-height:1.1;">${_n0(summary.total_qty || 0)}</div></div>
      <div class="so-mini-card" style="height:132px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:14px 16px;"><div class="so-mini-title">TOTAL LABOUR COST</div><div class="so-mini-val" style="font-size:30px;line-height:1.1;">${_money0(summary.total_cost || 0)}</div></div>
    </div>
    <div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;"><thead><tr><th>Employee</th><th>Name</th><th>Item</th><th>Process</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Labour Cost</th></tr></thead><tbody>${body}</tbody></table></div>
  `;
}

function buildDashboard(frm, data){
  const totals = data.production_totals || {};
  const poTotal = poTotalAmount(data.po_item_group_summary || []);
  return `
    ${css()}
    <div class="so-hdr">
      <div class="so-title">Sales Order Connection Report</div>
      <div class="so-sub">Sales Order: <b>${esc(frm.doc.name)}</b></div>
      ${kpis(totals)}
    </div>

    ${sectionBlock('profit', 'Profit and Loss Section', 'linear-gradient(90deg,#0f766e,#14b8a6)', `
      ${card("Profit Dashboard", "Estimated cost from default BOM and sales amount", `${profitSummaryCard(data.profit_summary || {})}<div style="margin-top:12px;font-weight:900;">Profit by Item</div>${profitByItemTable(data.profit_by_item || [])}`)}
      ${card("Purchase Order Total Amount", "Total amount of Purchase Orders linked with this Sales Order", `<div class="so-mini-card"><div class="so-mini-title">TOTAL PO AMOUNT</div><div class="so-mini-val" style="font-size:26px;">${_money0(poTotal)}</div></div>`)}
      ${card("PO Amount by Item Group", "Purchase Order amount summary linked with this Sales Order", profitGroupPurchaseTable(data.po_item_group_summary || []))}
      ${card("Employee Item-wise Labour Cost", "From per-piece-report > Employee item-wise", labourCostTable(data.labour_cost_employee_item_wise || [], data.labour_cost_summary || {}))}
    `, false)}

    ${sectionBlock('purchase', 'Purchase Order Section', 'linear-gradient(90deg,#7c3aed,#9333ea)', `
      ${card("PO Analytics (From PO Tab)", "Item Group-Wise PO Status", `${poAnalyticsOverviewCard((data.custom_po_analytics || {}).overview || {})}${poItemGroupTable((data.custom_po_analytics || {}).item_group_rows || [])}`)}
      ${card("Material Shortage & Purchase Suggestion", "Grouped by Item Group with PO and PR planning progress", materialShortageTable(data.material_shortage || []))}
      ${card("PO-Wise status Report", "Collapsed by Supplier", poStatusDetailTable((data.custom_po_analytics || {}).po_status_rows || []))}
      ${card("Purchase Flow Tracker", "PO + Purchase Receipt + Purchase Invoice in one row with PO cost", purchaseFlowTable(data.purchase_flow_rows || []))}
    `, false)}

    ${sectionBlock('production', 'Production Section', 'linear-gradient(90deg,#7a3e00,#a16207)', `
      ${card("Production", "Production Plan -> Work Order -> Job Cards / Operations / Employees / Materials", productionTree(data.production_tree||[]))}
      ${card("Production Timeline", "Work Orders, Delivery Notes and Invoices timeline", timelineView(data.gantt_timeline || []))}
      ${card("Machine Utilization", "Workstation time from Job Card Time Logs", machineUtilization(data.machine_utilization || []))}
      ${card("Employee Efficiency", "Completed quantity vs time spent", employeeEfficiency(data.employee_efficiency || []))}
    `, false)}

    ${sectionBlock('bom', 'BOM and Raw Material Section', 'linear-gradient(90deg,#0891b2,#06b6d4)', `${card("BOM & Raw Materials", "Item and BOM merged for easier reading", bomTree(data.bom_tree||[]))}`, false)}

    ${sectionBlock('dispatch', 'Dispatch Section', 'linear-gradient(90deg,#ea580c,#f97316)', `
      ${card("Order Item Summary", "Ordered, delivered, invoiced and pending quantity by item", orderItemSummaryTable(data.order_item_summary || []))}
      ${card("Delivery & Billing", "Delivery Note -> Invoices, click document number for popup detail", deliveryHierarchy(data.sales_fulfillment_hierarchy||[]))}
      ${card("Delivery Risk Prediction", "Delivery delay warning based on completion and delivery date", deliveryPredictionCard(data.delivery_prediction || {}))}
    `, false)}
  `;
}

// Final overrides (keep at end so they win over earlier duplicate definitions)
function poItemGroupTable(rows){
  rows = rows || [];
  if (!rows.length) {
    return `<div class="text-muted">No item-group analytics found.</div>`;
  }

  const groupMap = {};
  rows.forEach((r) => {
    const g = r.item_group || "Uncategorized";
    if (!groupMap[g]) groupMap[g] = [];
    groupMap[g].push(r);
  });

  const groups = Object.keys(groupMap).sort();
  let html = "";

  groups.forEach((g, idx) => {
    const key = `po_item_group_${idx}_${g.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const items = (groupMap[g] || []).sort((a, b) => {
      const ai = String(a.item || "");
      const bi = String(b.item || "");
      const ao = String(a.order_number || "");
      const bo = String(b.order_number || "");
      return ai.localeCompare(bi) || ao.localeCompare(bo);
    });

    let totalOrdered = 0;
    let totalReceived = 0;
    let totalPending = 0;
    let doneCount = 0;
    let progressCount = 0;
    let pendingCount = 0;
    items.forEach((r) => {
      totalOrdered += Number(r.ordered_qty || 0);
      totalReceived += Number(r.received_qty || 0);
      totalPending += Number(r.pending_qty || 0);
      const status = String(r.po_status || "").toLowerCase();
      if (status.includes("complete") || status.includes("close")) doneCount += 1;
      else if (status.includes("progress") || status.includes("part")) progressCount += 1;
      else pendingCount += 1;
    });

    const overallStatus = totalPending <= 0 ? "Completed" : "In Progress";
    const recPct = totalOrdered ? ((totalReceived * 100) / totalOrdered).toFixed(2) : "0.00";

    html += `
      <tr class="so-group-row" data-toggle="so" data-target="${esc(key)}" style="cursor:pointer;background:#f8fafc;">
        <td style="font-weight:900;width:13%;min-width:140px;"><span data-icon>▸</span> ${esc(g)}</td>
        <td colspan="2">${badge(overallStatus)} <span class="muted">Done ${doneCount} • In Progress ${progressCount} • Pending ${pendingCount}</span></td>
        <td style="text-align:right;">${_n0(totalOrdered)}</td>
        <td style="text-align:right;">${_n0(totalReceived)}</td>
        <td style="text-align:right;">${_n0(totalPending)}</td>
        <td style="text-align:right;">${recPct}%</td>
        <td style="text-align:right;">${(100 - Number(recPct || 0)).toFixed(2)}%</td>
        <td>${badge(overallStatus)}</td>
      </tr>
    `;

    items.forEach((r) => {
      html += `
        <tr data-panel="${esc(key)}" style="display:none;">
          <td style="padding-left:26px;width:13%;min-width:140px;">${esc(r.item || "-")}</td>
          <td>${esc(r.supplier_name || "-")}</td>
          <td>${r.order_number ? docLink("Purchase Order", r.order_number) : `<span class="text-muted">-</span>`}</td>
          <td style="text-align:right;">${_n0(r.ordered_qty)}</td>
          <td style="text-align:right;">${_n0(r.received_qty)}</td>
          <td style="text-align:right;">${_n0(r.pending_qty)}</td>
          <td style="text-align:right;">${esc(r.received_pct || 0)}%</td>
          <td style="text-align:right;">${esc(r.pending_pct || 0)}%</td>
          <td>${badge(r.po_status || "")}</td>
        </tr>
      `;
    });
  });

  return `
    <div class="table-responsive">
      <table class="table table-bordered so-table" style="margin:0;">
        <thead>
          <tr>
            <th style="width:13%;min-width:140px;">Item Group / Item</th>
            <th>Supplier Name</th>
            <th>Order Number</th>
            <th style="text-align:right;">Ordered</th>
            <th style="text-align:right;">Received</th>
            <th style="text-align:right;">Pending</th>
            <th style="text-align:right;">Rec %</th>
            <th style="text-align:right;">Pending %</th>
            <th>PO Status</th>
          </tr>
        </thead>
        <tbody>${html}</tbody>
      </table>
    </div>
  `;
}

function _csvDocLinks(doctype, csvText){
  const raw = String(csvText || "").trim();
  if (!raw) return `<span class="text-muted">-</span>`;
  const names = raw.split(",").map((x) => x.trim()).filter(Boolean);
  if (!names.length) return `<span class="text-muted">-</span>`;
  return names.map((n) => docLink(doctype, n)).join(", ");
}

function purchaseFlowTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map((r) => `
    <tr>
      <td>${r.purchase_order ? docLink("Purchase Order", r.purchase_order) : `<span class="text-muted">Not Created</span>`}</td>
      <td>${esc(r.supplier || "-")}</td>
      <td>${badge(r.po_status)}</td>
      <td style="text-align:right;">${_n0(r.ordered_qty)}</td>
      <td style="text-align:right;">${_n0(r.received_qty)}</td>
      <td style="text-align:right;">${_n0(r.pending_qty)}</td>
      <td style="text-align:right;">${esc(r.received_pct || 0)}%</td>
      <td style="text-align:right;">${esc(r.pending_pct || 0)}%</td>
      <td style="text-align:right;">${_money0(r.po_cost || 0)}</td>
      <td>${_csvDocLinks("Purchase Receipt", r.purchase_receipts)}</td>
      <td>${esc(r.pr_status || "-")}</td>
      <td>${_csvDocLinks("Purchase Invoice", r.purchase_invoices)}</td>
      <td>${esc(r.pi_status || "-")}</td>
    </tr>
  `).join("") : `<tr><td colspan="13" class="text-muted">No purchase flow records.</td></tr>`;

  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
    <thead><tr>
      <th>PO Number</th><th>Supplier</th><th>PO Status</th>
      <th style="text-align:right;">Ordered</th><th style="text-align:right;">Received</th><th style="text-align:right;">Pending</th>
      <th style="text-align:right;">Rec %</th><th style="text-align:right;">Pend %</th>
      <th style="text-align:right;">PO Cost</th>
      <th>Purchase Receipts</th><th>PR Status</th>
      <th>Purchase Invoices</th><th>PI Status</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

// Final purchase-section overrides
function poStatusDetailTable(rows){
  rows = rows || [];
  if (!rows.length) {
    return `<div class="text-muted">No PO analytics found.</div>`;
  }

  const supplierMap = {};
  rows.forEach((r) => {
    const s = r.supplier || "No Supplier";
    if (!supplierMap[s]) supplierMap[s] = [];
    supplierMap[s].push(r);
  });

  const suppliers = Object.keys(supplierMap).sort();
  let body = "";

  suppliers.forEach((s, i) => {
    const key = `po_supplier_${i}_${String(s).replace(/[^a-zA-Z0-9]/g, "_")}`;
    const list = supplierMap[s] || [];
    const ordered = list.reduce((a, r) => a + Number(r.ordered_qty || 0), 0);
    const received = list.reduce((a, r) => a + Number(r.received_qty || 0), 0);
    const pending = list.reduce((a, r) => a + Number(r.pending_qty || 0), 0);
    const recPct = ordered ? ((received * 100) / ordered).toFixed(2) : "0.00";

    body += `
      <tr class="so-group-row" data-toggle="so" data-target="${esc(key)}" style="cursor:pointer;background:#f8fafc;">
        <td style="font-weight:900;"><span data-icon>▸</span> ${esc(s)}</td>
        <td>${badge(pending <= 0 ? "Completed" : "In Progress")}</td>
        <td style="text-align:right;">${_n0(ordered)}</td>
        <td style="text-align:right;">${_n0(received)}</td>
        <td style="text-align:right;">${_n0(pending)}</td>
        <td style="text-align:right;">${recPct}%</td>
        <td style="text-align:right;">${(100 - Number(recPct)).toFixed(2)}%</td>
      </tr>
    `;

    list.forEach((r) => {
      body += `
        <tr data-panel="${esc(key)}" style="display:none;">
          <td>${r.purchase_order ? docLink("Purchase Order", r.purchase_order) : `<span class="text-muted">Not Created</span>`}</td>
          <td>${badge(r.status)}</td>
          <td style="text-align:right;">${_n0(r.ordered_qty)}</td>
          <td style="text-align:right;">${_n0(r.received_qty)}</td>
          <td style="text-align:right;">${_n0(r.pending_qty)}</td>
          <td style="text-align:right;">${esc(r.received_pct || 0)}%</td>
          <td style="text-align:right;">${esc(r.pending_pct || 0)}%</td>
        </tr>
      `;
    });
  });

  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
    <thead><tr>
      <th>Supplier / Purchase Order</th><th>Status</th>
      <th style="text-align:right;">Ordered Qty</th>
      <th style="text-align:right;">Received Qty</th>
      <th style="text-align:right;">Pending Qty</th>
      <th style="text-align:right;">Received %</th>
      <th style="text-align:right;">Pending %</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function materialShortageTable(rows){
  rows = rows || [];
  if(!rows.length){
    return `<div class="text-muted">No grouped shortage found.</div>`;
  }

  const groupMap = {};
  rows.forEach((r) => {
    const g = r.item_group || "Uncategorized";
    if (!groupMap[g]) groupMap[g] = [];
    groupMap[g].push(r);
  });

  const groups = Object.keys(groupMap).sort();
  let body = "";

  groups.forEach((g, i) => {
    const key = `ms_group_${i}_${String(g).replace(/[^a-zA-Z0-9]/g, "_")}`;
    const list = groupMap[g] || [];
    const req = list.reduce((a, r) => a + Number(r.required_qty || 0), 0);
    const stk = list.reduce((a, r) => a + Number(r.stock_qty || 0), 0);
    const sht = list.reduce((a, r) => a + Number(r.shortage_qty || 0), 0);
    const wst = list.reduce((a, r) => a + Number(r.wastage_qty || 0), 0);
    const suggested = sht + wst;
    const poq = list.reduce((a, r) => a + Number(r.po_qty || 0), 0);
    const wpo = list.reduce((a, r) => a + ((Number(r.po_qty || 0) * Number(r.wastage_pct || 0)) / 100), 0);
    const prq = list.reduce((a, r) => a + Number(r.pr_qty || 0), 0);
    const ppq = list.reduce((a, r) => a + Number(r.pending_po_qty || 0), 0);
    const lprArr = list.map((r) => Number(r.last_purchase_rate || 0)).filter((x) => x > 0);
    const lprGroup = lprArr.length ? (lprArr.reduce((a, b) => a + b, 0) / lprArr.length) : 0;

    body += `
      <tr class="so-group-row" data-toggle="so" data-target="${esc(key)}" style="cursor:pointer;background:#f8fafc;">
        <td style="font-weight:900;width:13%;min-width:140px;"><span data-icon>▸</span> ${esc(g)}</td>
        <td style="text-align:right;">-</td>
        <td style="text-align:right;">${_n0(req)}</td>
        <td style="text-align:right;">${_n0(wst)}</td>
        <td style="text-align:right;background:#f1f5f9;">${_n0(stk)}</td>
        <td style="text-align:right;" class="${sht>0?'so-danger':'so-success'}">${_n0(sht)}</td>
        <td style="text-align:right;">${_n0(suggested)}</td>
        <td style="text-align:right;">${_n0(poq)}</td>
        <td style="text-align:right;">${_n0(wpo)}</td>
        <td style="text-align:right;">${_n0(prq)}</td>
        <td style="text-align:right;" class="${ppq>0?'so-warning':'so-success'}">${_n0(ppq)}</td>
        <td style="text-align:right;">${_money0(lprGroup)}</td>
        <td>
          ${suggested > 0 ? `<button class="btn btn-xs btn-primary" data-ms-create-po-group="1" data-group="${esc(g)}">${__("Create PO")}</button>` : `<span class="text-muted">-</span>`}
        </td>
      </tr>
    `;

    list.forEach((r) => {
      const shortageQty = Number(r.shortage_qty || 0);
      const suggestedQty = shortageQty + Number(r.wastage_qty || 0);
      body += `
        <tr data-panel="${esc(key)}" style="display:none;">
          <td style="padding-left:26px;width:13%;min-width:140px;">${esc(r.item_code || "")}</td>
          <td style="text-align:right;">${(Number(r.qty_per_bom || 0)).toFixed(2)}</td>
          <td style="text-align:right;">${_n0(r.required_qty)}</td>
          <td style="text-align:right;">${_n0(r.wastage_qty || 0)}</td>
          <td style="text-align:right;background:#f1f5f9;">${_n0(r.stock_qty)}</td>
          <td style="text-align:right;" class="${Number(r.shortage_qty||0)>0?'so-danger':'so-success'}">${_n0(r.shortage_qty)}</td>
          <td style="text-align:right;">${_n0((Number(r.shortage_qty || 0) + Number(r.wastage_qty || 0)))}</td>
          <td style="text-align:right;">${_n0(r.po_qty)}</td>
          <td style="text-align:right;">${_n0((Number(r.po_qty || 0) * Number(r.wastage_pct || 0)) / 100)}</td>
          <td style="text-align:right;">${_n0(r.pr_qty)}</td>
          <td style="text-align:right;" class="${Number(r.pending_po_qty||0)>0?'so-warning':'so-success'}">${_n0(r.pending_po_qty)}</td>
          <td style="text-align:right;">${_money0(r.last_purchase_rate || 0)}</td>
          <td>
            ${suggestedQty > 0 ? `<button class="btn btn-xs btn-primary" data-ms-create-po="1" data-item="${esc(r.item_code || "")}" data-qty="${esc(shortageQty)}" data-description="${esc(r.item_code || "")}" data-wp="${esc(r.wastage_pct || 0)}" data-wq="${esc(r.wastage_qty || 0)}">${__("Create PO")}</button>` : `<span class="text-muted">-</span>`}
          </td>
        </tr>
      `;
    });
  });

  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead>
        <tr>
          <th style="width:13%;min-width:140px;">Item Group / Raw Material</th>
          <th style="width:120px;text-align:right;">Qty/BOM</th>
          <th style="width:130px;text-align:right;">Required</th>
          <th style="width:130px;text-align:right;">Wastage on BOM</th>
          <th style="width:100px;text-align:right;">Stock</th>
          <th style="width:120px;text-align:right;">Shortage</th>
          <th style="width:130px;text-align:right;">Suggested Qty</th>
          <th style="width:100px;text-align:right;">PO Qty</th>
          <th style="width:130px;text-align:right;">Wastage on PO</th>
          <th style="width:100px;text-align:right;">PR Qty</th>
          <th style="width:130px;text-align:right;">Pending PO Qty</th>
          <th style="width:130px;text-align:right;">Last Purchase Price</th>
          <th style="width:120px;">Create PO</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function poAnalyticsSection(data){
  const d = data || {};
  return `
    ${poAnalyticsOverviewCard(d.overview || {})}
    <div style="margin-top:12px;font-weight:900;">Item Group-Wise PO Status</div>
    ${poItemGroupTable(d.item_group_rows || [])}
    <div style="margin-top:12px;font-weight:900;">PO-Wise Detail Status</div>
    ${poStatusDetailTable(d.po_status_rows || [])}
  `;
}

function _firstProductionPointers(data){
  const tree = data.production_tree || [];
  let pp = "", wo = "", item = "";
  for (let i = 0; i < tree.length; i++) {
    const node = tree[i] || {};
    if (!pp && node.production_plan && node.production_plan.name && node.production_plan.name !== "Unassigned") pp = node.production_plan.name;
    const ws = node.work_orders || [];
    for (let j = 0; j < ws.length; j++) {
      const w = ws[j] || {};
      if (!wo && w.name) wo = w.name;
      if (!item && w.production_item) item = w.production_item;
    }
  }
  return { pp, wo, item };
}

function _planningRows(data){
  const soRows = data.order_item_summary || [];
  const tree = data.production_tree || [];
  const itemMap = {};
  tree.forEach((ppNode) => {
    const ppName = ((ppNode || {}).production_plan || {}).name || "";
    const ppStatus = ((ppNode || {}).production_plan || {}).status || "";
    ((ppNode || {}).work_orders || []).forEach((wo) => {
      const k = String((wo.production_item || wo.item_code || wo.item_name || "")).trim();
      if (!k) return;
      if (!itemMap[k]) itemMap[k] = { pp: [], pp_statuses: [], wo: [], wo_statuses: [], jc: [], jc_statuses: [] };
      if (ppName && itemMap[k].pp.indexOf(ppName) === -1) itemMap[k].pp.push(ppName);
      if (ppStatus) itemMap[k].pp_statuses.push(ppStatus);
      if (wo.name && itemMap[k].wo.indexOf(wo.name) === -1) itemMap[k].wo.push(wo.name);
      if (wo.status) itemMap[k].wo_statuses.push(wo.status);
      (wo.job_cards || []).forEach((jc) => {
        if (jc.name && itemMap[k].jc.indexOf(jc.name) === -1) itemMap[k].jc.push(jc.name);
        if (jc.status) itemMap[k].jc_statuses.push(jc.status);
      });
    });
  });

  return soRows.map((r, idx) => {
    const k = String(r.item_code || r.item_name || "").trim();
    const m = itemMap[k] || { pp: [], pp_statuses: [], wo: [], wo_statuses: [], jc: [], jc_statuses: [] };
    return {
      idx: idx + 1,
      item_code: r.item_code || "",
      item_name: r.item_name || r.item_code || "",
      ordered_qty: Number(r.ordered_qty || 0),
      delivered_qty: Number(r.delivered_qty || 0),
      pending_qty: Number(r.pending_qty || 0),
      pp_list: m.pp,
      pp_statuses: m.pp_statuses,
      wo_list: m.wo,
      wo_statuses: m.wo_statuses,
      jc_list: m.jc,
      jc_statuses: m.jc_statuses,
    };
  });
}

function _statusChip(hasAny, allDone){
  if (!hasAny) return `<span class="badge badge-secondary">Not Created</span>`;
  return allDone ? `<span class="badge badge-success">Completed</span>` : `<span class="badge badge-warning">In Progress</span>`;
}

function _allDoneStatus(statuses){
  const arr = (statuses || []).map((s) => String(s || "").toLowerCase());
  if (!arr.length) return false;
  return arr.every((s) => s.includes("complete") || s.includes("closed"));
}

function salesOrderItemsPlanningTable(data){
  const rows = _planningRows(data);
  const body = rows.length ? rows.map((r) => {
    const ppDone = _allDoneStatus(r.pp_statuses);
    const woDone = _allDoneStatus(r.wo_statuses);
    const jcDone = _allDoneStatus(r.jc_statuses);
    return `
      <tr>
        <td style="text-align:center;">${r.idx}</td>
        <td style="min-width:210px;"><b>${esc(r.item_name)}</b><div class="muted">${esc(r.item_code)}</div></td>
        <td style="text-align:right;">${_n0(r.ordered_qty)}</td>
        <td style="text-align:right;">${_n0(r.delivered_qty)}</td>
        <td style="text-align:right;">${_n0(r.pending_qty)}</td>
        <td>${_statusChip(r.pp_list.length > 0, ppDone)}</td>
        <td>${_statusChip(r.wo_list.length > 0, woDone)}</td>
        <td>${_statusChip(r.jc_list.length > 0, jcDone)}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-xs btn-info" data-plan-action="pp" data-item="${esc(r.item_code)}">PP</button>
          <button class="btn btn-xs btn-dark" data-plan-action="wo" data-item="${esc(r.item_code)}">WO</button>
          <button class="btn btn-xs btn-warning" data-plan-action="mt" data-item="${esc(r.item_code)}">MT</button>
          <button class="btn btn-xs btn-secondary" data-plan-action="mfg" data-item="${esc(r.item_code)}">MFG</button>
          <button class="btn btn-xs btn-success" data-plan-action="dn" data-item="${esc(r.item_code)}">DN</button>
          <button class="btn btn-xs btn-default" data-plan-action="view" data-item="${esc(r.item_code)}">View</button>
        </td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="9" class="text-muted">No item planning rows found.</td></tr>`;

  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
    <thead><tr><th style="width:44px;">#</th><th style="min-width:210px;">Item</th><th style="text-align:right;">Ordered Qty</th><th style="text-align:right;">Delivered</th><th style="text-align:right;">Pending</th><th>Production Plan</th><th>Work Order</th><th>Job Card</th><th>Actions</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

function manufacturingControlCenter(frm, data){
  const p = _firstProductionPointers(data);
  const totals = data.production_totals || {};
  const woOpen = (data.production_tree || []).reduce((a, n) => a + ((n.work_orders || []).length), 0);
  const jcTotal = (data.production_tree || []).reduce((a, n) => a + ((n.work_orders || []).reduce((x, w) => x + ((w.job_cards || []).length), 0)), 0);
  const completedPct = Number(totals.completion_pct || 0);
  return `
    <div class="so-card" style="border-color:#c7d2fe;">
      <div class="so-card-h"><div class="t">Manufacturing Control Center</div><div class="s">Same logic style with Live Work Order integration</div></div>
      <div class="so-card-b">
        <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;">
          <div class="so-mini-card"><div class="so-mini-title">Company</div><div class="so-mini-val">${esc(frm.doc.company || "-")}</div></div>
          <div class="so-mini-card"><div class="so-mini-title">Sales Order</div><div class="so-mini-val">${esc(frm.doc.name || "-")}</div></div>
          <div class="so-mini-card"><div class="so-mini-title">Production Plan</div><div class="so-mini-val">${esc(p.pp || "—")}</div></div>
          <div class="so-mini-card"><div class="so-mini-title">Work Order</div><div class="so-mini-val">${esc(p.wo || "—")}</div></div>
          <div class="so-mini-card"><div class="so-mini-title">Items</div><div class="so-mini-val">${esc(p.item || "Multiple")}</div></div>
        </div>
        <div style="margin-top:10px;padding:10px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-weight:700;">
          Recommended flow: Sales Order -> Production Plan -> Submit Plan -> Create/Submit Work Order -> Material Transfer -> Start/Pause/Complete Job Cards -> Manufacture/Return Material.
        </div>
        <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:10px;">
          <div class="so-mini-card">
            <div class="so-mini-title" style="font-size:11px;">WORK ORDERS</div>
            <div class="so-mini-val" style="font-size:14px;">${_n0(woOpen)}</div>
            <div class="muted" style="font-size:11px;">${_n0(woOpen)} open / in progress</div>
          </div>
          <div class="so-mini-card">
            <div class="so-mini-title" style="font-size:11px;">MATERIAL TRANSFER</div>
            <div class="so-mini-val" style="font-size:14px;">${completedPct.toFixed(1)}%</div>
          </div>
          <div class="so-mini-card">
            <div class="so-mini-title" style="font-size:11px;">JOB CARDS</div>
            <div class="so-mini-val" style="font-size:14px;">${_n0(jcTotal)}</div>
            <div class="muted" style="font-size:11px;">completed / total</div>
          </div>
          <div class="so-mini-card">
            <div class="so-mini-title" style="font-size:11px;">MANUFACTURE</div>
            <div class="so-mini-val" style="font-size:14px;">${completedPct.toFixed(1)}%</div>
          </div>
          <div class="so-mini-card">
            <div class="so-mini-title" style="font-size:11px;">DELIVERY</div>
            <div class="so-mini-val" style="font-size:14px;">${_n0((data.order_item_summary || []).reduce((a, r) => a + Number(r.delivered_qty || 0), 0))}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px;">
          <button class="btn btn-sm btn-success" data-so-action="create_sales_order">Create Sales Order</button>
          <button class="btn btn-sm btn-info" data-so-action="create_production_plan">Create Production Plan</button>
          <button class="btn btn-sm btn-dark" data-so-action="create_work_order">Create Work Order</button>
          <button class="btn btn-sm btn-secondary" data-so-action="manage_docs">Manage Existing Docs</button>
          <button class="btn btn-sm btn-warning" data-so-action="create_material_transfer">Material Transfer</button>
          <button class="btn btn-sm btn-primary" data-so-action="create_manufacture_entry">Manufacture Entry</button>
          <button class="btn btn-sm btn-success" data-so-action="create_delivery_note">Create Delivery Note</button>
          <button class="btn btn-sm btn-secondary" data-so-action="return_disassemble">Return / Disassemble</button>
        </div>
      </div>
    </div>
  `;
}

function bindDashboardActionButtons($wrap, frm){
  const openActionCenterForItem = (item) => {
    const d = new frappe.ui.Dialog({
      title: __("Action Center"),
      size: "large",
      fields: [{ fieldtype: "HTML", fieldname: "body" }],
    });
    d.fields_dict.body.$wrapper.html(`
      <div style="margin-bottom:10px;padding:8px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
        <b>${__("Sales Order")}:</b> ${esc(frm.doc.name)} &nbsp; | &nbsp; <b>${__("Item")}:</b> ${esc(item || "-")}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;">
        <button class="btn btn-sm btn-info" data-ac="pp">${__("Create Production Plan")}</button>
        <button class="btn btn-sm btn-dark" data-ac="wo">${__("Create Work Order")}</button>
        <button class="btn btn-sm btn-warning" data-ac="mt">${__("Material Transfer")}</button>
        <button class="btn btn-sm btn-primary" data-ac="mfg">${__("Manufacture Entry")}</button>
        <button class="btn btn-sm btn-success" data-ac="dn">${__("Create Delivery Note")}</button>
        <button class="btn btn-sm btn-secondary" data-ac="jc">${__("Open Job Cards")}</button>
      </div>
    `);
    const $w = d.fields_dict.body.$wrapper;
    $w.find("[data-ac]").on("click", function(e){
      e.preventDefault();
      const a = $(this).attr("data-ac");
      if (a === "pp") {
        frappe.route_options = { get_items_from: "Sales Order", sales_order: frm.doc.name, item_code: item, company: frm.doc.company };
        frappe.new_doc("Production Plan");
      } else if (a === "wo") {
        frappe.route_options = { sales_order: frm.doc.name, production_item: item, company: frm.doc.company };
        frappe.new_doc("Work Order");
      } else if (a === "mt") {
        frappe.route_options = { stock_entry_type: "Material Transfer for Manufacture", sales_order: frm.doc.name, item_code: item, company: frm.doc.company };
        frappe.new_doc("Stock Entry");
      } else if (a === "mfg") {
        frappe.route_options = { stock_entry_type: "Manufacture", sales_order: frm.doc.name, item_code: item, company: frm.doc.company };
        frappe.new_doc("Stock Entry");
      } else if (a === "dn") {
        frappe.route_options = { against_sales_order: frm.doc.name, item_code: item, company: frm.doc.company };
        frappe.new_doc("Delivery Note");
      } else if (a === "jc") {
        frappe.set_route("List", "Job Card", { sales_order: frm.doc.name });
      }
      d.hide();
    });
    d.show();
  };

  const openNew = (doctype, routeOptions) => {
    frappe.route_options = routeOptions || {};
    frappe.new_doc(doctype);
  };

  $wrap.find("[data-so-action]").off("click").on("click", function(e){
    e.preventDefault();
    e.stopPropagation();
    const action = $(this).attr("data-so-action");
    const common = { sales_order: frm.doc.name, company: frm.doc.company };
    if (action === "create_sales_order") openNew("Sales Order", { company: frm.doc.company });
    else if (action === "create_production_plan") openNew("Production Plan", { get_items_from: "Sales Order", sales_order: frm.doc.name, company: frm.doc.company });
    else if (action === "create_work_order") openNew("Work Order", { sales_order: frm.doc.name, company: frm.doc.company });
    else if (action === "create_material_transfer") openNew("Stock Entry", { stock_entry_type: "Material Transfer for Manufacture", ...common });
    else if (action === "create_manufacture_entry") openNew("Stock Entry", { stock_entry_type: "Manufacture", ...common });
    else if (action === "create_delivery_note") openNew("Delivery Note", { against_sales_order: frm.doc.name, ...common });
    else if (action === "return_disassemble") openNew("Stock Entry", { stock_entry_type: "Material Transfer", purpose: "Material Transfer", ...common });
    else if (action === "manage_docs") frappe.set_route("query-report", "Purchase Order updated Status");
  });

  $wrap.find("[data-plan-action]").off("click").on("click", function(e){
    e.preventDefault();
    e.stopPropagation();
    const action = $(this).attr("data-plan-action");
    const item = ($(this).attr("data-item") || "").trim();
    if (action === "pp") {
      frappe.route_options = { get_items_from: "Sales Order", sales_order: frm.doc.name, item_code: item, company: frm.doc.company };
      frappe.new_doc("Production Plan");
    } else if (action === "wo") {
      frappe.route_options = { sales_order: frm.doc.name, production_item: item, company: frm.doc.company };
      frappe.new_doc("Work Order");
    } else if (action === "mt") {
      frappe.route_options = { stock_entry_type: "Material Transfer for Manufacture", sales_order: frm.doc.name, item_code: item, company: frm.doc.company };
      frappe.new_doc("Stock Entry");
    } else if (action === "mfg") {
      frappe.route_options = { stock_entry_type: "Manufacture", sales_order: frm.doc.name, item_code: item, company: frm.doc.company };
      frappe.new_doc("Stock Entry");
    } else if (action === "dn") {
      frappe.route_options = { against_sales_order: frm.doc.name, item_code: item, company: frm.doc.company };
      frappe.new_doc("Delivery Note");
    } else if (action === "view") {
      openActionCenterForItem(item);
    }
  });
}

function bindMaterialShortageCreatePo($wrap, frm, data){
  const soPoRows = (frm.doc.custom_po_item || []);
  const itemDefaults = {};
  soPoRows.forEach((r) => {
    const k = String(r.item || "").trim();
    if (!k) return;
    itemDefaults[k] = {
      supplier: r.supplier || "",
      warehouse: r.warehouse || "",
      rate: Number(r.rate || 0),
      custom_wastage_percentage: Number(r.custom_wastage_percentage || 0),
      custom_wastage_qty: Number(r.custom_wastage_qty || 0),
      extra_qty: Number(r.custom_extra_qty || 0),
    };
  });

  $wrap.find("[data-ms-create-po='1']").off("click").on("click", function(e){
    e.preventDefault();
    e.stopPropagation();
    const item = ($(this).attr("data-item") || "").trim();
    const defaultQty = flt($(this).attr("data-qty") || 0);
    const description = ($(this).attr("data-description") || "").trim();
    const wp = flt($(this).attr("data-wp") || 0);
    const wq = flt($(this).attr("data-wq") || 0);
    if (!item || defaultQty <= 0) {
      frappe.msgprint(__("Invalid row for Create PO."));
      return;
    }
    const d = itemDefaults[item] || {};
    const ml = (data.material_shortage || []).find((r) => String(r.item_code || "").trim() === item) || {};
    open_po_item_data_entry(frm, {
      item_code: item,
      qty: defaultQty,
      descriptions: description || item,
      select_for_po: 1,
      supplier: d.supplier || ml.last_supplier || "",
      warehouse: d.warehouse || "",
      rate: Number(d.rate || ml.last_purchase_rate || 0),
      custom_wastage_percentage: wp || Number(d.custom_wastage_percentage || 0),
      custom_wastage_qty: wq || Number(d.custom_wastage_qty || 0),
      extra_qty: Number(d.extra_qty || 0),
    });
  });

  $wrap.find("[data-ms-create-po-group='1']").off("click").on("click", function(e){
    e.preventDefault();
    e.stopPropagation();
    const group = ($(this).attr("data-group") || "").trim();
    if (!group) return;
    const rows = (data.material_shortage || []).filter((r) => {
      if ((r.item_group || "") !== group) return false;
      const suggested = Number(r.shortage_qty || 0) + Number(r.wastage_qty || 0);
      return suggested > 0;
    });
    if (!rows.length) {
      frappe.msgprint(__("No shortage rows found for this Item Group."));
      return;
    }
    const prefillRows = rows.map((r) => ({
      ...(itemDefaults[r.item_code || ""] || {}),
      item_code: r.item_code || "",
      qty: Number(r.shortage_qty || 0) + Number(r.wastage_qty || 0),
      base_qty: Number(r.required_qty || 0),
      custom_wastage_percentage: Number(r.wastage_pct || 0),
      custom_wastage_qty: Number(r.wastage_qty || 0),
      po_qty: Number(r.shortage_qty || 0) + Number(r.wastage_qty || 0),
      rate: Number(r.last_purchase_rate || 0),
      supplier: (itemDefaults[r.item_code || ""] || {}).supplier || r.last_supplier || "",
      descriptions: r.item_code || "",
      select_for_po: 1,
    })).filter((r) => r.item_code && (Number(r.qty || 0) > 0 || Number(r.po_qty || 0) > 0));

    if (!prefillRows.length) {
      frappe.msgprint(__("No valid rows found for Create PO."));
      return;
    }
    open_po_item_data_entry(frm, { rows: prefillRows, select_for_po: 1 });
  });
}

function buildDashboard(frm, data){
  const totals = data.production_totals || {};
  const poTotal = poTotalAmount(data.po_item_group_summary || []);
  return `
    ${css()}
    <div class="so-hdr">
      <div class="so-title">Sales Order Connection Report</div>
      <div class="so-sub">Sales Order: <b>${esc(frm.doc.name)}</b></div>
      ${kpis(totals)}
    </div>

    ${sectionBlock('profit', 'Profit and Loss Section', 'linear-gradient(90deg,#0f766e,#14b8a6)', `
      ${card("Profit Dashboard", "Estimated cost from default BOM and sales amount", `${profitSummaryCard(data.profit_summary || {})}<div style="margin-top:12px;font-weight:900;">Profit by Item</div>${profitByItemTable(data.profit_by_item || [])}`)}
      ${card("Purchase Order Total Amount", "Total amount of Purchase Orders linked with this Sales Order", `<div class="so-mini-card"><div class="so-mini-title">TOTAL PO AMOUNT</div><div class="so-mini-val" style="font-size:26px;">${_money0(poTotal)}</div></div>`)}
      ${card("PO Amount by Item Group", "Purchase Order amount summary linked with this Sales Order", profitGroupPurchaseTable(data.po_item_group_summary || []))}
      ${card("Employee Item-wise Labour Cost", "From per-piece-report > Employee item-wise", labourCostTable(data.labour_cost_employee_item_wise || [], data.labour_cost_summary || {}))}
    `, false)}

    ${sectionBlock('purchase', 'Purchase Order Section', 'linear-gradient(90deg,#7c3aed,#9333ea)', `
      ${card("PO Analytics (From PO Tab)", "Item Group-Wise PO Status", `${poAnalyticsOverviewCard((data.custom_po_analytics || {}).overview || {})}${poItemGroupTable((data.custom_po_analytics || {}).item_group_rows || [])}`)}
      ${card("Material Shortage & Purchase Suggestion", "Grouped by Item Group with PO and PR planning progress", materialShortageTable(data.material_shortage || []))}
      ${card("PO-Wise status Report", "Collapsed by Supplier", poStatusDetailTable((data.custom_po_analytics || {}).po_status_rows || []))}
      ${card("Purchase Flow Tracker", "PO + Purchase Receipt + Purchase Invoice in one row with PO cost", purchaseFlowTable(data.purchase_flow_rows || []))}
    `, false)}

    ${sectionBlock('production', 'Production Section', 'linear-gradient(90deg,#7a3e00,#a16207)', `
      ${manufacturingControlCenter(frm, data)}
      ${card("Sales Order Items Planning", "Planning overview by Sales Order item", salesOrderItemsPlanningTable(data))}
      ${card("Production Details", "Job Card / Operation / Material details", productionTree(data.production_tree||[]))}
      ${card("Production Timeline", "Work Orders, Delivery Notes and Invoices timeline", timelineView(data.gantt_timeline || []))}
      ${card("Machine Utilization", "Workstation time from Job Card Time Logs", machineUtilization(data.machine_utilization || []))}
      ${card("Employee Efficiency", "Completed quantity vs time spent", employeeEfficiency(data.employee_efficiency || []))}
    `, false)}

    ${sectionBlock('bom', 'BOM and Raw Material Section', 'linear-gradient(90deg,#0891b2,#06b6d4)', `${card("BOM & Raw Materials", "Item and BOM merged for easier reading", bomTree(data.bom_tree||[]))}`, false)}

    ${sectionBlock('dispatch', 'Dispatch Section', 'linear-gradient(90deg,#ea580c,#f97316)', `
      ${card("Order Item Summary", "Ordered, delivered, invoiced and pending quantity by item", orderItemSummaryTable(data.order_item_summary || []))}
      ${card("Delivery & Billing", "Delivery Note -> Invoices, click document number for popup detail", deliveryHierarchy(data.sales_fulfillment_hierarchy||[]))}
      ${card("Delivery Risk Prediction", "Delivery delay warning based on completion and delivery date", deliveryPredictionCard(data.delivery_prediction || {}))}
    `, false)}
  `;
}

frappe.ui.form.on("Item PO", {
  item(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    if (!row) return;

    if (!row.descriptions && row.item) {
      frappe.db.get_value("Item", row.item, "description").then((r) => {
        const desc = r && r.message ? r.message.description : null;
        if (!desc) return;
        frappe.model.set_value(cdt, cdn, "descriptions", desc);
      });
    }
  },

  create_po(frm, cdt, cdn) {
    const row = locals[cdt][cdn];

    if (frm.doc.docstatus === 2) {
      frappe.msgprint(__("Cancelled Sales Order is not allowed."));
      return;
    }

    if (!row || !row.name) {
      frappe.msgprint(__("Please save the row first."));
      return;
    }

    if (row.purchase_order) {
      frappe.msgprint(__("Purchase Order already exists: {0}", [row.purchase_order]));
      return;
    }

    const errors = validate_rows_before_create([row]);
    if (errors.length) {
      frappe.msgprint({
        title: __("Cannot Create Purchase Order"),
        indicator: "red",
        message: errors.join("<br>"),
      });
      return;
    }

    create_po_from_rows(frm, [row.name]);
  },
});

function fill_bank_fields(frm, bank_account) {
  if (!bank_account) {
    frm.set_value("custom_bank_name", "");
    frm.set_value("custom_account_title", "");
    frm.set_value("custom_account_number", "");
    frm.set_value("custom_iban", "");
    return;
  }

  frappe.db.get_doc("Bank Account", bank_account).then((d) => {
    frm.set_value("custom_bank_name", d.bank || "");
    frm.set_value("custom_account_title", d.account_name || "");
    frm.set_value("custom_account_number", d.bank_account_no || "");
    frm.set_value("custom_iban", d.iban || "");
  });
}

frappe.ui.form.on("Sales Order", {
  setup(frm) {
    frm.set_query("custom_bank_account", () => ({
      filters: {
        is_company_account: 1,
        company: frm.doc.company || undefined,
        disabled: 0,
      },
    }));
  },
  custom_bank_account(frm) {
    fill_bank_fields(frm, frm.doc.custom_bank_account);
  },
  company(frm) {
    if (frm.doc.custom_bank_account) {
      fill_bank_fields(frm, frm.doc.custom_bank_account);
    }
  },
  refresh(frm) {
    if (
      frm.doc.custom_bank_account &&
      !frm.doc.custom_bank_name &&
      !frm.doc.custom_account_title
    ) {
      fill_bank_fields(frm, frm.doc.custom_bank_account);
    }
  },
});

frappe.ui.form.on("Sales Order", {
  custom_wastage_mode(frm) {
    if (frm.doc.__islocal) return;
    frm.refresh_field("custom_wastages");
    if (frm.doc.docstatus === 1) {
      frm.dashboard && frm.dashboard.clear_headline && frm.dashboard.clear_headline();
      setTimeout(() => frm.events && frm.events.refresh && frm.events.refresh(frm), 50);
    }
  },
  custom_manual_wastage_percent(frm) {
    if (frm.doc.__islocal) return;
    if (frm.doc.docstatus === 1) {
      setTimeout(() => frm.events && frm.events.refresh && frm.events.refresh(frm), 50);
    }
  },
});
