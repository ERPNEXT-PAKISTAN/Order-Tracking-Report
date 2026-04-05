### Order-Tracking-Report

This app packages Sales Order customizations so they can be moved to another server.

Included fixtures:

- Custom Fields (`Sales Order`) including `custom_detail_status` and `custom_po_item`
- Client Scripts (`Sales Order`)
- Property Setters (`Sales Order`)
- Server Scripts:
  - `Sales Order Detail Status`
  - `create_po_from_sales_order_po_tab`
- Custom Reports (`Sales Order`, non-standard only)

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
