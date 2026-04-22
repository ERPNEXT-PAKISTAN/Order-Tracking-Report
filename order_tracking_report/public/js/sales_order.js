frappe.ui.form.on("Sales Order", {
  setup(frm) {
    const getWastageItemGroupQuery = () => {
      const groups = getMaterialShortageItemGroups(frm);
      if (!groups.length) {
        return { filters: { name: ["in", [""]] } };
      }

      return {
        filters: {
          name: ["in", groups],
        },
      };
    };

    frm.set_query("custom_bank_account", () => ({
      filters: {
        is_company_account: 1,
        company: frm.doc.company || undefined,
        disabled: 0,
      },
    }));

    frm.set_query("item_group", "custom_wastages", getWastageItemGroupQuery);
    frm.__get_wastage_item_group_query = getWastageItemGroupQuery;
  },

  refresh(frm) {
    arrangeWastageControls(frm);

    if (!frm.doc.custom_wastage_mode) {
      frm.set_value("custom_wastage_mode", "Wastage");
    }

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

    if (
      frm.doc.custom_bank_account &&
      !frm.doc.custom_bank_name &&
      !frm.doc.custom_account_title
    ) {
      fill_bank_fields(frm, frm.doc.custom_bank_account);
    }

    if (frm.doc.docstatus !== 2) {
      frm.add_custom_button(__("PO Item Data Entry"), () => {
        open_po_item_data_entry(frm);
      }, __("PO Tools"));

      if (frappe.model.can_create("Purchase Order") && (frm.doc.custom_po_item || []).length) {
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
      }
    }

    const f = frm.get_field("custom_detail_status");
    if (!f) return;

    if (frm.is_new()) {
      f.$wrapper.html(`<div class="text-muted">Save Sales Order to view dashboard.</div>`);
      return;
    }

    frm.add_custom_button(__("Refresh Detail Status"), () => {
      frm.trigger("render_execution_dashboard");
    }, __("View"));

    frm.add_custom_button(__("Sales Order Live"), () => {
      frappe.route_options = {
        sales_order: frm.doc.name,
        company: frm.doc.company || "",
        customer: frm.doc.customer || "",
      };
      frappe.set_route("sales-order-live");
    }, __("View"));

    frm.add_custom_button(__("Live Work Order"), () => {
      frappe.route_options = {
        sales_order: frm.doc.name,
        company: frm.doc.company || "",
      };
      frappe.set_route("live-work-order");
    }, __("View"));

    frm.add_custom_button(__("All Related Links"), () => {
      openAllRelatedLinksDialog(frm);
    }, __("View"));

    frm.add_custom_button(__("Sales Order Status Board"), () => {
      frappe.route_options = {
        sales_order: frm.doc.name,
        company: frm.doc.company || "",
        customer: frm.doc.customer || "",
      };
      frappe.set_route("sales-order-status-board");
    }, __("View"));

    frm.add_custom_button(__("Financials"), () => {
      frappe.route_options = {
        sales_order: frm.doc.name,
        company: frm.doc.company || "",
        customer: frm.doc.customer || "",
      };
      frappe.set_route("finanicals");
    }, __("View"));

    frm.add_custom_button(__("PL by Order"), () => {
      frappe.route_options = {
        sales_order: frm.doc.name,
        company: frm.doc.company || "",
        customer: frm.doc.customer || "",
        only_pl: 1,
      };
      frappe.set_route("pl-by-order");
    }, __("View"));

    frm.add_custom_button(__("Purchase Order Status Report"), () => {
      frappe.route_options = {
        company: frm.doc.company || "",
      };
      frappe.set_route("query-report", "Purchase Order Status Report");
    }, __("View"));

    frm.add_custom_button(__("Sales Order Status Report"), () => {
      frappe.route_options = {
        sales_order: frm.doc.name || "",
        company: frm.doc.company || "",
        customer: frm.doc.customer || "",
      };
      frappe.set_route("query-report", "Sales Order Status Report");
    }, __("View"));

    frm.add_custom_button(__("Stock Report"), () => {
      frappe.route_options = {
        company: frm.doc.company || "",
      };
      frappe.set_route("query-report", "Stock Report");
    }, __("View"));

    frm.trigger("render_execution_dashboard");
  },

  render_execution_dashboard(frm) {
    const f = frm.get_field("custom_detail_status");
    if (!f) return;

    const defaultLocation = getDefaultWarehouse("source", frm.doc.company || "");
    const currentLocation = (frm.__connection_stock_location || defaultLocation).trim();
    frm.__connection_stock_location = currentLocation;
    f.$wrapper.html(`
      <div class="so-connection-filter" style="display:flex;gap:8px;align-items:end;flex-wrap:nowrap;margin-bottom:10px;">
        <div data-field="stock_location" style="min-width:260px;flex:1 1 260px;"></div>
        <button class="btn btn-sm btn-primary" data-action="apply-stock-location">${__("Apply Location")}</button>
        <button class="btn btn-sm btn-default" data-action="clear-stock-location">${__("Clear")}</button>
      </div>
      <div data-dashboard-body><div class="text-muted">Loading report...</div></div>
    `);

    const locationControl = frappe.ui.form.make_control({
      parent: f.$wrapper.find('[data-field="stock_location"]')[0],
      df: {
        fieldtype: "Link",
        fieldname: "stock_location",
        label: __("Stock Location"),
        options: "Warehouse",
      },
      render_input: true,
    });
    locationControl.set_value(currentLocation || "");

    // Only filter when Apply Location is clicked
    f.$wrapper.find('[data-action="apply-stock-location"]').off("click").on("click", () => {
      const selectedLocation = (locationControl.get_value() || "").trim();
      if (selectedLocation && selectedLocation !== frm.__connection_stock_location) {
        frm.__connection_stock_location = selectedLocation;
        frm.trigger("render_execution_dashboard");
      }
    });

    f.$wrapper.find('[data-action="clear-stock-location"]').off("click").on("click", () => {
      if (frm.__connection_stock_location !== defaultLocation) {
        frm.__connection_stock_location = defaultLocation;
        frm.trigger("render_execution_dashboard");
      }
    });

    const $dashboardBody = f.$wrapper.find('[data-dashboard-body]');

    frappe.call({
      method: "order_tracking_report.api.custom_so_execution_status",
      args: {
        sales_order: frm.doc.name,
        stock_location: (frm.__connection_stock_location || "").trim(),
      },
      callback: (r) => {
        const rawData = (r && r.message) ? r.message : {};
        const data = filterCancelledConnectionData(rawData);
        frm.__connection_stock_location = (data.stock_location || frm.__connection_stock_location || "").trim();
        cacheMaterialShortageItemGroups(frm, data);
        $dashboardBody.html(buildDashboard(frm, data));
        bindToggles($dashboardBody);
        bindPopupLinks($dashboardBody);
        bindSectionToggles($dashboardBody);
        bindDailyOperationProductionToggles($dashboardBody);
        bindMaterialShortageCreatePo($dashboardBody, frm, data);
        bindDashboardActionButtons($dashboardBody, frm, data);
      },
      error: () => {
        $dashboardBody.html(`<div class="text-danger">Detail status dashboard is not available.</div>`);
      }
    });
  },

  custom_bank_account(frm) {
    fill_bank_fields(frm, frm.doc.custom_bank_account);
  },

  company(frm) {
    if (frm.doc.custom_bank_account) {
      fill_bank_fields(frm, frm.doc.custom_bank_account);
    }
  },

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

  custom_wastages_add(frm, cdt, cdn) {
    const row = locals[cdt] && locals[cdt][cdn];
    if (!row) {
      return;
    }

    const groups = getMaterialShortageItemGroups(frm);
    if (!groups.length) {
      return;
    }

    const usedGroups = new Set(
      (frm.doc.custom_wastages || [])
        .filter((d) => d.name !== cdn)
        .map((d) => String(d.item_group || "").trim())
        .filter(Boolean)
    );

    const nextGroup = groups.find((groupName) => !usedGroups.has(groupName)) || groups[0];
    if (nextGroup && !row.item_group) {
      frappe.model.set_value(cdt, cdn, "item_group", nextGroup);
    }
    if (!row.source) {
      frappe.model.set_value(cdt, cdn, "source", "Wastage");
    }
  },
});

function getMaterialShortageItemGroups(frm) {
  return Array.isArray(frm.__material_shortage_item_groups) ? frm.__material_shortage_item_groups : [];
}

function cacheMaterialShortageItemGroups(frm, data) {
  const groupValueMap = {};
  ((data && data.material_shortage) || []).forEach((row) => {
    const groupName = String((row && row.item_group) || "").trim();
    if (!groupName) {
      return;
    }

    if (!(groupName in groupValueMap)) {
      groupValueMap[groupName] = {
        wastage: Number((row && row.wastage_pct) || 0),
        manual: Number((row && row.wastage_pct) || 0),
        po: Number((row && row.wastage_pct) || 0),
      };
    }
  });

  const groups = Array.from(new Set(
    ((data && data.material_shortage) || [])
      .map((row) => String((row && row.item_group) || "").trim())
      .filter(Boolean)
  ));
  frm.__material_shortage_item_groups = groups;
  frm.__material_shortage_group_values = groupValueMap;
  syncCustomWastagesFromMaterialShortage(frm);
  if (frm.fields_dict.custom_wastages && frm.fields_dict.custom_wastages.grid) {
    const gridField = frm.fields_dict.custom_wastages.grid.get_field("item_group");
    if (gridField) {
      gridField.get_query = () => frm.__get_wastage_item_group_query ? frm.__get_wastage_item_group_query() : {};
    }
    frm.fields_dict.custom_wastages.grid.refresh();
  }
}

function syncCustomWastagesFromMaterialShortage(frm) {
  const groups = getMaterialShortageItemGroups(frm);
  if (!groups.length) {
    return;
  }

  const rows = frm.doc.custom_wastages || [];
  const groupValues = frm.__material_shortage_group_values || {};
  const blankRows = rows.filter((row) => !String(row.item_group || "").trim());
  const existingGroups = new Set(
    rows.map((row) => String(row.item_group || "").trim()).filter(Boolean)
  );
  let mutated = false;

  if (!frm.doc.custom_wastage_mode) {
    frm.doc.custom_wastage_mode = "Wastage";
    mutated = true;
  }

  rows.forEach((row) => {
    if (!row.source) {
      row.source = "Wastage";
      mutated = true;
    }

    const groupName = String(row.item_group || "").trim();
    const defaults = groupValues[groupName] || null;
    if (!defaults) {
      return;
    }

    if ((row.wastage === undefined || row.wastage === null || row.wastage === "") || Number(row.wastage) === 0) {
      row.wastage = defaults.wastage;
      mutated = true;
    }
    if (row.manual === undefined || row.manual === null || row.manual === "") {
      row.manual = defaults.manual;
      mutated = true;
    }
    if (row.po === undefined || row.po === null || row.po === "") {
      row.po = defaults.po;
      mutated = true;
    }
  });

  groups.forEach((groupName) => {
    if (existingGroups.has(groupName)) {
      return;
    }

    const targetRow = blankRows.shift();
    if (targetRow) {
      const defaults = groupValues[groupName] || {};
      targetRow.item_group = groupName;
      targetRow.source = targetRow.source || "Wastage";
      targetRow.wastage = defaults.wastage || 0;
      targetRow.manual = defaults.manual || 0;
      targetRow.po = defaults.po || 0;
      existingGroups.add(groupName);
      mutated = true;
      return;
    }

    const newRow = frm.add_child("custom_wastages");
    const defaults = groupValues[groupName] || {};
    newRow.item_group = groupName;
    newRow.source = "Wastage";
    newRow.wastage = defaults.wastage || 0;
    newRow.manual = defaults.manual || 0;
    newRow.po = defaults.po || 0;
    existingGroups.add(groupName);
    mutated = true;
  });

  if (mutated) {
    frm.refresh_field("custom_wastages");
  }

  arrangeWastageControls(frm);
}

function arrangeWastageControls(frm) {
  const wastagesField = frm.get_field("custom_wastages");
  const modeField = frm.get_field("custom_wastage_mode");
  const manualField = frm.get_field("custom_manual_wastage_percent");
  if (!wastagesField || !modeField || !manualField) {
    return;
  }

  const $wastages = wastagesField.$wrapper;
  const $mode = modeField.$wrapper;
  const $manual = manualField.$wrapper;
  if (!$wastages || !$wastages.length || !$mode || !$mode.length || !$manual || !$manual.length) {
    return;
  }

  const $container = $wastages.parent();
  if ($container && $container.length) {
    // Keep controls on one row and keep custom_wastages as the last block.
    $container.append($mode);
    $container.append($manual);
    $container.append($wastages);
  }

  $mode.css({ display: "inline-block", width: "49%", verticalAlign: "top", paddingRight: "8px" });
  $manual.css({ display: "inline-block", width: "49%", verticalAlign: "top" });
  $wastages.css({ display: "block", width: "100%", marginTop: "8px" });
}

function esc(s){ return frappe.utils.escape_html(s == null ? "" : String(s)); }
let liveWorkOrderBridgePromise = null;

function ensureLiveWorkOrderBridge() {
  if (window.openExistingManufacturingManager) {
    return Promise.resolve();
  }
  if (liveWorkOrderBridgePromise) {
    return liveWorkOrderBridgePromise;
  }

  liveWorkOrderBridgePromise = frappe.call({
    method: "order_tracking_report.api.get_custom_html_block_page_payload",
    args: { block_name: "Live Work Order" },
  }).then((response) => {
    if (window.openExistingManufacturingManager) {
      return;
    }

    let host = document.getElementById("otr-live-work-order-bridge-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "otr-live-work-order-bridge-host";
      host.style.position = "absolute";
      host.style.left = "-99999px";
      host.style.top = "-99999px";
      host.style.width = "1px";
      host.style.height = "1px";
      host.style.overflow = "hidden";
      document.body.appendChild(host);
    }

    const payload = response.message || {};
    host.innerHTML = payload.html || "";
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.text = [
      "var root_element = document.getElementById('live_production_root') || document;",
      payload.script || "",
    ].join("\n");
    host.appendChild(script);
  }).catch((error) => {
    liveWorkOrderBridgePromise = null;
    throw error;
  });

  return liveWorkOrderBridgePromise;
}
function slug(doctype){ return String(doctype||"").toLowerCase().split(" ").join("-"); }
function num(v){ return v == null ? 0 : v; }
function soFlt(v){ return frappe.format ? frappe.format(v || 0, {fieldtype:"Float"}) : (v || 0); }
function fmtCurrency(v){
  try { return format_currency(v || 0); } catch(e){ return soFlt(v || 0); }
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
  .so-prod-pp-head{background:linear-gradient(90deg,#ecfeff,#dbeafe);border:1px solid #bfdbfe;border-radius:10px;padding:2px 8px;color:#0c4a6e;display:inline-flex;align-items:center;gap:6px;}
  .so-prod-wo-head{background:linear-gradient(90deg,#fff7ed,#ffedd5);border:1px solid #fed7aa;border-radius:10px;padding:2px 8px;color:#9a3412;display:inline-flex;align-items:center;gap:6px;}
  .so-wo-highlight{border:1px solid #bfdbfe;border-radius:12px;background:linear-gradient(90deg,#f8fbff,#eef6ff);padding:10px 12px;}
  .so-wo-metric-card{border:1px solid #c7d2fe;border-radius:12px;padding:10px 12px;background:#f8faff;}
  .so-wo-metric-card .cap{font-size:12px;color:#475569;}
  .so-wo-metric-card .val{font-size:24px;line-height:1.1;font-weight:900;color:#1e3a8a;}
  .so-wo-metric-strip{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;margin-top:8px;}
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
              <td style="text-align:right;">${soFlt(x.qty)}</td>
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

function toggleHeader(title,right,key,isExpanded=true){
  const icon = isExpanded ? "▾" : "▸";
  return `<div class="so-toggle" data-toggle="so" data-target="${esc(key)}">
    <div class="l"><span data-icon>${icon}</span> ${title}</div>
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
    <div class="so-kpi"><div class="lbl">TOTAL QTY</div><div class="val">${soFlt(t.total_qty)}</div></div>
    <div class="so-kpi"><div class="lbl">PRODUCED QTY</div><div class="val">${soFlt(t.produced_qty)}</div></div>
    <div class="so-kpi"><div class="lbl">PENDING QTY</div><div class="val">${soFlt(t.pending_qty)}</div></div>
    <div class="so-kpi"><div class="lbl">COMPLETION</div><div class="val">${esc(t.completion_pct||0)}%</div></div>
    <div class="so-kpi"><div class="lbl">DELAYED WO</div><div class="val">${soFlt(t.delayed_work_orders||0)}</div></div>
  </div>`;
}

function jobCardTable(rows, itemCode){
  rows = rows || [];
  const actionButtons = (row) => {
    const status = String(row.status || "").toLowerCase();
    const itemAttr = esc(itemCode || row.production_item || "");
    const nameAttr = esc(row.name || "");
    let buttons = `<button class="btn btn-xs btn-default" data-jc-action="manage" data-job-card="${nameAttr}" data-item="${itemAttr}">Manage</button>`;
    if (status === "open" || status === "material transferred") {
      buttons = `<button class="btn btn-xs btn-success" data-jc-action="start" data-job-card="${nameAttr}" data-item="${itemAttr}">Start Job</button>${buttons}`;
    }
    if (status === "work in progress") {
      buttons = `
        <button class="btn btn-xs btn-warning" data-jc-action="pause" data-job-card="${nameAttr}" data-item="${itemAttr}">Pause Job</button>
        <button class="btn btn-xs btn-primary" data-jc-action="complete" data-job-card="${nameAttr}" data-item="${itemAttr}">Complete Job</button>
        ${buttons}
      `;
    }
    return `<div style="display:flex;gap:6px;flex-wrap:wrap;">${buttons}</div>`;
  };
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${docLink("Job Card", r.name)}</td>
      <td>${badge(r.status)}</td>
      <td class="muted">${esc(r.operation||"")}</td>
      <td class="muted">${esc(r.workstation||"")}</td>
      <td style="text-align:right;">${soFlt(r.for_quantity || 0)}</td>
      <td style="text-align:right;">${soFlt(r.total_completed_qty || 0)}</td>
      <td style="text-align:right;">${soFlt(r.process_loss_qty || 0)}</td>
      <td>${actionButtons(r)}</td>
    </tr>
  `).join("") : `<tr><td colspan="8" class="text-muted">No Job Cards.</td></tr>`;
  return `<div class="table-responsive">
    <table class="table table-bordered so-table" style="margin:0;">
      <thead><tr><th style="width:220px;">Job Card</th><th style="width:140px;">Status</th><th>Operation</th><th>Workstation</th><th style="width:120px;text-align:right;">Qty to Mfg</th><th style="width:120px;text-align:right;">Completed Qty</th><th style="width:120px;text-align:right;">Loss Qty</th><th style="width:280px;">Actions</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function jobCardSecondaryItemsTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map((r) => `
    <tr>
      <td>${esc(r.item_code || "")}</td>
      <td style="text-align:right;">${soFlt(r.required_qty || 0)}</td>
      <td style="text-align:right;">${soFlt(r.consumed_qty || 0)}</td>
      <td style="text-align:right;">${soFlt(r.transferred_qty || 0)}</td>
      <td>${esc(r.uom || "")}</td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="text-muted">No secondary items.</td></tr>`;
  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;"><thead><tr><th>Scrap / Secondary Item</th><th style="text-align:right;">Required</th><th style="text-align:right;">Consumed</th><th style="text-align:right;">Transferred</th><th>UOM</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function operationTable(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.operation||"")}</td>
      <td>${badge(r.status)}</td>
      <td class="muted">${esc(r.workstation||"")}</td>
      <td style="text-align:right;">${soFlt(r.completed_qty)}</td>
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
      <td style="text-align:right;">${soFlt(r.required_qty)}</td>
      <td style="text-align:right;">${soFlt(r.transferred_qty)}</td>
      <td style="text-align:right;">${soFlt(r.consumed_qty)}</td>
      <td style="text-align:right;">${soFlt(r.returned_qty)}</td>
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
      <td style="text-align:right;">${soFlt(r.time_in_mins)}</td>
      <td style="text-align:right;font-weight:900;">${soFlt(r.produced_qty)}</td>
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
      <td style="text-align:right;">${soFlt(r.time_in_mins)}</td>
      <td style="text-align:right;font-weight:900;">${soFlt(r.completed_qty)}</td>
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

function __legacy_bomTree_1(tree){
  tree = tree || [];
  if(!tree.length) return `<div class="text-muted">No Active BOM found.</div>`;

  let html = "";
  tree.forEach((itemNode,i)=>{
    const keyItem = `bom_item_${i}_${itemNode.item_code}`;
    html += toggleHeader(`Item: ${esc(itemNode.item_code)}`, `${soFlt(itemNode.order_qty || 0)} Order Qty • ${(itemNode.boms||[]).length} BOM(s)`, keyItem);

    let bhtml = "";
    (itemNode.boms||[]).forEach((b,j)=>{
      const keyBom = `bom_${i}_${j}_${b.bom}`;
      const rms = b.raw_materials || [];
      const rmBody = rms.length ? rms.map(x=>`
        <tr>
          <td>${esc(x.item_code||"")}</td>
          <td style="text-align:right;">${soFlt(x.bom_qty)}</td>
          <td style="text-align:right;">${soFlt(x.required_qty)}</td>
          <td style="text-align:right;">${soFlt(x.stock_qty)}</td>
          <td style="text-align:right;" class="${Number(x.shortage_qty||0)>0?'so-danger':'so-success'}">${soFlt(x.shortage_qty)}</td>
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

    html += toggleHeader(`<span class="so-prod-pp-head">Production Plan: ${esc(pp.name)}</span>`, `${badge(pp.status)} • ${wos.length} WO`, keyPP, false);

    let woh = "";
    wos.forEach((wo,j)=>{
      const keyWO = `wo_${i}_${j}_${wo.name}`;

      const top = `
        <div class="so-wo-highlight" style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div>
            <div style="font-weight:900;font-size:13px;">${docLink("Work Order", wo.name)}</div>
            <div class="muted">Item: ${esc(wo.production_item||"")}</div>
            <div class="muted">Plan: ${esc(fmtDT(wo.planned_start_date))} → ${esc(fmtDT(wo.planned_end_date))}</div>
            ${wo.is_delayed ? `<div class="so-danger">Delayed Work Order</div>` : ``}
            <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
              <button class="btn btn-xs btn-primary" data-plan-action="ac" data-item="${esc(wo.production_item || "")}">Action Center</button>
            </div>
          </div>
          <div class="so-wo-metric-card" style="text-align:right;min-width:230px;">
            <div>${badge(wo.status)}</div>
            <div class="cap" style="margin-top:6px;">Qty</div>
            <div class="val">${soFlt(wo.qty)}</div>
            <div class="so-wo-metric-strip">
              <span class="so-summary-chip">Done <b>${soFlt(wo.produced_qty)}</b></span>
              <span class="so-summary-chip">Wastage <b>${soFlt(wo.process_loss_qty || 0)}</b></span>
              <span class="so-summary-chip">Pending <b>${soFlt(wo.pending_qty)}</b></span>
              <span class="so-summary-chip">Transfer <b>${soFlt(wo.material_transferred_for_manufacturing || 0)}</b></span>
              <span class="so-summary-chip">Extra <b>${soFlt(wo.additional_transferred_qty || 0)}</b></span>
              <span class="so-summary-chip">Disassembled <b>${soFlt(wo.disassembled_qty || 0)}</b></span>
            </div>
            <div style="margin-top:8px;">${progressBar(wo.completion_pct)}</div>
          </div>
        </div>
      `;

      const jcDone = (wo.job_cards || []).reduce((a, j) => a + Number(j.total_completed_qty || 0), 0);
      const jcLoss = (wo.job_cards || []).reduce((a, j) => a + Number(j.process_loss_qty || 0), 0);
      woh += toggleHeader(`<span class="so-prod-wo-head">Work Order: ${esc(wo.name)}</span>`, `Qty ${soFlt(wo.qty)} • Done ${soFlt(wo.produced_qty)} • Loss ${soFlt((wo.process_loss_qty || 0) + jcLoss)} • ${esc(wo.completion_pct||0)}%`, keyWO, false);
      woh += panel(`
        ${top}
        <div style="margin-top:12px;font-weight:900;">Job Cards</div>
        ${jobCardTable(wo.job_cards||[], wo.production_item || "")}
        <div style="margin-top:8px;" class="muted">Job Card Completed Qty: <b>${soFlt(jcDone)}</b> • Job Card Loss Qty: <b>${soFlt(jcLoss)}</b></div>
        <div style="margin-top:12px;font-weight:900;">Job Card Secondary Items (Scrap)</div>
        ${jobCardSecondaryItemsTable((wo.job_cards||[]).reduce((acc, jc) => acc.concat(jc.secondary_items || []), []))}
        <div style="margin-top:12px;font-weight:900;">Operations</div>
        ${operationTable(wo.operations||[])}
        <div style="margin-top:12px;font-weight:900;">Work Order Items (Materials)</div>
        ${woItemsTable(wo.wo_items||[])}
        <div style="margin-top:12px;font-weight:900;">Employees (Summary)</div>
        ${empSummaryTable(wo.employee_summary||[])}
        <div style="margin-top:12px;font-weight:900;">Employees (Detailed Logs) — ${esc(wo.name)}</div>
        ${empLogsTable(wo.employee_logs||[])}
      `, keyWO, false);
    });

    html += panel(woh || `<div class="text-muted">No Work Orders.</div>`, keyPP, false);
  });

  return html;
}

function __legacy_materialShortageTable_1(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.fg_item||"")}</td>
      <td>${esc(r.item_code||"")}</td>
      <td style="text-align:right;">${soFlt(r.qty_per_bom)}</td>
      <td style="text-align:right;">${soFlt(r.required_qty)}</td>
      <td style="text-align:right;">${soFlt(r.stock_qty)}</td>
      <td style="text-align:right;" class="${Number(r.shortage_qty||0)>0?'so-danger':'so-success'}">${soFlt(r.shortage_qty)}</td>
      <td style="text-align:right;" class="${Number(r.purchase_suggestion_qty||0)>0?'so-warning':'so-success'}">${soFlt(r.purchase_suggestion_qty)}</td>
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
  rows = _filterCancelledRows(rows || []).map((d) => ({
    ...d,
    invoices: _filterCancelledRows(d.invoices || []),
  }));
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
  rows = (rows || []).filter(r => String(r.status || r.docstatus || "").toLowerCase() !== "cancelled" && String(r.docstatus) !== "2");
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.item_code || "")}</td>
      <td>${esc(r.item_name || "")}</td>
      <td style="text-align:right;">${soFlt(r.ordered_qty)}</td>
      <td style="text-align:right;">${soFlt(r.delivered_qty)}</td>
      <td style="text-align:right;">${soFlt(r.invoiced_qty)}</td>
      <td style="text-align:right;" class="${Number(r.pending_qty||0)>0?'so-warning':'so-success'}">${soFlt(r.pending_qty)}</td>
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
          <span>${soFlt(mins)} mins</span>
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
      <td style="text-align:right;">${soFlt(r.time_in_mins)}</td>
      <td style="text-align:right;">${soFlt(r.completed_qty)}</td>
      <td style="text-align:right;font-weight:900;">${soFlt(r.qty_per_hour)}</td>
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
  rows = _filterCancelledRows(rows || []);
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

function __legacy_profitSummaryCard_1(s){
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

function __legacy_profitByItemTable_1(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.item_code||"")}</td>
      <td style="text-align:right;">${soFlt(r.qty)}</td>
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

function __legacy_poStatusDetailTable_1(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${r.purchase_order ? docPopupLink("Purchase Order", r.purchase_order) : `<span class="text-muted">Not Created</span>`}</td>
      <td>${esc(r.supplier || "-")}</td>
      <td>${badge(r.status)}</td>
      <td style="text-align:right;">${soFlt(r.ordered_qty)}</td>
      <td style="text-align:right;">${soFlt(r.received_qty)}</td>
      <td style="text-align:right;">${soFlt(r.pending_qty)}</td>
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

function __legacy_poItemGroupTable_1(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.item_group || "Uncategorized")}</td>
      <td style="text-align:right;">${soFlt(r.ordered_qty)}</td>
      <td style="text-align:right;">${soFlt(r.received_qty)}</td>
      <td style="text-align:right;">${soFlt(r.pending_qty)}</td>
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

function __legacy_poAnalyticsSection_1(data){
  const d = data || {};
  return `
    ${poAnalyticsOverviewCard(d.overview || {})}
    <div style="margin-top:12px;font-weight:900;">PO-Wise Detail Status</div>
    ${poStatusDetailTable(d.po_status_rows || [])}
    <div style="margin-top:12px;font-weight:900;">Item Group-Wise PO Status</div>
    ${poItemGroupTable(d.item_group_rows || [])}
  `;
}

function __legacy_buildDashboard_1(frm, data){
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

function openAllRelatedLinksDialog(frm) {
  frappe.call({
    method: "order_tracking_report.api.custom_so_execution_status",
    args: { sales_order: frm.doc.name },
    freeze: true,
    freeze_message: __("Loading related links..."),
    callback: (r) => {
      const data = (r && r.message) ? r.message : {};
      const html = buildAllRelatedLinksHtml(frm, data);
      const dialog = new frappe.ui.Dialog({
        title: __("All Related Links"),
        size: "extra-large",
        fields: [{ fieldtype: "HTML", fieldname: "content" }],
      });
      dialog.fields_dict.content.$wrapper.html(html);
      dialog.show();
    },
  });
}

function buildAllRelatedLinksHtml(frm, data) {
  const groups = {
    "Sales Order": [frm.doc.name],
    "Production Plan": [],
    "Work Order": [],
    "Job Card": [],
    "Stock Entry": [],
    "Purchase Order": [],
    "Purchase Receipt": [],
    "Purchase Invoice": [],
    "Per Piece Salary": [],
    "Delivery Note": [],
    "Sales Invoice": [],
  };

  (data.production_tree || []).forEach((node) => {
    const pp = node && node.production_plan ? node.production_plan.name : "";
    if (pp) groups["Production Plan"].push(pp);
    (node.work_orders || []).forEach((wo) => {
      if (wo && wo.name) groups["Work Order"].push(wo.name);
      (wo.job_cards || []).forEach((jc) => {
        if (jc && jc.name) groups["Job Card"].push(jc.name);
      });
    });
  });

  (data.procurement || []).forEach((row) => {
    if (row && row.doctype && row.name && groups[row.doctype]) {
      groups[row.doctype].push(row.name);
    }
  });

  (data.purchase_flow_rows || []).forEach((row) => {
    if (row.purchase_order) groups["Purchase Order"].push(row.purchase_order);
    splitDocNames(row.purchase_receipts).forEach((name) => groups["Purchase Receipt"].push(name));
    splitDocNames(row.purchase_invoices).forEach((name) => groups["Purchase Invoice"].push(name));
  });

  (data.sales_fulfillment_hierarchy || []).forEach((row) => {
    if (row.delivery_note) groups["Delivery Note"].push(row.delivery_note);
    (row.invoices || []).forEach((invoice) => {
      if (invoice && invoice.name) groups["Sales Invoice"].push(invoice.name);
    });
  });

  ((data.item_document_links || [])).forEach((row) => {
    (row.stock_entries || []).forEach((x) => x && x.name && groups["Stock Entry"].push(x.name));
    (row.salary_slips || []).forEach((x) => x && x.name && groups["Per Piece Salary"].push(x.name));
  });

  (data.labour_cost_employee_item_wise || []).forEach((row) => {
    splitDocNames(row.salary_slips).forEach((name) => groups["Per Piece Salary"].push(name));
  });

  const sections = Object.keys(groups).map((doctype) => {
    const values = [...new Set((groups[doctype] || []).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    return `
      <div style="border:1px solid #dbe4f0;border-radius:14px;padding:14px;background:#f8fafc;">
        <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.04em;">${esc(doctype)}</div>
        <div style="margin-top:8px;font-size:22px;font-weight:900;color:#0f172a;">${values.length}</div>
        <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">${values.length ? values.map((name) => relatedDocChip(doctype, name)).join("") : `<span style="font-size:12px;color:#64748b;">${__("No linked documents")}</span>`}</div>
      </div>
    `;
  }).join("");

  return `
    <div style="display:grid;gap:14px;">
      <div style="padding:12px 14px;border:1px solid #bfdbfe;border-radius:14px;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:700;">
        ${__("Open any related document in a new tab.")}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
        ${sections}
      </div>
    </div>
  `;
}

function openPlanningItemLinksDialog(frm, data, itemCode) {
  const code = String(itemCode || "").trim();
  const html = buildPlanningItemLinksHtml(frm, data, code);
  const dialog = new frappe.ui.Dialog({
    title: code ? __("Related Links: {0}", [code]) : __("Related Links"),
    size: "extra-large",
    fields: [{ fieldtype: "HTML", fieldname: "content" }],
  });
  dialog.fields_dict.content.$wrapper.html(html);
  dialog.show();
}

function getPlanningItemDocumentLinks(data, itemCode) {
  const code = String(itemCode || "").trim();
  return ((data && data.item_document_links) || []).find((row) => String((row && row.item_code) || "").trim() === code) || null;
}

function buildPlanningItemLinksHtml(frm, data, itemCode) {
  const code = String(itemCode || "").trim();
  const itemLabel = code || frm.doc.name;
  const itemLinks = getPlanningItemDocumentLinks(data, code) || {};
  const groups = {
    "Sales Order": [frm.doc.name],
    "Production Plan": [],
    "Work Order": [],
    "Job Card": [],
    "Stock Entry": [],
    "Purchase Order": [],
    "Purchase Receipt": [],
    "Purchase Invoice": [],
    "Per Piece Salary": [],
    "Delivery Note": [],
    "Sales Invoice": [],
  };

  const pushDoc = (doctype, value) => {
    if (!doctype || !value || !groups[doctype]) return;
    groups[doctype].push(value);
  };

  (itemLinks.production_plans || []).forEach((row) => pushDoc("Production Plan", row.name));
  (itemLinks.work_orders || []).forEach((row) => pushDoc("Work Order", row.name));
  (itemLinks.job_cards || []).forEach((row) => pushDoc("Job Card", row.name));
  (itemLinks.stock_entries || []).forEach((row) => pushDoc("Stock Entry", row.name));
  (itemLinks.purchase_orders || []).forEach((row) => pushDoc("Purchase Order", row.name));
  (itemLinks.purchase_receipts || []).forEach((row) => pushDoc("Purchase Receipt", row.name));
  (itemLinks.purchase_invoices || []).forEach((row) => pushDoc("Purchase Invoice", row.name));
  (itemLinks.salary_slips || []).forEach((row) => pushDoc("Per Piece Salary", row.name));
  (itemLinks.delivery_notes || []).forEach((row) => pushDoc("Delivery Note", row.name));
  (itemLinks.sales_invoices || []).forEach((row) => pushDoc("Sales Invoice", row.name));

  const sections = Object.keys(groups).map((doctype) => {
    const values = [...new Set((groups[doctype] || []).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    return `
      <div style="border:1px solid #dbe4f0;border-radius:16px;padding:14px;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);min-height:156px;">
        <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.04em;">${esc(doctype)}</div>
        <div style="margin-top:8px;font-size:24px;font-weight:900;color:#0f172a;line-height:1;">${values.length}</div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;">${values.length ? values.map((name) => relatedDocChip(doctype, name)).join("") : `<span style="font-size:12px;color:#64748b;">${__("No linked documents")}</span>`}</div>
      </div>
    `;
  }).join("");

  return `
    <div style="display:grid;gap:14px;">
      <div style="padding:14px 16px;border:1px solid #bfdbfe;border-radius:16px;background:linear-gradient(90deg,#eff6ff,#f8fbff);">
        <div style="font-size:18px;font-weight:900;color:#0f172a;">${esc(itemLabel)}</div>
        <div style="margin-top:4px;font-size:12px;color:#1d4ed8;font-weight:700;">${__("Only documents linked to this Sales Order item are shown here.")}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
        ${sections}
      </div>
    </div>
  `;
}

function splitDocNames(value) {
  return String(value || "").split(",").map((name) => (name || "").trim()).filter(Boolean);
}

function _statusText(value) {
  return String(value || "").trim().toLowerCase();
}

function _isCancelledStatus(value) {
  const status = _statusText(value);
  return status === "cancelled" || status === "canceled";
}

function _isCancelledDocRow(row) {
  if (!row || typeof row !== "object") return false;
  if (String(row.docstatus || "") === "2") return true;
  return [
    row.status,
    row.po_status,
    row.pr_status,
    row.pi_status,
    row.posting_status,
  ].some(_isCancelledStatus);
}

function _filterCancelledRows(rows) {
  return (rows || []).filter((row) => !_isCancelledDocRow(row));
}

function filterCancelledConnectionData(data) {
  const source = data || {};
  const out = { ...source };

  out.sales_fulfillment_hierarchy = _filterCancelledRows(source.sales_fulfillment_hierarchy || []).map((row) => {
    const invoices = _filterCancelledRows(row.invoices || []);
    return { ...row, invoices };
  }).filter((row) => (row.delivery_note || row.invoices.length));

  out.gantt_timeline = _filterCancelledRows(source.gantt_timeline || []);
  out.delivery_note_options = _filterCancelledRows(source.delivery_note_options || []);
  out.order_item_summary = _filterCancelledRows(source.order_item_summary || []);
  out.purchase_flow_rows = _filterCancelledRows(source.purchase_flow_rows || []).map((row) => ({
    ...row,
    purchase_receipts: _isCancelledStatus(row.pr_status) ? "" : (row.purchase_receipts || ""),
    pr_status: _isCancelledStatus(row.pr_status) ? "" : (row.pr_status || ""),
    purchase_invoices: _isCancelledStatus(row.pi_status) ? "" : (row.purchase_invoices || ""),
    pi_status: _isCancelledStatus(row.pi_status) ? "" : (row.pi_status || ""),
  }));

  const analytics = source.custom_po_analytics || {};
  out.custom_po_analytics = {
    ...analytics,
    item_group_rows: _filterCancelledRows(analytics.item_group_rows || []),
    po_status_rows: _filterCancelledRows(analytics.po_status_rows || []),
  };

  out.item_document_links = (source.item_document_links || []).map((row) => ({
    ...row,
    production_plans: _filterCancelledRows(row.production_plans || []),
    work_orders: _filterCancelledRows(row.work_orders || []),
    job_cards: _filterCancelledRows(row.job_cards || []),
    stock_entries: _filterCancelledRows(row.stock_entries || []),
    purchase_orders: _filterCancelledRows(row.purchase_orders || []),
    purchase_receipts: _filterCancelledRows(row.purchase_receipts || []),
    purchase_invoices: _filterCancelledRows(row.purchase_invoices || []),
    salary_slips: _filterCancelledRows(row.salary_slips || []),
    delivery_notes: _filterCancelledRows(row.delivery_notes || []),
    sales_invoices: _filterCancelledRows(row.sales_invoices || []),
  }));

  out.production_tree = (source.production_tree || []).map((node) => {
    const productionPlan = (node && node.production_plan) || {};
    const workOrders = _filterCancelledRows((node && node.work_orders) || []).map((wo) => ({
      ...wo,
      job_cards: _filterCancelledRows(wo.job_cards || []),
    }));
    const keepProductionPlan = productionPlan && !_isCancelledDocRow(productionPlan);
    if (!keepProductionPlan && !workOrders.length) return null;
    return {
      ...node,
      production_plan: keepProductionPlan ? productionPlan : {},
      work_orders: workOrders,
    };
  }).filter(Boolean);

  return out;
}

function relatedDocChip(doctype, name) {
  const slugMap = {
    "Sales Order": "sales-order",
    "Production Plan": "production-plan",
    "Work Order": "work-order",
    "Job Card": "job-card",
    "Stock Entry": "stock-entry",
    "Purchase Order": "purchase-order",
    "Purchase Receipt": "purchase-receipt",
    "Purchase Invoice": "purchase-invoice",
    "Per Piece Salary": "per-piece-salary",
    "Delivery Note": "delivery-note",
    "Sales Invoice": "sales-invoice",
  };
  const slug = slugMap[doctype];
  if (!slug || !name) {
    return `<span style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;background:#e2e8f0;color:#334155;font-size:11px;font-weight:800;">${esc(name || "")}</span>`;
  }
  return `<a href="/app/${slug}/${encodeURIComponent(name)}" target="_blank" style="display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:800;text-decoration:none;">${esc(name)}</a>`;
}


function sectionHeading(title, color){
  return `<div style="margin:14px 0 8px 0;padding:10px 12px;border-radius:12px;background:${color};color:#fff;font-size:14px;font-weight:900;letter-spacing:.2px;">${esc(title)}</div>`;
}

function __legacy_purchaseFlowTable_1(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${r.purchase_order ? docPopupLink("Purchase Order", r.purchase_order) : `<span class="text-muted">Not Created</span>`}</td>
      <td>${esc(r.supplier || "-")}</td>
      <td>${badge(r.po_status)}</td>
      <td style="text-align:right;">${soFlt(r.ordered_qty)}</td>
      <td style="text-align:right;">${soFlt(r.received_qty)}</td>
      <td style="text-align:right;">${soFlt(r.pending_qty)}</td>
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

function __legacy_labourCostTable_1(rows, summary){
  rows = rows || [];
  summary = summary || {};
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.employee || "-")}</td>
      <td>${esc(r.name1 || "-")}</td>
      <td>${esc(r.product || "-")}</td>
      <td>${esc(r.process_type || "-")}</td>
      <td style="text-align:right;">${soFlt(r.qty)}</td>
      <td style="text-align:right;">${soFlt(r.rate)}</td>
      <td style="text-align:right;">${fmtCurrency(r.labour_cost || 0)}</td>
    </tr>
  `).join("") : `<tr><td colspan="8" class="text-muted">No employee item-wise labour cost for this Sales Order.</td></tr>`;

  return `
    <div style="display:flex;gap:12px;margin-bottom:10px;">
      <div class="so-mini-card"><div class="so-mini-title">LABOUR QTY</div><div class="so-mini-val">${soFlt(summary.total_qty || 0)}</div></div>
      <div class="so-mini-card"><div class="so-mini-title">TOTAL LABOUR COST</div><div class="so-mini-val">${fmtCurrency(summary.total_cost || 0)}</div></div>
    </div>
    <div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
      <thead><tr><th>Employee</th><th>Name</th><th>Item</th><th>Process</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Labour Cost</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>
  `;
}

// override grouped shortage view
function __legacy_materialShortageTable_2(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.item_group || "Uncategorized")}</td>
      <td>${esc(r.item_code || "")}</td>
      <td style="text-align:right;">${soFlt(r.qty_per_bom)}</td>
      <td style="text-align:right;">${soFlt(r.required_qty)}</td>
      <td style="text-align:right;">${soFlt(r.stock_qty)}</td>
      <td style="text-align:right;" class="${Number(r.shortage_qty||0)>0?'so-danger':'so-success'}">${soFlt(r.shortage_qty)}</td>
      <td style="text-align:right;" class="${Number(r.purchase_suggestion_qty||0)>0?'so-warning':'so-success'}">${soFlt(r.purchase_suggestion_qty)}</td>
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
function __legacy_poItemGroupTable_2(rows){
  rows = rows || [];
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.item_group || "Uncategorized")}</td>
      <td class="muted">${esc(r.items || "-")}</td>
      <td style="text-align:right;">${soFlt(r.ordered_qty)}</td>
      <td style="text-align:right;">${soFlt(r.received_qty)}</td>
      <td style="text-align:right;">${soFlt(r.pending_qty)}</td>
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
function __legacy_buildDashboard_2(frm, data){
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

function __legacy_sectionBlock_1(key, title, color, content, show=true){
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

function __legacy_materialShortageTable_3(rows){
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
          <td style="text-align:right;">${soFlt(r.qty_per_bom)}</td>
          <td style="text-align:right;">${soFlt(r.required_qty)}</td>
          <td style="text-align:right;">${soFlt(r.stock_qty)}</td>
          <td style="text-align:right;" class="${Number(r.shortage_qty||0)>0?'so-danger':'so-success'}">${soFlt(r.shortage_qty)}</td>
          <td style="text-align:right;" class="${Number(r.purchase_suggestion_qty||0)>0?'so-warning':'so-success'}">${soFlt(r.purchase_suggestion_qty)}</td>
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

function __legacy_buildDashboard_3(frm, data){
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

function __legacy_materialShortageTable_4(rows){
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
          <td style="text-align:right;">${soFlt(r.qty_per_bom)}</td>
          <td style="text-align:right;">${soFlt(r.required_qty)}</td>
          <td style="text-align:right;">${soFlt(r.stock_qty)}</td>
          <td style="text-align:right;" class="${Number(r.shortage_qty||0)>0?'so-danger':'so-success'}">${soFlt(r.shortage_qty)}</td>
          <td style="text-align:right;" class="${Number(r.purchase_suggestion_qty||0)>0?'so-warning':'so-success'}">${soFlt(r.purchase_suggestion_qty)}</td>
          <td style="text-align:right;">${soFlt(r.po_qty)}</td>
          <td style="text-align:right;">${soFlt(r.pr_qty)}</td>
          <td style="text-align:right;" class="${Number(r.pending_po_qty||0)>0?'so-warning':'so-success'}">${soFlt(r.pending_po_qty)}</td>
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

function __legacy_poItemGroupTable_3(rows){
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
          <td style="text-align:right;">${soFlt(r.ordered_qty)}</td>
          <td style="text-align:right;">${soFlt(r.received_qty)}</td>
          <td style="text-align:right;">${soFlt(r.pending_qty)}</td>
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

function __legacy_poAnalyticsSection_2(data){
  const d = data || {};
  return `
    ${poAnalyticsOverviewCard(d.overview || {})}
    <div style="margin-top:12px;font-weight:900;">PO-Wise Detail Status</div>
    ${poStatusDetailTable(d.po_status_rows || [])}
    <div style="margin-top:12px;font-weight:900;">Item Group-Wise PO Status</div>
    ${poItemGroupTable(d.item_group_rows || [])}
  `;
}

function __legacy_bomTree_2(tree){
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
          <td style="text-align:right;">${soFlt(x.bom_qty)}</td>
          <td style="text-align:right;">${soFlt(x.required_qty)}</td>
          <td style="text-align:right;">${soFlt(x.stock_qty)}</td>
          <td style="text-align:right;" class="${Number(x.shortage_qty||0)>0?'so-danger':'so-success'}">${soFlt(x.shortage_qty)}</td>
        </tr>
      `).join("") : `<tr><td colspan="5" class="text-muted">No BOM Items.</td></tr>`;

      html += toggleHeader(`Item: ${esc(itemNode.item_code)} | BOM: ${esc(b.bom)}`, `${soFlt(itemNode.order_qty || 0)} SO Qty • ${rms.length} RM`, key);
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

function __legacy_profitGroupPurchaseTable_1(rows){
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

function __legacy_buildDashboard_4(frm, data){
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


function __legacy_labourCostTable_2(rows, summary){
  rows = rows || [];
  summary = summary || {};
  const body = rows.length ? rows.map(r => `
    <tr>
      <td>${esc(r.employee || "-")}</td>
      <td>${esc(r.name1 || "-")}</td>
      <td>${esc(r.product || "-")}</td>
      <td>${esc(r.process_type || "-")}</td>
      <td style="text-align:right;">${soFlt(r.qty)}</td>
      <td style="text-align:right;">${soFlt(r.rate)}</td>
      <td style="text-align:right;">${fmtCurrency(r.labour_cost || 0)}</td>
    </tr>
  `).join("") : `<tr><td colspan="8" class="text-muted">No employee item-wise labour cost for this Sales Order.</td></tr>`;

  return `
    <div style="display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:12px;margin-bottom:12px;">
      <div class="so-mini-card" style="height:132px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:14px 16px;">
        <div class="so-mini-title">LABOUR QTY</div>
        <div class="so-mini-val" style="font-size:30px;line-height:1.1;">${soFlt(summary.total_qty || 0)}</div>
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

function __legacy_poItemGroupTable_4(rows){
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
          <td style="text-align:right;">${soFlt(r.ordered_qty)}</td>
          <td style="text-align:right;">${soFlt(r.received_qty)}</td>
          <td style="text-align:right;">${soFlt(r.pending_qty)}</td>
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

function __legacy_materialShortageTable_5(rows){
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
          <td style="text-align:right;">${soFlt(r.qty_per_bom)}</td>
          <td style="text-align:right;">${soFlt(r.required_qty)}</td>
          <td style="text-align:right;background:#f1f5f9;">${(Number(r.stock_qty || 0)).toFixed(0)}</td>
          <td style="text-align:right;" class="${Number(r.shortage_qty||0)>0?'so-danger':'so-success'}">${soFlt(r.shortage_qty)}</td>
          <td style="text-align:right;" class="${Number(r.purchase_suggestion_qty||0)>0?'so-warning':'so-success'}">${soFlt(r.purchase_suggestion_qty)}</td>
          <td style="text-align:right;">${soFlt(r.po_qty)}</td>
          <td style="text-align:right;">${soFlt(r.pr_qty)}</td>
          <td style="text-align:right;" class="${Number(r.pending_po_qty||0)>0?'so-warning':'so-success'}">${soFlt(r.pending_po_qty)}</td>
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
          <td>${docLink("Item", x.item_code || "")}</td>
          <td style="text-align:right;">${soFlt(x.bom_qty)}</td>
          <td style="text-align:right;">${soFlt(x.required_qty)}</td>
          <td style="text-align:right;">${soFlt(x.stock_qty)}</td>
          <td style="text-align:right;" class="${Number(x.shortage_qty||0)>0?'so-danger':'so-success'}">${soFlt(x.shortage_qty)}</td>
        </tr>
      `).join("") : `<tr><td colspan="5" class="text-muted">No BOM Items.</td></tr>`;

      const ttl = `<span style="color:#111827;font-weight:900;">Item: ${docLink("Item", itemNode.item_code || "")}</span> <span style="color:#6b7280;">|</span> <span style="color:#b45309;font-weight:900;">BOM: ${docLink("BOM", b.bom || "")}</span>`;
      html += toggleHeader(ttl, `${soFlt(itemNode.order_qty || 0)} SO Qty • ${rms.length} RM`, key);
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

function dailyOperationWiseProductionTable(payload){
  const operations = (payload && payload.operations) || [];
  const groups = (payload && payload.groups) || [];
  if (!groups.length) {
    return `<div class="text-muted">No daily operation production found.</div>`;
  }

  const html = [`<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;min-width:${Math.max(900, 360 + operations.length * 150)}px;">`];
  html.push(`<thead><tr><th style="min-width:260px;"></th><th rowspan="2" style="min-width:140px;text-align:center;">Order Qty</th><th colspan="${operations.length}" style="text-align:center;">Operations</th></tr>`);
  html.push(`<tr><th>Date</th>${operations.map((operation) => `<th style="text-align:center;">${esc(operation)}</th>`).join("")}</tr></thead><tbody>`);

  groups.forEach((salesOrderGroup, salesOrderIndex) => {
    const salesOrderKey = `so-${salesOrderIndex}`;
    const toggleStyle = "border:0;background:transparent;color:inherit;font:inherit;padding:0;cursor:pointer;text-align:left;";
    html.push(`<tr>`);
    html.push(`<td style="background:#0f4c1d;color:#fff;font-weight:800;white-space:nowrap;"><button style="${toggleStyle}" data-dop-sales-order-toggle="${salesOrderKey}" data-collapsed="0">[-] ${esc(salesOrderGroup.sales_order || "")}</button></td>`);
    html.push(`<td style="background:#0f4c1d;color:#fff;font-weight:800;text-align:center;white-space:nowrap;">${_n0(salesOrderGroup.order_qty || 0)}</td>`);
    html.push(operations.map((operation) => `<td style="background:#0f4c1d;color:#fff;font-weight:800;text-align:center;white-space:nowrap;">${_n0(((salesOrderGroup.totals || {})[operation]) || 0)}</td>`).join(""));
    html.push(`</tr>`);

    (salesOrderGroup.items || []).forEach((itemGroup, itemIndex) => {
      const itemKey = `${salesOrderKey}-item-${itemIndex}`;
      html.push(`<tr data-dop-item-header="${itemKey}" data-dop-parent-sales-order="${salesOrderKey}">`);
      html.push(`<td style="background:#f8fafc;color:#0f172a;font-weight:700;white-space:nowrap;"><button style="${toggleStyle}" data-dop-item-toggle="${itemKey}" data-collapsed="1">[+] ${esc(itemGroup.item || "")}</button></td>`);
      html.push(`<td style="background:#f8fafc;color:#0f172a;font-weight:700;text-align:center;white-space:nowrap;">${_n0(itemGroup.order_qty || 0)}</td>`);
      html.push(operations.map((operation) => `<td style="background:#f8fafc;color:#1d4ed8;font-weight:800;text-align:center;white-space:nowrap;">${_n0((itemGroup.totals || {})[operation] || 0)}</td>`).join(""));
      html.push(`</tr>`);

      (itemGroup.rows || []).forEach((dateRow) => {
        html.push(`<tr data-dop-item-detail="${itemKey}" data-dop-parent-sales-order="${salesOrderKey}" style="display:none;">`);
        html.push(`<td>${esc(dateRow.date || "")}</td><td></td>`);
        html.push(operations.map((operation) => `<td style="text-align:center;">${_n0(((dateRow.values || {})[operation]) || 0)}</td>`).join(""));
        html.push(`</tr>`);
      });

      html.push(`<tr data-dop-item-detail="${itemKey}" data-dop-parent-sales-order="${salesOrderKey}" style="display:none;">`);
      html.push(`<td style="font-weight:800;color:#b91c1c;">Wastage</td><td></td>`);
      html.push(operations.map((operation) => `<td style="text-align:center;font-weight:800;color:#b91c1c;">${_n0((itemGroup.wastage || {})[operation] || 0)}</td>`).join(""));
      html.push(`</tr>`);

      html.push(`<tr data-dop-item-detail="${itemKey}" data-dop-parent-sales-order="${salesOrderKey}" style="display:none;">`);
      html.push(`<td style="height:16px;background:#fff;"></td><td style="background:#fff;"></td>`);
      html.push(operations.map(() => `<td style="background:#fff;"></td>`).join(""));
      html.push(`</tr>`);
    });
  });

  html.push(`</tbody></table></div>`);
  return html.join("");
}

function dailyOperationSummaryData(payload, salesOrder) {
  const groups = (payload && payload.groups) || [];
  const initialOps = Array.isArray(payload && payload.operations) ? payload.operations : [];
  const targetSalesOrder = String(salesOrder || "").trim();
  const opSet = {};
  initialOps.forEach((op) => {
    const key = String(op || "").trim();
    if (key) opSet[key] = 1;
  });
  const itemMap = {};

  groups.forEach((group) => {
    const so = String(group.sales_order || "").trim();
    if (targetSalesOrder && so && so !== targetSalesOrder) return;
    (group.items || []).forEach((item) => {
      const code = String(item.item || "").trim();
      if (!code) return;
      if (!itemMap[code]) itemMap[code] = { order_qty: 0, totals: {} };
      itemMap[code].order_qty += Number(item.order_qty || 0);
      const itemTotals = item.totals || {};
      Object.keys(itemTotals).forEach((operation) => {
        const op = String(operation || "").trim();
        if (!op) return;
        opSet[op] = 1;
        itemMap[code].totals[op] = Number(itemMap[code].totals[op] || 0) + Number(itemTotals[operation] || 0);
      });
    });
  });

  const operations = Object.keys(opSet).sort((a, b) => a.localeCompare(b));
  return { operations, items: itemMap };
}

function dailyOperationItemQtyMap(payload, salesOrder) {
  const summary = dailyOperationSummaryData(payload, salesOrder);
  const itemMap = summary.items || {};
  const qtyMap = {};
  Object.keys(itemMap).forEach((code) => {
    qtyMap[code] = Number((itemMap[code] || {}).order_qty || 0);
  });
  return qtyMap;
}

function dailyOperationItemSummaryHtml(summaryData, selectedItem, options) {
  const opts = options || {};
  const showItemTotalsTable = opts.show_item_totals_table !== false;
  const itemMap = (summaryData && summaryData.items) || {};
  const operations = (summaryData && summaryData.operations) || [];
  const itemQtyMap = {};
  Object.keys(itemMap).forEach((code) => {
    itemQtyMap[code] = Number((itemMap[code] || {}).order_qty || 0);
  });
  const keys = Object.keys(itemQtyMap || {}).sort((a, b) => a.localeCompare(b));
  if (!keys.length) {
    return `<div style="margin-bottom:10px;padding:10px;border:1px solid #dbeafe;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-size:12px;">${__("Daily Operation wise Production summary is not available for this Sales Order.")}</div>`;
  }
  const highlight = String(selectedItem || "").trim();
  const rows = keys.map((code) => {
    const qty = Number(itemQtyMap[code] || 0);
    const isSelected = highlight && code === highlight;
    return `<tr style="${isSelected ? "background:#f0f9ff;" : ""}"><td style="font-weight:${isSelected ? 800 : 600};">${esc(code)}</td><td style="text-align:right;font-weight:800;color:#0f172a;">${_n0(qty)}</td></tr>`;
  }).join("");
  return `
    <div style="margin-bottom:10px;">
      ${showItemTotalsTable ? `
        <div style="font-size:12px;font-weight:800;color:#1d4ed8;margin-bottom:6px;">${__("Daily Operation wise Production (Item Total Qty)")}</div>
        <div class="table-responsive">
          <table class="table table-bordered so-table" style="margin:0;">
            <thead><tr><th>${__("Item")}</th><th style="text-align:right;">${__("Total Qty")}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      ` : ""}
      ${operations.length ? (() => {
        const opsHead = operations.map((operation) => `<th style="text-align:right;">${esc(operation)}</th>`).join("");
        const totalByOp = {};
        operations.forEach((operation) => { totalByOp[operation] = 0; });
        const opRows = keys.map((code) => {
          const row = itemMap[code] || {};
          const isSelected = highlight && code === highlight;
          const cells = operations.map((operation) => {
            const val = Number((row.totals || {})[operation] || 0);
            totalByOp[operation] += val;
            return `<td style="text-align:right;font-weight:${isSelected ? 800 : 700};">${_n0(val)}</td>`;
          }).join("");
          return `<tr style="${isSelected ? "background:#f0f9ff;" : ""}"><td style="font-weight:${isSelected ? 800 : 600};">${esc(code)}</td>${cells}</tr>`;
        }).join("");
        const grandCells = operations.map((operation) => `<td style="text-align:right;font-weight:900;color:#1d4ed8;">${_n0(totalByOp[operation] || 0)}</td>`).join("");
        return `
          <div style="font-size:12px;font-weight:800;color:#1d4ed8;margin:10px 0 6px;">${__("Operation Total Summary")}</div>
          <div class="table-responsive">
            <table class="table table-bordered so-table" style="margin:0;">
              <thead><tr><th>${__("Item")}</th>${opsHead}</tr></thead>
              <tbody>
                ${opRows}
                <tr><td style="font-weight:900;color:#1d4ed8;">${__("Grand Total")}</td>${grandCells}</tr>
              </tbody>
            </table>
          </div>
        `;
      })() : ""}
    </div>
  `;
}

function bindDailyOperationProductionToggles($wrap){
  $wrap.find("[data-dop-item-toggle]").off("click").on("click", function(e){
    e.preventDefault();
    e.stopPropagation();
    const key = ($(this).attr("data-dop-item-toggle") || "").trim();
    if (!key) return;
    const collapsed = ($(this).attr("data-collapsed") || "1") === "1";
    $(this).attr("data-collapsed", collapsed ? "0" : "1").text(`${collapsed ? "[-]" : "[+]"} ${$(this).text().replace(/^\[.\]\s*/, "")}`);
    $wrap.find(`[data-dop-item-detail="${key}"]`).css("display", collapsed ? "table-row" : "none");
  });

  $wrap.find("[data-dop-sales-order-toggle]").off("click").on("click", function(e){
    e.preventDefault();
    e.stopPropagation();
    const key = ($(this).attr("data-dop-sales-order-toggle") || "").trim();
    if (!key) return;
    const collapsed = ($(this).attr("data-collapsed") || "0") === "1";
    $(this).attr("data-collapsed", collapsed ? "0" : "1").text(`${collapsed ? "[-]" : "[+]"} ${$(this).text().replace(/^\[.\]\s*/, "")}`);
    $wrap.find(`[data-dop-parent-sales-order="${key}"][data-dop-item-header]`).css("display", collapsed ? "table-row" : "none");
    if (collapsed) {
      $wrap.find(`[data-dop-parent-sales-order="${key}"][data-dop-item-detail]`).each(function(){
        const itemKey = ($(this).attr("data-dop-item-detail") || "").trim();
        const itemButton = $wrap.find(`[data-dop-item-toggle="${itemKey}"]`);
        $(this).css("display", itemButton.attr("data-collapsed") === "1" ? "none" : "table-row");
      });
      return;
    }
    $wrap.find(`[data-dop-parent-sales-order="${key}"][data-dop-item-detail]`).css("display", "none");
  });
}

function __legacy_buildDashboard_5(frm, data){
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

function create_po_from_rows(frm, row_names, options) {
  const opts = options || {};
  return frappe.call({
    method: "order_tracking_report.api.create_po_from_sales_order_po_tab",
    args: {
      source_name: frm.doc.name,
      row_names: (row_names || []).join(","),
    },
    freeze: true,
    freeze_message: __("Creating Purchase Order..."),
  }).then((r) => {
    const created = Array.isArray(r.message) ? r.message : [];
    frm.reload_doc();
    setTimeout(() => {
      if (frm.refresh_field) frm.refresh_field("custom_po_item");
      if (frm.scroll_to_field) frm.scroll_to_field("custom_po_item");
    }, 300);

    if (!created.length) {
      return created;
    }

    if (opts.openInNewTab) {
      created.forEach((row) => {
        window.open(`/app/purchase-order/${encodeURIComponent(row.name)}`, "_blank", "noopener");
      });

      frappe.show_alert({
        message: created.length === 1
          ? __("Purchase Order {0} created", [created[0].name])
          : __("{0} Purchase Orders created", [created.length]),
        indicator: "green",
      }, 5);

      return created;
    }

    if (created.length === 1) {
      frappe.set_route("Form", "Purchase Order", created[0].name);
      return created;
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

    return created;
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
    if (soFlt(row.qty) <= 0) {
      errors.push(__("Row #{0}: Qty must be greater than zero", [row.idx]));
    }
  });
  return errors;
}

function ensure_default_sales_order_create_menu(frm) {
  // Intentionally no-op:
  // keep ERPNext native "Create" button/menu untouched.
  return;
}

function ensure_update_items_button(frm) {
  // Intentionally no-op:
  // keep ERPNext native "Update Items" button/command untouched.
  return;
}

// Final UI overrides (latest requested behavior)
function _int(v) { return Math.round(Number(v || 0)); }
function _n0(v) { return _int(v).toLocaleString(); }
function _n2(v) { return Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function _money0(v) {
  try { return format_currency(_int(v || 0), null, 0); } catch (e) { return _n0(v); }
}
function getCompanyAbbr(company) {
  const key = String(company || "").trim();
  if (!key) return "";
  return COMPANY_ABBR_CACHE[key] || "";
}

const COMPANY_ABBR_CACHE = {};
const DEFAULT_COMPANY_ABBR = "AH";
const DEFAULT_WAREHOUSE_LABELS = {
  source: "Stores",
  wip: "Work In Progress",
  target: "Finished Goods",
  scrap: "Work In Progress"
};

function fetchCompanyAbbr(company) {
  const key = String(company || "").trim();
  if (!key) return Promise.resolve("");
  if (COMPANY_ABBR_CACHE[key]) return Promise.resolve(COMPANY_ABBR_CACHE[key]);
  return frappe.db.get_value("Company", key, "abbr").then((r) => {
    const abbr = ((r && r.message && r.message.abbr) || "").trim();
    COMPANY_ABBR_CACHE[key] = abbr;
    return abbr;
  }).catch(() => {
    COMPANY_ABBR_CACHE[key] = "";
    return "";
  });
}

function getDefaultWarehouse(type, company, abbrOverride) {
  const abbr = String(abbrOverride || "").trim() || getCompanyAbbr(company) || DEFAULT_COMPANY_ABBR;
  let label = DEFAULT_WAREHOUSE_LABELS[type] || "Store";
  return abbr ? `${label} - ${abbr}` : label;
}

function open_po_item_data_entry(frm, prefill) {
  if (frm.doc.docstatus === 2) {
    frappe.msgprint(__("Cancelled Sales Order is not allowed."));
    return;
  }

  let items_data = [];
  let item_map = {};
  const template_item_cache = {};
  let last_item_code = "";
  const allowedItemGroups = Array.from(new Set(
    (Array.isArray(prefill && prefill.allowed_item_groups) ? prefill.allowed_item_groups : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ));
  const hasRestrictedItemGroups = allowedItemGroups.length > 0;
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
        in_place_edit: true,
        data: [],
        fields: [
          { fieldtype: "Data", fieldname: "item_code", label: __("Item"), in_list_view: 1, read_only: 1 },
          { fieldtype: "Data", fieldname: "item_name", label: __("Item Name"), in_list_view: 1, read_only: 1 },
          { fieldtype: "Link", fieldname: "supplier", label: __("Supplier"), options: "Supplier", in_list_view: 1 },
          { fieldtype: "Link", fieldname: "warehouse", label: __("Warehouse"), options: "Warehouse", in_list_view: 1 },
          { fieldtype: "Currency", fieldname: "rate", label: __("Rate"), in_list_view: 1 },
          { fieldtype: "Float", fieldname: "base_qty", label: __("Base Qty"), in_list_view: 1, read_only: 1 },
          { fieldtype: "Float", fieldname: "custom_wastage_percentage", label: __("Wastage %"), in_list_view: 1 },
          { fieldtype: "Float", fieldname: "custom_wastage_qty", label: __("Wastage Qty"), in_list_view: 1 },
          { fieldtype: "Float", fieldname: "extra_qty", label: __("Extra Qty"), in_list_view: 1 },
          { fieldtype: "Float", fieldname: "po_qty", label: __("Qty"), in_list_view: 1 },
          { fieldtype: "Check", fieldname: "select_for_po", label: __("Select"), in_list_view: 1 },
          { fieldtype: "Data", fieldname: "descriptions", label: __("Description"), in_list_view: 1 },
          { fieldtype: "Data", fieldname: "comments", label: __("Comments"), in_list_view: 1 },
        ],
      },
    ],
  });

  // Set default warehouse logic
  // Use new warehouse logic
  const resolveDefaultWarehouse = (type = "source") => getDefaultWarehouse(type, frm.doc.company);

  dialog.fields_dict.warehouse.get_query = () => ({
    filters: {
      company: frm.doc.company || undefined,
      disabled: 0,
    },
  });
  // Set default value without relying on Dialog.on (not available in some builds)
  const fallbackWarehouse = resolveDefaultWarehouse();
  if (!dialog.get_value("warehouse")) {
    dialog.set_value("warehouse", fallbackWarehouse);
  }
  const company = frm.doc.company || "";
  void fetchCompanyAbbr(company).then((abbr) => {
    const exactWarehouse = getDefaultWarehouse("source", company, abbr);
    const currentWarehouse = dialog.get_value("warehouse") || "";
    if (!currentWarehouse || currentWarehouse === fallbackWarehouse) {
      dialog.set_value("warehouse", exactWarehouse);
    }
  });

  dialog.fields_dict.item_group.get_query = () => {
    if (!hasRestrictedItemGroups) {
      return {};
    }

    return {
      filters: {
        name: ["in", allowedItemGroups],
      },
    };
  };

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
    let item_group = dialog.get_value("item_group");
    if (hasRestrictedItemGroups && item_group && !allowedItemGroups.includes(String(item_group).trim())) {
      item_group = "";
      dialog.set_value("item_group", "");
    }
    const filters = { disabled: 0, is_purchase_item: 1, has_variants: 0 };
    if (item_group) filters.item_group = item_group;
    const r = await frappe.call({
      method: "frappe.client.get_list",
      args: { doctype: "Item", fields: ["name", "item_name", "description", "last_purchase_rate", "has_variants"], filters, order_by: "name asc", limit_page_length: 500 },
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

  async function is_template_item(item_code) {
    const code = String(item_code || "").trim();
    if (!code) return false;
    if (Object.prototype.hasOwnProperty.call(template_item_cache, code)) {
      return template_item_cache[code];
    }

    if (item_map[code] && typeof item_map[code].has_variants !== "undefined") {
      const fromMap = cint(item_map[code].has_variants) === 1;
      template_item_cache[code] = fromMap;
      return fromMap;
    }

    const r = await frappe.db.get_value("Item", code, "has_variants");
    const fromDb = cint(r && r.message && r.message.has_variants) === 1;
    template_item_cache[code] = fromDb;
    return fromDb;
  }

  function refresh_grid() {
    dialog.fields_dict.items_table.df.data = items_data;
    if (dialog.fields_dict.items_table.grid) {
      dialog.fields_dict.items_table.grid.df.data = items_data;
    }
    dialog.fields_dict.items_table.grid.refresh();
    render_meta();
  }

  function sync_items_from_grid(options) {
    const opts = options || {};
    const grid = dialog.fields_dict.items_table && dialog.fields_dict.items_table.grid;
    if (!grid) return;
    if (opts.blurActive && document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }
    const gridData = (grid.grid_rows || []).length
      ? grid.grid_rows.map((gridRow) => gridRow && gridRow.doc).filter(Boolean)
      : (typeof grid.get_data === "function"
        ? (grid.get_data() || [])
        : ((grid.df && grid.df.data) || dialog.fields_dict.items_table.df.data || []));

    const previousByName = {};
    (items_data || []).forEach((row) => {
      if (row && row.name) previousByName[row.name] = row;
    });

    items_data = (gridData || []).map((row) => {
      const previous = row && row.name ? (previousByName[row.name] || {}) : {};
      const baseQty = toNum((typeof row.base_qty !== "undefined" ? row.base_qty : previous.base_qty) || row.custom_base_qty || row.qty || 0);
      const wastagePct = toNum(typeof row.custom_wastage_percentage !== "undefined" ? row.custom_wastage_percentage : previous.custom_wastage_percentage);
      const wastageQty = toNum(typeof row.custom_wastage_qty !== "undefined" ? row.custom_wastage_qty : previous.custom_wastage_qty);
      const extraQty = toNum(typeof row.extra_qty !== "undefined" ? row.extra_qty : previous.extra_qty);
      const poQty = toNum(typeof row.po_qty !== "undefined" ? row.po_qty : (typeof previous.po_qty !== "undefined" ? previous.po_qty : row.qty));
      let warehouse = row.warehouse || dialog.get_value("warehouse") || "";
      if (!warehouse) warehouse = resolveDefaultWarehouse();
      return {
        ...row,
        supplier: row.supplier || dialog.get_value("supplier") || "",
        warehouse,
        rate: toNum(row.rate),
        base_qty: baseQty,
        qty: poQty,
        custom_wastage_percentage: wastagePct,
        custom_wastage_qty: wastageQty,
        extra_qty: extraQty,
        po_qty: poQty,
        select_for_po: toInt(typeof row.select_for_po !== "undefined" ? row.select_for_po : 1),
      };
    });

    render_meta();
  }

  function get_selected_grid_docnames() {
    const grid = dialog.fields_dict.items_table && dialog.fields_dict.items_table.grid;
    if (!grid) return [];

    let selected = [];
    if (typeof grid.get_selected_children === "function") {
      selected = (grid.get_selected_children() || []).map((d) => d && d.name).filter(Boolean);
    }
    if (!selected.length && typeof grid.get_selected === "function") {
      const byName = grid.get_selected() || [];
      selected = (Array.isArray(byName) ? byName : []).filter(Boolean);
    }
    if (!selected.length) {
      selected = dialog.$wrapper
        .find('[data-fieldname="items_table"] .grid-row-check:checked')
        .map((_, el) => $(el).closest(".grid-row").attr("data-name"))
        .get()
        .filter(Boolean);
    }

    return Array.from(new Set(selected));
  }

  function delete_selected_rows_from_grid() {
    sync_items_from_grid();
    const selectedNames = get_selected_grid_docnames();
    if (!selectedNames.length) {
      frappe.show_alert({ message: __("Select row(s) to delete from Rows to Insert."), indicator: "orange" }, 4);
      return;
    }

    items_data = items_data.filter((row) => !selectedNames.includes(row.name));
    refresh_grid();
    frappe.show_alert({ message: __("Selected row(s) removed."), indicator: "green" }, 3);
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
    if (await is_template_item(item_code)) {
      frappe.msgprint(__("Item {0} is a template. Please select one of its variants.", [item_code]));
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

  dialog.fields_dict.item_group.df.onchange = function () {
    const currentGroup = String(dialog.get_value("item_group") || "").trim();
    if (hasRestrictedItemGroups && currentGroup && !allowedItemGroups.includes(currentGroup)) {
      dialog.set_value("item_group", "");
      frappe.show_alert({ message: __("Select an Item Group from Material Shortage & Purchase Suggestion."), indicator: "orange" }, 3);
      return;
    }
    load_items();
    dialog.set_value("item_code", "");
  };
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

  async function persist_inserted_rows() {
    sync_items_from_grid({ blurActive: true });
    if (!items_data.length) {
      frappe.msgprint(__("Add at least one row."));
      return [];
    }

    try {
      const response = await frappe.call({
        method: "order_tracking_report.api.append_po_items_to_sales_order",
        args: {
          source_name: frm.doc.name,
          rows: JSON.stringify(items_data),
        },
        freeze: true,
        freeze_message: __("Saving PO rows..."),
      });
      await frm.reload_doc();
      const rowNames = ((response && response.message && response.message.row_names) || []).filter(Boolean);
      if (!rowNames.length) {
        frappe.msgprint({
          title: __("Unable to Resolve PO Rows"),
          indicator: "red",
          message: __("The PO rows were saved in the PO tab, but their saved row names could not be resolved for the next action."),
        });
        return [];
      }
      return rowNames;
    } catch (error) {
      frappe.msgprint({
        title: __("Unable to Save Sales Order"),
        indicator: "red",
        message: __("PO rows could not be saved to the Sales Order. Fix the Sales Order and try again."),
      });
      console.error(error);
      return [];
    }
  }

  async function create_po_and_add_in_table() {
    const insertedRowNames = await persist_inserted_rows();
    if (!insertedRowNames.length) {
      return;
    }

    dialog.hide();
    try {
      await create_po_from_rows(frm, insertedRowNames, { openInNewTab: true });
    } catch (error) {
      console.error(error);
    }
  }

  dialog.$wrapper.on("keydown", (e) => {
    if (e.key !== "Enter") return;
    const in_grid = $(e.target).closest(".grid").length > 0;
    const is_textarea = e.target && e.target.tagName === "TEXTAREA";
    if (in_grid || is_textarea) return;
    e.preventDefault();
    add_row();
  });

  dialog.set_primary_action(__("Insert to PO Item Table"), async () => {
    const insertedRowNames = await persist_inserted_rows();
    if (!insertedRowNames.length) {
      return;
    }

    frappe.show_alert({ message: __("Rows inserted in PO Item table"), indicator: "green" }, 4);
    dialog.hide();
    setTimeout(() => {
      if (frm.refresh_field) frm.refresh_field("custom_po_item");
      if (frm.scroll_to_field) frm.scroll_to_field("custom_po_item");
    }, 150);
  });

  dialog.show();
  const $dialogActions = dialog.$wrapper.find(".modal-footer .standard-actions");
  if ($dialogActions.length) {
    $(`<button class="btn btn-danger btn-delete-po-rows">${frappe.utils.escape_html(__("Delete Selected Rows"))}</button>`)
      .insertBefore(dialog.get_primary_btn())
      .on("click", (e) => {
        e.preventDefault();
        delete_selected_rows_from_grid();
      });

    $(
      `<button class="btn btn-success btn-create-po-and-add">${frappe.utils.escape_html(__("Create PO & Add in Table"))}</button>`
    ).insertBefore(dialog.get_primary_btn()).on("click", async (e) => {
      e.preventDefault();
      await create_po_and_add_in_table();
    });
  }
  dialog.$wrapper.find(".modal-dialog").css({ width: "98vw", maxWidth: "98vw" });
  dialog.$wrapper.find('[data-fieldname="qty"]').closest(".form-column").css("max-width", "140px");
  dialog.$wrapper.find('[data-fieldname="select_for_po"]').closest(".form-column").css("max-width", "180px");
  dialog.$wrapper.find('[data-fieldname="add_item_btn"]').closest(".form-column").css({ maxWidth: "210px", display: "flex", alignItems: "flex-end" });
  const $tbl = dialog.$wrapper.find('[data-fieldname="items_table"]').closest(".frappe-control");
  $tbl.closest(".form-column").css({ flex: "0 0 100%", maxWidth: "100%" });
  dialog.$wrapper.find('[data-fieldname="items_table"]').closest(".form-group, .frappe-control, .form-column").css({ width: "100%" });
  $tbl.css({ width: "100%" });
  const minGridWidth = "1900px";
  $tbl.find(".grid-body").css({ maxHeight: "340px", overflowY: "auto", overflowX: "auto", width: "100%" });
  $tbl.find(".grid-heading-row").css({ overflowX: "auto", width: "100%" });
  $tbl.find(".grid-body .rows, .grid-heading-row, .grid-heading-row .grid-row, .grid-body .grid-row").css({ minWidth: minGridWidth });
  $tbl.off("focusout.po_grid change.po_grid", "input, select, textarea").on("focusout.po_grid change.po_grid", "input, select, textarea", () => {
    setTimeout(sync_items_from_grid, 0);
  });
  $tbl.off("input.po_grid", "input, textarea").on("input.po_grid", "input, textarea", () => {
    setTimeout(sync_items_from_grid, 0);
  });

  // Bind after dialog render so click always works
  bind_add_row_button();
  ["qty", "custom_wastage_percentage", "extra_qty"].forEach((fn) => {
    const f = dialog.fields_dict[fn];
    if (f && f.$input) {
      f.$input.off("input.po_calc change.po_calc").on("input.po_calc change.po_calc", recalc_qty_fields);
    }
  });

  setTimeout(() => {
    (async () => {
    let initialGroup = "";
    if (prefill && typeof prefill === "object") {
      initialGroup = String(prefill.item_group || "").trim();
      if (hasRestrictedItemGroups && initialGroup && !allowedItemGroups.includes(initialGroup)) {
        initialGroup = "";
      }
      if (!initialGroup && hasRestrictedItemGroups && allowedItemGroups.length === 1) {
        initialGroup = allowedItemGroups[0];
      }
      if (initialGroup) {
        dialog.set_value("item_group", initialGroup);
      }
    }

    await load_items();
    render_meta();
    if (prefill && typeof prefill === "object") {
      const prefillSupplier = (prefill.supplier || "").trim();
      const prefillWarehouse = (prefill.warehouse || "").trim();
      if (Array.isArray(prefill.rows) && prefill.rows.length) {
        const firstSupplier = ((prefill.rows.find((r) => r && r.supplier) || {}).supplier || "").trim();
        if (prefillSupplier && !dialog.get_value("supplier")) dialog.set_value("supplier", prefillSupplier);
        else if (firstSupplier && !dialog.get_value("supplier")) dialog.set_value("supplier", firstSupplier);
        if (prefillWarehouse && !dialog.get_value("warehouse")) dialog.set_value("warehouse", prefillWarehouse);
        const skippedTemplateItems = [];
        for (const row of prefill.rows) {
          const code = String((row && row.item_code) || "").trim();
          if (code && (await is_template_item(code))) {
            skippedTemplateItems.push(code);
            continue;
          }
          const baseQty = toNum(row.base_qty || row.qty || 0);
          const wp = toNum(row.custom_wastage_percentage || row.wastage_pct || 0);
          const wq = toNum(row.custom_wastage_qty || row.wastage_qty || ((baseQty * wp) / 100));
          const extra = toNum(row.extra_qty || 0);
          const poQty = toNum(row.po_qty || (baseQty + wq + extra));
          items_data.push({
            item_code: row.item_code || "",
            item_name: row.item_name || "",
            supplier: row.supplier || dialog.get_value("supplier") || prefillSupplier || "",
            warehouse: row.warehouse || dialog.get_value("warehouse") || prefillWarehouse || "",
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
        }
        if (skippedTemplateItems.length) {
          frappe.show_alert({
            message: __("Skipped template item(s): {0}", [Array.from(new Set(skippedTemplateItems)).join(", ")]),
            indicator: "orange",
          }, 6);
        }
        refresh_grid();
      }
      if (prefill.item_code) dialog.set_value("item_code", prefill.item_code);
      if (prefill.supplier) dialog.set_value("supplier", prefill.supplier);
      if (prefill.warehouse) dialog.set_value("warehouse", prefill.warehouse);
      if (typeof prefill.rate !== "undefined") dialog.set_value("rate", soFlt(prefill.rate));
      if (prefill.qty) dialog.set_value("qty", soFlt(prefill.qty));
      if (prefill.descriptions) dialog.set_value("descriptions", prefill.descriptions);
      if (typeof prefill.select_for_po !== "undefined") dialog.set_value("select_for_po", cint(prefill.select_for_po) ? 1 : 0);
      if (typeof prefill.custom_wastage_percentage !== "undefined") dialog.set_value("custom_wastage_percentage", soFlt(prefill.custom_wastage_percentage));
      if (typeof prefill.custom_wastage_qty !== "undefined") dialog.set_value("custom_wastage_qty", soFlt(prefill.custom_wastage_qty));
      if (typeof prefill.extra_qty !== "undefined") dialog.set_value("extra_qty", soFlt(prefill.extra_qty));
    }
    last_item_code = dialog.get_value("item_code") || last_item_code;
    bind_add_row_button();
    recalc_qty_fields();
    dialog.fields_dict.item_code.$input.focus();
    })();
  }, 150);
}

function __legacy_purchaseFlowTable_2(rows){
  rows = rows || [];
  const body = rows.length ? rows.map((r) => `
    <tr>
      <td>${r.purchase_order ? docLink("Purchase Order", r.purchase_order) : `<span class="text-muted">Not Created</span>`}</td>
      <td>${esc(r.supplier || "-")}</td>
      <td>${badge(r.po_status)}</td>
      <td style="text-align:right;">${soFlt(r.ordered_qty)}</td>
      <td style="text-align:right;">${soFlt(r.received_qty)}</td>
      <td style="text-align:right;">${soFlt(r.pending_qty)}</td>
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

function __legacy_materialShortageTable_6(rows){
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
        <td>
          ${sug > 0 ? `<button class="btn btn-xs btn-primary" data-ms-create-po-group="1" data-group="${esc(g)}">${__("Create PO")}</button>` : `<span class="text-muted">-</span>`}
        </td>
        <td style="text-align:right;background:#f1f5f9;">${_n0(stk)}</td>
        <td style="text-align:right;" class="${sht>0?'so-danger':'so-success'}">${_n0(sht)}</td>
        <td style="text-align:right;">${_n0(sug)}</td>
        <td style="text-align:right;">${_n0(poq)}</td>
        <td style="text-align:right;">${_n0(wsp)}</td>
        <td style="text-align:right;">${_n0(prq)}</td>
        <td style="text-align:right;" class="${ppq>0?'so-warning':'so-success'}">${_n0(ppq)}</td>
      </tr>
    `;
    list.forEach((r) => {
      let createQty = Number(r.required_qty || 0) + Number(r.wastage_qty || 0);
      if (createQty <= 0) createQty = Number(r.shortage_qty || 0) + Number(r.wastage_qty || 0);
      if (createQty <= 0) createQty = Number(r.pending_po_qty || 0);
      if (createQty <= 0) createQty = Number(r.po_qty || 0);
      if (createQty <= 0) createQty = 1;
      const wp = Number(r.wastage_pct || 0);
      const wpo = Number(r.po_qty || 0) * wp / 100;
      body += `
        <tr data-panel="${esc(key)}" style="display:none;">
          <td style="padding-left:26px;width:13%;min-width:160px;">${esc(r.item_code || "")}</td>
          <td style="text-align:right;">${(Number(r.qty_per_bom || 0)).toFixed(2)}</td>
          <td style="text-align:right;">${_n0(r.required_qty)}</td>
          <td style="text-align:right;">${_n0(r.wastage_qty || 0)}</td>
          <td>
            ${createQty > 0 ? `<button class="btn btn-xs btn-primary" data-ms-create-po="1" data-item="${esc(r.item_code || "")}" data-qty="${esc(createQty)}" data-required="${esc(r.required_qty || 0)}" data-description="${esc(r.item_code || "")}" data-wp="${esc(wp)}" data-wq="${esc(r.wastage_qty || 0)}">${__("Create PO")}</button>` : `<span class="text-muted">-</span>`}
          </td>
          <td style="text-align:right;background:#f1f5f9;">${_n0(r.stock_qty)}</td>
          <td style="text-align:right;" class="${Number(r.shortage_qty||0)>0?'so-danger':'so-success'}">${_n0(r.shortage_qty)}</td>
          <td style="text-align:right;">${_n0((Number(r.shortage_qty || 0) + Number(r.wastage_qty || 0)))}</td>
          <td style="text-align:right;">${_n0(r.po_qty)}</td>
          <td style="text-align:right;">${_n0(wpo)}</td>
          <td style="text-align:right;">${_n0(r.pr_qty)}</td>
          <td style="text-align:right;" class="${Number(r.pending_po_qty||0)>0?'so-warning':'so-success'}">${_n0(r.pending_po_qty)}</td>
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
          <th style="width:120px;">Create PO</th>
          <th style="width:100px;text-align:right;">Stock</th>
          <th style="width:120px;text-align:right;">Shortage</th>
          <th style="width:130px;text-align:right;">Suggested Qty</th>
          <th style="width:100px;text-align:right;">PO Qty</th>
          <th style="width:130px;text-align:right;">Wastage on PO</th>
          <th style="width:100px;text-align:right;">PR Qty</th>
          <th style="width:130px;text-align:right;">Pending PO Qty</th>
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
    <td style="text-align:right;">${_n0(r.qty)}</td><td style="text-align:right;">${_n0(r.rate)}</td><td style="text-align:right;">${_money0(r.labour_cost || 0)}</td><td>${_csvDocLinks("Per Piece Salary", r.salary_slips)}</td></tr>
  `).join("") : `<tr><td colspan="7" class="text-muted">No employee item-wise labour cost for this Sales Order.</td></tr>`;
  return `
    <div style="display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:12px;margin-bottom:12px;">
      <div class="so-mini-card" style="height:132px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:14px 16px;"><div class="so-mini-title">LABOUR QTY</div><div class="so-mini-val" style="font-size:30px;line-height:1.1;">${_n0(summary.total_qty || 0)}</div></div>
      <div class="so-mini-card" style="height:132px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:14px 16px;"><div class="so-mini-title">TOTAL LABOUR COST</div><div class="so-mini-val" style="font-size:30px;line-height:1.1;">${_money0(summary.total_cost || 0)}</div></div>
    </div>
    <div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;"><thead><tr><th>Employee</th><th>Name</th><th>Item</th><th>Process</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Labour Cost</th><th>Salary</th></tr></thead><tbody>${body}</tbody></table></div>
  `;
}

function __legacy_buildDashboard_6(frm, data){
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
      ${card("Material Shortage & Purchase Suggestion", "Grouped by Item Group with PO and PR planning progress", materialShortageTable(data.material_shortage || []))}
      ${card("PO Analytics (From PO Tab)", "Item Group-Wise PO Status", `${poAnalyticsOverviewCard((data.custom_po_analytics || {}).overview || {})}${poItemGroupTable((data.custom_po_analytics || {}).item_group_rows || [])}`)}
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
    const suggested = sht > 0 ? (sht + wst) : 0;
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
        <td><button class="btn btn-xs btn-primary" data-ms-create-po-group="1" data-group="${esc(g)}">${__("Create PO")}</button></td>
        <td style="text-align:right;background:#f1f5f9;">${_n0(stk)}</td>
        <td style="text-align:right;" class="${sht>0?'so-danger':'so-success'}">${_n0(sht)}</td>
        <td style="text-align:right;">${_n0(suggested)}</td>
        <td style="text-align:right;">${_n0(poq)}</td>
        <td style="text-align:right;">${_n0(wpo)}</td>
        <td style="text-align:right;">${_n0(prq)}</td>
        <td style="text-align:right;" class="${ppq>0?'so-warning':'so-success'}">${_n0(ppq)}</td>
        <td style="text-align:right;">${_money0(lprGroup)}</td>
      </tr>
    `;

    list.forEach((r) => {
      const requiredQty = Number(r.required_qty || 0);
      const shortageOnly = Math.max(Number(r.shortage_qty || 0), 0);
      const wastageQty = Math.max(Number(r.wastage_qty || 0), 0);
      const createQtyRequired = Math.max(requiredQty + wastageQty, 0);
      const createQtyShortage = shortageOnly > 0 ? (shortageOnly + wastageQty) : 0;
      const defaultCreateQty = createQtyRequired > 0 ? createQtyRequired : createQtyShortage;
      const suggestedRow = shortageOnly > 0 ? (shortageOnly + wastageQty) : 0;
      body += `
        <tr data-panel="${esc(key)}" style="display:none;">
          <td style="padding-left:26px;width:13%;min-width:140px;"><a href="#" data-ms-item-detail="1" data-item="${esc(r.item_code || "")}" style="font-weight:700;">${esc(r.item_code || "")}</a></td>
          <td style="text-align:right;">${(Number(r.qty_per_bom || 0)).toFixed(2)}</td>
          <td style="text-align:right;">${_n0(r.required_qty)}</td>
          <td style="text-align:right;">${_n0(r.wastage_qty || 0)}</td>
          <td>
            <button class="btn btn-xs btn-primary" data-ms-create-po="1" data-item="${esc(r.item_code || "")}" data-qty="${esc(defaultCreateQty)}" data-required="${esc(r.required_qty || 0)}" data-shortage="${esc(r.shortage_qty || 0)}" data-description="${esc(r.item_code || "")}" data-wp="${esc(r.wastage_pct || 0)}" data-wq="${esc(r.wastage_qty || 0)}">${__("Create PO")}</button>
          </td>
          <td style="text-align:right;background:#f1f5f9;">${_n0(r.stock_qty)}</td>
          <td style="text-align:right;" class="${Number(r.shortage_qty||0)>0?'so-danger':'so-success'}">${_n0(r.shortage_qty)}</td>
          <td style="text-align:right;">${_n0(suggestedRow)}</td>
          <td style="text-align:right;">${_n0(r.po_qty)}</td>
          <td style="text-align:right;">${_n0((Number(r.po_qty || 0) * Number(r.wastage_pct || 0)) / 100)}</td>
          <td style="text-align:right;">${_n0(r.pr_qty)}</td>
          <td style="text-align:right;" class="${Number(r.pending_po_qty||0)>0?'so-warning':'so-success'}">${_n0(r.pending_po_qty)}</td>
          <td style="text-align:right;">${_money0(r.last_purchase_rate || 0)}</td>
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
          <th style="width:120px;">Create PO</th>
          <th style="width:100px;text-align:right;">Stock</th>
          <th style="width:120px;text-align:right;">Shortage</th>
          <th style="width:130px;text-align:right;">Suggested Qty</th>
          <th style="width:100px;text-align:right;">PO Qty</th>
          <th style="width:130px;text-align:right;">Wastage on PO</th>
          <th style="width:100px;text-align:right;">PR Qty</th>
          <th style="width:130px;text-align:right;">Pending PO Qty</th>
          <th style="width:130px;text-align:right;">Last Purchase Price</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function salesOrderExpensesTable(rows) {
  rows = rows || [];
  if (!rows.length) {
    return `<div class="text-muted">No Expense Claim rows linked with this Sales Order.</div>`;
  }
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const body = rows.map((r) => `
    <tr>
      <td>${r.expense_claim ? docLink("Expense Claim", r.expense_claim) : "-"}</td>
      <td>${esc(fmtDT(r.expense_date || "")) || "-"}</td>
      <td>${esc(r.expense_claim_type || "-")}</td>
      <td>${esc(r.description || "-")}</td>
      <td style="text-align:right;">${_money0(r.amount || 0)}</td>
    </tr>
  `).join("");

  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
    <thead>
      <tr>
        <th>${__("Entry No")}</th>
        <th>${__("Expense Date")}</th>
        <th>${__("Expense Claim Type")}</th>
        <th>${__("Description")}</th>
        <th style="text-align:right;">${__("Amount")}</th>
      </tr>
    </thead>
    <tbody>
      ${body}
      <tr>
        <td colspan="4" style="text-align:right;font-weight:900;color:#1d4ed8;">${__("Total")}</td>
        <td style="text-align:right;font-weight:900;color:#1d4ed8;">${_money0(totalAmount)}</td>
      </tr>
    </tbody>
  </table></div>`;
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

function _planningRows(frm, data){
  const soRows = data.order_item_summary || [];
  const tree = data.production_tree || [];
  const itemMap = {};
  tree.forEach((ppNode) => {
    const ppName = ((ppNode || {}).production_plan || {}).name || "";
    const ppStatus = ((ppNode || {}).production_plan || {}).status || "";
    ((ppNode || {}).work_orders || []).forEach((wo) => {
      const k = String((wo.production_item || wo.item_code || wo.item_name || "")).trim();
      if (!k) return;
      if (!itemMap[k]) itemMap[k] = { pp: [], pp_statuses: [], wo: [], wo_statuses: [], jc: [], jc_statuses: [], wo_completed_qty: 0, jc_completed_qty: 0, wo_details: [], wo_seen: {}, jc_details: [], jc_seen: {} };
      if (ppName && itemMap[k].pp.indexOf(ppName) === -1) itemMap[k].pp.push(ppName);
      if (ppStatus) itemMap[k].pp_statuses.push(ppStatus);
      if (wo.name && itemMap[k].wo.indexOf(wo.name) === -1) itemMap[k].wo.push(wo.name);
      if (wo.status) itemMap[k].wo_statuses.push(wo.status);
      itemMap[k].wo_completed_qty = Number(itemMap[k].wo_completed_qty || 0) + Number(wo.produced_qty || 0);
      if (wo.name && !itemMap[k].wo_seen[wo.name]) {
        itemMap[k].wo_seen[wo.name] = 1;
        itemMap[k].wo_details.push({
          name: wo.name || "",
          status: wo.status || "",
          qty: Number(wo.qty || 0),
          produced_qty: Number(wo.produced_qty || 0),
          process_loss_qty: Number(wo.process_loss_qty || 0),
          disassembled_qty: Number(wo.disassembled_qty || 0),
          material_transferred_for_manufacturing: Number(wo.material_transferred_for_manufacturing || 0),
          additional_transferred_qty: Number(wo.additional_transferred_qty || 0),
          pending_qty: Number(wo.pending_qty || 0),
          completion_pct: Number(wo.completion_pct || 0),
        });
      }
      (wo.job_cards || []).forEach((jc) => {
        if (jc.name && itemMap[k].jc.indexOf(jc.name) === -1) itemMap[k].jc.push(jc.name);
        if (jc.status) itemMap[k].jc_statuses.push(jc.status);
        itemMap[k].jc_completed_qty = Number(itemMap[k].jc_completed_qty || 0) + Number(jc.total_completed_qty || 0);
        if (jc.name && !itemMap[k].jc_seen[jc.name]) {
          itemMap[k].jc_seen[jc.name] = 1;
          itemMap[k].jc_details.push({
            name: jc.name || "",
            status: jc.status || "",
            work_order: jc.work_order || wo.name || "",
            for_quantity: Number(jc.for_quantity || 0),
            total_completed_qty: Number(jc.total_completed_qty || 0),
            process_loss_qty: Number(jc.process_loss_qty || 0),
            time_logs: Array.isArray(jc.time_logs) ? jc.time_logs : [],
            secondary_items: Array.isArray(jc.secondary_items) ? jc.secondary_items : [],
          });
        }
      });
    });
  });

  const sourceRows = soRows.length ? soRows : ((frm && frm.doc && frm.doc.items) || []).map((row) => ({
    sales_order_item: row.name || "",
    item_code: row.item_code || "",
    item_name: row.item_name || row.item_code || "",
    ordered_qty: Number(row.qty || 0),
    delivered_qty: Number(row.delivered_qty || 0),
    pending_qty: Math.max(Number(row.qty || 0) - Number(row.delivered_qty || 0), 0),
    pp_list: [],
    pp_statuses: [],
    wo_list: [],
    wo_statuses: [],
  }));

  return sourceRows.map((r, idx) => {
    const k = String(r.item_code || r.item_name || "").trim();
    const m = itemMap[k] || { pp: [], pp_statuses: [], wo: [], wo_statuses: [], jc: [], jc_statuses: [], wo_completed_qty: 0, jc_completed_qty: 0, wo_details: [], jc_details: [] };
    const ppList = Array.from(new Set([...(r.pp_list || []), ...(m.pp || [])].filter(Boolean)));
    const ppStatuses = Array.from(new Set([...(r.pp_statuses || []), ...(m.pp_statuses || [])].filter(Boolean)));
    const woDetails = (m.wo_details || []).filter((x) => !_isCancelledLikeStatus(x.status));
    const jcDetails = (m.jc_details || []).filter((x) => !_isCancelledLikeStatus(x.status));
    const woList = Array.from(new Set(woDetails.map((x) => String(x.name || "").trim()).filter(Boolean)));
    const woStatuses = woDetails.map((x) => x.status || "");
    const jcList = Array.from(new Set(jcDetails.map((x) => String(x.name || "").trim()).filter(Boolean)));
    const jcStatuses = jcDetails.map((x) => x.status || "");
    const filteredPP = _filterPlanningDocs(ppList, ppStatuses);
    const filteredWO = { names: woList, statuses: woStatuses.filter((s) => !_isCancelledLikeStatus(s)) };
    const filteredJC = { names: jcList, statuses: jcStatuses.filter((s) => !_isCancelledLikeStatus(s)) };
    return {
      idx: idx + 1,
      sales_order_item: r.sales_order_item || "",
      item_code: r.item_code || "",
      item_name: r.item_name || r.item_code || "",
      ordered_qty: Number(r.ordered_qty || 0),
      delivered_qty: Number(r.delivered_qty || 0),
      pending_qty: Number(r.pending_qty || 0),
      pp_list: filteredPP.names,
      pp_statuses: filteredPP.statuses,
      wo_list: filteredWO.names,
      wo_statuses: filteredWO.statuses,
      jc_list: filteredJC.names,
      jc_statuses: filteredJC.statuses,
      wo_completed_qty: woDetails.reduce((a, x) => a + Number(x.produced_qty || 0), 0),
      jc_completed_qty: jcDetails.reduce((a, x) => a + Number(x.total_completed_qty || 0), 0),
      wo_details: woDetails.slice(),
      jc_details: jcDetails.slice(),
    };
  });
}

function _statusChip(hasAny, allDone){
  if (!hasAny) return `<span class="badge badge-secondary">Not Created</span>`;
  return allDone ? `<span class="badge badge-success">Completed</span>` : `<span class="badge badge-warning">In Progress</span>`;
}

function _isCancelledLikeStatus(value){
  const s = String(value || "").trim().toLowerCase();
  return s.includes("cancel");
}

function _filterPlanningDocs(names, statuses){
  const list = (names || []).filter(Boolean);
  const sts = (statuses || []).filter((x) => String(x || "").trim() !== "");
  if (!list.length) {
    return {
      names: [],
      statuses: sts.filter((s) => !_isCancelledLikeStatus(s)),
    };
  }

  if (sts.length === list.length) {
    const outNames = [];
    const outStatuses = [];
    list.forEach((name, idx) => {
      const status = sts[idx] || "";
      if (_isCancelledLikeStatus(status)) return;
      outNames.push(name);
      outStatuses.push(status);
    });
    return { names: outNames, statuses: outStatuses };
  }

  if (sts.some((s) => _isCancelledLikeStatus(s)) && list.length === 1) {
    return {
      names: [],
      statuses: sts.filter((s) => !_isCancelledLikeStatus(s)),
    };
  }

  return {
    names: list,
    statuses: sts.filter((s) => !_isCancelledLikeStatus(s)),
  };
}

function _allDoneStatus(statuses){
  const arr = (statuses || []).map((s) => String(s || "").toLowerCase());
  if (!arr.length) return false;
  return arr.every((s) => s.includes("complete") || s.includes("closed"));
}

function _docStatusCell(doctype, names, statuses) {
  const list = (names || []).filter(Boolean);
  if (!list.length) return _statusChip(false, false);
  const links = list.map((n) => docLink(doctype, n)).join("<br>");
  const done = _allDoneStatus(statuses || []);
  return `${links}<div style="margin-top:4px;">${_statusChip(true, done)}</div>`;
}

function _planningJcQtyCell(r){
  const list = Array.isArray(r.jc_details) ? r.jc_details : [];
  if (!list.length) return `<span class="text-muted">-</span>`;
  const lines = list.map((x) => `<div>${docLink("Job Card", x.name || "")} - <b>${_n0(x.total_completed_qty || 0)}</b></div>`).join("");
  return `${lines}<div style="margin-top:6px;"><button class="btn btn-xs btn-default" data-plan-jc-detail="1" data-item="${esc(r.item_code || "")}">View Details</button></div>`;
}

function _planningWoQtyCell(r){
  const list = Array.isArray(r.wo_details) ? r.wo_details : [];
  const val = _n0(r.wo_completed_qty || 0);
  if (!list.length) return `<span>${val}</span>`;
  return `<div><b>${val}</b></div><div style="margin-top:6px;"><button class="btn btn-xs btn-default" data-plan-wo-detail="1" data-item="${esc(r.item_code || "")}">View Details</button></div>`;
}

function salesOrderItemsPlanningTable(frm, data){
  const rows = _planningRows(frm, data);
  const body = rows.length ? rows.map((r) => {
    return `
      <tr>
        <td style="min-width:210px;"><b>${esc(r.item_name)}</b><div class="muted">${esc(r.item_code)}</div></td>
        <td>${_docStatusCell("Production Plan", r.pp_list, r.pp_statuses)}</td>
        <td>${_docStatusCell("Work Order", r.wo_list, r.wo_statuses)}</td>
        <td>${_docStatusCell("Job Card", r.jc_list, r.jc_statuses)}</td>
        <td style="text-align:right;">${_n0(r.ordered_qty)}</td>
        <td style="text-align:right;">${_n0(r.delivered_qty)}</td>
        <td style="text-align:right;">${_n0(r.pending_qty)}</td>
        <td style="text-align:right;">${_planningWoQtyCell(r)}</td>
        <td>${_planningJcQtyCell(r)}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-xs btn-primary" data-plan-action="ac" data-item="${esc(r.item_code)}">Action Center</button>
        </td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="10" class="text-muted">No item planning rows found.</td></tr>`;

  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
    <thead><tr><th style="min-width:210px;">Item</th><th>Production Plan</th><th>Work Order</th><th>Job Card</th><th style="text-align:right;">Order Qty</th><th style="text-align:right;">Delivered</th><th style="text-align:right;">Pending</th><th style="text-align:right;">WO Completed Qty</th><th style="text-align:right;">JC Completed Qty</th><th>Actions</th></tr></thead>
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
          <div class="so-mini-card"><div class="so-mini-title" style="font-size:10px;">Company</div><div class="so-mini-val" style="font-size:12px;line-height:1.25;">${esc(frm.doc.company || "-")}</div></div>
          <div class="so-mini-card"><div class="so-mini-title" style="font-size:10px;">Sales Order</div><div class="so-mini-val" style="font-size:12px;line-height:1.25;">${esc(frm.doc.name || "-")}</div></div>
          <div class="so-mini-card"><div class="so-mini-title" style="font-size:10px;">Production Plan</div><div class="so-mini-val" style="font-size:12px;line-height:1.25;">${esc(p.pp || "—")}</div></div>
          <div class="so-mini-card"><div class="so-mini-title" style="font-size:10px;">Work Order</div><div class="so-mini-val" style="font-size:12px;line-height:1.25;">${esc(p.wo || "—")}</div></div>
          <div class="so-mini-card"><div class="so-mini-title" style="font-size:10px;">Items</div><div class="so-mini-val" style="font-size:12px;line-height:1.25;">${esc(p.item || "Multiple")}</div></div>
        </div>
        <div style="margin-top:10px;padding:10px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-weight:700;">
          Recommended flow: Sales Order -> Production Plan -> Submit Plan -> Create/Submit Work Order -> Material Transfer -> Start/Pause/Complete Job Cards -> Manufacture/Return Material.
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button class="btn btn-sm btn-primary" data-so-action="show_all_links">${__("Links")}</button>
          <span class="muted" style="font-size:12px;">${__("Open all linked Sales Order documents in one view.")}</span>
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
        <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:12px;">
          <button class="btn btn-sm btn-success" data-so-action="create_sales_order">Create Sales Order</button>
          <button class="btn btn-sm btn-info" data-so-action="create_production_plan">Create Production Plan</button>
          <button class="btn btn-sm btn-dark" data-so-action="create_work_order">Create Work Order</button>
          <button class="btn btn-sm btn-secondary" data-so-action="job_card">Job Card</button>
          <button class="btn btn-sm btn-secondary" data-so-action="manage_docs">Manage Existing Docs</button>
          <button class="btn btn-sm btn-warning" data-so-action="create_material_transfer">Material Transfer</button>
          <button class="btn btn-sm btn-primary" data-so-action="create_manufacture_entry">Manufacture Entry</button>
          <button class="btn btn-sm btn-success" data-so-action="create_delivery_note">Create Delivery Note</button>
          <button class="btn btn-sm btn-success" data-so-action="create_sales_invoice">Create Sales Invoice</button>
          <button class="btn btn-sm btn-secondary" data-so-action="return_disassemble">Return / Disassemble</button>
          <button class="btn btn-sm btn-default" data-so-action="so_status_board">SO Status Board</button>
          <button class="btn btn-sm btn-default" data-so-action="open_current_docs">Open Current Documents</button>
        </div>
      </div>
    </div>
  `;
}

function fgSummaryTable(rows){
  const list = rows || [];
  const body = list.length ? list.map((r) => `
    <tr>
      <td><b>${esc(r.item_code || "-")}</b></td>
      <td style="text-align:right;">${_n0(r.so_qty || 0)}</td>
      <td style="text-align:right;">${_n0(r.pp_qty || 0)}</td>
      <td style="text-align:right;">${_n0(r.wo_qty || 0)}</td>
      <td style="text-align:right;">${_n0(r.jo_qty || 0)}</td>
      <td style="text-align:right;color:#166534;font-weight:800;">${_n0(r.completed_qty || 0)}</td>
      <td style="text-align:right;color:#b45309;font-weight:800;">${_n0(r.wastage_qty || 0)}</td>
    </tr>
  `).join("") : `<tr><td colspan="7" class="text-muted">No FG production summary available.</td></tr>`;

  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
    <thead><tr><th>FG Item</th><th style="text-align:right;">SO Qty</th><th style="text-align:right;">PP Qty</th><th style="text-align:right;">WO Qty</th><th style="text-align:right;">JO Qty</th><th style="text-align:right;">Completed Qty</th><th style="text-align:right;">Wastage Qty (WO)</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

function dailyProductionTable(rows, indicators){
  const list = (rows || []).filter((r) => Number(r.completed_qty || 0) > 0);
  const indicatorMap = indicators || {};
  const totals = Object.keys(indicatorMap).reduce((acc, itemCode) => {
    const row = indicatorMap[itemCode] || {};
    acc.completed += Number(row.total_completed_qty || 0);
    acc.loss += Number(row.total_process_loss_qty || 0);
    return acc;
  }, { completed: 0, loss: 0 });

  const grouped = {};
  list.forEach((r) => {
    const item = String(r.item_code || "-").trim() || "-";
    if (!grouped[item]) grouped[item] = [];
    grouped[item].push(r);
  });

  const groupKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
  groupKeys.forEach((item) => {
    grouped[item].sort((a, b) => {
      const ta = String(a.from_time || "");
      const tb = String(b.from_time || "");
      if (ta === tb) return String(a.operation || "").localeCompare(String(b.operation || ""));
      return ta > tb ? -1 : 1;
    });
  });

  const body = groupKeys.length ? groupKeys.map((item) => {
    const rowsForItem = grouped[item] || [];
    const byOperation = {};
    rowsForItem.forEach((r) => {
      const op = String(r.operation || "Operation").trim() || "Operation";
      if (!byOperation[op]) byOperation[op] = [];
      byOperation[op].push(r);
    });

    const opKeys = Object.keys(byOperation).sort((a, b) => a.localeCompare(b));
    opKeys.forEach((op) => {
      byOperation[op].sort((a, b) => {
        const ta = String(a.from_time || "");
        const tb = String(b.from_time || "");
        return ta > tb ? -1 : (ta < tb ? 1 : 0);
      });
    });

    const itemHeader = `
      <tr>
        <td colspan="6" style="background:linear-gradient(90deg,#dbeafe,#eff6ff);color:#1e3a8a;font-weight:800;"><strong>${esc(item)}</strong></td>
      </tr>
    `;

    const opBlocks = opKeys.map((op) => {
      const opHeader = `
        <tr>
          <td colspan="6" style="background:linear-gradient(90deg,#ecfeff,#f0fdfa);color:#0f766e;font-weight:700;padding-left:20px;"><strong>Operation: ${esc(op)}</strong></td>
        </tr>
      `;
      const opRows = (byOperation[op] || []).map((r) => `
        <tr>
          <td>${esc(fmtDT(r.from_time || "") || "-")}</td>
          <td>${esc(fmtDT(r.to_time || "") || "-")}</td>
          <td>${esc(r.employee || "-")}</td>
          <td>${esc(r.item_code || "-")}</td>
          <td>${esc(r.operation || "-")}</td>
          <td style="text-align:right;">${_n0(r.completed_qty || 0)}</td>
        </tr>
      `).join("");
      return `${opHeader}${opRows}`;
    }).join("");

    return `${itemHeader}${opBlocks}`;
  }).join("") : `<tr><td colspan="6" class="text-muted">No production rows found.</td></tr>`;

  return `
    <div style="margin-bottom:10px;padding:10px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;color:#1e3a8a;font-weight:700;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <span class="so-summary-chip">Total Final Completed Qty (Job Card.total_completed_qty): <b>${_n0(totals.completed)}</b></span>
      <span class="so-summary-chip">Total Process Loss Qty (Job Card.process_loss_qty): <b>${_n0(totals.loss)}</b></span>
    </div>
    <div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
      <thead><tr><th>From Time</th><th>To Time</th><th>Employee</th><th>Item</th><th>Operation Types</th><th style="text-align:right;">Completed Qty</th></tr></thead>
      <tbody>${body}</tbody></table></div>
  `;
}

function dailyJobCardReportTable(rows){
  const list = (rows || []).filter((r) => Number(r.completed_qty || 0) > 0);
  const preferredOps = ["Cutting", "Stitching", "Packing"];
  const opSet = {};
  const itemMap = {};

  list.forEach((r) => {
    const item = String(r.item_code || "-").trim() || "-";
    const op = String(r.operation || "Operation").trim() || "Operation";
    const fromTime = String(r.from_time || "").trim();
    const jc = String(r.job_card || "").trim();
    opSet[op] = 1;
    if (!itemMap[item]) itemMap[item] = { rowsByTime: {}, processLossByOp: {}, finalByOp: {}, seenLoss: {}, seenFinal: {} };

    if (!itemMap[item].rowsByTime[fromTime]) itemMap[item].rowsByTime[fromTime] = {};
    itemMap[item].rowsByTime[fromTime][op] = Number(itemMap[item].rowsByTime[fromTime][op] || 0) + Number(r.completed_qty || 0);

    const lossKey = `${jc}::${op}`;
    if (jc && !itemMap[item].seenLoss[lossKey]) {
      itemMap[item].seenLoss[lossKey] = 1;
      itemMap[item].processLossByOp[op] = Number(itemMap[item].processLossByOp[op] || 0) + Number(r.process_loss_qty || 0);
    }

    const finalKey = `${jc}::${op}`;
    if (jc && !itemMap[item].seenFinal[finalKey]) {
      itemMap[item].seenFinal[finalKey] = 1;
      itemMap[item].finalByOp[op] = Number(itemMap[item].finalByOp[op] || 0) + Number(r.total_completed_qty || 0);
    }
  });

  const ops = Object.keys(opSet).sort((a, b) => {
    const ia = preferredOps.indexOf(a);
    const ib = preferredOps.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
  const items = Object.keys(itemMap).sort((a, b) => a.localeCompare(b));

  if (!items.length || !ops.length) {
    return `<div class="text-muted">No daily job card data found.</div>`;
  }

  const body = items.map((item) => {
    const block = itemMap[item] || {};
    const lossCells = ops.map((op) => `<td style="text-align:center;color:#dc2626;font-weight:800;">${_n0((block.processLossByOp || {})[op] || 0)}</td>`).join("");
    const finalCells = ops.map((op) => `<td style="text-align:center;color:#1d4ed8;font-weight:800;">${_n0((block.finalByOp || {})[op] || 0)}</td>`).join("");
    const times = Object.keys(block.rowsByTime || {}).sort((a, b) => (a > b ? -1 : (a < b ? 1 : 0)));
    const timeRows = times.map((t) => {
      const opCells = ops.map((op) => `<td style="text-align:center;">${_n0(((block.rowsByTime || {})[t] || {})[op] || 0)}</td>`).join("");
      return `<tr><td>${esc(fmtDT(t || "") || "-")}</td>${opCells}</tr>`;
    }).join("");

    return `
      <tr><td colspan="${1 + ops.length}" style="background:#2f4f0d;color:#ffffff;font-weight:800;">${esc(item)}</td></tr>
      <tr><td style="text-align:center;color:#dc2626;font-weight:800;">${__("Total Process Loss Qty")}</td>${lossCells}</tr>
      ${timeRows}
      <tr><td style="text-align:center;color:#1d4ed8;font-weight:800;">${__("Final Completed Qty")}</td>${finalCells}</tr>
    `;
  }).join("");

  const opHead = ops.map((op) => `<th style="text-align:center;">${esc(op)}</th>`).join("");

  return `<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;">
    <thead>
      <tr><th style="text-align:center;"></th><th colspan="${ops.length}" style="text-align:center;">${__("Operations")}</th></tr>
      <tr><th style="text-align:center;">${__("From Time")}</th>${opHead}</tr>
    </thead>
    <tbody>${body}</tbody></table></div>`;
}

function bindDashboardActionButtons($wrap, frm, data){
  const planningRows = _planningRows(frm, data || {});
  const itemDocumentLinks = Array.isArray((data || {}).item_document_links) ? data.item_document_links : [];
  const orderItemSummaryRows = Array.isArray((data || {}).order_item_summary) ? data.order_item_summary : [];
  const dailyOperationSummary = dailyOperationSummaryData((data || {}).daily_operation_report || {}, frm.doc.name || "");
  const dailyOperationQtyByItem = dailyOperationItemQtyMap((data || {}).daily_operation_report || {}, frm.doc.name || "");
  const primaryItem = (() => {
    const rows = frm.doc.items || [];
    if (!rows.length) return "";
    return (rows[0].item_code || rows[0].item_name || "").trim();
  })();

  const getItemLinks = (selectedItem) => {
    const itemCode = String(selectedItem || "").trim();
    return itemDocumentLinks.find((row) => String((row && row.item_code) || "").trim() === itemCode) || null;
  };

  const normalizeStatus = (value) => String(value || "").trim().toLowerCase();
  const isClosedStatus = (value) => {
    const status = normalizeStatus(value);
    return status === "cancelled" || status === "closed" || status === "completed" || status === "stopped";
  };
  const getActiveRows = (rows) => (rows || []).filter((row) => !isClosedStatus(row.status));
  const getItemSummary = (selectedItem) => orderItemSummaryRows.find((row) => String((row && row.item_code) || "").trim() === String(selectedItem || "").trim()) || null;
  const getSalesOrderRow = (selectedItem) => (frm.doc.items || []).find((row) => String((row.item_code || "").trim()) === String(selectedItem || "").trim()) || null;
  const getLatestRow = (rows) => (rows && rows.length ? rows[0] : null);
  const getPlanningRow = (selectedItem) => planningRows.find((row) => String((row.item_code || "")).trim() === String(selectedItem || "").trim()) || null;
  const getSuggestedProductionQty = (itemCode, fallbackQty) => {
    const code = String(itemCode || "").trim();
    const qty = Number(dailyOperationQtyByItem[code] || 0);
    return qty > 0 ? qty : Number(fallbackQty || 0);
  };

  const openWoCompletedDetails = (selectedItem) => {
    const row = getPlanningRow(selectedItem);
    const list = (row && row.wo_details) ? row.wo_details : [];
    const d = new frappe.ui.Dialog({
      title: __("Work Order Completion Details - {0}", [selectedItem || "Item"]),
      size: "large",
      fields: [{ fieldtype: "HTML", fieldname: "body" }],
    });
    const body = list.length ? list.map((w) => `
      <tr>
        <td>${w.name ? docLink("Work Order", w.name) : "-"}</td>
        <td>${esc(w.status || "")}</td>
        <td style="text-align:right;">${_n0(w.qty || 0)}</td>
        <td style="text-align:right;">${_n0(w.produced_qty || 0)}</td>
        <td style="text-align:right;">${_n0(w.process_loss_qty || 0)}</td>
        <td style="text-align:right;">${_n0(w.disassembled_qty || 0)}</td>
        <td style="text-align:right;">${_n0(w.material_transferred_for_manufacturing || 0)}</td>
        <td style="text-align:right;">${_n0(w.additional_transferred_qty || 0)}</td>
        <td style="text-align:right;">${_n0(w.pending_qty || 0)}</td>
      </tr>
    `).join("") : `<tr><td colspan="9" class="text-muted">No Work Order details found.</td></tr>`;

    d.fields_dict.body.$wrapper.html(`<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;"><thead><tr><th>Work Order</th><th>Status</th><th style="text-align:right;">Qty To Manufacture</th><th style="text-align:right;">Produced Qty</th><th style="text-align:right;">Process Loss Qty</th><th style="text-align:right;">Disassembled Qty</th><th style="text-align:right;">Material Transfer Qty</th><th style="text-align:right;">Additional Transfer Qty</th><th style="text-align:right;">Pending Qty</th></tr></thead><tbody>${body}</tbody></table></div>`);
    d.show();
  };

  const openJcCompletedDetails = (selectedItem) => {
    const row = getPlanningRow(selectedItem);
    const list = (row && row.jc_details) ? row.jc_details : [];
    const d = new frappe.ui.Dialog({
      title: __("Job Card Completion Details - {0}", [selectedItem || "Item"]),
      size: "extra-large",
      fields: [{ fieldtype: "HTML", fieldname: "body" }],
    });

    const body = list.length ? list.map((jc) => {
      const logs = (jc.time_logs || []).filter((x) => Number(x.completed_qty || 0) > 0);
      const logsBody = logs.length ? logs.map((x) => `
        <tr>
          <td>${esc(x.employee || "")}</td>
          <td>${esc(fmtDT(x.from_time || "") || "-")}</td>
          <td>${esc(fmtDT(x.to_time || "") || "-")}</td>
          <td style="text-align:right;">${_n0(x.completed_qty || 0)}</td>
          <td style="text-align:right;">${_n2(Number(x.time_in_mins || 0) / 60)}</td>
        </tr>
      `).join("") : `<tr><td colspan="5" class="text-muted">No time logs with completed qty > 0.</td></tr>`;

      const sec = jc.secondary_items || [];
      const secBody = sec.length ? sec.map((s) => `
        <tr>
          <td>${esc(s.item_code || "")}</td>
          <td style="text-align:right;">${_n0(s.required_qty || 0)}</td>
          <td style="text-align:right;">${_n0(s.consumed_qty || 0)}</td>
          <td style="text-align:right;">${_n0(s.transferred_qty || 0)}</td>
          <td>${esc(s.uom || "")}</td>
        </tr>
      `).join("") : `<tr><td colspan="5" class="text-muted">No secondary/scrap items.</td></tr>`;

      return `
        <div style="border:1px solid #dbeafe;border-radius:12px;padding:10px;margin-bottom:10px;background:#f8fbff;">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">
            <div><b>${jc.name ? docLink("Job Card", jc.name) : "-"}</b> <span class="muted">(WO: ${jc.work_order ? docLink("Work Order", jc.work_order) : "-"})</span></div>
            <div>${badge(jc.status || "-")}</div>
          </div>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
            <span class="so-summary-chip">Qty To Manufacture <b>${_n0(jc.for_quantity || 0)}</b></span>
            <span class="so-summary-chip">Completed Qty <b>${_n0(jc.total_completed_qty || 0)}</b></span>
            <span class="so-summary-chip">Process Loss Qty <b>${_n0(jc.process_loss_qty || 0)}</b></span>
          </div>
          <div style="margin-top:10px;font-weight:800;">Time Logs</div>
          <div class="table-responsive"><table class="table table-bordered so-table" style="margin:6px 0 0 0;"><thead><tr><th>Employee</th><th>From Time</th><th>To Time</th><th style="text-align:right;">Completed Qty</th><th style="text-align:right;">Hours</th></tr></thead><tbody>${logsBody}</tbody></table></div>
          <div style="margin-top:10px;font-weight:800;">Secondary / Scrap Items</div>
          <div class="table-responsive"><table class="table table-bordered so-table" style="margin:6px 0 0 0;"><thead><tr><th>Item</th><th style="text-align:right;">Required Qty</th><th style="text-align:right;">Consumed Qty</th><th style="text-align:right;">Transferred Qty</th><th>UOM</th></tr></thead><tbody>${secBody}</tbody></table></div>
        </div>
      `;
    }).join("") : `<div class="text-muted">No Job Card details found.</div>`;

    d.fields_dict.body.$wrapper.html(body);
    d.show();
  };

  const buildSeedForItem = (selectedItem) => {
    const itemCode = String(selectedItem || primaryItem || "").trim();
    const planRow = planningRows.find((row) => String(row.item_code || "").trim() === itemCode)
      || planningRows.find((row) => String(row.item_name || "").trim() === itemCode)
      || {};
    const firstPointer = _firstProductionPointers(data || {});
    return {
      company: frm.doc.company || "",
      sales_order: frm.doc.name || "",
      customer: frm.doc.customer || "",
      item_code: itemCode || "",
      sales_order_item: ((frm.doc.items || []).find((row) => String(row.item_code || "").trim() === itemCode) || {}).name || "",
      production_plan: (planRow.pp_list || [])[0] || firstPointer.pp || "",
      work_order: (planRow.wo_list || [])[0] || firstPointer.wo || "",
      job_card: (planRow.jc_list || [])[0] || "",
      qty: Math.max(Number((frm.doc.items || []).find((row) => String(row.item_code || "").trim() === itemCode)?.qty || 0), 1),
    };
  };

  const getPendingSoItems = async (selectedItem) => {
    const filterItem = String(selectedItem || "").trim();
    const rows = (frm.doc.items || []).map((r) => {
      const pending = Number(r.qty || 0) - Number(r.delivered_qty || 0);
      const fallbackQty = pending > 0 ? pending : Number(r.qty || 0) || 1;
      return {
        item_code: r.item_code || "",
        item_name: r.item_name || r.item_code || "",
        qty: getSuggestedProductionQty(r.item_code || "", fallbackQty) || 1,
        stock_uom: r.uom || r.stock_uom || "",
        sales_order_item: r.name || "",
      };
    }).filter((r) => r.item_code && (!filterItem || r.item_code === filterItem));
    const withBom = await Promise.all(rows.map(async (r) => {
      let bom = "";
      try {
        const x = await frappe.db.get_value("Item", r.item_code, "default_bom");
        bom = (x && x.message && x.message.default_bom) || "";
      } catch (e) {
        bom = "";
      }
      return { ...r, bom_no: bom };
    }));
    return withBom;
  };

  const insertDoc = async (doc) => {
    const r = await frappe.call({
      method: "frappe.client.insert",
      args: { doc },
      freeze: true,
      freeze_message: __("Creating draft..."),
    });
    return (r && r.message) || null;
  };

  const submitDoc = async (doc) => {
    const r = await frappe.call({
      method: "frappe.client.submit",
      args: { doc },
      freeze: true,
      freeze_message: __("Submitting..."),
    });
    return (r && r.message) || doc;
  };

  const getDoc = async (doctype, name) => {
    const r = await frappe.call({
      method: "frappe.client.get",
      args: { doctype, name },
    });
    return (r && r.message) || null;
  };

  const getDocList = async (doctype, filters, fields, limit) => {
    const r = await frappe.call({
      method: "frappe.client.get_list",
      args: {
        doctype,
        filters: filters || {},
        fields: fields || ["name"],
        limit_page_length: limit || 50,
        order_by: "modified desc",
      },
    });
    return (r && r.message) || [];
  };

  const submitExistingDoc = async (doctype, name) => {
    const doc = await getDoc(doctype, name);
    if (!doc) throw new Error(__("{0} not found", [name]));
    return submitDoc(doc);
  };

  const openJobCardControlDialog = async (mode, jobCardName, selectedItem, afterUpdate) => {
    const jc = await getDoc("Job Card", jobCardName);
    if (!jc) {
      frappe.show_alert({ message: __("Job Card not found."), indicator: "orange" }, 4);
      return;
    }

    const isStart = mode === "start";
    const isPause = mode === "pause";
    const isComplete = mode === "complete";
    const remainingQty = Math.max(Number(jc.for_quantity || 0) - Number(jc.total_completed_qty || 0), 0);
    const dialog = new frappe.ui.Dialog({
      title: isStart ? __("Start Job") : isPause ? __("Pause Job") : __("Complete Job"),
      fields: [
        { fieldtype: "HTML", fieldname: "info_html" },
        { fieldtype: "HTML", fieldname: "summary_html" },
        { fieldtype: "Section Break" },
        {
          fieldtype: "MultiSelectPills",
          fieldname: "employees",
          label: __("Employees"),
          reqd: 1,
          get_data: function(txt) {
            return frappe.db.get_link_options("Employee", txt || "");
          },
        },
        { fieldtype: "Datetime", fieldname: "from_time", label: __("From Time"), default: frappe.datetime.now_datetime(), reqd: 1 },
        { fieldtype: "Datetime", fieldname: "to_time", label: __("To Time"), default: frappe.datetime.now_datetime(), reqd: isStart ? 0 : 1 },
        { fieldtype: "Float", fieldname: "completed_qty", label: __("Completed Qty"), default: isComplete ? remainingQty : 0, reqd: isStart ? 0 : 1 },
      ],
      primary_action_label: isStart ? __("Start Job") : isPause ? __("Pause Job") : __("Complete Job"),
      primary_action: async (values) => {
        const employees = (values.employees || []).map((row) => {
          if (typeof row === "string") return row;
          return row && (row.value || row.label || row.name) || "";
        }).filter(Boolean);
        if (!employees.length) {
          frappe.show_alert({ message: __("Select at least one employee."), indicator: "orange" }, 4);
          return;
        }
        if (!isStart && Number(values.completed_qty || 0) < 0) {
          frappe.show_alert({ message: __("Completed Qty cannot be negative."), indicator: "orange" }, 4);
          return;
        }
        if (isPause && Number(values.completed_qty || 0) <= 0) {
          frappe.show_alert({ message: __("Completed Qty must be greater than 0 for Pause Job."), indicator: "orange" }, 4);
          return;
        }
        try {
          await frappe.call({
            method: "live_production_api",
            args: {
              action: isStart ? "start_job_card" : isPause ? "update_production" : "complete_job_card",
              job_card: jobCardName,
              employees: employees.join(","),
              from_time: values.from_time,
              to_time: values.to_time,
              completed_qty: values.completed_qty,
            },
            freeze: true,
            freeze_message: __("Updating Job Card..."),
          });
          dialog.hide();
          frappe.show_alert({ message: __("Job Card updated."), indicator: "green" }, 4);
          frm.trigger("render_execution_dashboard");
          if (typeof afterUpdate === "function") afterUpdate();
        } catch (error) {
          frappe.msgprint(__("Failed: {0}", [error.message || error]));
        }
      },
    });
    dialog.fields_dict.info_html.$wrapper.html(`
      <div style="padding:10px;border:1px solid #dbeafe;border-radius:10px;background:#eff6ff;color:#1e3a8a;font-size:12px;">
        <b>${esc(jc.name || jobCardName)}</b> &nbsp; | &nbsp; ${esc(jc.operation || "-")} &nbsp; | &nbsp; ${__("Qty")}: <b>${soFlt(jc.total_completed_qty || 0)}</b> / <b>${soFlt(jc.for_quantity || 0)}</b>
      </div>
    `);
    dialog.fields_dict.summary_html.$wrapper.html(
      dailyOperationItemSummaryHtml(dailyOperationSummary, selectedItem || "", { show_item_totals_table: false })
    );
    dialog.show();
  };

  const openSalesOrderCreator = (seed) => {
    const d = new frappe.ui.Dialog({
      title: __("Create Sales Order"),
      size: "large",
      fields: [
        { fieldtype: "Section Break" },
        { fieldtype: "Link", fieldname: "company", label: __("Company"), options: "Company", default: seed.company || frm.doc.company || "", reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Link", fieldname: "customer", label: __("Customer"), options: "Customer", default: frm.doc.customer || "", reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Date", fieldname: "delivery_date", label: __("Delivery Date"), default: frappe.datetime.now_date(), reqd: 1 },
        { fieldtype: "Section Break" },
        { fieldtype: "Link", fieldname: "item_code", label: __("Item"), options: "Item", default: seed.item_code || primaryItem || "", reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Float", fieldname: "qty", label: __("Qty"), default: 1, reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Currency", fieldname: "rate", label: __("Rate"), default: 0 },
      ],
      primary_action_label: __("Create Draft Sales Order"),
      primary_action: async (v) => {
        const doc = {
          doctype: "Sales Order",
          company: v.company,
          customer: v.customer,
          delivery_date: v.delivery_date,
          items: [{
            doctype: "Sales Order Item",
            item_code: v.item_code,
            qty: Number(v.qty || 0),
            delivery_date: v.delivery_date,
            rate: Number(v.rate || 0),
          }],
        };
        try {
          const created = await insertDoc(doc);
          d.hide();
          frappe.show_alert({ message: __("Draft Sales Order {0} created", [created.name]), indicator: "green" }, 5);
          if (created && created.name) window.open(`/app/sales-order/${encodeURIComponent(created.name)}`, "_blank");
        } catch (e) {
          frappe.msgprint(__("Failed: {0}", [e.message || e]));
        }
      },
    });
    d.show();
  };

  const openProductionPlanCreator = (seed) => {
    const rows = [];
    const selectedItem = String(seed.item_code || "").trim();
    const summaryHtml = dailyOperationItemSummaryHtml(dailyOperationSummary, selectedItem, { show_item_totals_table: false });
    const d = new frappe.ui.Dialog({
      title: __("Create Production Plan"),
      size: "extra-large",
      fields: [
        { fieldtype: "HTML", fieldname: "help_html" },
        { fieldtype: "Section Break" },
        { fieldtype: "Link", fieldname: "company", label: __("Company"), options: "Company", default: seed.company || frm.doc.company || "", reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Link", fieldname: "sales_order", label: __("Sales Order"), options: "Sales Order", default: frm.doc.name || "", reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Date", fieldname: "posting_date", label: __("Posting Date"), default: frappe.datetime.now_date(), reqd: 1 },
        { fieldtype: "Section Break" },
        { fieldtype: "Datetime", fieldname: "planned_start_date", label: __("Default Planned Start"), default: frappe.datetime.now_datetime(), reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Link", fieldname: "default_fg_warehouse", label: __("Default FG Warehouse"), options: "Warehouse", default: getDefaultWarehouse("target", seed.company || frm.doc.company || "") },
        { fieldtype: "Column Break" },
        { fieldtype: "Button", fieldname: "load_sales_order_items", label: __("Load Sales Order Items") },
        { fieldtype: "Section Break" },
        { fieldtype: "Check", fieldname: "submit_after_create", label: __("Submit after create"), default: 0 },
        { fieldtype: "Column Break" },
        { fieldtype: "Check", fieldname: "create_work_orders_after_submit", label: __("Create Work Orders after submit"), default: 1 },
        { fieldtype: "Section Break" },
        {
          fieldtype: "Table",
          fieldname: "po_items",
          label: __("Production Items"),
          cannot_add_rows: false,
          in_place_edit: true,
          data: rows,
          get_data: () => rows,
          fields: [
            { fieldtype: "Link", fieldname: "item_code", label: __("Item"), options: "Item", reqd: 1, in_list_view: 1 },
            { fieldtype: "Link", fieldname: "bom_no", label: __("BOM"), options: "BOM", reqd: 1, in_list_view: 1 },
            { fieldtype: "Float", fieldname: "planned_qty", label: __("Planned Qty"), reqd: 1, in_list_view: 1 },
            { fieldtype: "Link", fieldname: "stock_uom", label: __("UOM"), options: "UOM", in_list_view: 1 },
            { fieldtype: "Datetime", fieldname: "planned_start_date", label: __("Planned Start"), in_list_view: 1 },
            { fieldtype: "Link", fieldname: "warehouse", label: __("FG Warehouse"), options: "Warehouse", in_list_view: 1 },
            { fieldtype: "Data", fieldname: "sales_order_item", label: __("SO Item"), hidden: 1 },
          ],
        },
      ],
      primary_action_label: __("Create Draft Production Plan"),
      primary_action: async (v) => {
        const poItems = (v.po_items || []).filter((r) => r.item_code && r.bom_no && Number(r.planned_qty || 0) > 0);
        if (!poItems.length) return frappe.msgprint(__("Add at least one valid item row."));
        let doc = {
          doctype: "Production Plan",
          company: v.company,
          posting_date: v.posting_date,
          get_items_from: "Sales Order",
          sales_orders: [{ doctype: "Production Plan Sales Order", sales_order: v.sales_order }],
          po_items: poItems.map((r) => ({
            doctype: "Production Plan Item",
            item_code: r.item_code,
            bom_no: r.bom_no,
            stock_uom: r.stock_uom || "",
            planned_qty: Number(r.planned_qty || 0),
            pending_qty: Number(r.planned_qty || 0),
            planned_start_date: r.planned_start_date || v.planned_start_date,
            warehouse: r.warehouse || v.default_fg_warehouse || "",
            sales_order: v.sales_order || "",
            sales_order_item: r.sales_order_item || "",
          })),
        };
        try {
          doc = await insertDoc(doc);
          if (v.submit_after_create || v.create_work_orders_after_submit) doc = await submitDoc(doc);
          if (v.create_work_orders_after_submit && doc && doc.name) {
            await frappe.call({
              method: "frappe.handler.run_doc_method",
              args: { dt: "Production Plan", dn: doc.name, method: "make_work_order" },
              freeze: true,
              freeze_message: __("Creating Work Orders from Production Plan..."),
            });
          }
          d.hide();
          frappe.show_alert({ message: __("Production Plan {0} created", [doc.name]), indicator: "green" }, 6);
          frm.trigger("render_execution_dashboard");
          if (doc && doc.name) window.open(`/app/production-plan/${encodeURIComponent(doc.name)}`, "_blank");
        } catch (e) {
          frappe.msgprint(__("Failed: {0}", [e.message || e]));
        }
      },
    });
    d.fields_dict.help_html.$wrapper.html(`
      ${summaryHtml}
      <div style="padding:10px;border:1px solid #dbeafe;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:12px;">
        ${__("Required for Production Plan: Company, Posting Date, and item rows with Item, BOM, Planned Qty, UOM, and Planned Start.")}
      </div>
    `);
    d.fields_dict.load_sales_order_items.$input.on("click", async () => {
      rows.splice(0, rows.length);
      const soRows = await getPendingSoItems(seed.item_code);
      soRows.forEach((r) => rows.push({
        item_code: r.item_code,
        bom_no: r.bom_no || "",
        planned_qty: Number(r.qty || 1),
        stock_uom: r.stock_uom || "",
        planned_start_date: d.get_value("planned_start_date") || frappe.datetime.now_datetime(),
        warehouse: d.get_value("default_fg_warehouse") || "",
        sales_order_item: r.sales_order_item || "",
      }));
      d.fields_dict.po_items.grid.refresh();
    });
    d.show();
    const syncProductionPlanWarehouses = async () => {
      const company = d.get_value("company") || seed.company || frm.doc.company || "";
      const abbr = await fetchCompanyAbbr(company);
      d.set_value("default_fg_warehouse", getDefaultWarehouse("target", company, abbr));
    };
    if (d.fields_dict.company && d.fields_dict.company.$input) {
      d.fields_dict.company.$input.off("change.otr_pp_wh").on("change.otr_pp_wh", () => {
        void syncProductionPlanWarehouses();
      });
    }
    void syncProductionPlanWarehouses();
    d.fields_dict.load_sales_order_items.$input.trigger("click");
  };

  const openWorkOrderCreator = (seed) => {
    const rows = [];
    const selectedItem = String(seed.item_code || "").trim();
    const summaryHtml = dailyOperationItemSummaryHtml(dailyOperationSummary, selectedItem, { show_item_totals_table: false });
    const d = new frappe.ui.Dialog({
      title: __("Create Work Order"),
      size: "extra-large",
      fields: [
        { fieldtype: "HTML", fieldname: "help_html" },
        { fieldtype: "Section Break" },
        { fieldtype: "Link", fieldname: "company", label: __("Company"), options: "Company", default: seed.company || frm.doc.company || "", reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Link", fieldname: "sales_order", label: __("Sales Order"), options: "Sales Order", default: frm.doc.name || "", reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Button", fieldname: "load_sales_order_items", label: __("Load Sales Order Items") },
        { fieldtype: "Section Break" },
        { fieldtype: "Datetime", fieldname: "planned_start_date", label: __("Planned Start Date"), default: frappe.datetime.now_datetime(), reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Link", fieldname: "source_warehouse", label: __("Source Warehouse"), options: "Warehouse", default: getDefaultWarehouse("source", seed.company || frm.doc.company || "") },
        { fieldtype: "Column Break" },
        { fieldtype: "Link", fieldname: "wip_warehouse", label: __("WIP Warehouse"), options: "Warehouse", default: getDefaultWarehouse("wip", seed.company || frm.doc.company || "") },
        { fieldtype: "Section Break" },
        { fieldtype: "Link", fieldname: "fg_warehouse", label: __("Target Warehouse"), options: "Warehouse", default: getDefaultWarehouse("target", seed.company || frm.doc.company || ""), reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Link", fieldname: "scrap_warehouse", label: __("Scrap Warehouse"), options: "Warehouse", default: getDefaultWarehouse("scrap", seed.company || frm.doc.company || "") },
        { fieldtype: "Column Break" },
        { fieldtype: "Check", fieldname: "skip_transfer", label: __("Skip Material Transfer to WIP"), default: 0 },
        { fieldtype: "Section Break" },
        { fieldtype: "Check", fieldname: "submit_after_create", label: __("Submit after create"), default: 0 },
        { fieldtype: "Section Break" },
        {
          fieldtype: "Table",
          fieldname: "wo_items",
          label: __("Work Order Items"),
          cannot_add_rows: false,
          in_place_edit: true,
          data: rows,
          get_data: () => rows,
          fields: [
            { fieldtype: "Link", fieldname: "item_code", label: __("Item"), options: "Item", reqd: 1, in_list_view: 1 },
            { fieldtype: "Link", fieldname: "bom_no", label: __("BOM"), options: "BOM", reqd: 1, in_list_view: 1 },
            { fieldtype: "Float", fieldname: "qty", label: __("Qty"), reqd: 1, in_list_view: 1 },
            { fieldtype: "Data", fieldname: "sales_order_item", label: __("SO Item"), hidden: 1 },
          ],
        },
      ],
      primary_action_label: __("Create Draft Work Order(s)"),
      primary_action: async (v) => {
        const woRows = (v.wo_items || []).filter((r) => r.item_code && r.bom_no && Number(r.qty || 0) > 0);
        if (!woRows.length) return frappe.msgprint(__("Add at least one valid Work Order row."));
        try {
          const created = [];
          for (const r of woRows) {
            let doc = await insertDoc({
              doctype: "Work Order",
              company: v.company,
              sales_order: v.sales_order,
              sales_order_item: r.sales_order_item || "",
              production_plan: seed.production_plan || "",
              production_item: r.item_code,
              bom_no: r.bom_no,
              qty: Number(r.qty || 0),
              planned_start_date: v.planned_start_date,
              source_warehouse: v.source_warehouse || "",
              wip_warehouse: v.wip_warehouse || "",
              fg_warehouse: v.fg_warehouse || "",
              scrap_warehouse: v.scrap_warehouse || "",
              skip_transfer: v.skip_transfer ? 1 : 0,
            });
            if (v.submit_after_create) doc = await submitDoc(doc);
            if (doc && doc.name) created.push(doc.name);
          }
          d.hide();
          frappe.show_alert({ message: __("{0} Work Order(s) created", [created.length]), indicator: "green" }, 6);
          frm.trigger("render_execution_dashboard");
          if (created[0]) window.open(`/app/work-order/${encodeURIComponent(created[0])}`, "_blank");
        } catch (e) {
          frappe.msgprint(__("Failed: {0}", [e.message || e]));
        }
      },
    });
    d.fields_dict.help_html.$wrapper.html(`
      ${summaryHtml}
      <div style="padding:10px;border:1px solid #ede9fe;border-radius:8px;background:#f5f3ff;color:#5b21b6;font-size:12px;">
        ${__("Required for Work Order: Company, Planned Start Date, Target Warehouse, and item rows with Item, BOM, and Qty.")}
      </div>
    `);
    d.fields_dict.load_sales_order_items.$input.on("click", async () => {
      rows.splice(0, rows.length);
      const soRows = await getPendingSoItems(seed.item_code);
      soRows.forEach((r) => rows.push({
        item_code: r.item_code,
        bom_no: r.bom_no || "",
        qty: Number(r.qty || 1),
        sales_order_item: r.sales_order_item || "",
      }));
      d.fields_dict.wo_items.grid.refresh();
    });
    d.show();
    const syncWorkOrderWarehouses = async () => {
      const company = d.get_value("company") || seed.company || frm.doc.company || "";
      const abbr = await fetchCompanyAbbr(company);
      d.set_value("source_warehouse", getDefaultWarehouse("source", company, abbr));
      d.set_value("wip_warehouse", getDefaultWarehouse("wip", company, abbr));
      d.set_value("fg_warehouse", getDefaultWarehouse("target", company, abbr));
      d.set_value("scrap_warehouse", getDefaultWarehouse("scrap", company, abbr));
    };
    if (d.fields_dict.company && d.fields_dict.company.$input) {
      d.fields_dict.company.$input.off("change.otr_wo_wh").on("change.otr_wo_wh", () => {
        void syncWorkOrderWarehouses();
      });
    }
    void syncWorkOrderWarehouses();
    d.fields_dict.load_sales_order_items.$input.trigger("click");
  };

  const openStockEntryCreator = async (seed, purpose) => {
    const d = new frappe.ui.Dialog({
      title: __(purpose === "Disassemble" ? "Return / Disassemble" : purpose),
      size: "large",
      fields: [
        { fieldtype: "Section Break" },
        { fieldtype: "Link", fieldname: "work_order", label: __("Work Order"), options: "Work Order", default: seed.work_order || "", reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Float", fieldname: "qty", label: __("Qty"), default: 1, reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Date", fieldname: "posting_date", label: __("Posting Date"), default: frappe.datetime.now_date(), reqd: 1 },
        { fieldtype: "Section Break" },
        { fieldtype: "Link", fieldname: "source_warehouse", label: __("Source Warehouse"), options: "Warehouse", default: getDefaultWarehouse("source", seed.company || frm.doc.company || "") },
        { fieldtype: "Column Break" },
        { fieldtype: "Link", fieldname: "target_warehouse", label: __("Target Warehouse"), options: "Warehouse", default: getDefaultWarehouse("target", seed.company || frm.doc.company || "") },
        { fieldtype: "Column Break" },
        { fieldtype: "Check", fieldname: "submit_after_create", label: __("Submit after create"), default: 0 },
      ],
      primary_action_label: __("Create Draft Entry"),
      primary_action: async (v) => {
        try {
          const mapped = await frappe.call({
            method: "erpnext.manufacturing.doctype.work_order.work_order.make_stock_entry",
            args: {
              work_order_id: v.work_order,
              purpose,
              qty: Number(v.qty || 0),
              target_warehouse: v.target_warehouse || "",
            },
            freeze: true,
            freeze_message: __("Preparing entry..."),
          });
          let doc = (mapped && mapped.message) || null;
          if (!doc) throw new Error(__("Could not prepare stock entry"));
          doc.posting_date = v.posting_date || doc.posting_date;
          if (v.source_warehouse && Array.isArray(doc.items)) {
            doc.items = doc.items.map((x) => ({ ...x, s_warehouse: x.s_warehouse || v.source_warehouse }));
          }
          if (v.target_warehouse && Array.isArray(doc.items)) {
            doc.items = doc.items.map((x) => ({ ...x, t_warehouse: x.t_warehouse || v.target_warehouse }));
          }
          doc = await insertDoc(doc);
          if (v.submit_after_create) doc = await submitDoc(doc);
          d.hide();
          frappe.show_alert({ message: __("Stock Entry {0} created", [doc.name]), indicator: "green" }, 6);
          frm.trigger("render_execution_dashboard");
          if (doc && doc.name) window.open(`/app/stock-entry/${encodeURIComponent(doc.name)}`, "_blank");
        } catch (e) {
          frappe.msgprint(__("Failed: {0}", [e.message || e]));
        }
      },
    });
    d.show();
    const company = seed.company || frm.doc.company || "";
    const abbr = await fetchCompanyAbbr(company);
    d.set_value("source_warehouse", getDefaultWarehouse("source", company, abbr));
    d.set_value("target_warehouse", getDefaultWarehouse("target", company, abbr));
  };

  const filterMappedItemsBySeed = (doc, seed) => {
    if (!doc || !Array.isArray(doc.items)) return doc;
    if (!seed || (!seed.sales_order_item && !seed.item_code)) return doc;
    const filteredItems = doc.items.filter((row) => {
      const matchesSoItem = !seed.sales_order_item || String((row && (row.so_detail || row.sales_order_item)) || "").trim() === String(seed.sales_order_item || "").trim();
      const matchesItem = !seed.item_code || String((row && row.item_code) || "").trim() === String(seed.item_code || "").trim();
      return matchesSoItem && matchesItem;
    });
    return { ...doc, items: filteredItems };
  };

  const openDeliveryNoteCreator = async (seed) => {
    const d = new frappe.ui.Dialog({
      title: __("Create Delivery Note"),
      size: "large",
      fields: [
        { fieldtype: "Section Break" },
        { fieldtype: "Link", fieldname: "sales_order", label: __("Sales Order"), options: "Sales Order", default: frm.doc.name || "", reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Date", fieldname: "posting_date", label: __("Posting Date"), default: frappe.datetime.now_date(), reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Check", fieldname: "submit_after_create", label: __("Submit after create"), default: 0 },
      ],
      primary_action_label: __("Create Draft Delivery Note"),
      primary_action: async (v) => {
        try {
          const mapped = await frappe.call({
            method: "erpnext.selling.doctype.sales_order.sales_order.make_delivery_note",
            args: { source_name: v.sales_order },
            freeze: true,
            freeze_message: __("Preparing Delivery Note..."),
          });
          let doc = (mapped && mapped.message) || null;
          if (!doc) throw new Error(__("Could not prepare delivery note"));
          doc = filterMappedItemsBySeed(doc, seed);
          if (!doc.items || !doc.items.length) {
            throw new Error(__("No pending Delivery Note items found for this Sales Order item."));
          }
          doc.posting_date = v.posting_date || doc.posting_date;
          doc = await insertDoc(doc);
          if (v.submit_after_create) doc = await submitDoc(doc);
          d.hide();
          frappe.show_alert({ message: __("Delivery Note {0} created", [doc.name]), indicator: "green" }, 6);
          frm.trigger("render_execution_dashboard");
          if (doc && doc.name) window.open(`/app/delivery-note/${encodeURIComponent(doc.name)}`, "_blank");
        } catch (e) {
          frappe.msgprint(__("Failed: {0}", [e.message || e]));
        }
      },
    });
    d.show();
  };

  const openSalesInvoiceCreator = async (seed) => {
    const d = new frappe.ui.Dialog({
      title: __("Create Sales Invoice"),
      size: "large",
      fields: [
        { fieldtype: "Section Break" },
        { fieldtype: "Link", fieldname: "sales_order", label: __("Sales Order"), options: "Sales Order", default: frm.doc.name || "", reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Date", fieldname: "posting_date", label: __("Posting Date"), default: frappe.datetime.now_date(), reqd: 1 },
        { fieldtype: "Column Break" },
        { fieldtype: "Check", fieldname: "submit_after_create", label: __("Submit after create"), default: 0 },
      ],
      primary_action_label: __("Create Draft Sales Invoice"),
      primary_action: async (v) => {
        try {
          const mapped = await frappe.call({
            method: "erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice",
            args: { source_name: v.sales_order },
            freeze: true,
            freeze_message: __("Preparing Sales Invoice..."),
          });
          let doc = (mapped && mapped.message) || null;
          if (!doc) throw new Error(__("Could not prepare sales invoice"));
          doc = filterMappedItemsBySeed(doc, seed);
          if (!doc.items || !doc.items.length) {
            throw new Error(__("No pending Sales Invoice items found for this Sales Order item."));
          }
          doc.posting_date = v.posting_date || doc.posting_date;
          doc = await insertDoc(doc);
          if (v.submit_after_create) doc = await submitDoc(doc);
          d.hide();
          frappe.show_alert({ message: __("Sales Invoice {0} created", [doc.name]), indicator: "green" }, 6);
          frm.trigger("render_execution_dashboard");
          if (doc && doc.name) window.open(`/app/sales-invoice/${encodeURIComponent(doc.name)}`, "_blank");
        } catch (e) {
          frappe.msgprint(__("Failed: {0}", [e.message || e]));
        }
      },
    });
    d.show();
  };

  const openExistingDocsDialog = (seed) => {
    const itemRows = (frm.doc.items || []).filter((row) => row.item_code);
    const itemOptions = itemRows.map((row) => row.item_code);
    const initialItem = String(seed.item_code || primaryItem || itemOptions[0] || "").trim();
    const dialog = new frappe.ui.Dialog({
      title: __("Existing Manufacturing Documents"),
      size: "extra-large",
      fields: [
        { fieldtype: "Section Break" },
        {
          fieldtype: "Select",
          fieldname: "item_code",
          label: __("Sales Order Item"),
          options: itemOptions.join("\n"),
          default: initialItem,
        },
        { fieldtype: "Column Break" },
        { fieldtype: "Data", fieldname: "sales_order", label: __("Sales Order"), read_only: 1, default: frm.doc.name || "" },
        { fieldtype: "Column Break" },
        { fieldtype: "Data", fieldname: "customer", label: __("Customer"), read_only: 1, default: frm.doc.customer || "" },
        { fieldtype: "Section Break" },
        { fieldtype: "HTML", fieldname: "body_html" },
      ],
    });

    const openDoc = (doctype, name) => {
      if (!doctype || !name) return;
      window.open(`/app/${slug(doctype)}/${encodeURIComponent(name)}`, "_blank");
    };

    const getSnapshot = (selectedItem) => {
      const itemCode = String(selectedItem || initialItem || "").trim();
      const seedForItem = buildSeedForItem(itemCode);
      const itemLinks = getItemLinks(itemCode) || {};
      const summary = getItemSummary(itemCode) || {};
      const salesOrderRow = getSalesOrderRow(itemCode) || {};
      const transferEntries = (itemLinks.stock_entries || []).filter((row) => normalizeStatus(row.purpose) === "material transfer for manufacture");
      const manufactureEntries = (itemLinks.stock_entries || []).filter((row) => normalizeStatus(row.purpose) === "manufacture");
      const latestProductionPlan = getLatestRow(itemLinks.production_plans || []);
      const activeWorkOrder = getActiveRows(itemLinks.work_orders || [])[0] || getLatestRow(itemLinks.work_orders || []);
      const draftProductionPlan = (itemLinks.production_plans || []).find((row) => normalizeStatus(row.status) === "draft") || null;
      const draftWorkOrder = (itemLinks.work_orders || []).find((row) => normalizeStatus(row.status) === "draft") || null;
      const openJobCards = (itemLinks.job_cards || []).filter((row) => {
        const status = normalizeStatus(row.status);
        return status && status !== "completed" && status !== "cancelled";
      });
      return {
        itemCode,
        itemName: salesOrderRow.item_name || summary.item_name || itemCode,
        salesOrderRow,
        summary,
        itemLinks,
        seed: {
          ...seedForItem,
          production_plan: seedForItem.production_plan || (latestProductionPlan && latestProductionPlan.name) || "",
          work_order: seedForItem.work_order || (activeWorkOrder && activeWorkOrder.name) || "",
        },
        transferEntries,
        manufactureEntries,
        latestProductionPlan,
        activeWorkOrder,
        draftProductionPlan,
        draftWorkOrder,
        openJobCards,
      };
    };

    const getRecommendedAction = (snapshot) => {
      if (!(snapshot.itemLinks.production_plans || []).length) {
        return { action: "pp", label: __("Create Production Plan"), help: __("Start the manufacturing chain for this Sales Order item.") };
      }
      if (snapshot.draftProductionPlan) {
        return { action: "submit_pp", docname: snapshot.draftProductionPlan.name, label: __("Submit Production Plan"), help: __("Submit the draft Production Plan before creating Work Orders.") };
      }
      if (!(snapshot.itemLinks.work_orders || []).length) {
        return { action: "wo", label: __("Create Work Order"), help: __("Create a Work Order linked to this Sales Order item and Production Plan.") };
      }
      if (snapshot.draftWorkOrder) {
        return { action: "submit_wo", docname: snapshot.draftWorkOrder.name, label: __("Submit Work Order"), help: __("Submit the draft Work Order before transfer or manufacture.") };
      }
      if (!snapshot.transferEntries.length && snapshot.activeWorkOrder && !snapshot.activeWorkOrder.skip_transfer) {
        return { action: "mt", label: __("Create Material Transfer"), help: __("Move raw material to WIP for this item's active Work Order.") };
      }
      if (snapshot.openJobCards.length) {
        return { action: "jc", label: __("Manage Job Cards"), help: __("Start, pause, or complete the Job Cards for this item.") };
      }
      if (!snapshot.manufactureEntries.length && snapshot.activeWorkOrder) {
        return { action: "mfg", label: __("Create Manufacture Entry"), help: __("Post finished goods against the active Work Order.") };
      }
      if (!(snapshot.itemLinks.delivery_notes || []).length) {
        return { action: "dn", label: __("Create Delivery Note"), help: __("Deliver only this Sales Order item after manufacturing is ready.") };
      }
      if (!(snapshot.itemLinks.sales_invoices || []).length) {
        return { action: "si", label: __("Create Sales Invoice"), help: __("Invoice this Sales Order item after delivery or billing readiness.") };
      }
      return { action: "links", label: __("Open Item Links"), help: __("All main documents are already linked for this item.") };
    };

    const renderSectionRows = (doctype, rows, cols, actionBuilder) => {
      if (!rows.length) {
        return `<div style="padding:12px;border:1px dashed #cbd5e1;border-radius:10px;background:#f8fafc;color:#64748b;">${__("No records found for this step.")}</div>`;
      }
      const header = cols.map((col) => `<th style="text-align:left;padding:8px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">${esc(col.label)}</th>`).join("");
      const body = rows.map((row) => `
        <tr>
          ${cols.map((col) => `<td style="padding:8px;border-bottom:1px solid #f1f5f9;vertical-align:top;">${col.render(row)}</td>`).join("")}
          <td style="padding:8px;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${actionBuilder(row)}</td>
        </tr>
      `).join("");
      return `
        <div style="overflow:auto;border:1px solid #e5e7eb;border-radius:12px;background:#fff;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr>${header}<th style="text-align:left;padding:8px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">${__("Actions")}</th></tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      `;
    };

    const renderManager = () => {
      const snapshot = getSnapshot(dialog.get_value("item_code"));
      const recommended = getRecommendedAction(snapshot);
      const stageCards = [
        { label: __("Production Plan"), value: (snapshot.itemLinks.production_plans || []).length, tone: "#dbeafe", text: "#1d4ed8" },
        { label: __("Work Order"), value: (snapshot.itemLinks.work_orders || []).length, tone: "#ede9fe", text: "#6d28d9" },
        { label: __("Job Card"), value: (snapshot.itemLinks.job_cards || []).length, tone: "#fff7ed", text: "#c2410c" },
        { label: __("Transfer"), value: snapshot.transferEntries.length, tone: "#fef3c7", text: "#a16207" },
        { label: __("Manufacture"), value: snapshot.manufactureEntries.length, tone: "#e0f2fe", text: "#0369a1" },
        { label: __("Delivery"), value: (snapshot.itemLinks.delivery_notes || []).length, tone: "#dcfce7", text: "#15803d" },
        { label: __("Invoice"), value: (snapshot.itemLinks.sales_invoices || []).length, tone: "#cffafe", text: "#0f766e" },
      ].map((card) => `
        <div style="padding:12px;border-radius:12px;background:${card.tone};border:1px solid rgba(148,163,184,.18);">
          <div style="font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:.04em;">${esc(card.label)}</div>
          <div style="margin-top:6px;font-size:22px;font-weight:900;color:${card.text};">${esc(card.value)}</div>
        </div>
      `).join("");

      const nextActionHtml = `
        <div style="padding:14px;border:1px solid #bfdbfe;border-radius:14px;background:#eff6ff;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;">
          <div>
            <div style="font-size:11px;font-weight:800;color:#1d4ed8;text-transform:uppercase;letter-spacing:.05em;">${__("Recommended Next Step")}</div>
            <div style="margin-top:4px;font-size:16px;font-weight:900;color:#0f172a;">${esc(recommended.label)}</div>
            <div style="margin-top:4px;font-size:12px;color:#334155;">${esc(recommended.help)}</div>
          </div>
          <button class="btn btn-sm btn-primary" data-manager-next="${esc(recommended.action)}" data-docname="${esc(recommended.docname || "")}">${esc(recommended.label)}</button>
        </div>
      `;

      const ppSection = renderSectionRows(
        "Production Plan",
        snapshot.itemLinks.production_plans || [],
        [
          { label: __("Production Plan"), render: (row) => docLink("Production Plan", row.name) },
          { label: __("Status"), render: (row) => badge(row.status) },
        ],
        (row) => [
          `<button class="btn btn-xs btn-default" data-manager-open="Production Plan" data-name="${esc(row.name || "")}">${__("Open")}</button>`,
          normalizeStatus(row.status) === "draft" ? `<button class="btn btn-xs btn-success" data-manager-submit="Production Plan" data-name="${esc(row.name || "")}">${__("Submit")}</button>` : "",
          `<button class="btn btn-xs btn-dark" data-manager-create-wo="${esc(row.name || "")}">${__("Create WO")}</button>`,
        ].filter(Boolean).join(" ")
      );

      const woSection = renderSectionRows(
        "Work Order",
        snapshot.itemLinks.work_orders || [],
        [
          { label: __("Work Order"), render: (row) => docLink("Work Order", row.name) },
          { label: __("Status"), render: (row) => badge(row.status) },
          { label: __("Production Plan"), render: (row) => row.production_plan ? docLink("Production Plan", row.production_plan) : "—" },
          { label: __("Qty"), render: (row) => soFlt(row.qty || 0) },
          { label: __("Produced"), render: (row) => soFlt(row.produced_qty || 0) },
        ],
        (row) => [
          `<button class="btn btn-xs btn-default" data-manager-open="Work Order" data-name="${esc(row.name || "")}">${__("Open")}</button>`,
          normalizeStatus(row.status) === "draft" ? `<button class="btn btn-xs btn-success" data-manager-submit="Work Order" data-name="${esc(row.name || "")}">${__("Submit")}</button>` : "",
          `<button class="btn btn-xs btn-warning" data-manager-wo-action="mt" data-name="${esc(row.name || "")}">${__("Transfer")}</button>`,
          `<button class="btn btn-xs btn-primary" data-manager-wo-action="mfg" data-name="${esc(row.name || "")}">${__("Manufacture")}</button>`,
          `<button class="btn btn-xs btn-secondary" data-manager-wo-action="jc" data-name="${esc(row.name || "")}">${__("Job Cards")}</button>`,
        ].filter(Boolean).join(" ")
      );

      const jcSection = renderSectionRows(
        "Job Card",
        snapshot.itemLinks.job_cards || [],
        [
          { label: __("Job Card"), render: (row) => docLink("Job Card", row.name) },
          { label: __("Status"), render: (row) => badge(row.status) },
          { label: __("Work Order"), render: (row) => row.work_order ? docLink("Work Order", row.work_order) : "—" },
          { label: __("Operation"), render: (row) => esc(row.operation || "—") },
          { label: __("Workstation"), render: (row) => esc(row.workstation || "—") },
        ],
        (row) => {
          const status = normalizeStatus(row.status);
          return [
            `<button class="btn btn-xs btn-default" data-manager-open="Job Card" data-name="${esc(row.name || "")}">${__("Open")}</button>`,
            status === "open" || status === "not started" ? `<button class="btn btn-xs btn-success" data-manager-jc-action="start" data-name="${esc(row.name || "")}">${__("Start")}</button>` : "",
            status === "work in progress" ? `<button class="btn btn-xs btn-warning" data-manager-jc-action="pause" data-name="${esc(row.name || "")}">${__("Pause")}</button>` : "",
            status === "work in progress" ? `<button class="btn btn-xs btn-primary" data-manager-jc-action="complete" data-name="${esc(row.name || "")}">${__("Complete")}</button>` : "",
          ].filter(Boolean).join(" ");
        }
      );

      const stockSection = renderSectionRows(
        "Stock Entry",
        snapshot.itemLinks.stock_entries || [],
        [
          { label: __("Stock Entry"), render: (row) => docLink("Stock Entry", row.name) },
          { label: __("Purpose"), render: (row) => esc(row.purpose || "—") },
          { label: __("Status"), render: (row) => badge(row.status) },
          { label: __("Date"), render: (row) => esc(row.posting_date || "—") },
        ],
        (row) => `<button class="btn btn-xs btn-default" data-manager-open="Stock Entry" data-name="${esc(row.name || "")}">${__("Open")}</button>`
      );

      const dnSection = renderSectionRows(
        "Delivery Note",
        snapshot.itemLinks.delivery_notes || [],
        [
          { label: __("Delivery Note"), render: (row) => docLink("Delivery Note", row.name) },
          { label: __("Status"), render: (row) => badge(row.status) },
          { label: __("Date"), render: (row) => esc(row.posting_date || "—") },
        ],
        (row) => `<button class="btn btn-xs btn-default" data-manager-open="Delivery Note" data-name="${esc(row.name || "")}">${__("Open")}</button>`
      );

      const siSection = renderSectionRows(
        "Sales Invoice",
        snapshot.itemLinks.sales_invoices || [],
        [
          { label: __("Sales Invoice"), render: (row) => docLink("Sales Invoice", row.name) },
          { label: __("Status"), render: (row) => badge(row.status) },
          { label: __("Date"), render: (row) => esc(row.posting_date || "—") },
          { label: __("Delivery Note"), render: (row) => row.delivery_note ? docLink("Delivery Note", row.delivery_note) : "—" },
        ],
        (row) => `<button class="btn btn-xs btn-default" data-manager-open="Sales Invoice" data-name="${esc(row.name || "")}">${__("Open")}</button>`
      );

      dialog.fields_dict.body_html.$wrapper.html(`
        <div style="display:grid;gap:14px;">
          <div style="padding:14px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;">
            <div><div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;">${__("Item Code")}</div><div style="margin-top:4px;font-size:16px;font-weight:900;color:#0f172a;">${esc(snapshot.itemCode || "—")}</div></div>
            <div><div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;">${__("Item Name")}</div><div style="margin-top:4px;font-size:16px;font-weight:900;color:#0f172a;">${esc(snapshot.itemName || "—")}</div></div>
            <div><div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;">${__("Ordered / Delivered")}</div><div style="margin-top:4px;font-size:16px;font-weight:900;color:#0f172a;">${soFlt(snapshot.summary.ordered_qty || snapshot.salesOrderRow.qty || 0)} / ${soFlt(snapshot.summary.delivered_qty || 0)}</div></div>
            <div><div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;">${__("Pending / Invoiced")}</div><div style="margin-top:4px;font-size:16px;font-weight:900;color:#0f172a;">${soFlt(snapshot.summary.pending_qty || 0)} / ${soFlt(snapshot.summary.invoiced_qty || 0)}</div></div>
          </div>
          ${nextActionHtml}
          <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;">${stageCards}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
            <button class="btn btn-sm btn-info" data-manager-direct="pp">${__("Create Production Plan")}</button>
            <button class="btn btn-sm btn-dark" data-manager-direct="wo">${__("Create Work Order")}</button>
            <button class="btn btn-sm btn-secondary" data-manager-direct="jc">${__("Job Card")}</button>
            <button class="btn btn-sm btn-warning" data-manager-direct="mt">${__("Material Transfer")}</button>
            <button class="btn btn-sm btn-primary" data-manager-direct="mfg">${__("Manufacture")}</button>
            <button class="btn btn-sm btn-success" data-manager-direct="dn">${__("Create Delivery Note")}</button>
            <button class="btn btn-sm btn-success" data-manager-direct="si">${__("Create Sales Invoice")}</button>
            <button class="btn btn-sm btn-default" data-manager-direct="links">${__("Item Links")}</button>
          </div>
          <div>
            <div style="margin:0 0 8px;font-size:13px;font-weight:900;color:#1e293b;">${__("Production Plan")}</div>
            ${ppSection}
          </div>
          <div>
            <div style="margin:0 0 8px;font-size:13px;font-weight:900;color:#1e293b;">${__("Work Order")}</div>
            ${woSection}
          </div>
          <div>
            <div style="margin:0 0 8px;font-size:13px;font-weight:900;color:#1e293b;">${__("Job Card")}</div>
            ${jcSection}
          </div>
          <div>
            <div style="margin:0 0 8px;font-size:13px;font-weight:900;color:#1e293b;">${__("Stock Entry")}</div>
            ${stockSection}
          </div>
          <div>
            <div style="margin:0 0 8px;font-size:13px;font-weight:900;color:#1e293b;">${__("Delivery Note")}</div>
            ${dnSection}
          </div>
          <div>
            <div style="margin:0 0 8px;font-size:13px;font-weight:900;color:#1e293b;">${__("Sales Invoice")}</div>
            ${siSection}
          </div>
        </div>
      `);

      const body = dialog.fields_dict.body_html.$wrapper;
      const reopen = () => {
        dialog.hide();
        frm.trigger("render_execution_dashboard");
        openExistingDocsDialog(snapshot.seed);
      };

      body.find("[data-manager-open]").off("click").on("click", function() {
        openDoc($(this).attr("data-manager-open"), $(this).attr("data-name"));
      });

      body.find("[data-manager-submit]").off("click").on("click", async function() {
        const doctype = $(this).attr("data-manager-submit");
        const name = $(this).attr("data-name");
        await submitExistingDoc(doctype, name);
        frappe.show_alert({ message: __("{0} {1} submitted.", [doctype, name]), indicator: "green" }, 5);
        reopen();
      });

      body.find("[data-manager-create-wo]").off("click").on("click", function() {
        dialog.hide();
        openWorkOrderCreator({ ...snapshot.seed, production_plan: $(this).attr("data-manager-create-wo") || snapshot.seed.production_plan || "" });
      });

      body.find("[data-manager-wo-action]").off("click").on("click", function() {
        const action = $(this).attr("data-manager-wo-action");
        const workOrder = $(this).attr("data-name") || "";
        const nextSeed = { ...snapshot.seed, work_order: workOrder || snapshot.seed.work_order || "" };
        dialog.hide();
        if (action === "mt") openStockEntryCreator(nextSeed, "Material Transfer for Manufacture");
        else if (action === "mfg") openStockEntryCreator(nextSeed, "Manufacture");
        else if (action === "jc") openExistingDocsDialog(nextSeed);
      });

      body.find("[data-manager-jc-action]").off("click").on("click", function() {
        const action = $(this).attr("data-manager-jc-action");
        const name = $(this).attr("data-name") || "";
        dialog.hide();
        openJobCardControlDialog(action, name, snapshot.itemCode || "", () => {
          openExistingDocsDialog(snapshot.seed);
        });
      });

      body.find("[data-manager-direct], [data-manager-next]").off("click").on("click", function() {
        const action = $(this).attr("data-manager-direct") || $(this).attr("data-manager-next");
        const docname = $(this).attr("data-docname") || "";
        dialog.hide();
        if (action === "submit_pp" && docname) {
          submitExistingDoc("Production Plan", docname).then(() => {
            frappe.show_alert({ message: __("Production Plan {0} submitted.", [docname]), indicator: "green" }, 5);
            frm.trigger("render_execution_dashboard");
            openExistingDocsDialog(snapshot.seed);
          }).catch((error) => frappe.msgprint(__("Failed: {0}", [error.message || error])));
          return;
        }
        if (action === "submit_wo" && docname) {
          submitExistingDoc("Work Order", docname).then(() => {
            frappe.show_alert({ message: __("Work Order {0} submitted.", [docname]), indicator: "green" }, 5);
            frm.trigger("render_execution_dashboard");
            openExistingDocsDialog(snapshot.seed);
          }).catch((error) => frappe.msgprint(__("Failed: {0}", [error.message || error])));
          return;
        }
        if (action === "si") {
          openSalesInvoiceCreator(snapshot.seed);
          return;
        }
        runDirectAction(action, snapshot.itemCode);
      });
    };

    dialog.show();
    if (dialog.fields_dict.item_code && dialog.fields_dict.item_code.$input) {
      dialog.fields_dict.item_code.$input.off("change").on("change", renderManager);
    }
    renderManager();
  };

  const openJobCardCenter = (selectedItem) => {
    const itemCode = String(selectedItem || primaryItem || "").trim();
    const seed = buildSeedForItem(itemCode);
    const itemLinks = getItemLinks(itemCode) || {};
    const jobCards = (itemLinks.job_cards || []).filter((row) => !_isCancelledLikeStatus(row.status));

    if (!jobCards.length) {
      frappe.show_alert({ message: __("No Job Cards found for this item. Opening Manage Existing Docs."), indicator: "orange" }, 5);
      openExistingDocsDialog(seed);
      return;
    }

    const dialog = new frappe.ui.Dialog({
      title: __("Job Card Control"),
      size: "extra-large",
      fields: [{ fieldtype: "HTML", fieldname: "body_html" }],
    });

    const render = () => {
      const rows = jobCards.map((row) => {
        const status = normalizeStatus(row.status);
        const canStart = status === "open" || status === "not started";
        const canPause = status === "work in progress";
        const canComplete = status === "work in progress";
        return `
          <tr>
            <td>${docLink("Job Card", row.name || "")}</td>
            <td>${badge(row.status || "—")}</td>
            <td>${row.work_order ? docLink("Work Order", row.work_order) : "—"}</td>
            <td>${esc(row.operation || "—")}</td>
            <td>${esc(row.workstation || "—")}</td>
            <td style="text-align:right;">${_n0(row.for_quantity || 0)}</td>
            <td style="text-align:right;">${_n0(row.total_completed_qty || 0)}</td>
            <td style="white-space:nowrap;">
              <button class="btn btn-xs btn-default" data-jcc-action="open" data-job-card="${esc(row.name || "")}">${__("Open")}</button>
              <button class="btn btn-xs btn-secondary" data-jcc-action="manage" data-job-card="${esc(row.name || "")}">${__("Manage")}</button>
              ${canStart ? `<button class="btn btn-xs btn-success" data-jcc-action="start" data-job-card="${esc(row.name || "")}">${__("Start")}</button>` : ""}
              ${canPause ? `<button class="btn btn-xs btn-warning" data-jcc-action="pause" data-job-card="${esc(row.name || "")}">${__("Pause")}</button>` : ""}
              ${canComplete ? `<button class="btn btn-xs btn-primary" data-jcc-action="complete" data-job-card="${esc(row.name || "")}">${__("Complete")}</button>` : ""}
            </td>
          </tr>
        `;
      }).join("");

      dialog.fields_dict.body_html.$wrapper.html(`
        <div style="padding:10px;border:1px solid #dbeafe;border-radius:10px;background:#eff6ff;color:#1e3a8a;font-size:12px;margin-bottom:10px;">
          <b>${__("Sales Order")}:</b> ${esc(frm.doc.name || "")} &nbsp; | &nbsp;
          <b>${__("Item")}:</b> ${esc(itemCode || __("Multiple"))}
        </div>
        ${dailyOperationItemSummaryHtml(dailyOperationSummary, itemCode, { show_item_totals_table: false })}
        <div class="table-responsive">
          <table class="table table-bordered so-table" style="margin:0;">
            <thead>
              <tr>
                <th>${__("Job Card")}</th>
                <th>${__("Status")}</th>
                <th>${__("Work Order")}</th>
                <th>${__("Operation")}</th>
                <th>${__("Workstation")}</th>
                <th style="text-align:right;">${__("Qty")}</th>
                <th style="text-align:right;">${__("Completed")}</th>
                <th>${__("Actions")}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `);

      const $body = dialog.fields_dict.body_html.$wrapper;
      $body.find("[data-jcc-action]").off("click").on("click", function(e) {
        e.preventDefault();
        const action = ($(this).attr("data-jcc-action") || "").trim();
        const jobCard = ($(this).attr("data-job-card") || "").trim();
        if (!jobCard) return;

        if (action === "open") {
          window.open(`/app/job-card/${encodeURIComponent(jobCard)}`, "_blank");
          return;
        }

        if (action === "manage") {
          dialog.hide();
          openExistingDocsDialog({ ...seed, job_card: jobCard });
          return;
        }

        if (action === "start" || action === "pause" || action === "complete") {
          dialog.hide();
          openJobCardControlDialog(action, jobCard, itemCode, () => {
            openJobCardCenter(itemCode);
          });
        }
      });
    };

    dialog.show();
    render();
  };

  const openCurrentDocuments = (seed) => {
    let opened = 0;
    if (seed.sales_order) {
      window.open(`/app/sales-order/${encodeURIComponent(seed.sales_order)}`, "_blank");
      opened += 1;
    }
    if (seed.production_plan) {
      window.open(`/app/production-plan/${encodeURIComponent(seed.production_plan)}`, "_blank");
      opened += 1;
    }
    if (seed.work_order) {
      window.open(`/app/work-order/${encodeURIComponent(seed.work_order)}`, "_blank");
      opened += 1;
    }
    if (seed.job_card) {
      window.open(`/app/job-card/${encodeURIComponent(seed.job_card)}`, "_blank");
      opened += 1;
    }
    if (!opened) {
      frappe.show_alert({ message: __("No current documents available to open."), indicator: "orange" }, 4);
    }
  };

  const openSalesOrderStatusBoard = (seed) => {
    frappe.route_options = {
      sales_order: seed.sales_order || frm.doc.name || "",
      company: seed.company || frm.doc.company || "",
      customer: seed.customer || frm.doc.customer || "",
    };
    frappe.set_route("sales-order-status-board");
  };

  const openActionCenterForItem = (item, defaultAction) => {
    const d = new frappe.ui.Dialog({
      title: __("Manufacturing Control Center"),
      size: "large",
      fields: [{ fieldtype: "HTML", fieldname: "body" }],
    });
    const safeItem = item || primaryItem || "";
    d.fields_dict.body.$wrapper.html(`
      <div style="margin-bottom:10px;padding:8px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
        <b>${__("Sales Order")}:</b> ${esc(frm.doc.name)} &nbsp; | &nbsp; <b>${__("Item")}:</b> ${esc(safeItem || __("Multiple"))}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;">
        <button class="btn btn-sm btn-success" data-ac="so">${__("Create Sales Order")}</button>
        <button class="btn btn-sm btn-info" data-ac="pp">${__("Create Production Plan")}</button>
        <button class="btn btn-sm btn-dark" data-ac="wo">${__("Create Work Order")}</button>
        <button class="btn btn-sm btn-secondary" data-ac="jc">${__("Job Card")}</button>
        <button class="btn btn-sm btn-secondary" data-ac="manage">${__("Manage Existing Docs")}</button>
        <button class="btn btn-sm btn-warning" data-ac="mt">${__("Material Transfer")}</button>
        <button class="btn btn-sm btn-primary" data-ac="mfg">${__("Manufacture Entry")}</button>
        <button class="btn btn-sm btn-success" data-ac="dn">${__("Create Delivery Note")}</button>
        <button class="btn btn-sm btn-success" data-ac="si">${__("Create Sales Invoice")}</button>
        <button class="btn btn-sm btn-secondary" data-ac="ret">${__("Return / Disassemble")}</button>
      </div>
    `);
    const $w = d.fields_dict.body.$wrapper;
    const runAction = (a) => {
      const selectedItem = safeItem;
      const seed = {
        company: frm.doc.company || "",
        sales_order: frm.doc.name || "",
        customer: frm.doc.customer || "",
        item_code: selectedItem || "",
        work_order: "",
      };
      if (a === "so") openSalesOrderCreator(seed);
      else if (a === "pp") openProductionPlanCreator(seed);
      else if (a === "wo") openWorkOrderCreator(seed);
      else if (a === "jc") openJobCardCenter(selectedItem);
      else if (a === "manage") openExistingDocsDialog(seed);
      else if (a === "mt") openStockEntryCreator(seed, "Material Transfer for Manufacture");
      else if (a === "mfg") openStockEntryCreator(seed, "Manufacture");
      else if (a === "dn") openDeliveryNoteCreator(seed);
      else if (a === "si") openSalesInvoiceCreator(seed);
      else if (a === "ret") openStockEntryCreator(seed, "Disassemble");
      d.hide();
    };

    $w.find("[data-ac]").on("click", function(e){
      e.preventDefault();
      runAction($(this).attr("data-ac"));
    });
    d.show();

    if (defaultAction) {
      const $btn = $w.find(`[data-ac='${defaultAction}']`);
      if ($btn && $btn.length) {
        $btn.addClass("btn-primary");
      }
    }
  };

  const runDirectAction = (action, selectedItem) => {
    const seed = buildSeedForItem(selectedItem);
    const itemLinks = getItemLinks(seed.item_code) || {};
    if (action === "ac" || action === "action_center") return openActionCenterForItem(selectedItem || primaryItem, "pp");
    if (action === "show_all_links") return openAllRelatedLinksDialog(frm);
    if (action === "links") return openPlanningItemLinksDialog(frm, data, selectedItem);
    if (action === "create_sales_order" || action === "so") return openSalesOrderCreator(seed);
    if (action === "create_production_plan" || action === "pp") return openProductionPlanCreator(seed);
    if (action === "create_work_order" || action === "wo") {
      if (getActiveRows(itemLinks.work_orders || []).length) {
        frappe.show_alert({ message: __("This item already has an active Work Order. Opening Manage Existing Docs instead."), indicator: "orange" }, 5);
        return openExistingDocsDialog(seed);
      }
      return openWorkOrderCreator(seed);
    }
    if (action === "job_card" || action === "jc") return openJobCardCenter(seed.item_code || selectedItem || primaryItem);
    if (action === "manage_docs" || action === "manage" || action === "view") return openExistingDocsDialog(seed);
    if (action === "create_material_transfer" || action === "mt") {
      const activeWorkOrder = getActiveRows(itemLinks.work_orders || [])[0];
      if (!activeWorkOrder) {
        frappe.show_alert({ message: __("Create or submit a Work Order for this item first."), indicator: "orange" }, 5);
        return openExistingDocsDialog(seed);
      }
      seed.work_order = activeWorkOrder.name || seed.work_order;
      return openStockEntryCreator(seed, "Material Transfer for Manufacture");
    }
    if (action === "create_manufacture_entry" || action === "mfg") {
      const activeWorkOrder = getActiveRows(itemLinks.work_orders || [])[0];
      if (!activeWorkOrder) {
        frappe.show_alert({ message: __("Create or submit a Work Order for this item first."), indicator: "orange" }, 5);
        return openExistingDocsDialog(seed);
      }
      seed.work_order = activeWorkOrder.name || seed.work_order;
      return openStockEntryCreator(seed, "Manufacture");
    }
    if (action === "create_delivery_note" || action === "dn") return openDeliveryNoteCreator(seed);
    if (action === "create_sales_invoice" || action === "si") return openSalesInvoiceCreator(seed);
    if (action === "return_disassemble" || action === "ret") return openStockEntryCreator(seed, "Disassemble");
    if (action === "open_current_docs") return openCurrentDocuments(seed);
    if (action === "so_status_board") return openSalesOrderStatusBoard(seed);
  };

  $wrap.find("[data-so-action]").off("click").on("click", function(e){
    e.preventDefault();
    e.stopPropagation();
    const action = $(this).attr("data-so-action");
    runDirectAction(action, primaryItem);
  });

  $wrap.find("[data-plan-action]").off("click").on("click", function(e){
    e.preventDefault();
    e.stopPropagation();
    const action = $(this).attr("data-plan-action");
    const item = ($(this).attr("data-item") || "").trim();
    runDirectAction(action, item);
  });

  $wrap.find("[data-plan-wo-detail='1']").off("click").on("click", function(e){
    e.preventDefault();
    e.stopPropagation();
    const item = ($(this).attr("data-item") || "").trim();
    openWoCompletedDetails(item);
  });

  $wrap.find("[data-plan-jc-detail='1']").off("click").on("click", function(e){
    e.preventDefault();
    e.stopPropagation();
    const item = ($(this).attr("data-item") || "").trim();
    openJcCompletedDetails(item);
  });

  $wrap.find("[data-jc-action]").off("click").on("click", function(e) {
    e.preventDefault();
    e.stopPropagation();
    const action = $(this).attr("data-jc-action");
    const jobCard = ($(this).attr("data-job-card") || "").trim();
    const item = ($(this).attr("data-item") || "").trim();
    if (!jobCard) return;
    if (action === "manage") {
      openExistingDocsDialog({ ...buildSeedForItem(item), job_card: jobCard });
      return;
    }
    if (action === "start" || action === "pause" || action === "complete") {
      openJobCardControlDialog(action === "pause" ? "pause" : action, jobCard, item || "");
    }
  });
}

function bindMaterialShortageCreatePo($wrap, frm, data){
  const soPoRows = (frm.doc.custom_po_item || []);
  const hasValue = (value) => !(value === undefined || value === null || value === "");
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

  const askQtyMode = () => new Promise((resolve) => {
    let resolved = false;
    const done = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };
    const d = new frappe.ui.Dialog({
      title: __("Create PO Quantity Source"),
      fields: [{ fieldtype: "HTML", fieldname: "body" }],
      primary_action_label: __("Cancel"),
      primary_action: () => {
        done(null);
        d.hide();
      },
    });
    d.fields_dict.body.$wrapper.html(`
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button type="button" class="btn btn-primary" data-ms-choose-mode="required_plus_wastage">${__("Required + Wastage on BOM")}</button>
        <button type="button" class="btn btn-warning" data-ms-choose-mode="shortage_plus_wastage">${__("Shortage + Wastage on BOM")}</button>
      </div>
    `);
    d.$wrapper.off("click.otr_ms_mode").on("click.otr_ms_mode", "[data-ms-choose-mode]", function(e){
      e.preventDefault();
      const mode = ($(this).attr("data-ms-choose-mode") || "").trim();
      done(mode || null);
      d.hide();
    });
    d.onhide = () => done(null);
    d.show();
  });

  const pickBaseQty = (requiredQty, shortageQty, wastageQty, mode) => {
    const req = Math.max(Number(requiredQty || 0), 0);
    const sht = Math.max(Number(shortageQty || 0), 0);
    const wq = Math.max(Number(wastageQty || 0), 0);
    if (mode === "shortage_plus_wastage") {
      if (sht > 0) return { base_qty: sht, po_qty: sht + wq };
      return { base_qty: 0, po_qty: 0 };
    }
    return { base_qty: req, po_qty: req + wq };
  };

  $wrap.find("[data-ms-create-po='1']").off("click").on("click", async function(e){
    e.preventDefault();
    e.stopPropagation();
    const item = ($(this).attr("data-item") || "").trim();
    const totalQtyFromShortage = soFlt($(this).attr("data-qty") || 0);
    const requiredQtyAttr = soFlt($(this).attr("data-required") || 0);
    const shortageQtyAttr = soFlt($(this).attr("data-shortage") || 0);
    const description = ($(this).attr("data-description") || "").trim();
    const wp = $(this).attr("data-wp");
    const wq = $(this).attr("data-wq");
    const mode = await askQtyMode();
    if (!mode) return;
    if (!item || soFlt(totalQtyFromShortage) <= 0) {
      frappe.msgprint(__("Invalid row for Create PO."));
      return;
    }
    const d = itemDefaults[item] || {};
    const ml = (data.material_shortage || []).find((r) => String(r.item_code || "").trim() === item) || {};
    const supplier = d.supplier || ml.last_supplier || ml.supplier || "";
    const warehouse = d.warehouse || frm.doc.set_warehouse || "";
    const rate = Number(d.rate || ml.last_purchase_rate || 0);
    const requiredQty = Number(requiredQtyAttr || ml.required_qty || 0);
    const shortageQty = Math.max(Number(shortageQtyAttr || ml.shortage_qty || 0), 0);
    const wpFinal = hasValue(wp) ? Number(wp) : (hasValue(d.custom_wastage_percentage) ? Number(d.custom_wastage_percentage) : Number(ml.wastage_pct || 0));
    const wqFinal = hasValue(wq) ? Number(wq) : (hasValue(d.custom_wastage_qty) ? Number(d.custom_wastage_qty) : Number(ml.wastage_qty || 0));
    const qtyChoice = pickBaseQty(requiredQty > 0 ? requiredQty : Math.max(Number(totalQtyFromShortage || 0) - Number(wqFinal || 0), 0), shortageQty, wqFinal, mode);
    const baseQty = Number(qtyChoice.base_qty || 0);
    const extraFinal = Number(d.extra_qty || 0);
    const poQty = Number(qtyChoice.po_qty || 0) + extraFinal;

    open_po_item_data_entry(frm, {
      item_group: ml.item_group || "",
      allowed_item_groups: (ml.item_group ? [ml.item_group] : []),
      supplier,
      warehouse,
      qty: baseQty,
      custom_wastage_percentage: wpFinal,
      custom_wastage_qty: wqFinal,
      extra_qty: extraFinal,
      select_for_po: 1,
      rows: [{
        item_code: item,
        qty: baseQty,
        base_qty: baseQty,
        descriptions: description || item,
        supplier,
        warehouse,
        rate,
        custom_wastage_percentage: wpFinal,
        custom_wastage_qty: wqFinal,
        extra_qty: extraFinal,
        po_qty: poQty,
        select_for_po: 1,
      }],
    });
  });

  $wrap.find("[data-ms-create-po-group='1']").off("click").on("click", async function(e){
    e.preventDefault();
    e.stopPropagation();
    const group = ($(this).attr("data-group") || "").trim();
    const mode = await askQtyMode();
    if (!mode) return;
    const defaultWarehouse = getDefaultWarehouse("source", frm.doc.company || "");
    if (!group) return;
    const rows = (data.material_shortage || []).filter((r) => (r.item_group || "") === group && (r.item_code || "").trim());
    if (!rows.length) {
      frappe.msgprint(__("No shortage rows found for this Item Group."));
      return;
    }
    const prefillRows = rows.map((r) => ({
      ...(itemDefaults[r.item_code || ""] || {}),
      item_code: r.item_code || "",
      qty: (function(){
        const req = Number(r.required_qty || 0);
        const sht = Math.max(Number(r.shortage_qty || 0), 0);
        const wq = Math.max(Number(r.wastage_qty || 0), 0);
        let q = mode === "shortage_plus_wastage" ? sht : req;
        if (q <= 0 && mode !== "shortage_plus_wastage") q = sht;
        if (q <= 0) q = Number(r.pending_po_qty || 0);
        if (q <= 0) q = Number(r.po_qty || 0);
        if (q <= 0) q = 1;
        return q;
      })(),
      base_qty: (function(){
        const req = Number(r.required_qty || 0);
        const sht = Math.max(Number(r.shortage_qty || 0), 0);
        if (mode === "shortage_plus_wastage") return sht;
        return req;
      })(),
      custom_wastage_percentage: Number(r.wastage_pct || 0),
      custom_wastage_qty: Number(r.wastage_qty || 0),
      po_qty: (function(){
        let q = mode === "shortage_plus_wastage"
          ? (Math.max(Number(r.shortage_qty || 0), 0) + Number(r.wastage_qty || 0))
          : (Number(r.required_qty || 0) + Number(r.wastage_qty || 0));
        if (q <= 0 && mode !== "shortage_plus_wastage") q = Number(r.shortage_qty || 0) + Number(r.wastage_qty || 0);
        if (q <= 0) q = Number(r.pending_po_qty || 0);
        if (q <= 0) q = Number(r.po_qty || 0);
        if (q <= 0) q = 1;
        return q;
      })(),
      rate: Number(r.last_purchase_rate || 0),
      supplier: (itemDefaults[r.item_code || ""] || {}).supplier || r.last_supplier || "",
      warehouse: defaultWarehouse,
      descriptions: r.item_code || "",
      select_for_po: 1,
    })).filter((r) => r.item_code);

    if (!prefillRows.length) {
      frappe.msgprint(__("No valid rows found for Create PO."));
      return;
    }
    open_po_item_data_entry(frm, {
      item_group: group,
      allowed_item_groups: [group],
      rows: prefillRows,
      warehouse: defaultWarehouse,
      select_for_po: 1,
    });
  });

  $wrap.find("[data-ms-item-detail='1']").off("click").on("click", function(e){
    e.preventDefault();
    e.stopPropagation();
    const item = ($(this).attr("data-item") || "").trim();
    if (!item) return;

    frappe.call({
      method: "order_tracking_report.api.custom_so_execution_status",
      args: {
        sales_order: frm.doc.name,
        action: "item_po_detail",
        item_code: item,
      },
      freeze: true,
      freeze_message: __("Loading item purchase orders..."),
      callback: (r) => {
        const rows = (r && r.message) ? r.message : [];
        const d = new frappe.ui.Dialog({
          title: __("Purchase Orders for {0}", [item]),
          size: "large",
          fields: [{ fieldtype: "HTML", fieldname: "body" }],
        });

        const body = rows.length ? rows.map((x) => `
          <tr>
            <td>${x.purchase_order ? docLink("Purchase Order", x.purchase_order) : "-"}</td>
            <td>${esc(x.supplier || "")}</td>
            <td style="text-align:right;">${_n0(x.qty || 0)}</td>
            <td style="text-align:right;">${_n0(x.received_qty || 0)}</td>
            <td style="text-align:right;">${_n0(x.pending_qty || 0)}</td>
          </tr>
        `).join("") : `<tr><td colspan="5" class="text-muted">No purchase orders found for this item.</td></tr>`;

        d.fields_dict.body.$wrapper.html(`<div class="table-responsive"><table class="table table-bordered so-table" style="margin:0;"><thead><tr><th>PO Number</th><th>Supplier</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Received Qty</th><th style="text-align:right;">Pending Qty</th></tr></thead><tbody>${body}</tbody></table></div>`);
        d.show();
      },
    });
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

    ${manufacturingControlCenter(frm, data)}
    ${card("Sales Order Items Planning", "Planning overview by Sales Order item", salesOrderItemsPlanningTable(frm, data))}

    ${sectionBlock('profit', 'Profit and Loss Section', 'linear-gradient(90deg,#0f766e,#14b8a6)', `
      ${card("Profit Dashboard", "Estimated cost from default BOM and sales amount", `${profitSummaryCard(data.profit_summary || {})}<div style="margin-top:12px;font-weight:900;">Profit by Item</div>${profitByItemTable(data.profit_by_item || [])}`)}
      ${card("Purchase Order Total Amount", "Total amount of Purchase Orders linked with this Sales Order", `<div class="so-mini-card"><div class="so-mini-title">TOTAL PO AMOUNT</div><div class="so-mini-val" style="font-size:26px;">${_money0(poTotal)}</div></div>`)}
      ${card("PO Amount by Item Group", "Purchase Order amount summary linked with this Sales Order", profitGroupPurchaseTable(data.po_item_group_summary || []))}
      ${card("Employee Item-wise Labour Cost", "From per-piece-report > Employee item-wise", labourCostTable(data.labour_cost_employee_item_wise || [], data.labour_cost_summary || {}))}
    `, false)}

    ${sectionBlock('purchase', 'Purchase Order Section', 'linear-gradient(90deg,#7c3aed,#9333ea)', `
      ${card("Material Shortage & Purchase Suggestion", "Grouped by Item Group with PO and PR planning progress", materialShortageTable(data.material_shortage || []))}
      ${card("PO Analytics (From PO Tab)", "Item Group-Wise PO Status", `${poAnalyticsOverviewCard((data.custom_po_analytics || {}).overview || {})}${poItemGroupTable((data.custom_po_analytics || {}).item_group_rows || [])}`)}
      ${card("PO-Wise status Report", "Collapsed by Supplier", poStatusDetailTable((data.custom_po_analytics || {}).po_status_rows || []))}
      ${card("Purchase Flow Tracker", "PO + Purchase Receipt + Purchase Invoice in one row with PO cost", purchaseFlowTable(data.purchase_flow_rows || []))}
    `, false)}

    ${sectionBlock('daily-operation-wise-production', 'Daily Operation wise Production', 'linear-gradient(90deg,#166534,#16a34a)', `
      ${card("Daily Operation wise Production", "Same grouped daily production matrix by Sales Order and item.", dailyOperationWiseProductionTable(data.daily_operation_report || {}))}
    `, false)}

    ${sectionBlock('production', 'Production Section', 'linear-gradient(90deg,#7a3e00,#a16207)', `
      ${card("Finished Goods Production Summary", "SO/PP/WO/JO progress with completion and wastage", fgSummaryTable(data.production_fg_summary || []))}
      ${card("Daily Job Card Report", "Operation-wise daily Job Card matrix", dailyJobCardReportTable(data.daily_production || []))}
      ${card("Daily Production Report", "From Job Card time_logs table (daily rows)", dailyProductionTable(data.daily_production || [], data.daily_production_indicators || {}))}
      ${card("Production Details", "Job Card / Operation / Material details", productionTree(data.production_tree||[]))}
      ${card("Production Timeline", "Work Orders, Delivery Notes and Invoices timeline", timelineView(data.gantt_timeline || []))}
      ${card("Machine Utilization", "Workstation time from Job Card Time Logs", machineUtilization(data.machine_utilization || []))}
      ${card("Employee Efficiency", "Completed quantity vs time spent", employeeEfficiency(data.employee_efficiency || []))}
    `, false)}

    ${sectionBlock('bom', 'BOM and Raw Material Section', 'linear-gradient(90deg,#0891b2,#06b6d4)', `${card("BOM & Raw Materials", "Item and BOM merged for easier reading", bomTree(data.bom_tree||[]))}`, false)}

    ${sectionBlock('expenses', 'Expenses', 'linear-gradient(90deg,#6d28d9,#9333ea)', `
      ${card("Expenses", "Expense Claim details linked with this Sales Order", salesOrderExpensesTable(data.sales_order_expenses || []))}
    `, false)}

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
