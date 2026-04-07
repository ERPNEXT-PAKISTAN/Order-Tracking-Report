### Order-Tracking-Report

This app packages Sales Order customizations so they can be moved to another server.

Backend design:

- Custom Fields (`Sales Order`) including `custom_detail_status` and `custom_po_item`
- Client logic moved to app files:
  - `order_tracking_report/public/js/sales_order.js` (detail status + SO actions)
  - `order_tracking_report/public/js/data_entry/*.js` (Data Entry on Sales Order, Sales Invoice, Purchase Order, Purchase Receipt, Purchase Invoice, Stock Entry)
- Property Setters (`Sales Order`)
- API logic moved to app file: `order_tracking_report/api.py`
- Detail status backend engine: `order_tracking_report/so_detail_status_backend.py`
- Legacy `Client Script` and `Server Script` records are auto-removed by:
  - `order_tracking_report.cleanup.remove_legacy_ui_scripts` (hook: `after_migrate`)
- Purchase Order -> Item PO status sync is now app `doc_events`:
  - `order_tracking_report.po_sync.sync_item_po_status_for_purchase_order`
  - old `Status update Creat PO from SO_po_tab*` server scripts are removed on migrate
- Child table dependency is auto-ensured by:
  - `order_tracking_report.bootstrap.ensure_item_po_setup` (creates `Item PO` Doctype/fields if missing)

Included fixtures:

- `Custom Field`
- `Property Setter`
- `Print Format`

### Installation

Install on new server/site:

```bash
cd /home/frappe/frappe-bench
bench get-app --branch main order_tracking_report https://github.com/ERPNEXT-PAKISTAN/Order-Tracking-Report.git
bench --site site1.local install-app order_tracking_report
bench --site site1.local migrate
bench --site site1.local clear-cache
bench restart
```

If your server already has old UI scripts/fields, install is still safe:
- Existing fields with same name are updated by fixtures.
- Legacy app script records are removed on migrate (exact known names only).

### Update on Server (already installed)

If `git pull origin main` fails with:
`fatal: 'origin' does not appear to be a git repository`
then app folder is not linked to remote yet. Run one-time setup:

```bash
cd <bench_path>/apps/order_tracking_report
git init
git remote add origin https://github.com/ERPNEXT-PAKISTAN/Order-Tracking-Report.git
git fetch origin
git checkout -B main origin/main
```

Regular update command:

```bash
cd /home/frappe/frappe-bench/apps/order_tracking_report
git pull origin main
cd /home/frappe/frappe-bench
bench --site site1.local migrate
bench --site site1.local clear-cache
bench restart
```

Important:
- Use the same `<bench_path>` where this app is actually installed.
- Example: if app is in `/home/frappe/frappe-bench/apps/order_tracking_report`, then use `/home/frappe/frappe-bench` (not `/home/frappe/frappe-bench-v16`).

### Folder Schema (3 Sections)

1. Core Backend

```text
apps/order_tracking_report/
  order_tracking_report/
    hooks.py
    api.py
    bootstrap.py
    so_detail_status_backend.py
    cleanup.py
```

2. Frontend JS (inside app)

```text
apps/order_tracking_report/
  order_tracking_report/public/js/
    sales_order.js
    data_entry/
      sales_order_data_entry.js
      sales_invoice_data_entry.js
      purchase_order_data_entry.js
      purchase_receipt_data_entry.js
      purchase_invoice_data_entry.js
      stock_entry_data_entry.js
```

3. Fixtures and Reports

```text
apps/order_tracking_report/
  order_tracking_report/fixtures/
    custom_field.json
    property_setter.json
    print_format.json
  order_tracking_report/order_tracking_report/report/
    purchase_order_updated_status/
      purchase_order_updated_status.py
      purchase_order_updated_status.js
      purchase_order_updated_status.json
```

### License

mit
