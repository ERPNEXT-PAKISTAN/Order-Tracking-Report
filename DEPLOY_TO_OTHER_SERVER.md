# Order Tracking Report - Other Server Setup

This app includes:
- Sales Order custom fields
- App JS (`public/js/sales_order.js`)
- Data Entry app JS for:
  - Sales Order
  - Sales Invoice
  - Purchase Order
  - Purchase Receipt
  - Purchase Invoice
  - Stock Entry
- App API (`api.py`) and backend services
- Print Format (`Sales Order Contract`)
- Report and Property Setters

## 1) Install on Other Server

On target bench server:

```bash
cd /home/frappe/frappe-bench
bench get-app --branch main order_tracking_report https://github.com/ERPNEXT-PAKISTAN/Order-Tracking-Report.git
bench --site site1.local install-app order_tracking_report
bench --site site1.local migrate
bench --site site1.local clear-cache
bench restart
```

## 2) Verify

1. Open `Sales Order` form.
2. Confirm custom tab/field `custom_detail_status` loads dashboard.
3. Check print format `Sales Order Contract`.
4. Check terms payment fields and Bank Account autofill behavior.

## 3) If App Already Exists on Other Server

If `git pull origin main` fails with:
`fatal: 'origin' does not appear to be a git repository`
run one-time remote setup:

```bash
cd /home/frappe/frappe-bench/apps/order_tracking_report
git init
git remote add origin https://github.com/ERPNEXT-PAKISTAN/Order-Tracking-Report.git
git fetch origin
git checkout -B main origin/main
```

Then regular update:

```bash
cd /home/frappe/frappe-bench/apps/order_tracking_report
git pull origin main
cd /home/frappe/frappe-bench
bench --site site1.local migrate
bench --site site1.local clear-cache
bench restart
```

Important:
- Use the bench path where this app is installed.
- If your app path is `/home/frappe/frappe-bench/apps/order_tracking_report`, run commands from `/home/frappe/frappe-bench`.

## 4) Folder Schema (3 Sections)

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

## 5) Notes

- Fixtures are already exported in app code, so `migrate` applies customizations.
- `after_migrate` hooks ensure required child tables (like `Item PO` and `Wastage`) and remove legacy UI scripts (`Client Script` / `Server Script`) that were moved to backend app code.
- Recent fix included: PR Qty in `Material Shortage & Purchase Suggestion` now uses submitted `Purchase Receipt Item` quantities for partial receipts.
