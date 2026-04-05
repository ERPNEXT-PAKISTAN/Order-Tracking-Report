import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


PRINT_FORMAT_NAME = "Sales Order Contract"
OLD_PRINT_FORMAT_NAME = "Order Tracking Sales Order"


def ensure_sales_order_payment_detail_fields():
	custom_fields = {
		"Sales Order": [
			{
				"fieldname": "custom_payment_detail_section",
				"label": "Payment Detail",
				"fieldtype": "Section Break",
				"insert_after": "terms",
			},
			{
				"fieldname": "custom_bank_account",
				"label": "Bank Account",
				"fieldtype": "Link",
				"options": "Bank Account",
				"insert_after": "custom_payment_detail_section",
			},
			{
				"fieldname": "custom_bank_name",
				"label": "Bank Name",
				"fieldtype": "Data",
				"insert_after": "custom_bank_account",
			},
			{
				"fieldname": "custom_account_title",
				"label": "Account Title",
				"fieldtype": "Data",
				"insert_after": "custom_bank_name",
			},
			{
				"fieldname": "custom_account_number",
				"label": "Account Number",
				"fieldtype": "Data",
				"insert_after": "custom_account_title",
			},
			{
				"fieldname": "custom_bank_address",
				"label": "Bank Address",
				"fieldtype": "Small Text",
				"insert_after": "custom_account_number",
			},
			{
				"fieldname": "custom_swift_code",
				"label": "Swift Code",
				"fieldtype": "Data",
				"insert_after": "custom_bank_address",
			},
			{
				"fieldname": "custom_iban",
				"label": "IBAN",
				"fieldtype": "Data",
				"insert_after": "custom_swift_code",
			},
		]
	}
	create_custom_fields(custom_fields, update=True)
	frappe.clear_cache(doctype="Sales Order")


def ensure_sales_order_bank_account_client_script():
	script_name = "Sales Order Bank Account Autofill"
	script = """
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
"""
	if frappe.db.exists("Client Script", script_name):
		doc = frappe.get_doc("Client Script", script_name)
		doc.update({"dt": "Sales Order", "enabled": 1, "script": script})
		doc.save(ignore_permissions=True)
	else:
		frappe.get_doc(
			{
				"doctype": "Client Script",
				"name": script_name,
				"dt": "Sales Order",
				"enabled": 1,
				"script": script,
			}
		).insert(ignore_permissions=True)

	frappe.db.commit()


