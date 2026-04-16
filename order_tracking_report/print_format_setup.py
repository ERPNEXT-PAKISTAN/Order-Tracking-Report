import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


PRINT_FORMAT_NAME = "Sales Order Contract"
OLD_PRINT_FORMAT_NAME = "Order Tracking Sales Order"
DELIVERY_NOTE_PRINT_FORMAT_NAME = "Delivery Note Container Report"


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


def ensure_delivery_note_print_fields():
	custom_fields = {
		"Item": [
			{
				"fieldname": "custom_pcs_per_ctn",
				"label": "Pcs Per CTN",
				"fieldtype": "Float",
				"insert_after": "stock_uom",
			},
		],
		"Delivery Note": [
			{
				"fieldname": "custom_container_no",
				"label": "Container No",
				"fieldtype": "Data",
				"insert_after": "posting_date",
				"allow_on_submit": 1,
			},
		],
		"Delivery Note Item": [
			{
				"fieldname": "custom_designcolor",
				"label": "Design Color",
				"fieldtype": "Data",
				"insert_after": "custom_comments",
				"allow_on_submit": 1,
			},
			{
				"fieldname": "custom_carton_number_from",
				"label": "Carton Number From",
				"fieldtype": "Int",
				"insert_after": "custom_designcolor",
				"allow_on_submit": 1,
			},
			{
				"fieldname": "custom_carton_number_to",
				"label": "Carton Number To",
				"fieldtype": "Int",
				"insert_after": "custom_carton_number_from",
				"allow_on_submit": 1,
			},
			{
				"fieldname": "custom_pcs_per_ctn",
				"label": "Pcs Per CTN",
				"fieldtype": "Float",
				"insert_after": "custom_carton_number_to",
				"fetch_from": "item_code.custom_pcs_per_ctn",
				"fetch_if_empty": 1,
				"allow_on_submit": 1,
			},
			{
				"fieldname": "custom_ctn",
				"label": "CTN",
				"fieldtype": "Float",
				"insert_after": "custom_pcs_per_ctn",
				"read_only": 1,
				"allow_on_submit": 1,
			},
		],
	}
	create_custom_fields(custom_fields, update=True)
	frappe.clear_cache(doctype="Item")
	frappe.clear_cache(doctype="Delivery Note")
	frappe.clear_cache(doctype="Delivery Note Item")


def ensure_delivery_note_print_client_script():
	script_name = "Delivery Note Container Print Autofill"
	script = """
function otr_round(value, precision) {
  const p = Number.isFinite(precision) ? precision : 3;
  return flt(value, p);
}

function otr_update_ctn(cdt, cdn) {
  const row = locals[cdt] && locals[cdt][cdn];
  if (!row) return;
  const qty = flt(row.qty || 0);
  const pcsPerCtn = flt(row.custom_pcs_per_ctn || 0);
  const ctn = pcsPerCtn > 0 ? otr_round(qty / pcsPerCtn, 3) : 0;
  if (flt(row.custom_ctn || 0) !== ctn) {
    frappe.model.set_value(cdt, cdn, "custom_ctn", ctn);
  }
}

async function otr_fill_row_from_sales_order_item(row) {
  if (!row || !row.so_detail) return;
  if (row.custom_comments && row.custom_designcolor) return;
  try {
    const response = await frappe.db.get_value("Sales Order Item", row.so_detail, ["custom_comments", "custom_designcolor"]);
    const values = (response && response.message) || {};
    if (!row.custom_comments && values.custom_comments) {
      await frappe.model.set_value(row.doctype, row.name, "custom_comments", values.custom_comments);
    }
    if (!row.custom_designcolor && values.custom_designcolor) {
      await frappe.model.set_value(row.doctype, row.name, "custom_designcolor", values.custom_designcolor);
    }
  } catch (error) {
    console.warn("Failed to load Sales Order Item fields for Delivery Note print row", error);
  }
}

async function otr_fill_header_from_sales_order(frm) {
  if (frm.doc.custom_container_no && frm.doc.po_no) return;
  const salesOrders = [...new Set((frm.doc.items || []).map((row) => row.against_sales_order).filter(Boolean))];
  if (salesOrders.length !== 1) return;
  try {
    const response = await frappe.db.get_value("Sales Order", salesOrders[0], ["custom_container_no", "po_no"]);
    const values = (response && response.message) || {};
    if (!frm.doc.custom_container_no && values.custom_container_no) {
      await frm.set_value("custom_container_no", values.custom_container_no);
    }
    if (!frm.doc.po_no && values.po_no) {
      await frm.set_value("po_no", values.po_no);
    }
  } catch (error) {
    console.warn("Failed to load Sales Order header values for Delivery Note", error);
  }
}

async function otr_prepare_row(frm, cdt, cdn) {
  const row = locals[cdt] && locals[cdt][cdn];
  if (!row) return;
  otr_update_ctn(cdt, cdn);
  await otr_fill_row_from_sales_order_item(row);
  await otr_fill_header_from_sales_order(frm);
}

frappe.ui.form.on("Delivery Note", {
  refresh(frm) {
    otr_fill_header_from_sales_order(frm);
    (frm.doc.items || []).forEach((row) => {
      if (row && row.name) {
        otr_update_ctn(row.doctype, row.name);
      }
    });
  },
});

frappe.ui.form.on("Delivery Note Item", {
  item_code(frm, cdt, cdn) {
    otr_prepare_row(frm, cdt, cdn);
  },
  qty(frm, cdt, cdn) {
    otr_update_ctn(cdt, cdn);
  },
  custom_pcs_per_ctn(frm, cdt, cdn) {
    otr_update_ctn(cdt, cdn);
  },
  so_detail(frm, cdt, cdn) {
    otr_prepare_row(frm, cdt, cdn);
  },
  items_add(frm, cdt, cdn) {
    otr_prepare_row(frm, cdt, cdn);
  },
});
"""
	if frappe.db.exists("Client Script", script_name):
		doc = frappe.get_doc("Client Script", script_name)
		doc.update({"dt": "Delivery Note", "enabled": 1, "script": script})
		doc.save(ignore_permissions=True)
	else:
		frappe.get_doc(
			{
				"doctype": "Client Script",
				"name": script_name,
				"dt": "Delivery Note",
				"view": "Form",
				"enabled": 1,
				"script": script,
			}
		).insert(ignore_permissions=True)

	frappe.db.commit()


