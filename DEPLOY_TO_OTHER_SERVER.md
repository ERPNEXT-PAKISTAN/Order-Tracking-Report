# Order Tracking Report - GitHub Upload and Other Server Setup

This app includes:
- Sales Order custom fields
- Client Script (`Sales Order Detail Status`)
- Server Script (`Sales Order Detail Status`, `create_po_from_sales_order_po_tab`)
- Print Format (`Sales Order Contract`)
- Report and Property Setters exported as fixtures

## 1) Upload This App to GitHub

Run from bench server:

```bash
cd /home/frappe/frappe-bench-v16/apps/order_tracking_report
```

If this folder is not already a git repository:

```bash
git init
git checkout -b main
git add .
git commit -m "Initial order_tracking_report app with sales order tracking customizations"
```

Create an empty GitHub repo (example name: `order_tracking_report`), then:

```bash
git remote add origin https://github.com/<your-username>/order_tracking_report.git
git push -u origin main
```

## 2) Install on Other Server

On target bench server:

```bash
cd /home/frappe/frappe-bench-v16
bench get-app --branch main order_tracking_report https://github.com/<your-username>/order_tracking_report.git
bench --site <your-site-name> install-app order_tracking_report
bench --site <your-site-name> migrate
bench --site <your-site-name> clear-cache
bench restart
```

## 3) Verify

1. Open `Sales Order` form.
2. Confirm custom tab/field `custom_detail_status` loads dashboard.
3. Check print format `Sales Order Contract`.
4. Check terms payment fields and Bank Account autofill behavior.

## 4) If App Already Exists on Other Server

To update to latest code:

```bash
cd /home/frappe/frappe-bench-v16/apps/order_tracking_report
git pull origin main
cd /home/frappe/frappe-bench-v16
bench --site <your-site-name> migrate
bench --site <your-site-name> clear-cache
bench restart
```

## Notes

- Fixtures are already exported in app code, so `migrate` applies customizations.
- Recent fix included: PR Qty in `Material Shortage & Purchase Suggestion` now uses submitted `Purchase Receipt Item` quantities for partial receipts.
