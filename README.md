### Order-Tracking-Report

This app packages Sales Order customizations so they can be moved to another server.

Backend design:

- Custom Fields (`Sales Order`) including `custom_detail_status` and `custom_po_item`
- Client logic moved to app file: `order_tracking_report/public/js/sales_order.js`
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
cd /home/frappe/frappe-bench-v16
bench get-app --branch main order_tracking_report https://github.com/ERPNEXT-PAKISTAN/Order-Tracking-Report.git
bench --site <site_name> install-app order_tracking_report
bench --site <site_name> migrate
bench --site <site_name> clear-cache
bench restart
```

If your server already has old UI scripts/fields, install is still safe:
- Existing fields with same name are updated by fixtures.
- Legacy app script records are removed on migrate (exact known names only).

### Update on Server (already installed)

```bash
cd /home/frappe/frappe-bench-v16/apps/order_tracking_report
git pull origin main
cd /home/frappe/frappe-bench-v16
bench --site <site_name> migrate
bench --site <site_name> clear-cache
bench restart
```

### GitHub Upload Commands

From this app folder:

```bash
cd /home/frappe/frappe-bench-v16/apps/order_tracking_report
echo "# Order-Tracking-Report" >> README.md
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/ERPNEXT-PAKISTAN/Order-Tracking-Report.git
git push -u origin main
```

If remote already exists:

```bash
git remote set-url origin https://github.com/ERPNEXT-PAKISTAN/Order-Tracking-Report.git
git branch -M main
git push -u origin main
```

### Export Fixtures (when customizations change)

```bash
cd /home/frappe/frappe-bench-v16
bench --site <site_name> export-fixtures --app order_tracking_report
```

### Folder Schema

```text
apps/order_tracking_report/
  README.md
  DEPLOY_TO_OTHER_SERVER.md
  order_tracking_report/
    hooks.py
    api.py
    bootstrap.py
    so_detail_status_backend.py
    cleanup.py
    public/js/sales_order.js
    fixtures/
      custom_field.json
      property_setter.json
      print_format.json
    order_tracking_report/
      report/
        purchase_order_updated_status/
          purchase_order_updated_status.py
          purchase_order_updated_status.js
          purchase_order_updated_status.json
```

### Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/order_tracking_report
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade

### License

mit
