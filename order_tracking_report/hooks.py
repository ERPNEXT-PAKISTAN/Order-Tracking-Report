app_name = "order_tracking_report"
app_title = "Order Tracking Report"
app_publisher = "Local Team"
app_description = "Sales Order custom fields scripts reports"
app_email = "admin@example.com"
app_license = "mit"

fixtures = [
	{
		"dt": "Custom Field",
		"filters": [["dt", "=", "Sales Order"]],
	},
	{
		"dt": "Custom HTML Block",
		"filters": [["name", "in", ["Live Work Order", "Work Order"]]],
	},
	{
		"dt": "Property Setter",
		"filters": [["doc_type", "=", "Sales Order"]],
	},
	{
		"dt": "Print Format",
		"filters": [["name", "in", ["Sales Order Contract", "Sales Order Contract with Comment"]]],
	},
	{
		"dt": "Server Script",
		"filters": [["name", "in", ["Work Order"]]],
	},
]

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "order_tracking_report",
# 		"logo": "/assets/order_tracking_report/logo.png",
# 		"title": "Order Tracking Report",
# 		"route": "/order_tracking_report",
# 		"has_permission": "order_tracking_report.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/order_tracking_report/css/order_tracking_report.css"
app_include_js = [
	"/assets/order_tracking_report/js/data_entry/sales_order_data_entry.js",
]

# include js, css files in header of web template
# web_include_css = "/assets/order_tracking_report/css/order_tracking_report.css"
# web_include_js = "/assets/order_tracking_report/js/order_tracking_report.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "order_tracking_report/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
	"Sales Order": "public/js/sales_order.js",
	"Purchase Order": "public/js/data_entry/purchase_order_data_entry.js",
	"Purchase Receipt": "public/js/data_entry/purchase_receipt_data_entry.js",
	"Purchase Invoice": "public/js/data_entry/purchase_invoice_data_entry.js",
	"Sales Invoice": "public/js/data_entry/sales_invoice_data_entry.js",
	"Stock Entry": "public/js/data_entry/stock_entry_data_entry.js",
}

after_migrate = [
	"order_tracking_report.bootstrap.ensure_item_po_setup",
	"order_tracking_report.cleanup.remove_legacy_ui_scripts",
	"order_tracking_report.cleanup.normalize_purchase_receipt_titles",
]
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "order_tracking_report/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "order_tracking_report.utils.jinja_methods",
# 	"filters": "order_tracking_report.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "order_tracking_report.install.before_install"
# after_install = "order_tracking_report.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "order_tracking_report.uninstall.before_uninstall"
# after_uninstall = "order_tracking_report.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "order_tracking_report.utils.before_app_install"
# after_app_install = "order_tracking_report.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "order_tracking_report.utils.before_app_uninstall"
# after_app_uninstall = "order_tracking_report.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "order_tracking_report.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }
doc_events = {
	"Purchase Order": {
		"on_update": "order_tracking_report.po_sync.sync_item_po_status_for_purchase_order",
		"on_submit": "order_tracking_report.po_sync.sync_item_po_status_for_purchase_order",
		"on_cancel": "order_tracking_report.po_sync.sync_item_po_status_for_purchase_order",
	},
	"Purchase Receipt": {
		"validate": "order_tracking_report.cleanup.ensure_purchase_receipt_title",
	},
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"order_tracking_report.tasks.all"
# 	],
# 	"daily": [
# 		"order_tracking_report.tasks.daily"
# 	],
# 	"hourly": [
# 		"order_tracking_report.tasks.hourly"
# 	],
# 	"weekly": [
# 		"order_tracking_report.tasks.weekly"
# 	],
# 	"monthly": [
# 		"order_tracking_report.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "order_tracking_report.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "order_tracking_report.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "order_tracking_report.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "order_tracking_report.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["order_tracking_report.utils.before_request"]
# after_request = ["order_tracking_report.utils.after_request"]

# Job Events
# ----------
# before_job = ["order_tracking_report.utils.before_job"]
# after_job = ["order_tracking_report.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"order_tracking_report.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []
