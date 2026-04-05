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
  .so-table thead th{color:#fff !important;background:linear-gradient(90deg,#1d4ed8,#06b6d4) !important;border-color:#1e40af !important;font-weight:900 !important;font-size:12px !important;}
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
      <div class="so-mini-card"><div class="so-mini-title">ORDERED QTY</div><div class="so-mini-val">${flt(o.ordered_qty || 0)}</div></div>
      <div class="so-mini-card"><div class="so-mini-title">RECEIVED QTY</div><div class="so-mini-val">${flt(o.received_qty || 0)}</div></div>
      <div class="so-mini-card"><div class="so-mini-title">PENDING QTY</div><div class="so-mini-val">${flt(o.pending_qty || 0)}</div></div>
      <div class="so-mini-card"><div class="so-mini-title">RECEIVED %</div><div class="so-mini-val">${esc(o.received_pct || 0)}%</div></div>
      <div class="so-mini-card"><div class="so-mini-title">PENDING %</div><div class="so-mini-val">${esc(o.pending_pct || 0)}%</div></div>
      <div class="so-mini-card"><div class="so-mini-title">PO CREATED / PENDING</div><div class="so-mini-val">${esc(o.po_created_rows || 0)} / ${esc(o.po_pending_rows || 0)}</div></div>
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

frappe.ui.form.on("Sales Order", {
  refresh(frm) {
    if (frm.doc.docstatus === 2) return;
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
    }, __("Create"));
  },
});

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