def create_or_update_delivery_note_print_format():
	html = """
<style>
  @page { size: A4 landscape; margin: 8mm; }
  .dncr-wrap { font-size: 11px; color: #000; font-family: Arial, sans-serif; }
  .dncr-header { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 0; }
  .dncr-header td, .dncr-header th { border: 2px solid #111827; padding: 6px 8px; vertical-align: middle; }
  .dncr-company-cell { border-bottom: 0; }
  .dncr-company-box { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 58px; }
  .dncr-company-name { font-size: 18px; font-weight: 800; text-align: center; flex: 1; }
  .dncr-logo { max-height: 46px; max-width: 72px; object-fit: contain; }
  .dncr-meta { font-size: 12px; font-weight: 700; text-align: center; line-height: 1.35; }
  .dncr-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .dncr-table th, .dncr-table td { border: 1.6px solid #111827; padding: 4px 6px; }
  .dncr-table th { font-size: 11px; font-weight: 800; text-align: center; background: #fff; }
  .dncr-table td { font-size: 10px; }
  .dncr-center { text-align: center; }
  .dncr-right { text-align: right; }
  .dncr-item { font-weight: 700; }
  .dncr-total-row td { font-weight: 800; background: #f3f4f6; }
  @media print {
    html, body { width: 297mm; }
  }
</style>

{% set company_doc = frappe.get_cached_doc("Company", doc.company) if doc.company else None %}
{% set company_logo = (company_doc.company_logo if company_doc and company_doc.company_logo else "") %}
{% set company_name = (company_doc.company_name if company_doc and company_doc.company_name else doc.company) %}

<div class="dncr-wrap">
  <table class="dncr-header">
    <tr>
      <td class="dncr-company-cell" colspan="3">
        <div class="dncr-company-box">
          <div style="width:72px;"></div>
          <div class="dncr-company-name">{{ company_name or "" }}</div>
          <div style="width:72px; text-align:right;">
            {% if company_logo %}
              <img src="{{ company_logo }}" class="dncr-logo">
            {% endif %}
          </div>
        </div>
      </td>
    </tr>
    <tr>
      <td class="dncr-meta" style="width:39%;">
        Delivery Note# {{ doc.name or "" }}
      </td>
      <td class="dncr-meta" style="width:36%;">
        Container No# {{ doc.custom_container_no or "" }}<br>
        PO# {{ doc.po_no or "" }}
      </td>
      <td class="dncr-meta" style="width:25%;">
        {{ frappe.utils.formatdate(doc.posting_date) if doc.posting_date else "" }}
      </td>
    </tr>
  </table>

  <table class="dncr-table">
    <thead>
      <tr>
        <th style="width:23%;">Item</th>
        <th style="width:16%;">Colour/Standard</th>
        <th style="width:8%;">Size</th>
        <th style="width:10%;">Numbering From</th>
        <th style="width:10%;">Numbering To</th>
        <th style="width:10%;">Pcs/CTN</th>
        <th style="width:10%;">CTN</th>
        <th style="width:13%;">Total Pcs</th>
      </tr>
    </thead>
    <tbody>
      {% set ns_total = namespace(ctn=0, pcs=0) %}
      {% for row in doc.items %}
        {% set attrs = frappe.db.sql("select attribute, attribute_value from `tabItem Variant Attribute` where parent=%s and ifnull(attribute_value, '') != ''", [row.item_code], as_dict=1) %}
        {% set ns = namespace(size="", color="") %}
        {% for a in attrs %}
          {% set key = (a.attribute or "").lower() %}
          {% if "size" in key %}
            {% set ns.size = a.attribute_value or ns.size %}
          {% elif ("design" in key and "color" in key) or "colour" in key or key == "color" %}
            {% set ns.color = a.attribute_value or ns.color %}
          {% endif %}
        {% endfor %}
        {% set pcs_per_ctn = (row.custom_pcs_per_ctn or frappe.db.get_value("Item", row.item_code, "custom_pcs_per_ctn") or 0) | float %}
        {% set ctn = (row.custom_ctn if row.custom_ctn is not none else ((row.qty or 0) / pcs_per_ctn if pcs_per_ctn else 0)) | float %}
        {% set total_pcs = (row.qty or 0) | float %}
        {# CHANGE ITEM TEXT HERE if you want Description instead of Comments. #}
        {# Current priority: custom_comments -> description -> comments -> item_name -> item_code #}
        {% set item_text = row.custom_comments or row.description or row.comments or row.item_name or row.item_code or "" %}
        {% set ns_total.ctn = ns_total.ctn + ctn %}
        {% set ns_total.pcs = ns_total.pcs + total_pcs %}
        <tr>
          <td class="dncr-item">{{ item_text }}</td>
          <td class="dncr-center">{{ row.custom_designcolor or ns.color or "" }}</td>
          <td class="dncr-center">{{ ns.size }}</td>
          <td class="dncr-center">{{ row.custom_carton_number_from or "" }}</td>
          <td class="dncr-center">{{ row.custom_carton_number_to or "" }}</td>
          <td class="dncr-center">{{ "{:,.0f}".format(pcs_per_ctn) if pcs_per_ctn else "" }}</td>
          <td class="dncr-right">{{ "{:,.3f}".format(ctn) if ctn else "" }}</td>
          <td class="dncr-right">{{ "{:,.0f}".format(total_pcs) if total_pcs == (total_pcs | int) else "{:,.2f}".format(total_pcs) }}</td>
        </tr>
      {% endfor %}
      <tr class="dncr-total-row">
        <td colspan="6"></td>
        <td class="dncr-right">{{ "{:,.3f}".format(ns_total.ctn) }}</td>
        <td class="dncr-right">{{ "{:,.0f}".format(ns_total.pcs) if ns_total.pcs == (ns_total.pcs | int) else "{:,.2f}".format(ns_total.pcs) }}</td>
      </tr>
    </tbody>
  </table>
</div>
"""

	existing = frappe.db.exists("Print Format", DELIVERY_NOTE_PRINT_FORMAT_NAME)
	if existing:
		doc = frappe.get_doc("Print Format", DELIVERY_NOTE_PRINT_FORMAT_NAME)
		doc.update(
			{
				"doc_type": "Delivery Note",
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
				"name": DELIVERY_NOTE_PRINT_FORMAT_NAME,
				"doc_type": "Delivery Note",
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
	return DELIVERY_NOTE_PRINT_FORMAT_NAME


def apply_sales_order_print_setup():
	ensure_sales_order_payment_detail_fields()
	ensure_sales_order_bank_account_client_script()
	return create_or_update_sales_order_print_format()


def apply_delivery_note_print_setup():
	ensure_delivery_note_print_fields()
	ensure_delivery_note_print_client_script()
	return create_or_update_delivery_note_print_format()


def apply_print_setup():
	apply_sales_order_print_setup()
	return apply_delivery_note_print_setup()