def create_or_update_sales_order_print_format():
	html = """
<style>
  .otr-wrap { font-size: 11px; color: #111827; font-family: Arial, sans-serif; }
  .print-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 2px solid #9ca3af;
    margin-bottom: 15px;
  }
  .left-section { display: flex; align-items: center; }
  .company-logo { height: 70px; margin-right: 10px; }
  .company-name {
    font-size: 20px; font-weight: bold; text-transform: uppercase; color: #111827;
  }
  .right-section { text-align: right; color: #111827; }
  .dc-title { font-size: 20px; font-weight: bold; text-transform: uppercase; margin: 0; }
  .otr-grid { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  .otr-grid th, .otr-grid td { border: 1px solid #e5e7eb; padding: 6px; vertical-align: top; }
  .otr-grid th { background: #f8fafc; text-align: left; font-weight: 600; color: #1f2937; }
  .otr-right { text-align: right; }
  .otr-section { margin-top: 16px; margin-bottom: 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #111827; }
  .otr-box { border: 1px solid #e5e7eb; min-height: 84px; padding: 10px; margin-bottom: 10px; background: #fcfcfd; }
  .otr-sign-row { width: 100%; margin-top: 40px; }
  .otr-sign-cell { width: 48%; display: inline-block; vertical-align: top; }
  .otr-sign-line { border-top: 1px solid #6b7280; margin-top: 36px; padding-top: 6px; font-weight: 600; text-align: center; }
</style>

<div class="otr-wrap">
  <div class="print-header">
    <div class="left-section">
      <img src="/files/Logo.jpg" alt="Company Logo" class="company-logo">
      <div class="company-name">{{ doc.company or "" }}</div>
    </div>
    <div class="right-section">
      <div class="dc-title">Sales Contract</div>
    </div>
  </div>

  <table class="otr-grid">
    <tr>
      <th style="width: 20%">Entry No</th>
      <td style="width: 30%">{{ doc.name }}</td>
      <th style="width: 20%">Status</th>
      <td style="width: 30%">{{ doc.status or "" }}</td>
    </tr>
    <tr>
      <th>Customer</th>
      <td>{{ doc.customer_name or doc.customer or "" }}</td>
      <th>Order Date</th>
      <td>{{ frappe.utils.formatdate(doc.transaction_date) if doc.transaction_date else "" }}</td>
    </tr>
    <tr><th>PO No</th><td>{{ doc.po_no or "" }}</td><th>PO Date</th><td>{{ frappe.utils.formatdate(doc.po_date) if doc.po_date else "" }}</td></tr>
    <tr><th>Container No</th><td>{{ doc.custom_container_no or "" }}</td><th>Invoice No</th><td>{{ doc.custom_invoice_no or "" }}</td></tr>
    <tr><th>PO</th><td colspan="3">{{ doc.custom_po or "" }}</td></tr>
  </table>

  <div class="otr-section">Sales Order Items</div>
  <table class="otr-grid">
    <tr>
      <th style="width: 4%">#</th>
      <th style="width: 30%">Item Name</th>
      <th style="width: 16%">Fabric Quality</th>
      <th style="width: 14%">Design/Color</th>
      <th style="width: 10%">Size</th>
      <th style="width: 12%">Dimension</th>
      <th class="otr-right" style="width: 8%">Qty</th>
      <th style="width: 10%">UOM</th>
    </tr>
    {% for row in doc.items %}
    {% set attrs = frappe.db.sql("select attribute, attribute_value from `tabItem Variant Attribute` where parent=%s", [row.item_code], as_dict=1) %}
    {% set ns = namespace(fabric_quality="", design_color="", size="", dimension="") %}
    {% for a in attrs %}
      {% set key = (a.attribute or "").lower() %}
      {% if ("fabric" in key and ("quality" in key or "quallity" in key)) or key == "quality" %}
        {% set ns.fabric_quality = a.attribute_value or ns.fabric_quality %}
      {% elif ("design" in key and "color" in key) or key == "color" %}
        {% set ns.design_color = a.attribute_value or ns.design_color %}
      {% elif "size" in key %}
        {% set ns.size = a.attribute_value or ns.size %}
      {% elif "dimension" in key %}
        {% set ns.dimension = a.attribute_value or ns.dimension %}
      {% endif %}
    {% endfor %}
    {% set all_attr_rows = frappe.db.sql("select attribute, attribute_value from `tabItem Variant Attribute` where parent=%s and ifnull(attribute_value, '') != ''", [row.item_code], as_dict=1) %}
    <tr>
      <td>{{ row.idx }}</td>
      <td>
        <div>{{ row.item_name or "" }}</div>
        {% if all_attr_rows %}
        <div style="font-size:10px; color:#6b7280; margin-top:2px;">
          {% for ar in all_attr_rows %}
            {{ ar.attribute }}: {{ ar.attribute_value }}{% if not loop.last %}, {% endif %}
          {% endfor %}
        </div>
        {% endif %}
      </td>
      <td>{{ row.custom_fabric_quality or ns.fabric_quality }}</td>
      <td>{{ row.custom_designcolor or ns.design_color }}</td>
      <td>{{ ns.size }}</td>
      <td>{{ ns.dimension }}</td>
      <td class="otr-right">{{ frappe.utils.fmt_money(row.qty, precision=2) }}</td>
      <td>{{ row.uom or "" }}</td>
    </tr>
    {% endfor %}
  </table>

  {% if doc.taxes %}
  <div class="otr-section">Taxes and Charges</div>
  <table class="otr-grid">
    <tr>
      <th style="width: 42%">Type</th>
      <th style="width: 18%">Account Head</th>
      <th class="otr-right" style="width: 10%">Rate</th>
      <th class="otr-right" style="width: 15%">Tax Amount</th>
      <th class="otr-right" style="width: 15%">Total</th>
    </tr>
    {% for tax in doc.taxes %}
    <tr>
      <td>{{ tax.charge_type or "" }}</td>
      <td>{{ tax.account_head or "" }}</td>
      <td class="otr-right">{{ tax.rate or 0 }}</td>
      <td class="otr-right">{{ frappe.utils.fmt_money(tax.tax_amount, currency=doc.currency) }}</td>
      <td class="otr-right">{{ frappe.utils.fmt_money(tax.total, currency=doc.currency) }}</td>
    </tr>
    {% endfor %}
  </table>
  {% endif %}

  <div class="otr-section">Packing Instructions</div>
  <div class="otr-box">{{ doc.custom_packing_instructions or "" }}</div>

  <div class="otr-section">Remarks</div>
  <div class="otr-box">{{ doc.custom_remarks or "" }}</div>

  {% if doc.terms %}
  <div class="otr-section">Terms and Conditions</div>
  <table class="otr-grid">
    <tr><td>{{ doc.terms }}</td></tr>
  </table>
  {% endif %}

  <div class="otr-section">Billing and Shipping</div>
  <table class="otr-grid">
    <tr>
      <th style="width: 50%">Billing Address</th>
      <th style="width: 50%">Shipping Address</th>
    </tr>
    <tr>
      <td>{{ doc.address_display or "" }}</td>
      <td>{{ doc.shipping_address or "" }}</td>
    </tr>
  </table>

  <div class="otr-section">Payment Detail</div>
  <table class="otr-grid">
    <tr><th style="width: 30%">Bank Account</th><td>{{ doc.custom_bank_account or "" }}</td></tr>
    <tr><th style="width: 30%">Bank Name</th><td>{{ doc.custom_bank_name or "" }}</td></tr>
    <tr><th>Account Title</th><td>{{ doc.custom_account_title or "" }}</td></tr>
    <tr><th>Account Number</th><td>{{ doc.custom_account_number or "" }}</td></tr>
    <tr><th>Bank Address</th><td>{{ doc.custom_bank_address or "" }}</td></tr>
    <tr><th>Swift Code</th><td>{{ doc.custom_swift_code or "" }}</td></tr>
    <tr><th>IBAN</th><td>{{ doc.custom_iban or "" }}</td></tr>
  </table>

  <div class="otr-sign-row">
    <div class="otr-sign-cell">
      <div class="otr-sign-line">Seller's Signature</div>
    </div>
    <div class="otr-sign-cell" style="float:right;">
      <div class="otr-sign-line">Buyer's Signature</div>
    </div>
  </div>
</div>
"""

	old_exists = frappe.db.exists("Print Format", OLD_PRINT_FORMAT_NAME)
	new_exists = frappe.db.exists("Print Format", PRINT_FORMAT_NAME)
	if old_exists and not new_exists:
		frappe.rename_doc("Print Format", OLD_PRINT_FORMAT_NAME, PRINT_FORMAT_NAME, force=True)

	existing = frappe.db.exists("Print Format", PRINT_FORMAT_NAME)
	if existing:
		doc = frappe.get_doc("Print Format", PRINT_FORMAT_NAME)
		doc.update(
			{
				"doc_type": "Sales Order",
				"module": "Order Tracking Report",
				"standard": "No",
				"custom_format": 1,
				"disabled": 0,
				"print_format_type": "Jinja",
				"print_format_builder": 0,
				"print_format_builder_beta": 0,
				"raw_printing": 0,
				"html": html,
			}
		)
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc(
			{
				"doctype": "Print Format",
				"name": PRINT_FORMAT_NAME,
				"doc_type": "Sales Order",
				"module": "Order Tracking Report",
				"standard": "No",
				"custom_format": 1,
				"disabled": 0,
				"print_format_type": "Jinja",
				"print_format_builder": 0,
				"print_format_builder_beta": 0,
				"raw_printing": 0,
				"html": html,
			}
		)
		doc.insert(ignore_permissions=True)

	frappe.db.commit()
	return PRINT_FORMAT_NAME


def apply_sales_order_print_setup():
	ensure_sales_order_payment_detail_fields()
	ensure_sales_order_bank_account_client_script()
	return create_or_update_sales_order_print_format()
