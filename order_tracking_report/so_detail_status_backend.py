import frappe


def run(sales_order=None, action=None, doctype=None, docname=None, stock_location=None, item_code=None):
    doc_doctype = doctype
    doc_name = docname
    
    
    def safe_sql(q, p=None):
        try:
            return frappe.db.sql(q, p or {}, as_dict=True)
        except Exception:
            return []
    
    
    def uniq_list(values):
        out = []
        seen = {}
        for v in values:
            if v and v not in seen:
                seen[v] = 1
                out.append(v)
        return out
    
    
    def to_float(v):
        try:
            return float(v or 0)
        except Exception:
            return 0.0
    
    
    def fmt_date(v):
        try:
            return str(v) if v else ""
        except Exception:
            return ""
    
    
    def get_today():
        try:
            return frappe.utils.nowdate()
        except Exception:
            return ""
    
    
    # ---------------------------------------------------------
    # SALES ORDER ITEM BASE
    # ---------------------------------------------------------
    def get_sales_order_items(so):
        return safe_sql(
            "SELECT item_code, item_name, qty, rate, amount "
            "FROM `tabSales Order Item` "
            "WHERE parent = %(so)s "
            "ORDER BY idx",
            {"so": so}
        )
    
    
    def get_sales_order_total_qty(so):
        rows = get_sales_order_items(so)
        total = 0
        for r in rows:
            total = total + to_float(r.get("qty"))
        return total
    
    
    # ---------------------------------------------------------
    # DEFAULT BOM / BOM COST
    # ---------------------------------------------------------
    def get_default_bom_for_item(item_code):
        rs = safe_sql(
            "SELECT name "
            "FROM `tabBOM` "
            "WHERE item = %(item)s AND is_default = 1 AND is_active = 1 AND docstatus = 1 "
            "ORDER BY modified DESC LIMIT 1",
            {"item": item_code}
        )
        if rs:
            return rs[0].get("name")
    
        rs = safe_sql(
            "SELECT name "
            "FROM `tabBOM` "
            "WHERE item = %(item)s AND is_active = 1 AND docstatus = 1 "
            "ORDER BY is_default DESC, modified DESC LIMIT 1",
            {"item": item_code}
        )
        if rs:
            return rs[0].get("name")
    
        return ""
    
    
    def get_bom_cost(bom_name):
        if not bom_name:
            return 0
    
        rs = safe_sql(
            "SELECT total_cost "
            "FROM `tabBOM` "
            "WHERE name = %(bom)s",
            {"bom": bom_name}
        )
        if rs:
            return to_float(rs[0].get("total_cost"))
        return 0
    
    
    # ---------------------------------------------------------
    # GENERIC DOC ITEM POPUP
    # ---------------------------------------------------------
    def get_document_items(doctype, name):
        if not doctype or not name:
            return {"meta": {}, "items": []}
    
        if doctype == "Delivery Note":
            meta_rows = safe_sql(
                "SELECT name, posting_date, transporter, vehicle_no, lr_no, lr_date, "
                "grand_total, rounded_total, status "
                "FROM `tabDelivery Note` "
                "WHERE name = %(name)s",
                {"name": name}
            )
            items = safe_sql(
                "SELECT item_code, qty, rate, amount "
                "FROM `tabDelivery Note Item` "
                "WHERE parent = %(name)s "
                "ORDER BY idx",
                {"name": name}
            )
            return {"meta": meta_rows[0] if meta_rows else {}, "items": items}
    
        if doctype == "Sales Invoice":
            meta_rows = safe_sql(
                "SELECT name, posting_date, due_date, grand_total, rounded_total, status, customer "
                "FROM `tabSales Invoice` "
                "WHERE name = %(name)s",
                {"name": name}
            )
            items = safe_sql(
                "SELECT item_code, qty, rate, amount "
                "FROM `tabSales Invoice Item` "
                "WHERE parent = %(name)s "
                "ORDER BY idx",
                {"name": name}
            )
            return {"meta": meta_rows[0] if meta_rows else {}, "items": items}
    
        if doctype == "Purchase Order":
            meta_rows = safe_sql(
                "SELECT name, transaction_date, supplier, grand_total, rounded_total, status "
                "FROM `tabPurchase Order` "
                "WHERE name = %(name)s",
                {"name": name}
            )
            items = safe_sql(
                "SELECT item_code, qty, rate, amount "
                "FROM `tabPurchase Order Item` "
                "WHERE parent = %(name)s "
                "ORDER BY idx",
                {"name": name}
            )
            return {"meta": meta_rows[0] if meta_rows else {}, "items": items}
    
        if doctype == "Purchase Receipt":
            meta_rows = safe_sql(
                "SELECT name, posting_date, supplier, grand_total, rounded_total, status "
                "FROM `tabPurchase Receipt` "
                "WHERE name = %(name)s",
                {"name": name}
            )
            items = safe_sql(
                "SELECT item_code, qty, rate, amount "
                "FROM `tabPurchase Receipt Item` "
                "WHERE parent = %(name)s "
                "ORDER BY idx",
                {"name": name}
            )
            return {"meta": meta_rows[0] if meta_rows else {}, "items": items}
    
        if doctype == "Purchase Invoice":
            meta_rows = safe_sql(
                "SELECT name, posting_date, due_date, supplier, grand_total, rounded_total, status "
                "FROM `tabPurchase Invoice` "
                "WHERE name = %(name)s",
                {"name": name}
            )
            items = safe_sql(
                "SELECT item_code, qty, rate, amount "
                "FROM `tabPurchase Invoice Item` "
                "WHERE parent = %(name)s "
                "ORDER BY idx",
                {"name": name}
            )
            return {"meta": meta_rows[0] if meta_rows else {}, "items": items}
    
        return {"meta": {}, "items": []}
    
    
    # ---------------------------------------------------------
    # PRODUCTION
    # ---------------------------------------------------------
    def get_production_plans(so):
        return safe_sql(
            "SELECT DISTINCT pp.name, pp.status "
            "FROM `tabProduction Plan` pp "
            "JOIN `tabProduction Plan Sales Order` pps ON pps.parent = pp.name "
            "WHERE pps.sales_order = %(so)s "
            "ORDER BY pp.modified DESC LIMIT 50",
            {"so": so}
        )
    
    
    def get_work_orders_for_so(so):
        wo = safe_sql(
            "SELECT name, status, production_item, qty, produced_qty, process_loss_qty, disassembled_qty, "
            "material_transferred_for_manufacturing, additional_transferred_qty, production_plan, "
            "planned_start_date, planned_end_date, actual_start_date, actual_end_date "
            "FROM `tabWork Order` "
            "WHERE sales_order = %(so)s AND docstatus != 2 AND LOWER(IFNULL(status, '')) != 'cancelled' "
            "ORDER BY modified DESC LIMIT 500",
            {"so": so}
        )
        if wo:
            return wo
    
        return safe_sql(
            "SELECT DISTINCT wo.name, wo.status, wo.production_item, wo.qty, wo.produced_qty, wo.process_loss_qty, wo.disassembled_qty, "
            "wo.material_transferred_for_manufacturing, wo.additional_transferred_qty, wo.production_plan, "
            "wo.planned_start_date, wo.planned_end_date, wo.actual_start_date, wo.actual_end_date "
            "FROM `tabWork Order` wo "
            "LEFT JOIN `tabWork Order Item` woi ON woi.parent = wo.name "
            "WHERE (wo.sales_order = %(so)s OR woi.sales_order = %(so)s) "
            "AND wo.docstatus != 2 AND LOWER(IFNULL(wo.status, '')) != 'cancelled' "
            "ORDER BY wo.modified DESC LIMIT 500",
            {"so": so}
        )
    
    
    def get_jobcards_for_wos(wo_names):
        if not wo_names:
            return []
        return safe_sql(
            "SELECT name, status, work_order, operation, workstation, for_quantity, total_completed_qty, process_loss_qty "
            "FROM `tabJob Card` "
            "WHERE work_order IN %(wo)s AND docstatus != 2 AND LOWER(IFNULL(status, '')) != 'cancelled' "
            "ORDER BY modified DESC LIMIT 4000",
            {"wo": tuple(wo_names)}
        )


    def get_daily_production_from_job_cards(wo_names):
        if not wo_names:
            return []

        rows = safe_sql(
            "SELECT "
            "jc.name AS job_card, "
            "jc.operation AS operation, "
            "IFNULL(jc.total_completed_qty, 0) AS total_completed_qty, "
            "IFNULL(jc.process_loss_qty, 0) AS process_loss_qty, "
            "wo.production_item AS item_code, "
            "jctl.employee AS employee, "
            "jctl.from_time AS from_time, "
            "jctl.to_time AS to_time, "
            "IFNULL(jctl.time_in_mins, 0) AS time_in_mins, "
            "IFNULL(jctl.completed_qty, 0) AS completed_qty "
            "FROM `tabJob Card Time Log` jctl "
            "JOIN `tabJob Card` jc ON jc.name = jctl.parent "
            "LEFT JOIN `tabWork Order` wo ON wo.name = jc.work_order "
            "WHERE jc.work_order IN %(wo)s AND IFNULL(jctl.completed_qty, 0) > 0 "
            "AND jc.docstatus != 2 AND LOWER(IFNULL(jc.status, '')) != 'cancelled' "
            "ORDER BY jctl.from_time DESC, wo.production_item ASC, jc.operation ASC",
            {"wo": tuple(wo_names)},
        )

        out = []
        for row in rows:
            out.append(
                {
                    "job_card": row.get("job_card") or "",
                    "item_code": row.get("item_code") or "",
                    "operation": row.get("operation") or "",
                    "total_completed_qty": to_float(row.get("total_completed_qty")),
                    "employee": row.get("employee") or "",
                    "from_time": fmt_date(row.get("from_time")),
                    "to_time": fmt_date(row.get("to_time")),
                    "time_in_mins": to_float(row.get("time_in_mins")),
                    "completed_qty": to_float(row.get("completed_qty")),
                    "process_loss_qty": to_float(row.get("process_loss_qty")),
                }
            )
        return out


    def get_job_card_indicators_by_item(wo_names):
        if not wo_names:
            return {}

        rows = safe_sql(
            "SELECT jc.name AS job_card, wo.production_item AS item_code, "
            "IFNULL(jc.total_completed_qty, 0) AS total_completed_qty, "
            "IFNULL(jc.process_loss_qty, 0) AS process_loss_qty "
            "FROM `tabJob Card` jc "
            "LEFT JOIN `tabWork Order` wo ON wo.name = jc.work_order "
            "WHERE jc.work_order IN %(wo)s AND jc.docstatus != 2 AND LOWER(IFNULL(jc.status, '')) != 'cancelled' "
            "ORDER BY wo.production_item, jc.name",
            {"wo": tuple(wo_names)},
        )

        out = {}
        seen = {}
        for row in rows:
            item_code = row.get("item_code") or ""
            jc_name = row.get("job_card") or ""
            if not item_code or not jc_name:
                continue
            if jc_name in seen:
                continue
            seen[jc_name] = 1
            if item_code not in out:
                out[item_code] = {
                    "item_code": item_code,
                    "total_completed_qty": 0,
                    "total_process_loss_qty": 0,
                }
            out[item_code]["total_completed_qty"] = to_float(out[item_code].get("total_completed_qty")) + to_float(row.get("total_completed_qty"))
            out[item_code]["total_process_loss_qty"] = to_float(out[item_code].get("total_process_loss_qty")) + to_float(row.get("process_loss_qty"))

        return out


    def get_time_logs_for_job_cards(job_card_names):
        if not job_card_names:
            return {}

        rows = safe_sql(
            "SELECT parent AS job_card, employee, from_time, to_time, "
            "IFNULL(time_in_mins, 0) AS time_in_mins, IFNULL(completed_qty, 0) AS completed_qty "
            "FROM `tabJob Card Time Log` "
            "WHERE parent IN %(jc)s "
            "ORDER BY parent, from_time",
            {"jc": tuple(job_card_names)},
        )

        out = {}
        for row in rows:
            jc = row.get("job_card")
            if jc not in out:
                out[jc] = []
            out[jc].append(
                {
                    "employee": row.get("employee") or "",
                    "from_time": fmt_date(row.get("from_time")),
                    "to_time": fmt_date(row.get("to_time")),
                    "time_in_mins": to_float(row.get("time_in_mins")),
                    "completed_qty": to_float(row.get("completed_qty")),
                }
            )
        return out
    
    
    def get_operations_for_wos(wo_names):
        if not wo_names:
            return []
        return safe_sql(
            "SELECT parent AS work_order, operation, status, completed_qty, workstation "
            "FROM `tabWork Order Operation` "
            "WHERE parent IN %(wo)s "
            "ORDER BY idx, modified DESC LIMIT 8000",
            {"wo": tuple(wo_names)}
        )


    def get_jobcard_secondary_items(job_card_names):
        if not job_card_names:
            return {}

        rows = safe_sql(
            "SELECT parent AS job_card, item_code, source_warehouse, target_warehouse, "
            "required_qty, consumed_qty, transferred_qty, uom "
            "FROM `tabJob Card Item` "
            "WHERE parent IN %(jc)s AND IFNULL(item_code, '') != '' "
            "ORDER BY parent, idx",
            {"jc": tuple(job_card_names)},
        )

        out = {}
        for row in rows:
            jc = row.get("job_card")
            if jc not in out:
                out[jc] = []
            out[jc].append(
                {
                    "item_code": row.get("item_code") or "",
                    "required_qty": to_float(row.get("required_qty")),
                    "consumed_qty": to_float(row.get("consumed_qty")),
                    "transferred_qty": to_float(row.get("transferred_qty")),
                    "uom": row.get("uom") or "",
                    "source_warehouse": row.get("source_warehouse") or "",
                    "target_warehouse": row.get("target_warehouse") or "",
                }
            )
        return out
    
    
    def get_wo_required_items(wo_names):
        if not wo_names:
            return []
        return safe_sql(
            "SELECT parent AS work_order, item_code, required_qty, transferred_qty, consumed_qty, returned_qty "
            "FROM `tabWork Order Item` "
            "WHERE parent IN %(wo)s "
            "ORDER BY idx, modified DESC LIMIT 15000",
            {"wo": tuple(wo_names)}
        )
    
    
    def get_employee_logs_for_wos(wo_names):
        if not wo_names:
            return []
    
        rs = safe_sql(
            "SELECT "
            "jc.work_order AS work_order, "
            "jc.name AS job_card, "
            "jctl.employee AS employee, "
            "jc.operation AS operation, "
            "jc.workstation AS workstation, "
            "jctl.from_time AS from_time, "
            "jctl.to_time AS to_time, "
            "IFNULL(jctl.time_in_mins, 0) AS time_in_mins, "
            "IFNULL(jctl.completed_qty, 0) AS completed_qty, "
            "wo.production_item AS item_name "
            "FROM `tabJob Card` jc "
            "JOIN `tabJob Card Time Log` jctl ON jctl.parent = jc.name "
            "LEFT JOIN `tabWork Order` wo ON wo.name = jc.work_order "
            "WHERE jc.work_order IN %(wo)s "
            "AND jc.docstatus != 2 AND LOWER(IFNULL(jc.status, '')) != 'cancelled' "
            "ORDER BY jc.work_order, jc.name, jctl.from_time",
            {"wo": tuple(wo_names)}
        )
    
        if not rs:
            rs = safe_sql(
                "SELECT "
                "jc.work_order AS work_order, "
                "jc.name AS job_card, "
                "jctl.employee AS employee, "
                "jc.operation AS operation, "
                "jc.workstation AS workstation, "
                "jctl.from_time AS from_time, "
                "jctl.to_time AS to_time, "
                "IFNULL(jctl.time_in_mins, 0) AS time_in_mins, "
                "0 AS completed_qty, "
                "wo.production_item AS item_name "
                "FROM `tabJob Card` jc "
                "JOIN `tabJob Card Time Log` jctl ON jctl.parent = jc.name "
                "LEFT JOIN `tabWork Order` wo ON wo.name = jc.work_order "
                "WHERE jc.work_order IN %(wo)s "
                "AND jc.docstatus != 2 AND LOWER(IFNULL(jc.status, '')) != 'cancelled' "
                "ORDER BY jc.work_order, jc.name, jctl.from_time",
                {"wo": tuple(wo_names)}
            )
    
        out = []
        for r in rs:
            ft = r.get("from_time")
            tt = r.get("to_time")
            tm = r.get("time_in_mins") or 0
            cq = r.get("completed_qty") or 0
            empty_time = (not ft) and (not tt)
            if empty_time and tm == 0 and cq == 0:
                continue
            out.append(r)
    
        return out
    
    
    def employee_summary_by_wo(employee_logs):
        tmp = {}
    
        for r in employee_logs:
            wo = r.get("work_order")
            emp = r.get("employee")
            if not wo or not emp:
                continue
    
            if wo not in tmp:
                tmp[wo] = {}
    
            if emp not in tmp[wo]:
                tmp[wo][emp] = {
                    "employee": emp,
                    "time_in_mins": 0,
                    "produced_qty": 0,
                    "operations": {},
                    "workstations": {}
                }
    
            current_time = to_float(tmp[wo][emp].get("time_in_mins"))
            add_time = to_float(r.get("time_in_mins"))
            tmp[wo][emp]["time_in_mins"] = current_time + add_time
    
            current_qty = to_float(tmp[wo][emp].get("produced_qty"))
            add_qty = to_float(r.get("completed_qty"))
            tmp[wo][emp]["produced_qty"] = current_qty + add_qty
    
            op = r.get("operation") or ""
            ws = r.get("workstation") or ""
    
            if op:
                tmp[wo][emp]["operations"][op] = 1
            if ws:
                tmp[wo][emp]["workstations"][ws] = 1
    
        out = {}
        for wo in tmp:
            out[wo] = []
            for emp in tmp[wo]:
                x = tmp[wo][emp]
                x["operations"] = ", ".join(list(x.get("operations", {}).keys()))
                x["workstations"] = ", ".join(list(x.get("workstations", {}).keys()))
                out[wo].append(x)
    
            out[wo].sort(key=lambda z: (-(z.get("produced_qty") or 0), -(z.get("time_in_mins") or 0)))
    
        return out
    
    
    def build_work_orders(wo_rows, jc_by_wo, ops_by_wo, wo_items_by_wo, emp_logs_by_wo, emp_summary_map):
        today = get_today()
        out = []
    
        for w in wo_rows:
            name = w.get("name")
            target = to_float(w.get("qty"))
            produced = to_float(w.get("produced_qty"))
            pending = target - produced
            if pending < 0:
                pending = 0
    
            pct = 0
            if target:
                pct = round((produced * 100.0) / target, 2)
    
            planned_end = fmt_date(w.get("planned_end_date"))
            is_delayed = 0
            if planned_end and today and today > planned_end and pct < 100:
                is_delayed = 1
    
            out.append({
                "name": name,
                "status": w.get("status") or "—",
                "production_item": w.get("production_item") or "",
                "qty": target,
                "produced_qty": produced,
                "process_loss_qty": to_float(w.get("process_loss_qty")),
                "disassembled_qty": to_float(w.get("disassembled_qty")),
                "material_transferred_for_manufacturing": to_float(w.get("material_transferred_for_manufacturing")),
                "additional_transferred_qty": to_float(w.get("additional_transferred_qty")),
                "pending_qty": pending,
                "completion_pct": pct,
                "planned_start_date": fmt_date(w.get("planned_start_date")),
                "planned_end_date": planned_end,
                "actual_start_date": fmt_date(w.get("actual_start_date")),
                "actual_end_date": fmt_date(w.get("actual_end_date")),
                "is_delayed": is_delayed,
                "job_cards": jc_by_wo.get(name, []),
                "operations": ops_by_wo.get(name, []),
                "wo_items": wo_items_by_wo.get(name, []),
                "employee_logs": emp_logs_by_wo.get(name, []),
                "employee_summary": emp_summary_map.get(name, [])
            })
        return out
    
    
    def build_production_tree_and_totals(so):
        pps = get_production_plans(so)
        wo = get_work_orders_for_so(so)
        wo_names = uniq_list([x.get("name") for x in wo])
    
        jc = get_jobcards_for_wos(wo_names)
        job_card_names = uniq_list([x.get("name") for x in jc if x.get("name")])
        jc_secondary_items = get_jobcard_secondary_items(job_card_names)
        jc_time_logs = get_time_logs_for_job_cards(job_card_names)
        ops = get_operations_for_wos(wo_names)
        wo_items = get_wo_required_items(wo_names)
    
        jc_by_wo = {}
        for r in jc:
            w = r.get("work_order")
            if w not in jc_by_wo:
                jc_by_wo[w] = []
            r["secondary_items"] = jc_secondary_items.get(r.get("name") or "") or []
            r["time_logs"] = jc_time_logs.get(r.get("name") or "") or []
            jc_by_wo[w].append(r)
    
        ops_by_wo = {}
        for r in ops:
            w = r.get("work_order")
            if w not in ops_by_wo:
                ops_by_wo[w] = []
            ops_by_wo[w].append(r)
    
        wo_items_by_wo = {}
        for r in wo_items:
            w = r.get("work_order")
            if w not in wo_items_by_wo:
                wo_items_by_wo[w] = []
            wo_items_by_wo[w].append(r)
    
        emp_logs = get_employee_logs_for_wos(wo_names)
        daily_production = get_daily_production_from_job_cards(wo_names)
        daily_production_indicators = get_job_card_indicators_by_item(wo_names)
        emp_summary_map = employee_summary_by_wo(emp_logs)
    
        emp_logs_by_wo = {}
        for r in emp_logs:
            w = r.get("work_order")
            if w not in emp_logs_by_wo:
                emp_logs_by_wo[w] = []
            emp_logs_by_wo[w].append(r)
    
        wo_by_pp = {}
        for r in wo:
            pp = r.get("production_plan") or "Unassigned"
            if pp not in wo_by_pp:
                wo_by_pp[pp] = []
            wo_by_pp[pp].append(r)
    
        tree = []
        for pp in pps:
            pp_name = pp.get("name")
            children = wo_by_pp.get(pp_name) or []
            tree.append({
                "production_plan": {"name": pp_name, "status": pp.get("status") or "—"},
                "work_orders": build_work_orders(children, jc_by_wo, ops_by_wo, wo_items_by_wo, emp_logs_by_wo, emp_summary_map)
            })
    
        if wo_by_pp.get("Unassigned"):
            tree.append({
                "production_plan": {"name": "Unassigned", "status": "—"},
                "work_orders": build_work_orders(wo_by_pp.get("Unassigned") or [], jc_by_wo, ops_by_wo, wo_items_by_wo, emp_logs_by_wo, emp_summary_map)
            })
    
        # IMPORTANT:
        # total qty should come from Sales Order even if no WO started yet
        total_qty = get_sales_order_total_qty(so)
    
        total_produced = 0
        delayed_count = 0
        today = get_today()
    
        for r in wo:
            total_produced = total_produced + to_float(r.get("produced_qty"))
    
            planned_end = fmt_date(r.get("planned_end_date"))
            pct = 0
            qty = to_float(r.get("qty"))
            if qty:
                pct = round((to_float(r.get("produced_qty")) * 100.0) / qty, 2)
            if planned_end and today and today > planned_end and pct < 100:
                delayed_count = delayed_count + 1
    
        pending = total_qty - total_produced
        if pending < 0:
            pending = 0
    
        pct = 0
        if total_qty:
            pct = round((total_produced * 100.0) / total_qty, 2)
    
        return {
            "tree": tree,
            "daily_production": daily_production,
            "daily_production_indicators": daily_production_indicators,
            "totals": {
                "total_qty": total_qty,
                "produced_qty": total_produced,
                "pending_qty": pending,
                "completion_pct": pct,
                "delayed_work_orders": delayed_count
            }
        }


    def get_fg_production_summary(so, production_tree):
        so_item_rows = safe_sql(
            "SELECT item_code, SUM(IFNULL(qty, 0)) AS so_qty "
            "FROM `tabSales Order Item` "
            "WHERE parent = %(so)s "
            "GROUP BY item_code",
            {"so": so},
        )
        so_qty_map = {row.get("item_code"): to_float(row.get("so_qty")) for row in so_item_rows if row.get("item_code")}

        summary = {}

        def ensure_row(item):
            if not item:
                return None
            if item not in summary:
                summary[item] = {
                    "item_code": item,
                    "so_qty": to_float(so_qty_map.get(item)),
                    "pp_qty": 0,
                    "wo_qty": 0,
                    "jc_qty": 0,
                    "completed_qty": 0,
                    "wastage_qty": 0,
                    "pp_total": 0,
                    "pp_done": 0,
                    "wo_total": 0,
                    "wo_done": 0,
                    "jc_total": 0,
                    "jc_done": 0,
                }
            return summary[item]

        for node in production_tree or []:
            pp = (node or {}).get("production_plan") or {}
            pp_status = str(pp.get("status") or "").lower()
            wos = (node or {}).get("work_orders") or []
            for wo in wos:
                item = (wo or {}).get("production_item") or ""
                row = ensure_row(item)
                if not row:
                    continue
                row["pp_total"] = row["pp_total"] + 1
                if "complete" in pp_status or "close" in pp_status:
                    row["pp_done"] = row["pp_done"] + 1

                row["wo_total"] = row["wo_total"] + 1
                wo_status = str((wo or {}).get("status") or "").lower()
                if "complete" in wo_status or "close" in wo_status:
                    row["wo_done"] = row["wo_done"] + 1

                row["wo_qty"] = to_float(row.get("wo_qty")) + to_float((wo or {}).get("qty"))
                row["completed_qty"] = to_float(row.get("completed_qty")) + to_float((wo or {}).get("produced_qty"))
                row["wastage_qty"] = to_float(row.get("wastage_qty")) + to_float((wo or {}).get("process_loss_qty"))

                for jc in (wo or {}).get("job_cards") or []:
                    row["jc_total"] = row["jc_total"] + 1
                    jc_status = str((jc or {}).get("status") or "").lower()
                    if "complete" in jc_status or "close" in jc_status:
                        row["jc_done"] = row["jc_done"] + 1
                    row["jc_qty"] = to_float(row.get("jc_qty")) + to_float((jc or {}).get("for_quantity"))
                    row["wastage_qty"] = to_float(row.get("wastage_qty")) + to_float((jc or {}).get("process_loss_qty"))

        out = list(summary.values())
        out.sort(key=lambda x: (x.get("item_code") or ""))
        return out


    def get_item_po_detail_rows(so, item):
        item = (item or "").strip()
        if not so or not item:
            return []

        rows = safe_sql(
            "SELECT po.name AS purchase_order, po.supplier, po.status, "
            "SUM(IFNULL(poi.qty, 0)) AS qty, SUM(IFNULL(poi.received_qty, 0)) AS received_qty "
            "FROM `tabPurchase Order` po "
            "JOIN `tabPurchase Order Item` poi ON poi.parent = po.name "
            "WHERE po.docstatus != 2 AND poi.sales_order = %(so)s AND poi.item_code = %(item)s "
            "GROUP BY po.name, po.supplier, po.status "
            "ORDER BY po.transaction_date DESC, po.modified DESC",
            {"so": so, "item": item},
        )

        out = []
        for row in rows:
            qty = to_float(row.get("qty"))
            rec = to_float(row.get("received_qty"))
            pending = qty - rec
            if pending < 0:
                pending = 0
            out.append(
                {
                    "purchase_order": row.get("purchase_order") or "",
                    "supplier": row.get("supplier") or "",
                    "status": row.get("status") or "",
                    "qty": qty,
                    "received_qty": rec,
                    "pending_qty": pending,
                }
            )
        return out
    
    
    # ---------------------------------------------------------
    # PROCUREMENT
    # ---------------------------------------------------------
    def get_procurement(so):
        out = []
    
        po = safe_sql(
            "SELECT DISTINCT po.name, po.status, po.supplier "
            "FROM `tabPurchase Order` po "
            "JOIN `tabPurchase Order Item` poi ON poi.parent = po.name "
            "WHERE poi.sales_order = %(so)s "
            "ORDER BY po.modified DESC LIMIT 400",
            {"so": so}
        )
    
        po_names = []
        for r in po:
            po_names.append(r.get("name"))
            out.append({
                "doctype": "Purchase Order",
                "name": r.get("name"),
                "status": r.get("status") or "—",
                "qty": "",
                "details": "Supplier: " + (r.get("supplier") or "")
            })
    
        if not po_names:
            return out
    
        pr = safe_sql(
            "SELECT DISTINCT pr.name, pr.status, pr.supplier "
            "FROM `tabPurchase Receipt` pr "
            "JOIN `tabPurchase Receipt Item` pri ON pri.parent = pr.name "
            "WHERE pri.purchase_order IN %(po)s "
            "ORDER BY pr.modified DESC LIMIT 400",
            {"po": tuple(po_names)}
        )
        for r in pr:
            out.append({
                "doctype": "Purchase Receipt",
                "name": r.get("name"),
                "status": r.get("status") or "—",
                "qty": "",
                "details": "Supplier: " + (r.get("supplier") or "")
            })
    
        pi = safe_sql(
            "SELECT DISTINCT pi.name, pi.status, pi.supplier "
            "FROM `tabPurchase Invoice` pi "
            "JOIN `tabPurchase Invoice Item` pii ON pii.parent = pi.name "
            "WHERE pii.purchase_order IN %(po)s "
            "ORDER BY pi.modified DESC LIMIT 400",
            {"po": tuple(po_names)}
        )
        for r in pi:
            out.append({
                "doctype": "Purchase Invoice",
                "name": r.get("name"),
                "status": r.get("status") or "—",
                "qty": "",
                "details": "Supplier: " + (r.get("supplier") or "")
            })
    
        return out
    
    
    # ---------------------------------------------------------
    # DELIVERY + BILLING
    # ---------------------------------------------------------
    def get_delivery_note_invoice_hierarchy(so):
        dns = safe_sql(
            "SELECT DISTINCT dn.name, dn.status, dn.posting_date "
            "FROM `tabDelivery Note` dn "
            "JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name "
            "WHERE dni.against_sales_order = %(so)s "
            "ORDER BY dn.posting_date DESC, dn.modified DESC LIMIT 400",
            {"so": so}
        )
    
        sis = safe_sql(
            "SELECT DISTINCT si.name, si.status, si.posting_date, sii.delivery_note "
            "FROM `tabSales Invoice` si "
            "JOIN `tabSales Invoice Item` sii ON sii.parent = si.name "
            "WHERE sii.sales_order = %(so)s "
            "ORDER BY si.posting_date DESC, si.modified DESC LIMIT 400",
            {"so": so}
        )
    
        si_by_dn = {}
        unlinked = []
    
        for s in sis:
            dn = s.get("delivery_note")
            row = {
                "name": s.get("name"),
                "status": s.get("status") or "—",
                "posting_date": fmt_date(s.get("posting_date"))
            }
            if dn:
                if dn not in si_by_dn:
                    si_by_dn[dn] = []
                si_by_dn[dn].append(row)
            else:
                unlinked.append(row)
    
        out = []
        for d in dns:
            dn_name = d.get("name")
            out.append({
                "delivery_note": dn_name,
                "status": d.get("status") or "—",
                "posting_date": fmt_date(d.get("posting_date")),
                "invoices": si_by_dn.get(dn_name, [])
            })
    
        if unlinked:
            out.append({
                "delivery_note": "",
                "status": "",
                "posting_date": "",
                "invoices": unlinked
            })
    
        return out
    
    
    # ---------------------------------------------------------
    # ITEM ORDER / DELIVERED / INVOICED / PENDING SUMMARY
    # ---------------------------------------------------------
    def get_order_item_summary(so):
        so_items = safe_sql(
            "SELECT name, item_code, item_name, qty "
            "FROM `tabSales Order Item` "
            "WHERE parent = %(so)s "
            "ORDER BY idx",
            {"so": so}
        )

        so_item_names = [row.get("name") for row in so_items if row.get("name")]
    
        dn_rows = safe_sql(
            "SELECT item_code, SUM(qty) AS delivered_qty "
            "FROM `tabDelivery Note Item` "
            "WHERE against_sales_order = %(so)s "
            "GROUP BY item_code",
            {"so": so}
        )
    
        si_rows = safe_sql(
            "SELECT item_code, SUM(qty) AS invoiced_qty "
            "FROM `tabSales Invoice Item` "
            "WHERE sales_order = %(so)s "
            "GROUP BY item_code",
            {"so": so}
        )
    
        delivered_map = {}
        for r in dn_rows:
            delivered_map[r.get("item_code")] = to_float(r.get("delivered_qty"))
    
        invoiced_map = {}
        for r in si_rows:
            invoiced_map[r.get("item_code")] = to_float(r.get("invoiced_qty"))

        production_plan_rows = []
        work_order_rows = []

        if so_item_names:
            production_plan_rows = safe_sql(
                "SELECT DISTINCT ppi.parent AS production_plan, pp.status AS production_plan_status, "
                "ppi.sales_order_item, ppi.item_code "
                "FROM `tabProduction Plan Item` ppi "
                "JOIN `tabProduction Plan` pp ON pp.name = ppi.parent "
                "WHERE ppi.sales_order = %(so)s OR ppi.sales_order_item IN %(so_items)s "
                "ORDER BY pp.modified DESC LIMIT 2000",
                {"so": so, "so_items": tuple(so_item_names)}
            )
            work_order_rows = safe_sql(
                "SELECT DISTINCT wo.name AS work_order, wo.status AS work_order_status, wo.production_plan, "
                "wo.sales_order_item, wo.production_item AS item_code "
                "FROM `tabWork Order` wo "
                "WHERE wo.sales_order = %(so)s OR wo.sales_order_item IN %(so_items)s "
                "ORDER BY wo.modified DESC LIMIT 2000",
                {"so": so, "so_items": tuple(so_item_names)}
            )
        else:
            production_plan_rows = safe_sql(
                "SELECT DISTINCT ppi.parent AS production_plan, pp.status AS production_plan_status, "
                "ppi.sales_order_item, ppi.item_code "
                "FROM `tabProduction Plan Item` ppi "
                "JOIN `tabProduction Plan` pp ON pp.name = ppi.parent "
                "WHERE ppi.sales_order = %(so)s "
                "ORDER BY pp.modified DESC LIMIT 2000",
                {"so": so}
            )
            work_order_rows = safe_sql(
                "SELECT DISTINCT wo.name AS work_order, wo.status AS work_order_status, wo.production_plan, "
                "wo.sales_order_item, wo.production_item AS item_code "
                "FROM `tabWork Order` wo "
                "WHERE wo.sales_order = %(so)s "
                "ORDER BY wo.modified DESC LIMIT 2000",
                {"so": so}
            )

        planning_links_by_so_item = {}
        planning_links_by_item = {}

        def ensure_planning_bucket(key, bucket_map):
            if not key:
                return None
            if key not in bucket_map:
                bucket_map[key] = {
                    "pp_list": [],
                    "pp_statuses": [],
                    "wo_list": [],
                    "wo_statuses": [],
                }
            return bucket_map[key]

        def append_unique(target, value):
            if value and value not in target:
                target.append(value)

        for row in production_plan_rows:
            sales_order_item = row.get("sales_order_item") or ""
            item_code = row.get("item_code") or ""
            plan_name = row.get("production_plan") or ""
            plan_status = row.get("production_plan_status") or ""

            for bucket in filter(None, [
                ensure_planning_bucket(sales_order_item, planning_links_by_so_item),
                ensure_planning_bucket(item_code, planning_links_by_item),
            ]):
                append_unique(bucket["pp_list"], plan_name)
                append_unique(bucket["pp_statuses"], plan_status)

        for row in work_order_rows:
            sales_order_item = row.get("sales_order_item") or ""
            item_code = row.get("item_code") or ""
            work_order = row.get("work_order") or ""
            work_order_status = row.get("work_order_status") or ""
            production_plan = row.get("production_plan") or ""

            for bucket in filter(None, [
                ensure_planning_bucket(sales_order_item, planning_links_by_so_item),
                ensure_planning_bucket(item_code, planning_links_by_item),
            ]):
                append_unique(bucket["wo_list"], work_order)
                append_unique(bucket["wo_statuses"], work_order_status)
                append_unique(bucket["pp_list"], production_plan)
    
        out = []
        for r in so_items:
            sales_order_item = r.get("name") or ""
            item_code = r.get("item_code")
            ordered = to_float(r.get("qty"))
            delivered = delivered_map.get(item_code, 0)
            invoiced = invoiced_map.get(item_code, 0)
            pending = ordered - delivered
            if pending < 0:
                pending = 0

            links = planning_links_by_so_item.get(sales_order_item) or planning_links_by_item.get(item_code) or {}
    
            out.append({
                "sales_order_item": sales_order_item,
                "item_code": item_code,
                "item_name": r.get("item_name") or "",
                "ordered_qty": ordered,
                "delivered_qty": delivered,
                "invoiced_qty": invoiced,
                "pending_qty": pending,
                "pp_list": links.get("pp_list") or [],
                "pp_statuses": links.get("pp_statuses") or [],
                "wo_list": links.get("wo_list") or [],
                "wo_statuses": links.get("wo_statuses") or [],
            })
    
        return out
    
    
    # ---------------------------------------------------------
    # BOM / RAW MATERIALS / SHORTAGE
    # ---------------------------------------------------------
    def get_stock_location_warehouses(location_name):
        location_name = (location_name or "").strip()
        if not location_name:
            return []

        wh = safe_sql(
            "SELECT name, is_group, lft, rgt FROM `tabWarehouse` WHERE name = %(name)s LIMIT 1",
            {"name": location_name},
        )
        if not wh:
            return []

        row = wh[0]
        if int(row.get("is_group") or 0):
            children = safe_sql(
                "SELECT name FROM `tabWarehouse` "
                "WHERE lft >= %(lft)s AND rgt <= %(rgt)s AND ifnull(is_group,0) = 0",
                {"lft": row.get("lft"), "rgt": row.get("rgt")},
            )
            return [c.get("name") for c in children if c.get("name")]

        return [row.get("name")]


    selected_stock_location = (stock_location or "").strip()
    stock_location_warehouses = get_stock_location_warehouses(selected_stock_location)


    def get_bin_stock(item_code):
        if selected_stock_location:
            if not stock_location_warehouses:
                return 0.0
            rs = safe_sql(
                "SELECT SUM(actual_qty) AS qty "
                "FROM `tabBin` "
                "WHERE item_code = %(item)s AND warehouse IN %(warehouses)s",
                {"item": item_code, "warehouses": tuple(stock_location_warehouses)},
            )
        else:
            rs = safe_sql(
                "SELECT SUM(actual_qty) AS qty "
                "FROM `tabBin` "
                "WHERE item_code = %(item)s",
                {"item": item_code}
            )
        if rs and rs[0].get("qty") is not None:
            return to_float(rs[0].get("qty"))
        return 0.0
    
    
    def get_bom_tree(so):
        so_items = safe_sql(
            "SELECT item_code, qty, rate, amount "
            "FROM `tabSales Order Item` "
            "WHERE parent = %(so)s "
            "ORDER BY idx",
            {"so": so}
        )
        items = uniq_list([r.get("item_code") for r in so_items])
        if not items:
            return []
    
        item_qty_map = {}
        for r in so_items:
            item_qty_map[r.get("item_code")] = to_float(r.get("qty"))
    
        bom_rows = []
        for item in items:
            bom_name = get_default_bom_for_item(item)
            if bom_name:
                bom_rows.append({"name": bom_name, "item": item})
    
        if not bom_rows:
            return []
    
        bom_names = uniq_list([b.get("name") for b in bom_rows])
    
        bom_items = safe_sql(
            "SELECT parent AS bom, item_code, qty "
            "FROM `tabBOM Item` "
            "WHERE parent IN %(boms)s "
            "ORDER BY parent, idx",
            {"boms": tuple(bom_names)}
        )
    
        rm_by_bom = {}
        bom_to_fg_item = {}
        for b in bom_rows:
            bom_to_fg_item[b.get("name")] = b.get("item")
    
        for bi in bom_items:
            bom = bi.get("bom")
            fg_item = bom_to_fg_item.get(bom)
            so_qty = item_qty_map.get(fg_item, 0)
            bom_qty = to_float(bi.get("qty"))
            required_qty = bom_qty * so_qty
            stock_qty = get_bin_stock(bi.get("item_code"))
            shortage_qty = required_qty - stock_qty
            if shortage_qty < 0:
                shortage_qty = 0
    
            if bom not in rm_by_bom:
                rm_by_bom[bom] = []
    
            rm_by_bom[bom].append({
                "item_code": bi.get("item_code"),
                "qty": bom_qty,
                "bom_qty": bom_qty,
                "required_qty": required_qty,
                "stock_qty": stock_qty,
                "shortage_qty": shortage_qty
            })
    
        out = []
        for b in bom_rows:
            item_code = b.get("item")
            out.append({
                "item_code": item_code,
                "order_qty": item_qty_map.get(item_code, 0),
                "boms": [{
                    "bom": b.get("name"),
                    "raw_materials": rm_by_bom.get(b.get("name")) or []
                }]
            })
    
        return out
    
    
    def build_material_shortage_from_bom_tree(bom_tree):
        rows = []
        for item_node in bom_tree or []:
            fg_item = item_node.get("item_code")
            order_qty = to_float(item_node.get("order_qty"))
            for b in item_node.get("boms") or []:
                for rm in b.get("raw_materials") or []:
                    shortage = to_float(rm.get("shortage_qty"))
                    purchase_suggestion = shortage
                    rows.append({
                        "fg_item": fg_item,
                        "order_qty": order_qty,
                        "bom": b.get("bom"),
                        "item_code": rm.get("item_code"),
                        "qty_per_bom": to_float(rm.get("bom_qty")),
                        "required_qty": to_float(rm.get("required_qty")),
                        "stock_qty": to_float(rm.get("stock_qty")),
                        "shortage_qty": shortage,
                        "purchase_suggestion_qty": purchase_suggestion
                    })
        return rows
    
    
    # ---------------------------------------------------------
    # CUSTOM PO TAB TRACKING
    # ---------------------------------------------------------
    def get_custom_po_tracking(so):
        try:
            exists = frappe.db.exists("DocType", "Item PO")
        except Exception:
            exists = False
    
        if not exists:
            return []
    
        try:
            rows = frappe.get_all(
                "Item PO",
                filters={
                    "parent": so,
                    "parenttype": "Sales Order",
                    "parentfield": "custom_po_item",
                },
                fields=[
                    "name",
                    "item",
                    "supplier",
                    "qty",
                    "purchase_order",
                    "posting_status",
                    "po_status",
                    "comments",
                ],
                order_by="idx asc",
            )
        except Exception:
            rows = []
    
        out = []
        for r in rows:
            po_name = r.get("purchase_order") or ""
            status_value = r.get("po_status") or r.get("posting_status") or "Pending"
            details = []
            if r.get("item"):
                details.append("Item: " + str(r.get("item")))
            if r.get("supplier"):
                details.append("Supplier: " + str(r.get("supplier")))
            if r.get("comments"):
                details.append("Comment: " + str(r.get("comments")))
    
            out.append({
                "doctype": "Purchase Order" if po_name else "",
                "name": po_name or "",
                "status": status_value,
                "qty": r.get("qty") or "",
                "details": " | ".join(details),
            })
    
        return out
    
    
    
    
    # ---------------------------------------------------------
    # CUSTOM PO ANALYTICS (FROM custom_po_item)
    # ---------------------------------------------------------
    def pct_values(total_qty, received_qty):
        total_qty = to_float(total_qty)
        received_qty = to_float(received_qty)
        if received_qty < 0:
            received_qty = 0
        pending_qty = total_qty - received_qty
        if pending_qty < 0:
            pending_qty = 0
    
        received_pct = 0
        pending_pct = 0
        if total_qty > 0:
            received_pct = round((received_qty * 100.0) / total_qty, 2)
            pending_pct = round((pending_qty * 100.0) / total_qty, 2)
    
        return {
            "ordered_qty": total_qty,
            "received_qty": received_qty,
            "pending_qty": pending_qty,
            "received_pct": received_pct,
            "pending_pct": pending_pct,
        }
    
    
    def get_custom_po_analytics(so):
        try:
            exists = frappe.db.exists("DocType", "Item PO")
        except Exception:
            exists = False
    
        if not exists:
            return {
                "overview": {},
                "po_status_rows": [],
                "item_group_rows": [],
            }
    
        try:
            po_rows = frappe.get_all(
                "Item PO",
                filters={
                    "parent": so,
                    "parenttype": "Sales Order",
                    "parentfield": "custom_po_item",
                },
                fields=[
                    "name",
                    "item",
                    "supplier",
                    "qty",
                    "custom_po_qty",
                    "custom_base_qty",
                    "custom_extra_qty",
                    "custom_wastage_percentage",
                    "custom_wastage_qty",
                    "purchase_order",
                    "posting_status",
                    "po_status",
                ],
                order_by="idx asc",
            )
        except Exception:
            po_rows = []
    
        if not po_rows:
            return {
                "overview": {
                    "ordered_qty": 0,
                    "received_qty": 0,
                    "pending_qty": 0,
                    "received_pct": 0,
                    "pending_pct": 0,
                    "total_rows": 0,
                    "po_created_rows": 0,
                    "po_pending_rows": 0,
                },
                "po_status_rows": [],
                "item_group_rows": [],
            }
    
        item_codes = uniq_list([r.get("item") for r in po_rows if r.get("item")])
        item_group_map = {}
        if item_codes:
            item_info = safe_sql(
                "SELECT name, item_group FROM `tabItem` WHERE name IN %(items)s",
                {"items": tuple(item_codes)}
            )
            for x in item_info:
                item_group_map[x.get("name")] = x.get("item_group") or "Uncategorized"
    
        po_names = uniq_list([r.get("purchase_order") for r in po_rows if r.get("purchase_order")])
    
        po_meta_map = {}
        po_item_agg_map = {}
    
        if po_names:
            po_meta = safe_sql(
                "SELECT name, supplier, status, docstatus FROM `tabPurchase Order` WHERE name IN %(po)s",
                {"po": tuple(po_names)}
            )
            for p in po_meta:
                po_meta_map[p.get("name")] = p
    
            po_item_agg = safe_sql(
                "SELECT parent AS purchase_order, item_code, "
                "SUM(IFNULL(qty,0)) AS ordered_qty, "
                "SUM(IFNULL(received_qty,0)) AS received_qty "
                "FROM `tabPurchase Order Item` "
                "WHERE parent IN %(po)s "
                "GROUP BY parent, item_code",
                {"po": tuple(po_names)}
            )
            for p in po_item_agg:
                po_item_agg_map[(p.get("purchase_order"), p.get("item_code"))] = p
    
        total_ordered = 0
        total_received = 0
        total_pending = 0
    
        po_created_rows = 0
        po_pending_rows = 0
    
        po_group = {}
        item_group_totals = {}
    
        for r in po_rows:
            item_code = r.get("item")
            supplier = r.get("supplier") or ""
            po_name = r.get("purchase_order") or ""
    
            row_ordered = to_float(r.get("custom_po_qty")) or to_float(r.get("qty"))
            row_received = 0
    
            if po_name and item_code:
                agg = po_item_agg_map.get((po_name, item_code))
                if agg:
                    # Keep row level ceiling at row qty
                    row_received = min(row_ordered, to_float(agg.get("received_qty")))
    
            p = pct_values(row_ordered, row_received)
            row_pending = p.get("pending_qty")
    
            total_ordered = total_ordered + row_ordered
            total_received = total_received + row_received
            total_pending = total_pending + row_pending
    
            if po_name:
                po_created_rows = po_created_rows + 1
            else:
                po_pending_rows = po_pending_rows + 1
    
            group_name = item_group_map.get(item_code) or "Uncategorized"
            if group_name not in item_group_totals:
                item_group_totals[group_name] = {
                    "item_group": group_name,
                    "ordered_qty": 0,
                    "received_qty": 0,
                    "pending_qty": 0,
                    "row_count": 0,
                }
            item_group_totals[group_name]["ordered_qty"] = to_float(item_group_totals[group_name].get("ordered_qty")) + row_ordered
            item_group_totals[group_name]["received_qty"] = to_float(item_group_totals[group_name].get("received_qty")) + row_received
            item_group_totals[group_name]["pending_qty"] = to_float(item_group_totals[group_name].get("pending_qty")) + row_pending
            item_group_totals[group_name]["row_count"] = int(item_group_totals[group_name].get("row_count") or 0) + 1
    
            key = po_name or "NOT_CREATED"
            if key not in po_group:
                po_group[key] = {
                    "doctype": "Purchase Order" if po_name else "",
                    "purchase_order": po_name,
                    "status": "Not Created",
                    "supplier": supplier,
                    "ordered_qty": 0,
                    "received_qty": 0,
                    "pending_qty": 0,
                    "row_count": 0,
                }
    
            if po_name:
                meta = po_meta_map.get(po_name) or {}
                po_group[key]["status"] = meta.get("status") or r.get("po_status") or r.get("posting_status") or "Draft"
                if not po_group[key].get("supplier"):
                    po_group[key]["supplier"] = meta.get("supplier") or supplier
    
            po_group[key]["ordered_qty"] = to_float(po_group[key].get("ordered_qty")) + row_ordered
            po_group[key]["received_qty"] = to_float(po_group[key].get("received_qty")) + row_received
            po_group[key]["pending_qty"] = to_float(po_group[key].get("pending_qty")) + row_pending
            po_group[key]["row_count"] = int(po_group[key].get("row_count") or 0) + 1
    
        overview = pct_values(total_ordered, total_received)
        overview["total_rows"] = len(po_rows)
        overview["po_created_rows"] = po_created_rows
        overview["po_pending_rows"] = po_pending_rows
    
        po_status_rows = []
        for k in po_group:
            row = po_group[k]
            pct = pct_values(row.get("ordered_qty"), row.get("received_qty"))
            row["received_pct"] = pct.get("received_pct")
            row["pending_pct"] = pct.get("pending_pct")
            po_status_rows.append(row)
    
        # keep created PO rows first, then not-created
        po_status_rows.sort(key=lambda x: (1 if not x.get("purchase_order") else 0, x.get("purchase_order") or ""))
    
        item_group_rows = []
        for g in item_group_totals:
            row = item_group_totals[g]
            pct = pct_values(row.get("ordered_qty"), row.get("received_qty"))
            row["received_pct"] = pct.get("received_pct")
            row["pending_pct"] = pct.get("pending_pct")
            item_group_rows.append(row)
    
        item_group_rows.sort(key=lambda x: x.get("item_group") or "")
    
        return {
            "overview": overview,
            "po_status_rows": po_status_rows,
            "item_group_rows": item_group_rows,
        }
    
    
    
    # ---------------------------------------------------------
    # LIVE STATUS SYNC FOR ITEM PO
    # ---------------------------------------------------------
    def sync_item_po_status_from_live(so):
        try:
            rows = frappe.get_all(
                "Item PO",
                filters={
                    "parent": so,
                    "parenttype": "Sales Order",
                    "parentfield": "custom_po_item",
                },
                fields=["name", "item", "qty", "custom_po_qty", "purchase_order"],
                order_by="idx asc",
            )
        except Exception:
            rows = []
    
        if not rows:
            return
    
        po_names = uniq_list([r.get("purchase_order") for r in rows if r.get("purchase_order")])
        po_meta_map = {}
        po_item_agg_map = {}
    
        if po_names:
            po_meta = safe_sql(
                "SELECT name, status, docstatus FROM `tabPurchase Order` WHERE name IN %(po)s",
                {"po": tuple(po_names)},
            )
            for p in po_meta:
                po_meta_map[p.get("name")] = p
    
            po_item_agg = safe_sql(
                "SELECT parent AS purchase_order, item_code, SUM(IFNULL(qty,0)) AS ordered_qty, SUM(IFNULL(received_qty,0)) AS received_qty "
                "FROM `tabPurchase Order Item` "
                "WHERE parent IN %(po)s "
                "GROUP BY parent, item_code",
                {"po": tuple(po_names)},
            )
            for p in po_item_agg:
                po_item_agg_map[(p.get("purchase_order"), p.get("item_code"))] = p
    
        for r in rows:
            row_name = r.get("name")
            po_name = r.get("purchase_order") or ""
            item_code = r.get("item") or ""
            row_qty = to_float(r.get("custom_po_qty")) or to_float(r.get("qty"))
    
            if not po_name:
                frappe.db.set_value("Item PO", row_name, "posting_status", "", update_modified=False)
                frappe.db.set_value("Item PO", row_name, "po_status", "Pending", update_modified=False)
                continue
    
            po = po_meta_map.get(po_name)
            if not po:
                frappe.db.set_value("Item PO", row_name, "purchase_order", "", update_modified=False)
                frappe.db.set_value("Item PO", row_name, "posting_status", "", update_modified=False)
                frappe.db.set_value("Item PO", row_name, "po_status", "Pending", update_modified=False)
                continue
    
            posting_status = "Draft"
            if to_float(po.get("docstatus")) == 1:
                posting_status = "Submitted"
            elif to_float(po.get("docstatus")) == 2:
                posting_status = "Cancelled"
    
            po_status = po.get("status") or posting_status
    
            received = 0
            if item_code:
                agg = po_item_agg_map.get((po_name, item_code))
                if agg:
                    received = min(row_qty, to_float(agg.get("received_qty")))
    
            received_pct = 0
            if row_qty > 0:
                received_pct = round((received * 100.0) / row_qty, 2)
    
            po_status_live = po_status
            if posting_status != "Cancelled" and row_qty > 0:
                po_status_live = str(po_status) + " | " + str(received_pct) + "% Received"
    
            frappe.db.set_value("Item PO", row_name, "posting_status", posting_status, update_modified=False)
            frappe.db.set_value("Item PO", row_name, "po_status", po_status_live, update_modified=False)
    
    
    def get_custom_po_analytics_with_items(so):
        base = get_custom_po_analytics(so)
    
        try:
            item_rows = frappe.get_all(
                "Item PO",
                filters={
                    "parent": so,
                    "parenttype": "Sales Order",
                    "parentfield": "custom_po_item",
                },
                fields=["item", "supplier", "qty", "custom_po_qty", "purchase_order"],
                order_by="idx asc",
            )
        except Exception:
            item_rows = []
    
        if not item_rows:
            base["item_group_rows"] = []
            return base
    
        item_codes = uniq_list([r.get("item") for r in item_rows if r.get("item")])
        item_group_map = {}
        if item_codes:
            item_info = safe_sql(
                "SELECT name, item_group FROM `tabItem` WHERE name IN %(items)s",
                {"items": tuple(item_codes)}
            )
            for x in item_info:
                item_group_map[x.get("name")] = x.get("item_group") or "Uncategorized"
    
        po_names = uniq_list([r.get("purchase_order") for r in item_rows if r.get("purchase_order")])
        po_meta_map = {}
        po_item_agg_map = {}
        if po_names:
            po_meta = safe_sql(
                "SELECT name, status, docstatus, supplier FROM `tabPurchase Order` WHERE name IN %(po)s",
                {"po": tuple(po_names)}
            )
            for p in po_meta:
                po_meta_map[p.get("name")] = p
    
            agg = safe_sql(
                "SELECT parent AS purchase_order, item_code, SUM(IFNULL(qty,0)) AS ordered_qty, SUM(IFNULL(received_qty,0)) AS received_qty "
                "FROM `tabPurchase Order Item` WHERE parent IN %(po)s GROUP BY parent, item_code",
                {"po": tuple(po_names)}
            )
            for a in agg:
                po_item_agg_map[(a.get("purchase_order"), a.get("item_code"))] = a
    
        expanded = []
        for r in item_rows:
            item = r.get("item") or ""
            group_name = item_group_map.get(item) or "Uncategorized"
            supplier = (r.get("supplier") or "").strip()
            po_name = (r.get("purchase_order") or "").strip()
            ordered_qty = to_float(r.get("custom_po_qty")) or to_float(r.get("qty"))
            received_qty = 0
            status = "Pending"
    
            if po_name:
                po = po_meta_map.get(po_name) or {}
                status = po.get("status") or "Draft"
                if not supplier:
                    supplier = po.get("supplier") or ""
    
                agg = po_item_agg_map.get((po_name, item))
                if agg:
                    received_qty = min(ordered_qty, to_float(agg.get("received_qty")))
    
            pending_qty = max(ordered_qty - received_qty, 0)
            pct = pct_values(ordered_qty, received_qty)
    
            expanded.append({
                "item_group": group_name,
                "item": item,
                "supplier_name": supplier,
                "order_number": po_name,
                "ordered_qty": ordered_qty,
                "received_qty": received_qty,
                "pending_qty": pending_qty,
                "received_pct": pct.get("received_pct"),
                "pending_pct": pct.get("pending_pct"),
                "po_status": status,
            })
    
        expanded.sort(key=lambda x: ((x.get("item_group") or ""), (x.get("item") or ""), (x.get("order_number") or ""), (x.get("supplier_name") or "")))
        base["item_group_rows"] = expanded
        return base
    
    
    def group_material_shortage_by_item_group(rows, so=None):
        rows = rows or []
        item_codes = uniq_list([r.get("item_code") for r in rows if r.get("item_code")])
        item_group_map = {}
        if item_codes:
            item_info = safe_sql(
                "SELECT name, item_group FROM `tabItem` WHERE name IN %(items)s",
                {"items": tuple(item_codes)}
            )
            for x in item_info:
                item_group_map[x.get("name")] = x.get("item_group") or "Uncategorized"
    
        fallback_item_map = {}
        if so:
            q = safe_sql(
                "SELECT poi.item_code, SUM(IFNULL(poi.qty,0)) AS po_qty, SUM(IFNULL(poi.received_qty,0)) AS pr_qty "
                "FROM `tabPurchase Order Item` poi "
                "JOIN `tabPurchase Order` po ON po.name = poi.parent "
                "WHERE poi.sales_order = %(so)s AND po.docstatus != 2 "
                "GROUP BY poi.item_code",
                {"so": so}
            )
            for r in q:
                fallback_item_map[r.get("item_code")] = {
                    "po_qty": to_float(r.get("po_qty")),
                    "pr_qty": to_float(r.get("pr_qty")),
                }
    
        linked_item_map = {}
        item_po_plan_map = {}
        if so:
            try:
                link_rows = frappe.get_all(
                    "Item PO",
                    filters={
                        "parent": so,
                        "parenttype": "Sales Order",
                        "parentfield": "custom_po_item",
                        "purchase_order": ["is", "set"],
                    },
                    fields=["item", "purchase_order"],
                )
            except Exception:
                link_rows = []
    
            try:
                item_po_all = frappe.get_all(
                    "Item PO",
                    filters={
                        "parent": so,
                        "parenttype": "Sales Order",
                        "parentfield": "custom_po_item",
                    },
                    fields=["item", "qty"],
                )
            except Exception:
                item_po_all = []
    
            for x in item_po_all:
                item_code = x.get("item")
                if not item_code:
                    continue
                item_po_plan_map[item_code] = to_float(item_po_plan_map.get(item_code)) + to_float(x.get("qty"))
    
            po_names = uniq_list([x.get("purchase_order") for x in link_rows if x.get("purchase_order")])
            if po_names:
                po_qty_rows = safe_sql(
                    "SELECT parent AS purchase_order, item_code, SUM(IFNULL(qty,0)) AS po_qty "
                    "FROM `tabPurchase Order Item` "
                    "WHERE parent IN %(po)s "
                    "GROUP BY parent, item_code",
                    {"po": tuple(po_names)}
                )
                for a in po_qty_rows:
                    item_code = a.get("item_code")
                    if item_code not in linked_item_map:
                        linked_item_map[item_code] = {"po_qty": 0, "pr_qty": 0}
                    linked_item_map[item_code]["po_qty"] = to_float(linked_item_map[item_code].get("po_qty")) + to_float(a.get("po_qty"))
    
                # Use Purchase Receipt Item for received quantity so partial receipts
                # are reflected even when PO Item received_qty is not fully updated.
                pr_qty_rows = safe_sql(
                    "SELECT pri.purchase_order, pri.item_code, SUM(IFNULL(pri.qty,0)) AS pr_qty "
                    "FROM `tabPurchase Receipt Item` pri "
                    "JOIN `tabPurchase Receipt` pr ON pr.name = pri.parent "
                    "WHERE pri.purchase_order IN %(po)s AND pr.docstatus = 1 "
                    "GROUP BY pri.purchase_order, pri.item_code",
                    {"po": tuple(po_names)}
                )
                for a in pr_qty_rows:
                    item_code = a.get("item_code")
                    if item_code not in linked_item_map:
                        linked_item_map[item_code] = {"po_qty": 0, "pr_qty": 0}
                    linked_item_map[item_code]["pr_qty"] = to_float(linked_item_map[item_code].get("pr_qty")) + to_float(a.get("pr_qty"))
    
        item_codes_in_rows = uniq_list([r.get("item_code") for r in rows if r.get("item_code")])
        if item_codes_in_rows:
            item_meta_map = {}
            meta_rows = safe_sql(
                "SELECT name, item_group, IFNULL(has_variants, 0) AS has_variants, IFNULL(is_purchase_item, 0) AS is_purchase_item "
                "FROM `tabItem` WHERE name IN %(items)s",
                {"items": tuple(item_codes_in_rows)}
            )
            for x in meta_rows:
                item_meta_map[x.get("name")] = x

            # This section must stay BOM-driven purchase planning only.
            # Exclude template and non-purchase items from shortage suggestions.
            rows = [
                r
                for r in rows
                if (
                    (item_meta_map.get(r.get("item_code")) or {}).get("has_variants") in [0, "0", False]
                    and (item_meta_map.get(r.get("item_code")) or {}).get("is_purchase_item") in [1, "1", True]
                )
            ]

        missing_map_codes = []
        for code in uniq_list([r.get("item_code") for r in rows if r.get("item_code")]):
            if code and code not in item_group_map:
                missing_map_codes.append(code)
        if missing_map_codes:
            item_info = safe_sql(
                "SELECT name, item_group FROM `tabItem` WHERE name IN %(items)s",
                {"items": tuple(missing_map_codes)}
            )
            for x in item_info:
                item_group_map[x.get("name")] = x.get("item_group") or "Uncategorized"
    
        wastage_pct_map = {}
        wastage_pct_item_map = {}
        wastage_mode = "Individual"
        global_manual_pct = 0
        if so:
            try:
                so_w = frappe.db.get_value(
                    "Sales Order",
                    so,
                    ["custom_wastage_mode", "custom_manual_wastage_percent"],
                    as_dict=True,
                ) or {}
                wastage_mode = (so_w.get("custom_wastage_mode") or "Individual").strip()
                global_manual_pct = to_float(so_w.get("custom_manual_wastage_percent"))
                if global_manual_pct < 0:
                    global_manual_pct = 0
            except Exception:
                pass

        def _norm_key(value):
            return str(value or "").strip().lower()

        if so and frappe.db.exists("DocType", "Wastage"):
            try:
                wastage_columns = set()
                try:
                    wastage_columns = set(frappe.db.get_table_columns("Wastage") or [])
                except Exception:
                    wastage_columns = set()

                # Some servers do not have `item` on Wastage (older schema),
                # so fetch only fields that actually exist.
                fields = ["item_group", "wastage", "manual", "po", "source"]
                if "item" in wastage_columns:
                    fields.append("item")

                w_rows = frappe.get_all(
                    "Wastage",
                    filters={
                        "parent": so,
                        "parenttype": "Sales Order",
                        "parentfield": "custom_wastages",
                    },
                    fields=fields,
                )
            except Exception:
                w_rows = []

            mode_key = str(wastage_mode or "").strip().lower()
            for w in w_rows:
                group_key = _norm_key(w.get("item_group"))
                item_key = _norm_key(w.get("item"))
                if not group_key and not item_key:
                    continue

                row_source = str(w.get("source") or "").strip().lower()
                source_value = w.get("wastage")

                if mode_key == "individual" or not mode_key:
                    if row_source == "manual":
                        source_value = w.get("manual")
                        if source_value in [None, ""]:
                            source_value = w.get("wastage")
                    elif row_source == "po":
                        source_value = w.get("po")
                        if source_value in [None, ""]:
                            source_value = w.get("wastage")
                    else:
                        source_value = w.get("wastage")
                elif mode_key == "manual":
                    source_value = w.get("manual")
                    if source_value in [None, ""]:
                        source_value = w.get("wastage")
                elif mode_key == "po":
                    source_value = w.get("po")
                    if source_value in [None, ""]:
                        source_value = w.get("wastage")
                else:
                    source_value = w.get("wastage")

                raw = str(source_value or "").replace("%", "").strip()
                pct = to_float(raw)
                if pct < 0:
                    pct = 0
                if group_key:
                    wastage_pct_map[group_key] = pct
                if item_key:
                    wastage_pct_item_map[item_key] = pct

        # Last purchase rate/supplier by item (latest submitted PO item rate)
        item_last_purchase_rate_map = {}
        item_last_supplier_map = {}
        all_codes_for_rate = uniq_list([r.get("item_code") for r in rows if r.get("item_code")])
        if all_codes_for_rate:
            try:
                rate_rows = safe_sql(
                    "SELECT poi.item_code, poi.rate, po.supplier "
                    "FROM `tabPurchase Order Item` poi "
                    "JOIN `tabPurchase Order` po ON po.name = poi.parent "
                    "WHERE po.docstatus = 1 AND poi.item_code IN %(items)s "
                    "ORDER BY po.transaction_date DESC, poi.modified DESC",
                    {"items": tuple(all_codes_for_rate)},
                )
            except Exception:
                rate_rows = []
            for rr in rate_rows:
                code = rr.get("item_code")
                if code and code not in item_last_purchase_rate_map:
                    item_last_purchase_rate_map[code] = to_float(rr.get("rate"))
                    item_last_supplier_map[code] = rr.get("supplier") or ""

        grouped = {}
        for r in rows:
            item_code = r.get("item_code")
            group_name = item_group_map.get(item_code) or "Uncategorized"
            key = str(group_name) + "||" + str(item_code or "")
            if key not in grouped:
                grouped[key] = {
                    "item_group": group_name,
                    "item_code": item_code,
                    "qty_per_bom": 0,
                    "required_qty": 0,
                    "stock_qty": 0,
                    "shortage_qty": 0,
                    "purchase_suggestion_qty": 0,
                    "po_qty": 0,
                    "pr_qty": 0,
                    "pending_po_qty": 0,
                    "wastage_pct": 0,
                    "wastage_qty": 0,
                    "last_purchase_rate": to_float(item_last_purchase_rate_map.get(item_code)),
                    "last_supplier": item_last_supplier_map.get(item_code) or "",
                }
    
            grouped[key]["qty_per_bom"] = to_float(grouped[key].get("qty_per_bom")) + to_float(r.get("qty_per_bom"))
            grouped[key]["required_qty"] = to_float(grouped[key].get("required_qty")) + to_float(r.get("required_qty"))
            # Same raw material can appear across multiple BOM lines. Stock must
            # be treated as one pool for the selected location, not summed per row.
            grouped[key]["stock_qty"] = max(
                to_float(grouped[key].get("stock_qty")),
                to_float(r.get("stock_qty")),
            )
    
            linked = linked_item_map.get(item_code) or {}
            fallback = fallback_item_map.get(item_code) or {}
            # Prefer linked Item PO calculations, but keep fallback sales-order linked PO/PR
            # figures when linked values are missing or lower due to partial linking.
            po_qty = max(to_float(linked.get("po_qty")), to_float(fallback.get("po_qty")))
            pr_qty = max(to_float(linked.get("pr_qty")), to_float(fallback.get("pr_qty")))
            grouped[key]["po_qty"] = po_qty
            grouped[key]["pr_qty"] = pr_qty
            grouped[key]["pending_po_qty"] = max(po_qty - pr_qty, 0)
            if str(wastage_mode or "").strip().lower() == "global manual %":
                grouped[key]["wastage_pct"] = global_manual_pct
            else:
                pct_from_group = wastage_pct_map.get(_norm_key(group_name))
                pct_from_item = wastage_pct_item_map.get(_norm_key(item_code))
                if pct_from_group is None and pct_from_item is None:
                    grouped[key]["wastage_pct"] = 0
                elif pct_from_group is None:
                    grouped[key]["wastage_pct"] = to_float(pct_from_item)
                else:
                    grouped[key]["wastage_pct"] = to_float(pct_from_group)
        for rec in grouped.values():
            required_qty = to_float(rec.get("required_qty"))
            stock_qty = to_float(rec.get("stock_qty"))
            shortage_qty = max(required_qty - stock_qty, 0)
            rec["shortage_qty"] = shortage_qty
            rec["purchase_suggestion_qty"] = shortage_qty
            rec["wastage_qty"] = round(
                required_qty * to_float(rec.get("wastage_pct")) / 100.0,
                4,
            )
    
        out = list(grouped.values())
        out.sort(key=lambda x: ((x.get("item_group") or ""), (x.get("item_code") or "")))
        return out
    
    
    def get_purchase_flow_rows(so):
        # Start from Item PO rows to include not-created cases too
        try:
            item_po = frappe.get_all(
                "Item PO",
                filters={
                    "parent": so,
                    "parenttype": "Sales Order",
                    "parentfield": "custom_po_item",
                },
                fields=["item", "supplier", "qty", "custom_po_qty", "purchase_order"],
                order_by="idx asc",
            )
        except Exception:
            item_po = []
    
        po_names = uniq_list([r.get("purchase_order") for r in item_po if r.get("purchase_order")])
        supplier_by_po_from_item_po = {}
        for r in item_po:
            po_name = (r.get("purchase_order") or "").strip()
            supplier = (r.get("supplier") or "").strip()
            if po_name and supplier and not supplier_by_po_from_item_po.get(po_name):
                supplier_by_po_from_item_po[po_name] = supplier
    
        # include POs directly linked by sales_order in PO Item as fallback
        po_fallback = safe_sql(
            "SELECT DISTINCT parent AS purchase_order FROM `tabPurchase Order Item` WHERE sales_order = %(so)s",
            {"so": so}
        )
        for r in po_fallback:
            po_name = r.get("purchase_order")
            if po_name and po_name not in po_names:
                po_names.append(po_name)
    
        po_meta_map = {}
        po_item_sum_map = {}
        if po_names:
            po_meta = safe_sql(
                "SELECT name, supplier, status, docstatus, grand_total, rounded_total FROM `tabPurchase Order` WHERE name IN %(po)s",
                {"po": tuple(po_names)}
            )
            for p in po_meta:
                po_meta_map[p.get("name")] = p
    
            po_item_sum = safe_sql(
                "SELECT parent AS purchase_order, SUM(IFNULL(qty,0)) AS ordered_qty, SUM(IFNULL(received_qty,0)) AS received_qty "
                "FROM `tabPurchase Order Item` WHERE parent IN %(po)s GROUP BY parent",
                {"po": tuple(po_names)}
            )
            for p in po_item_sum:
                po_item_sum_map[p.get("purchase_order")] = p
    
        pr_by_po = {}
        pi_by_po = {}
    
        if po_names:
            pr_rows = safe_sql(
                "SELECT pri.purchase_order, pr.name, pr.status, SUM(IFNULL(pri.qty,0)) AS qty, MAX(IFNULL(pr.rounded_total, pr.grand_total)) AS amount "
                "FROM `tabPurchase Receipt Item` pri "
                "JOIN `tabPurchase Receipt` pr ON pr.name = pri.parent "
                "WHERE pri.purchase_order IN %(po)s "
                "GROUP BY pri.purchase_order, pr.name, pr.status "
                "ORDER BY pr.posting_date DESC, pr.modified DESC",
                {"po": tuple(po_names)}
            )
            for r in pr_rows:
                po_name = r.get("purchase_order")
                if po_name not in pr_by_po:
                    pr_by_po[po_name] = []
                pr_by_po[po_name].append(r)
    
            pi_rows = safe_sql(
                "SELECT pii.purchase_order, pi.name, pi.status, SUM(IFNULL(pii.qty,0)) AS qty, MAX(IFNULL(pi.rounded_total, pi.grand_total)) AS amount "
                "FROM `tabPurchase Invoice Item` pii "
                "JOIN `tabPurchase Invoice` pi ON pi.name = pii.parent "
                "WHERE pii.purchase_order IN %(po)s "
                "GROUP BY pii.purchase_order, pi.name, pi.status "
                "ORDER BY pi.posting_date DESC, pi.modified DESC",
                {"po": tuple(po_names)}
            )
            for r in pi_rows:
                po_name = r.get("purchase_order")
                if po_name not in pi_by_po:
                    pi_by_po[po_name] = []
                pi_by_po[po_name].append(r)
    
        # gather not-created bucket from Item PO
        not_created_qty = 0
        missing_supplier = []
        for r in item_po:
            if not r.get("purchase_order"):
                not_created_qty = not_created_qty + (to_float(r.get("custom_po_qty")) or to_float(r.get("qty")))
                s = (r.get("supplier") or "").strip()
                if s and s not in missing_supplier:
                    missing_supplier.append(s)
    
        out = []
        for po_name in po_names:
            meta = po_meta_map.get(po_name) or {}
            agg = po_item_sum_map.get(po_name) or {}
    
            ordered_qty = to_float(agg.get("ordered_qty"))
            received_qty = to_float(agg.get("received_qty"))
            pending_qty = ordered_qty - received_qty
            if pending_qty < 0:
                pending_qty = 0
    
            received_pct = 0
            pending_pct = 0
            if ordered_qty > 0:
                received_pct = round((received_qty * 100.0) / ordered_qty, 2)
                pending_pct = round((pending_qty * 100.0) / ordered_qty, 2)
    
            pr_list = pr_by_po.get(po_name) or []
            pi_list = pi_by_po.get(po_name) or []
    
            pr_numbers = ", ".join([x.get("name") for x in pr_list if x.get("name")])
            pr_status = ", ".join(uniq_list([x.get("status") for x in pr_list if x.get("status")]))
            pr_qty = 0
            pr_cost = 0
            for x in pr_list:
                pr_qty = pr_qty + to_float(x.get("qty"))
                pr_cost = pr_cost + to_float(x.get("amount"))
    
            pi_numbers = ", ".join([x.get("name") for x in pi_list if x.get("name")])
            pi_status = ", ".join(uniq_list([x.get("status") for x in pi_list if x.get("status")]))
            pi_qty = 0
            pi_cost = 0
            for x in pi_list:
                pi_qty = pi_qty + to_float(x.get("qty"))
                pi_cost = pi_cost + to_float(x.get("amount"))
    
            po_cost = to_float(meta.get("rounded_total") or meta.get("grand_total"))
    
            out.append({
                "purchase_order": po_name,
                "supplier": meta.get("supplier") or supplier_by_po_from_item_po.get(po_name) or "",
                "po_status": meta.get("status") or "Draft",
                "ordered_qty": ordered_qty,
                "received_qty": received_qty,
                "pending_qty": pending_qty,
                "received_pct": received_pct,
                "pending_pct": pending_pct,
                "po_cost": po_cost,
                "purchase_receipts": pr_numbers,
                "pr_status": pr_status,
                "pr_qty": pr_qty,
                "pr_cost": pr_cost,
                "purchase_invoices": pi_numbers,
                "pi_status": pi_status,
                "pi_qty": pi_qty,
                "pi_cost": pi_cost,
            })
    
        if not_created_qty > 0:
            out.append({
                "purchase_order": "",
                "supplier": ", ".join(missing_supplier),
                "po_status": "Not Created",
                "ordered_qty": not_created_qty,
                "received_qty": 0,
                "pending_qty": not_created_qty,
                "received_pct": 0,
                "pending_pct": 100,
                "po_cost": 0,
                "purchase_receipts": "",
                "pr_status": "",
                "pr_qty": 0,
                "pr_cost": 0,
                "purchase_invoices": "",
                "pi_status": "",
                "pi_qty": 0,
                "pi_cost": 0,
            })
    
        return out
    
    
    def get_employee_item_wise_labour_cost(so):
        if not frappe.db.exists("DocType", "Per Piece"):
            return {"rows": [], "summary": {"total_qty": 0, "total_cost": 0}}
    
        rows = safe_sql(
            "SELECT pp.employee, pp.name1, pp.product, pp.process_type, "
            "SUM(IFNULL(pp.qty,0)) AS qty, SUM(IFNULL(pp.amount,0)) AS labour_cost, "
            "GROUP_CONCAT(DISTINCT pps.name ORDER BY pps.name SEPARATOR ', ') AS salary_slips "
            "FROM `tabPer Piece` pp "
            "JOIN `tabPer Piece Salary` pps ON pps.name = pp.parent "
            "WHERE pp.parenttype='Per Piece Salary' AND pp.parentfield='perpiece' "
            "AND pps.docstatus < 2 AND pp.sales_order = %(so)s "
            "GROUP BY pp.employee, pp.name1, pp.product, pp.process_type "
            "ORDER BY pp.employee ASC, pp.product ASC",
            {"so": so}
        )
    
        total_qty = 0
        total_cost = 0
        for r in rows:
            qty = to_float(r.get("qty"))
            cost = to_float(r.get("labour_cost"))
            total_qty = total_qty + qty
            total_cost = total_cost + cost
            rate = 0
            if qty > 0:
                rate = round(cost / qty, 4)
            r["rate"] = rate
    
        return {
            "rows": rows,
            "summary": {
                "total_qty": round(total_qty, 2),
                "total_cost": round(total_cost, 2),
            },
        }
    
    # ---------------------------------------------------------
    # TIMELINE / MACHINE / EMPLOYEE / DELIVERY RISK
    # ---------------------------------------------------------
    def get_gantt_timeline(so):
        wo_rows = safe_sql(
            "SELECT name, production_item, qty, produced_qty, planned_start_date, planned_end_date, status "
            "FROM `tabWork Order` "
            "WHERE sales_order = %(so)s "
            "ORDER BY planned_start_date ASC, modified ASC LIMIT 500",
            {"so": so}
        )
    
        out = []
        today = get_today()
    
        for w in wo_rows:
            qty = to_float(w.get("qty"))
            produced = to_float(w.get("produced_qty"))
            pct = 0
            if qty:
                pct = round((produced * 100.0) / qty, 2)
    
            planned_end = fmt_date(w.get("planned_end_date"))
            delayed = 0
            if planned_end and today and today > planned_end and pct < 100:
                delayed = 1
    
            out.append({
                "doctype": "Work Order",
                "name": w.get("name"),
                "item": w.get("production_item") or "",
                "start_date": fmt_date(w.get("planned_start_date")),
                "end_date": planned_end,
                "status": w.get("status") or "—",
                "progress": pct,
                "is_delayed": delayed
            })
    
        dn_rows = safe_sql(
            "SELECT DISTINCT dn.name, dn.posting_date, dn.status "
            "FROM `tabDelivery Note` dn "
            "JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name "
            "WHERE dni.against_sales_order = %(so)s "
            "ORDER BY dn.posting_date ASC, dn.modified ASC LIMIT 500",
            {"so": so}
        )
    
        for d in dn_rows:
            out.append({
                "doctype": "Delivery Note",
                "name": d.get("name"),
                "item": "",
                "start_date": fmt_date(d.get("posting_date")),
                "end_date": fmt_date(d.get("posting_date")),
                "status": d.get("status") or "—",
                "progress": 100,
                "is_delayed": 0
            })
    
        si_rows = safe_sql(
            "SELECT DISTINCT si.name, si.posting_date, si.status "
            "FROM `tabSales Invoice` si "
            "JOIN `tabSales Invoice Item` sii ON sii.parent = si.name "
            "WHERE sii.sales_order = %(so)s "
            "ORDER BY si.posting_date ASC, si.modified ASC LIMIT 500",
            {"so": so}
        )
    
        for s in si_rows:
            out.append({
                "doctype": "Sales Invoice",
                "name": s.get("name"),
                "item": "",
                "start_date": fmt_date(s.get("posting_date")),
                "end_date": fmt_date(s.get("posting_date")),
                "status": s.get("status") or "—",
                "progress": 100,
                "is_delayed": 0
            })
    
        return out
    
    
    def get_machine_utilization(so):
        rows = safe_sql(
            "SELECT jc.workstation AS workstation, SUM(IFNULL(jctl.time_in_mins,0)) AS time_in_mins "
            "FROM `tabJob Card` jc "
            "JOIN `tabJob Card Time Log` jctl ON jctl.parent = jc.name "
            "WHERE jc.work_order IN (SELECT name FROM `tabWork Order` WHERE sales_order = %(so)s) "
            "GROUP BY jc.workstation "
            "ORDER BY SUM(IFNULL(jctl.time_in_mins,0)) DESC",
            {"so": so}
        )
    
        out = []
        for r in rows:
            out.append({
                "workstation": r.get("workstation") or "—",
                "time_in_mins": to_float(r.get("time_in_mins"))
            })
        return out
    
    
    def get_employee_efficiency(so):
        wo_rows = get_work_orders_for_so(so)
        wo_names = uniq_list([x.get("name") for x in wo_rows])
        logs = get_employee_logs_for_wos(wo_names)
    
        tmp = {}
    
        for r in logs:
            emp = r.get("employee")
            if not emp:
                continue
    
            if emp not in tmp:
                tmp[emp] = {
                    "employee": emp,
                    "time_in_mins": 0,
                    "completed_qty": 0,
                    "operations": {}
                }
    
            current_time = to_float(tmp[emp].get("time_in_mins"))
            add_time = to_float(r.get("time_in_mins"))
            tmp[emp]["time_in_mins"] = current_time + add_time
    
            current_qty = to_float(tmp[emp].get("completed_qty"))
            add_qty = to_float(r.get("completed_qty"))
            tmp[emp]["completed_qty"] = current_qty + add_qty
    
            op = r.get("operation") or ""
            if op:
                tmp[emp]["operations"][op] = 1
    
        out = []
        for emp in tmp:
            row = tmp[emp]
            qty = to_float(row.get("completed_qty"))
            mins = to_float(row.get("time_in_mins"))
            qty_per_hour = 0
            if mins > 0:
                qty_per_hour = round((qty * 60.0) / mins, 2)
    
            out.append({
                "employee": row.get("employee"),
                "time_in_mins": mins,
                "completed_qty": qty,
                "qty_per_hour": qty_per_hour,
                "operations": ", ".join(list(row.get("operations", {}).keys()))
            })
    
        out.sort(key=lambda x: (-(x.get("completed_qty") or 0), -(x.get("time_in_mins") or 0)))
        return out
    
    
    def get_delivery_delay_prediction(so):
        so_doc = frappe.get_doc("Sales Order", so)
        delivery_date = fmt_date(so_doc.get("delivery_date"))
        today = get_today()
    
        total_qty = get_sales_order_total_qty(so)
        produced_qty = 0
        wo_rows = get_work_orders_for_so(so)
    
        for r in wo_rows:
            produced_qty = produced_qty + to_float(r.get("produced_qty"))
    
        pending_qty = total_qty - produced_qty
        if pending_qty < 0:
            pending_qty = 0
    
        completion_pct = 0
        if total_qty:
            completion_pct = round((produced_qty * 100.0) / total_qty, 2)
    
        risk = "Low"
        reason = "On track"
    
        if delivery_date:
            if today and today > delivery_date and completion_pct < 100:
                risk = "High"
                reason = "Delivery date passed but order is not fully completed"
            elif completion_pct < 50:
                risk = "Medium"
                reason = "Less than 50% produced against sales order requirement"
            elif pending_qty > 0:
                risk = "Medium"
                reason = "Production still pending before delivery"
        else:
            if completion_pct < 100:
                risk = "Medium"
                reason = "Delivery date not set and production is pending"
    
        return {
            "delivery_date": delivery_date,
            "today": today,
            "completion_pct": completion_pct,
            "pending_qty": pending_qty,
            "risk": risk,
            "reason": reason
        }
    
    
    # ---------------------------------------------------------
    # PROFIT USING DEFAULT BOM COST
    # ---------------------------------------------------------
    def get_profit_summary_and_items(so):
        so_doc = frappe.get_doc("Sales Order", so)
        total_sales = to_float(so_doc.get("grand_total"))
    
        rows = get_sales_order_items(so)
    
        out_items = []
        total_estimated_cost = 0
    
        for r in rows:
            item_code = r.get("item_code")
            qty = to_float(r.get("qty"))
            sales_amount = to_float(r.get("amount"))
    
            bom_name = get_default_bom_for_item(item_code)
            bom_unit_cost = get_bom_cost(bom_name)
    
            estimated_cost = bom_unit_cost * qty
            estimated_profit = sales_amount - estimated_cost
            margin_pct = 0
            if sales_amount:
                margin_pct = round((estimated_profit * 100.0) / sales_amount, 2)
    
            total_estimated_cost = total_estimated_cost + estimated_cost
    
            out_items.append({
                "item_code": item_code,
                "qty": qty,
                "default_bom": bom_name,
                "bom_unit_cost": bom_unit_cost,
                "sales_amount": sales_amount,
                "estimated_cost": estimated_cost,
                "estimated_profit": estimated_profit,
                "margin_pct": margin_pct
            })
    
        total_profit = total_sales - total_estimated_cost
        total_margin_pct = 0
        if total_sales:
            total_margin_pct = round((total_profit * 100.0) / total_sales, 2)
    
        return {
            "summary": {
                "sales_amount": total_sales,
                "estimated_cost": total_estimated_cost,
                "estimated_profit": total_profit,
                "margin_pct": total_margin_pct
            },
            "items": out_items
        }
    
    
    
    def get_po_item_group_summary(so):
        rows = safe_sql(
            "SELECT IFNULL(i.item_group, 'Uncategorized') AS item_group, SUM(IFNULL(poi.amount,0)) AS po_amount "
            "FROM `tabPurchase Order Item` poi "
            "JOIN `tabPurchase Order` po ON po.name = poi.parent "
            "LEFT JOIN `tabItem` i ON i.name = poi.item_code "
            "WHERE poi.sales_order = %(so)s AND po.docstatus != 2 "
            "GROUP BY IFNULL(i.item_group, 'Uncategorized') "
            "ORDER BY IFNULL(i.item_group, 'Uncategorized')",
            {"so": so}
        )
        out = []
        for r in rows:
            out.append({
                "item_group": r.get("item_group") or "Uncategorized",
                "po_amount": to_float(r.get("po_amount")),
            })
        return out
    
    
    def get_custom_po_tracking_live(so):
        rows = get_custom_po_tracking(so)
        out = []
        if not rows:
            return out
        po_names = uniq_list([r.get("name") for r in rows if r.get("doctype") == "Purchase Order" and r.get("name")])
        po_map = {}
        if po_names:
            po_meta = safe_sql("SELECT name, status FROM `tabPurchase Order` WHERE name IN %(po)s", {"po": tuple(po_names)})
            for p in po_meta:
                po_map[p.get("name")] = p.get("status") or "Draft"
        for r in rows:
            if r.get("doctype") == "Purchase Order" and r.get("name"):
                r["status"] = po_map.get(r.get("name")) or r.get("status")
            out.append(r)
        return out


    def get_item_document_links(so):
        so_items = safe_sql(
            "SELECT name, item_code, item_name "
            "FROM `tabSales Order Item` "
            "WHERE parent = %(so)s "
            "ORDER BY idx",
            {"so": so}
        )

        so_item_names = [row.get("name") for row in so_items if row.get("name")]

        # Map BOM raw material item -> finished good item(s) from this Sales Order,
        # so item-level links can include procurement docs created against raw items.
        raw_to_fg_items = {}
        try:
            bom_tree = get_bom_tree(so) or []
        except Exception:
            bom_tree = []
        for item_node in bom_tree:
            fg_item = (item_node or {}).get("item_code") or ""
            for bom_row in ((item_node or {}).get("boms") or []):
                for rm in ((bom_row or {}).get("raw_materials") or []):
                    raw_code = (rm or {}).get("item_code") or ""
                    if not fg_item or not raw_code:
                        continue
                    if raw_code not in raw_to_fg_items:
                        raw_to_fg_items[raw_code] = []
                    if fg_item not in raw_to_fg_items[raw_code]:
                        raw_to_fg_items[raw_code].append(fg_item)

        links_by_so_item = {}
        links_by_item = {}

        def ensure_bucket(key, store):
            if not key:
                return None
            if key not in store:
                store[key] = {
                    "production_plans": [],
                    "work_orders": [],
                    "job_cards": [],
                    "stock_entries": [],
                    "purchase_orders": [],
                    "purchase_receipts": [],
                    "purchase_invoices": [],
                    "salary_slips": [],
                    "delivery_notes": [],
                    "sales_invoices": [],
                }
            return store[key]

        def append_doc(target, payload):
            if target is None or not payload or not payload.get("name"):
                return
            name = payload.get("name")
            if not any(existing.get("name") == name for existing in target):
                target.append(payload)

        def push_doc(sales_order_item, item_code, doc_key, payload):
            for bucket in filter(None, [
                ensure_bucket(sales_order_item, links_by_so_item),
                ensure_bucket(item_code, links_by_item),
            ]):
                append_doc(bucket.get(doc_key), payload)

        def push_doc_with_raw_mapping(item_code, doc_key, payload):
            push_doc("", item_code, doc_key, payload)
            for fg_item in raw_to_fg_items.get(item_code, []):
                push_doc("", fg_item, doc_key, payload)

        if so_item_names:
            production_plan_rows = safe_sql(
                "SELECT DISTINCT ppi.parent AS name, pp.status, ppi.sales_order_item, ppi.item_code "
                "FROM `tabProduction Plan Item` ppi "
                "JOIN `tabProduction Plan` pp ON pp.name = ppi.parent "
                "WHERE ppi.sales_order = %(so)s OR ppi.sales_order_item IN %(so_items)s "
                "ORDER BY pp.modified DESC LIMIT 2000",
                {"so": so, "so_items": tuple(so_item_names)}
            )
            work_order_rows = safe_sql(
                "SELECT DISTINCT wo.name, wo.status, wo.production_plan, wo.sales_order_item, wo.production_item AS item_code, wo.qty, wo.produced_qty "
                "FROM `tabWork Order` wo "
                "WHERE (wo.sales_order = %(so)s OR wo.sales_order_item IN %(so_items)s) "
                "AND wo.docstatus != 2 AND LOWER(IFNULL(wo.status, '')) != 'cancelled' "
                "ORDER BY wo.modified DESC LIMIT 2000",
                {"so": so, "so_items": tuple(so_item_names)}
            )
            delivery_note_rows = safe_sql(
                "SELECT DISTINCT dn.name, dn.status, dn.posting_date, dni.so_detail AS sales_order_item, dni.item_code "
                "FROM `tabDelivery Note` dn "
                "JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name "
                "WHERE dni.against_sales_order = %(so)s OR dni.so_detail IN %(so_items)s "
                "ORDER BY dn.posting_date DESC, dn.modified DESC LIMIT 2000",
                {"so": so, "so_items": tuple(so_item_names)}
            )
            sales_invoice_rows = safe_sql(
                "SELECT DISTINCT si.name, si.status, si.posting_date, sii.so_detail AS sales_order_item, sii.item_code, sii.delivery_note "
                "FROM `tabSales Invoice` si "
                "JOIN `tabSales Invoice Item` sii ON sii.parent = si.name "
                "WHERE sii.sales_order = %(so)s OR sii.so_detail IN %(so_items)s "
                "ORDER BY si.posting_date DESC, si.modified DESC LIMIT 2000",
                {"so": so, "so_items": tuple(so_item_names)}
            )
        else:
            production_plan_rows = safe_sql(
                "SELECT DISTINCT ppi.parent AS name, pp.status, ppi.sales_order_item, ppi.item_code "
                "FROM `tabProduction Plan Item` ppi "
                "JOIN `tabProduction Plan` pp ON pp.name = ppi.parent "
                "WHERE ppi.sales_order = %(so)s "
                "ORDER BY pp.modified DESC LIMIT 2000",
                {"so": so}
            )
            work_order_rows = safe_sql(
                "SELECT DISTINCT wo.name, wo.status, wo.production_plan, wo.sales_order_item, wo.production_item AS item_code, wo.qty, wo.produced_qty "
                "FROM `tabWork Order` wo "
                "WHERE wo.sales_order = %(so)s "
                "AND wo.docstatus != 2 AND LOWER(IFNULL(wo.status, '')) != 'cancelled' "
                "ORDER BY wo.modified DESC LIMIT 2000",
                {"so": so}
            )
            delivery_note_rows = safe_sql(
                "SELECT DISTINCT dn.name, dn.status, dn.posting_date, dni.so_detail AS sales_order_item, dni.item_code "
                "FROM `tabDelivery Note` dn "
                "JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name "
                "WHERE dni.against_sales_order = %(so)s "
                "ORDER BY dn.posting_date DESC, dn.modified DESC LIMIT 2000",
                {"so": so}
            )
            sales_invoice_rows = safe_sql(
                "SELECT DISTINCT si.name, si.status, si.posting_date, sii.so_detail AS sales_order_item, sii.item_code, sii.delivery_note "
                "FROM `tabSales Invoice` si "
                "JOIN `tabSales Invoice Item` sii ON sii.parent = si.name "
                "WHERE sii.sales_order = %(so)s "
                "ORDER BY si.posting_date DESC, si.modified DESC LIMIT 2000",
                {"so": so}
            )

        for row in production_plan_rows:
            push_doc(
                row.get("sales_order_item") or "",
                row.get("item_code") or "",
                "production_plans",
                {
                    "name": row.get("name") or "",
                    "status": row.get("status") or "—",
                }
            )

        work_order_names = []
        work_order_key_map = {}
        for row in work_order_rows:
            payload = {
                "name": row.get("name") or "",
                "status": row.get("status") or "—",
                "production_plan": row.get("production_plan") or "",
                "qty": to_float(row.get("qty")),
                "produced_qty": to_float(row.get("produced_qty")),
            }
            push_doc(
                row.get("sales_order_item") or "",
                row.get("item_code") or "",
                "work_orders",
                payload
            )
            if row.get("name"):
                work_order_names.append(row.get("name"))
                work_order_key_map[row.get("name")] = {
                    "sales_order_item": row.get("sales_order_item") or "",
                    "item_code": row.get("item_code") or "",
                }

        work_order_names = uniq_list(work_order_names)

        if work_order_names:
            job_card_rows = safe_sql(
                "SELECT name, status, work_order, operation, workstation, for_quantity, total_completed_qty, process_loss_qty "
                "FROM `tabJob Card` "
                "WHERE work_order IN %(wo)s AND docstatus != 2 AND LOWER(IFNULL(status, '')) != 'cancelled' "
                "ORDER BY modified DESC LIMIT 4000",
                {"wo": tuple(work_order_names)}
            )
            stock_entry_rows = safe_sql(
                "SELECT name, docstatus, purpose, posting_date, work_order "
                "FROM `tabStock Entry` "
                "WHERE work_order IN %(wo)s "
                "ORDER BY posting_date DESC, modified DESC LIMIT 4000",
                {"wo": tuple(work_order_names)}
            )
        else:
            job_card_rows = []
            stock_entry_rows = []

        for row in job_card_rows:
            key = work_order_key_map.get(row.get("work_order") or "") or {}
            push_doc(
                key.get("sales_order_item") or "",
                key.get("item_code") or "",
                "job_cards",
                {
                    "name": row.get("name") or "",
                    "status": row.get("status") or "—",
                    "work_order": row.get("work_order") or "",
                    "operation": row.get("operation") or "",
                    "workstation": row.get("workstation") or "",
                    "for_quantity": to_float(row.get("for_quantity")),
                    "total_completed_qty": to_float(row.get("total_completed_qty")),
                    "process_loss_qty": to_float(row.get("process_loss_qty")),
                }
            )

        for row in stock_entry_rows:
            key = work_order_key_map.get(row.get("work_order") or "") or {}
            status = "Draft"
            if int(to_float(row.get("docstatus"))) == 1:
                status = "Submitted"
            elif int(to_float(row.get("docstatus"))) == 2:
                status = "Cancelled"
            push_doc(
                key.get("sales_order_item") or "",
                key.get("item_code") or "",
                "stock_entries",
                {
                    "name": row.get("name") or "",
                    "status": status,
                    "purpose": row.get("purpose") or "",
                    "posting_date": fmt_date(row.get("posting_date")),
                    "work_order": row.get("work_order") or "",
                }
            )

        for row in delivery_note_rows:
            push_doc(
                row.get("sales_order_item") or "",
                row.get("item_code") or "",
                "delivery_notes",
                {
                    "name": row.get("name") or "",
                    "status": row.get("status") or "—",
                    "posting_date": fmt_date(row.get("posting_date")),
                }
            )

        for row in sales_invoice_rows:
            push_doc(
                row.get("sales_order_item") or "",
                row.get("item_code") or "",
                "sales_invoices",
                {
                    "name": row.get("name") or "",
                    "status": row.get("status") or "—",
                    "posting_date": fmt_date(row.get("posting_date")),
                    "delivery_note": row.get("delivery_note") or "",
                }
            )

        out = []
        item_codes = uniq_list([row.get("item_code") for row in so_items if row.get("item_code")])

        po_item_rows = []
        po_item_to_item = {}
        po_names = []
        po_item_names = []

        if item_codes:
            # Primary source: PO Items linked by Sales Order on child rows.
            po_item_rows = safe_sql(
                "SELECT DISTINCT poi.name AS po_item, poi.item_code, po.name, po.status "
                "FROM `tabPurchase Order Item` poi "
                "JOIN `tabPurchase Order` po ON po.name = poi.parent "
                "WHERE po.docstatus != 2 AND poi.sales_order = %(so)s "
                "ORDER BY po.modified DESC LIMIT 4000",
                {"so": so}
            )

            # Fallback source: Item PO table rows on this Sales Order (custom_po_item),
            # useful when draft/submitted POs exist but PO Item.sales_order is not populated.
            po_item_rows.extend(
                safe_sql(
                    "SELECT DISTINCT poi.name AS po_item, ip.item AS item_code, po.name, po.status "
                    "FROM `tabItem PO` ip "
                    "JOIN `tabPurchase Order` po ON po.name = ip.purchase_order "
                    "LEFT JOIN `tabPurchase Order Item` poi "
                    "ON poi.parent = po.name AND poi.item_code = ip.item "
                    "WHERE po.docstatus != 2 AND ip.parenttype = 'Sales Order' "
                    "AND ip.parentfield = 'custom_po_item' AND ip.parent = %(so)s "
                    "AND IFNULL(ip.item, '') != '' "
                    "ORDER BY po.modified DESC LIMIT 4000",
                    {"so": so}
                )
            )

        seen_po_item_link = {}
        for row in po_item_rows:
            po_item = row.get("po_item") or ""
            item_code = row.get("item_code") or ""
            link_key = (row.get("name") or "") + "::" + item_code
            if not item_code or not row.get("name") or link_key in seen_po_item_link:
                continue
            seen_po_item_link[link_key] = 1
            if po_item and item_code:
                po_item_to_item[po_item] = item_code
                po_item_names.append(po_item)
            if row.get("name"):
                po_names.append(row.get("name"))
            push_doc_with_raw_mapping(
                item_code,
                "purchase_orders",
                {
                    "name": row.get("name") or "",
                    "status": row.get("status") or "—",
                }
            )

        po_item_names = uniq_list(po_item_names)
        po_names = uniq_list(po_names)

        pr_rows = []
        if po_names:
            pr_rows = safe_sql(
                "SELECT DISTINCT pr.name, pr.status, pr.posting_date, pri.item_code, pri.purchase_order_item "
                "FROM `tabPurchase Receipt` pr "
                "JOIN `tabPurchase Receipt Item` pri ON pri.parent = pr.name "
                "WHERE pr.docstatus != 2 AND pri.purchase_order IN %(po)s "
                "ORDER BY pr.posting_date DESC, pr.modified DESC LIMIT 4000",
                {"po": tuple(po_names)}
            )

        pr_names = []
        for row in pr_rows:
            item_code = row.get("item_code") or po_item_to_item.get(row.get("purchase_order_item") or "") or ""
            if row.get("name"):
                pr_names.append(row.get("name"))
            push_doc_with_raw_mapping(
                item_code,
                "purchase_receipts",
                {
                    "name": row.get("name") or "",
                    "status": row.get("status") or "—",
                    "posting_date": fmt_date(row.get("posting_date")),
                }
            )

        pr_names = uniq_list(pr_names)

        pi_rows = []
        if po_item_names:
            pi_rows.extend(
                safe_sql(
                    "SELECT DISTINCT pi.name, pi.status, pi.posting_date, pii.item_code, pii.po_detail "
                    "FROM `tabPurchase Invoice` pi "
                    "JOIN `tabPurchase Invoice Item` pii ON pii.parent = pi.name "
                    "WHERE pi.docstatus != 2 AND pii.po_detail IN %(po_items)s "
                    "ORDER BY pi.posting_date DESC, pi.modified DESC LIMIT 4000",
                    {"po_items": tuple(po_item_names)}
                )
            )
        if pr_names:
            pi_rows.extend(
                safe_sql(
                    "SELECT DISTINCT pi.name, pi.status, pi.posting_date, pii.item_code, '' AS po_detail "
                    "FROM `tabPurchase Invoice` pi "
                    "JOIN `tabPurchase Invoice Item` pii ON pii.parent = pi.name "
                    "WHERE pi.docstatus != 2 AND pii.purchase_receipt IN %(pr)s "
                    "ORDER BY pi.posting_date DESC, pi.modified DESC LIMIT 4000",
                    {"pr": tuple(pr_names)}
                )
            )

        seen_pi = {}
        for row in pi_rows:
            item_code = row.get("item_code") or po_item_to_item.get(row.get("po_detail") or "") or ""
            key = (row.get("name") or "") + "::" + item_code
            if not row.get("name") or key in seen_pi:
                continue
            seen_pi[key] = 1
            push_doc_with_raw_mapping(
                item_code,
                "purchase_invoices",
                {
                    "name": row.get("name") or "",
                    "status": row.get("status") or "—",
                    "posting_date": fmt_date(row.get("posting_date")),
                }
            )

        salary_rows = []
        if item_codes:
            salary_rows = safe_sql(
                "SELECT DISTINCT pps.name, pps.docstatus, pp.sales_order_item, pp.product AS item_code "
                "FROM `tabPer Piece` pp "
                "JOIN `tabPer Piece Salary` pps ON pps.name = pp.parent "
                "WHERE pp.parenttype='Per Piece Salary' AND pp.parentfield='perpiece' "
                "AND pp.sales_order = %(so)s AND pp.product IN %(items)s AND pps.docstatus < 2 "
                "ORDER BY pps.modified DESC LIMIT 4000",
                {"so": so, "items": tuple(item_codes)}
            )

        for row in salary_rows:
            status = "Draft"
            if int(to_float(row.get("docstatus"))) == 1:
                status = "Submitted"
            push_doc(
                row.get("sales_order_item") or "",
                row.get("item_code") or "",
                "salary_slips",
                {
                    "name": row.get("name") or "",
                    "status": status,
                }
            )

        for row in so_items:
            sales_order_item = row.get("name") or ""
            item_code = row.get("item_code") or ""
            links = links_by_so_item.get(sales_order_item) or links_by_item.get(item_code) or {}
            out.append({
                "sales_order_item": sales_order_item,
                "item_code": item_code,
                "item_name": row.get("item_name") or item_code,
                "production_plans": links.get("production_plans") or [],
                "work_orders": links.get("work_orders") or [],
                "job_cards": links.get("job_cards") or [],
                "stock_entries": links.get("stock_entries") or [],
                "purchase_orders": links.get("purchase_orders") or [],
                "purchase_receipts": links.get("purchase_receipts") or [],
                "purchase_invoices": links.get("purchase_invoices") or [],
                "salary_slips": links.get("salary_slips") or [],
                "delivery_notes": links.get("delivery_notes") or [],
                "sales_invoices": links.get("sales_invoices") or [],
            })
        return out
    
    # ---------------------------------------------------------
    # MAIN
    # ---------------------------------------------------------
    if action == "doc_items":
        frappe.response["message"] = get_document_items(doc_doctype, doc_name)
    elif action == "item_po_detail":
        frappe.response["message"] = get_item_po_detail_rows(sales_order, item_code)
    
    elif not sales_order:
        frappe.response["message"] = {
            "stock_location": selected_stock_location,
            "production_tree": [],
            "production_totals": {
                "total_qty": 0,
                "produced_qty": 0,
                "pending_qty": 0,
                "completion_pct": 0,
                "delayed_work_orders": 0
            },
            "procurement": [],
            "sales_fulfillment_hierarchy": [],
            "bom_tree": [],
            "material_shortage": [],
            "custom_po_tracking": [],
            "gantt_timeline": [],
            "machine_utilization": [],
            "employee_efficiency": [],
            "delivery_prediction": {},
            "profit_summary": {},
            "profit_by_item": [],
            "order_item_summary": [],
            "item_document_links": [],
            "custom_po_analytics": {
                "overview": {},
                "po_status_rows": [],
                "item_group_rows": []
            },
            "purchase_flow_rows": [],
            "labour_cost_employee_item_wise": [],
            "labour_cost_summary": {"total_qty": 0, "total_cost": 0},
            "po_item_group_summary": []
        }
    
    else:
        so_doc = frappe.get_doc("Sales Order", sales_order)
        so_doc.check_permission("read")
    
        sync_item_po_status_from_live(sales_order)
        prod = build_production_tree_and_totals(sales_order)
        fg_production_summary = get_fg_production_summary(sales_order, prod.get("tree") or [])
        bom_tree = get_bom_tree(sales_order)
        profit_data = get_profit_summary_and_items(sales_order)
        labour_data = get_employee_item_wise_labour_cost(sales_order)
        po_item_group_summary = get_po_item_group_summary(sales_order)
    
        frappe.response["message"] = {
            "stock_location": selected_stock_location,
            "production_tree": prod.get("tree") or [],
            "daily_production": prod.get("daily_production") or [],
            "production_fg_summary": fg_production_summary,
            "production_totals": prod.get("totals") or {
                "total_qty": 0,
                "produced_qty": 0,
                "pending_qty": 0,
                "completion_pct": 0,
                "delayed_work_orders": 0
            },
            "procurement": get_procurement(sales_order),
            "sales_fulfillment_hierarchy": get_delivery_note_invoice_hierarchy(sales_order),
            "bom_tree": bom_tree,
            "material_shortage": group_material_shortage_by_item_group(build_material_shortage_from_bom_tree(bom_tree), sales_order),
            "custom_po_tracking": get_custom_po_tracking_live(sales_order),
            "gantt_timeline": get_gantt_timeline(sales_order),
            "machine_utilization": get_machine_utilization(sales_order),
            "employee_efficiency": get_employee_efficiency(sales_order),
            "delivery_prediction": get_delivery_delay_prediction(sales_order),
            "profit_summary": profit_data.get("summary") or {},
            "profit_by_item": profit_data.get("items") or [],
            "order_item_summary": get_order_item_summary(sales_order),
            "item_document_links": get_item_document_links(sales_order),
            "custom_po_analytics": get_custom_po_analytics_with_items(sales_order),
            "purchase_flow_rows": get_purchase_flow_rows(sales_order),
            "labour_cost_employee_item_wise": labour_data.get("rows") or [],
            "labour_cost_summary": labour_data.get("summary") or {},
            "po_item_group_summary": po_item_group_summary
        }

    return frappe.response.get("message")
