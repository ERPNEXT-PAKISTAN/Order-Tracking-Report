(function () {
	const DATA_ENTRY_CONFIG = {
  "after_row_insert": "sales",
  "button_record_name": "Data Entry on Sales Order",
  "doctype": "Sales Order",
  "invalid_item_message": "Selected item is not marked as a sales item",
  "item_filter_field": "is_sales_item",
  "items_field": "items",
  "party_field": "customer",
  "party_label": "Customer",
  "party_options": "Customer",
  "party_required": true,
  "rate_field": "rate",
  "rate_label": "Rate",
  "refresh_trigger": "calculate_taxes_and_totals",
  "script_name": "Data Entry on Sales Order"
};
	const DOCTYPE = DATA_ENTRY_CONFIG.doctype;
	const BUTTON_LABEL = __('Data Entry');
	const DIALOG_TITLE = __('Data Entry');
	const RATE_PRECISION = 9;
	const AMT_PRECISION = 2;
	const QTY_PRECISION = 2;

	function makePartyField(frm) {
		if (!DATA_ENTRY_CONFIG.party_field) {
			return [];
		}

		return [{
			label: __(DATA_ENTRY_CONFIG.party_label),
			fieldname: DATA_ENTRY_CONFIG.party_field,
			fieldtype: 'Link',
			options: DATA_ENTRY_CONFIG.party_options,
			default: frm.doc[DATA_ENTRY_CONFIG.party_field] || '',
			reqd: DATA_ENTRY_CONFIG.party_required ? 1 : 0
		}];
	}

	function getDialogFields(frm) {
		const fields = [
			{ fieldname: 'header_html', fieldtype: 'HTML' },
			...makePartyField(frm),
			{ fieldtype: 'Section Break', label: __('Item Filters') },
			{
				label: __('Item Group'),
				fieldname: 'item_group',
				fieldtype: 'Link',
				options: 'Item Group'
			},
			{ fieldtype: 'Column Break' },
			{
				label: __('Variant Template'),
				fieldname: 'variant_of',
				fieldtype: 'Link',
				options: 'Item'
			},
			{ fieldtype: 'Section Break' },
			{ fieldname: 'variant_attributes_html', fieldtype: 'HTML' },
			{ fieldname: 'item_filter_status', fieldtype: 'HTML' },
						{ fieldtype: 'Section Break', label: __('Quick Add Item') },
						{
							label: __('Item Code'),
							fieldname: 'item_code',
							fieldtype: 'Autocomplete'
						},
						{ fieldtype: 'Section Break' },
						{ label: __('Qty'), fieldname: 'qty', fieldtype: 'Float' },
						{ fieldtype: 'Column Break' },
						{ label: __(DATA_ENTRY_CONFIG.rate_label), fieldname: 'rate', fieldtype: 'Currency' },
						{ fieldtype: 'Column Break' },
						{ label: __('Amount'), fieldname: 'amount', fieldtype: 'Currency' },
						{ fieldtype: 'Column Break' },
						{
							fieldtype: 'Button',
							label: __('Add Item (Enter)'),
							fieldname: 'add_item_btn'
						},
			{ fieldtype: 'Section Break', label: __('Items to Insert') },
			{
				fieldname: 'items_table',
				fieldtype: 'Table',
				cannot_add_rows: true,
				in_place_edit: true,
				data: [],
				fields: [
					{ fieldtype: 'Data', fieldname: 'item_code', label: __('Item'), in_list_view: 1, read_only: 1 },
					{ fieldtype: 'Data', fieldname: 'item_name', label: __('Name'), in_list_view: 1, read_only: 1 },
					{ fieldtype: 'Float', fieldname: 'qty', label: __('Qty'), in_list_view: 1 },
					{ fieldtype: 'Currency', fieldname: 'rate', label: __(DATA_ENTRY_CONFIG.rate_label), in_list_view: 1 },
					{ fieldtype: 'Currency', fieldname: 'amount', label: __('Amount'), in_list_view: 1 }
				]
			},
			{ fieldtype: 'Section Break' },
			{ fieldtype: 'Column Break' },
			{ label: __('Total Qty'), fieldname: 'total_qty', fieldtype: 'Float', read_only: 1 },
			{ label: __('Total Amount'), fieldname: 'total_amount', fieldtype: 'Currency', read_only: 1 }
		];

		if (!DATA_ENTRY_CONFIG.party_field) {
			fields.splice(1, 0, { fieldname: 'party_hint_html', fieldtype: 'HTML' });
		}

		return fields;
	}

	frappe.ui.form.on(DOCTYPE, {
		refresh(frm) {
			frm.add_custom_button(BUTTON_LABEL, function () {
				let items_data = [];
				let last_qty = null;
				let attribute_controls = [];
				let available_items = {};
				let item_attribute_map_cache = {};

				const dialog = new frappe.ui.Dialog({
					title: DIALOG_TITLE,
					size: 'extra-large',
					fields: getDialogFields(frm)
				});

				dialog.fields_dict.header_html.$wrapper.html(`
					<div style="display:flex;gap:12px;align-items:center;padding:12px;border-radius:14px;background:linear-gradient(135deg,#eef2ff,#f8fafc);border:1px solid #e0e7ff;margin-bottom:10px">
						<div style="width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:#4f46e5;color:#fff;font-size:18px">DE</div>
						<div style="flex:1">
							<div style="font-weight:900;font-size:16px">${frappe.utils.escape_html(__('Data Entry'))}</div>
							<div style="color:#6b7280;font-size:12px">${frappe.utils.escape_html(__('Use item filters, variant template, and attributes to load matching items quickly.'))}</div>
						</div>
						<div style="font-size:12px;color:#6b7280">${frappe.utils.escape_html(DOCTYPE)}: <b>${frappe.utils.escape_html(frm.doc.name || __('New'))}</b></div>
					</div>
				`);

				if (dialog.fields_dict.party_hint_html) {
					dialog.fields_dict.party_hint_html.$wrapper.html(
						'<div style="padding:6px 0 10px;color:#64748b;font-size:12px;">' +
						frappe.utils.escape_html(__('This screen does not require a customer or supplier for Data Entry.')) +
						'</div>'
					);
				}

				function set_if_changed(fieldname, value, precision) {
					const current = flt(dialog.get_value(fieldname));
					const new_val = flt(value, precision);
					if (current !== new_val) {
						dialog.set_value(fieldname, new_val);
					}
				}

				function get_selected_attribute_filters() {
					return attribute_controls
						.map(({ attribute, control }) => ({ attribute, value: control.get_value() }))
						.filter(d => d.value);
				}

				function update_filter_status(message, color) {
					const palette = {
						blue: { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
						green: { bg: '#ecfdf5', border: '#bbf7d0', text: '#047857' },
						orange: { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
						gray: { bg: '#f8fafc', border: '#e2e8f0', text: '#475569' }
					};
					const style = palette[color] || palette.gray;
					dialog.fields_dict.item_filter_status.$wrapper.html(`
						<div style="padding:8px 10px;border-radius:10px;border:1px solid ${style.border};background:${style.bg};color:${style.text};font-size:12px;margin-bottom:2px;">
							${frappe.utils.escape_html(message || '')}
						</div>
					`);
				}

				function set_item_code_options(items) {
					available_items = {};
					const item_codes = items.map(d => {
						available_items[d.name] = d;
						return d.name;
					});
					const item_control = dialog.fields_dict.item_code;
					if (typeof item_control.set_data === 'function') {
						item_control.set_data(item_codes);
					}
					dialog.set_df_property('item_code', 'options', [''].concat(item_codes).join('\n'));
					item_control.refresh();
				}

				async function get_item_attribute_map(item_code) {
					if (!item_code) {
						return {};
					}
					if (item_attribute_map_cache[item_code]) {
						return item_attribute_map_cache[item_code];
					}
					const item_doc = await frappe.db.get_doc('Item', item_code);
					const attribute_map = {};
					(item_doc.attributes || []).forEach(row => {
						if (row.attribute) {
							attribute_map[row.attribute] = row.attribute_value || '';
						}
					});
					item_attribute_map_cache[item_code] = attribute_map;
					return attribute_map;
				}

				async function get_matching_item_codes_by_attributes(filters, items) {
					const matched_codes = new Set();
					for (const item of items) {
						const attribute_map = await get_item_attribute_map(item.name);
						const matches = filters.every(filter => attribute_map[filter.attribute] === filter.value);
						if (matches) {
							matched_codes.add(item.name);
						}
					}
					return matched_codes;
				}

				async function get_template_attribute_options(variant_of, attributes) {
					const response = await frappe.call({
						method: 'frappe.client.get_list',
						args: {
							doctype: 'Item',
							fields: ['name'],
							filters: {
								disabled: 0,
								has_variants: 0,
								variant_of: variant_of,
								[DATA_ENTRY_CONFIG.item_filter_field]: 1
							},
							limit_page_length: 500,
							order_by: 'name asc'
						}
					});
					const option_map = {};
					attributes.forEach(attribute => {
						option_map[attribute] = new Set();
					});
					for (const item of (response.message || [])) {
						const attribute_map = await get_item_attribute_map(item.name);
						attributes.forEach(attribute => {
							if (attribute_map[attribute]) {
								option_map[attribute].add(attribute_map[attribute]);
							}
						});
					}
					const normalized = {};
					attributes.forEach(attribute => {
						normalized[attribute] = Array.from(option_map[attribute]).sort((left, right) => left.localeCompare(right));
					});
					return normalized;
				}

				async function load_filtered_items(preserve_selection) {
					const current_item_code = dialog.get_value('item_code');
					const item_group = dialog.get_value('item_group');
					const variant_of = dialog.get_value('variant_of');
					const attribute_filters = get_selected_attribute_filters();
					const filters = {
						disabled: 0,
						has_variants: 0
					};

					filters[DATA_ENTRY_CONFIG.item_filter_field] = 1;
					if (item_group) {
						filters.item_group = item_group;
					}
					if (variant_of) {
						filters.variant_of = variant_of;
					}

					update_filter_status(__('Loading matching items...'), 'blue');
					const response = await frappe.call({
						method: 'frappe.client.get_list',
						args: {
							doctype: 'Item',
							fields: ['name', 'item_name', 'item_group', 'variant_of'],
							filters,
							limit_page_length: variant_of || attribute_filters.length ? 500 : 200,
							order_by: 'name asc'
						}
					});
					let items = response.message || [];
					if (attribute_filters.length) {
						const matched_codes = await get_matching_item_codes_by_attributes(attribute_filters, items);
						items = items.filter(d => matched_codes.has(d.name));
					}
					set_item_code_options(items);
					if (preserve_selection && current_item_code && available_items[current_item_code]) {
						dialog.set_value('item_code', current_item_code);
					} else if (!available_items[current_item_code]) {
						dialog.set_value('item_code', '');
					}
					if (!item_group && !variant_of && !attribute_filters.length && items.length === 200) {
						update_filter_status(__('Showing the first 200 matching items. Use Item Group, Variant Template, or attributes to narrow the list.'), 'orange');
					} else if (items.length) {
						update_filter_status(__('Loaded {0} matching item(s).', [items.length]), 'green');
					} else {
						update_filter_status(__('No items match the current filters.'), 'orange');
					}
				}

				async function render_attribute_filters() {
					const wrapper = dialog.fields_dict.variant_attributes_html.$wrapper;
					const variant_of = dialog.get_value('variant_of');
					attribute_controls = [];
					wrapper.empty();
					if (!variant_of) {
						wrapper.html('<div style="padding:6px 0;color:#64748b;font-size:12px;">' + frappe.utils.escape_html(__('Select a variant template to enable attribute filters.')) + '</div>');
						return;
					}
					const template = await frappe.db.get_doc('Item', variant_of);
					const attributes = [...new Set((template.attributes || []).map(d => d.attribute).filter(Boolean))];
					if (!attributes.length) {
						wrapper.html('<div style="padding:6px 0;color:#64748b;font-size:12px;">' + frappe.utils.escape_html(__('This template does not have item-attribute based variants.')) + '</div>');
						return;
					}
					const template_attribute_options = await get_template_attribute_options(variant_of, attributes);
					wrapper.html(`
						<div style="font-size:12px;font-weight:700;color:#334155;margin:2px 0 8px;">${frappe.utils.escape_html(__('Variant Attributes'))}</div>
						<div class="data-entry-variant-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px"></div>
					`);
					const grid = wrapper.find('.data-entry-variant-grid');
					const attribute_docs = await Promise.all(attributes.map(attribute => frappe.db.get_doc('Item Attribute', attribute)));
					attribute_docs.forEach(doc => {
						const container = $('<div style="min-width:0"></div>').appendTo(grid);
						const values = template_attribute_options[doc.name] || [];
						const fallback_values = (doc.item_attribute_values || []).map(d => d.attribute_value);
						const options = [''].concat(values.length ? values : fallback_values);
						const control = frappe.ui.form.make_control({
							parent: container,
							df: {
								label: doc.name,
								fieldname: frappe.scrub(doc.name),
								fieldtype: 'Select',
								options: options.join('\n'),
								change: function () {
									load_filtered_items(true);
								}
							},
							render_input: true
						});
						control.refresh();
						attribute_controls.push({ attribute: doc.name, control });
					});
				}

				async function validate_selected_item(item_code) {
					if (!item_code) {
						return { valid: false, message: __('Select Item') };
					}
					const response = await frappe.db.get_value('Item', item_code, [
						'item_name',
						'item_group',
						'variant_of',
						'disabled',
						DATA_ENTRY_CONFIG.item_filter_field,
						'has_variants'
					]);
					const item = response && response.message;
					if (!item) {
						return { valid: false, message: __('Selected item was not found') };
					}
					if (cint(item.disabled)) {
						return { valid: false, message: __('Selected item is disabled') };
					}
					if (!cint(item[DATA_ENTRY_CONFIG.item_filter_field])) {
						return { valid: false, message: __(DATA_ENTRY_CONFIG.invalid_item_message) };
					}
					if (cint(item.has_variants)) {
						return { valid: false, message: __('Select an actual variant or item, not a template item') };
					}
					const selected_group = dialog.get_value('item_group');
					const selected_template = dialog.get_value('variant_of');
					if (selected_group && item.item_group !== selected_group) {
						return { valid: false, message: __('Item must belong to Item Group {0}', [selected_group]) };
					}
					if (selected_template && item.variant_of !== selected_template) {
						return { valid: false, message: __('Item must be a variant of {0}', [selected_template]) };
					}
					const attribute_filters = get_selected_attribute_filters();
					if (attribute_filters.length) {
						const attribute_map = await get_item_attribute_map(item_code);
						const mismatch = attribute_filters.find(d => attribute_map[d.attribute] !== d.value);
						if (mismatch) {
							return { valid: false, message: __('Item does not match {0}: {1}', [mismatch.attribute, mismatch.value]) };
						}
					}
					return {
						valid: true,
						item_name: item.item_name || (available_items[item_code] && available_items[item_code].item_name) || ''
					};
				}

				dialog.fields_dict.qty.df.onchange = function () {
					const qty = flt(dialog.get_value('qty'));
					const rate = flt(dialog.get_value('rate'));
					const amount = flt(dialog.get_value('amount'));
					if (qty && rate) {
						set_if_changed('amount', qty * rate, AMT_PRECISION);
					} else if (qty && amount) {
						set_if_changed('rate', amount / qty, RATE_PRECISION);
					}
				};

				dialog.fields_dict.rate.df.onchange = function () {
					const qty = flt(dialog.get_value('qty'));
					const rate = flt(dialog.get_value('rate'));
					if (qty && rate) {
						set_if_changed('amount', qty * rate, AMT_PRECISION);
					}
				};

				dialog.fields_dict.amount.df.onchange = function () {
					const qty = flt(dialog.get_value('qty'));
					const amount = flt(dialog.get_value('amount'));
					if (qty && amount) {
						set_if_changed('rate', amount / qty, RATE_PRECISION);
					}
				};

				dialog.fields_dict.variant_of.get_query = function () {
					const filters = {
						has_variants: 1,
						disabled: 0
					};
					const item_group = dialog.get_value('item_group');
					if (item_group) {
						filters.item_group = item_group;
					}
					return { filters };
				};

				dialog.fields_dict.item_group.df.onchange = async function () {
					const selected_group = dialog.get_value('item_group');
					const selected_template = dialog.get_value('variant_of');
					if (selected_group && selected_template) {
						const response = await frappe.db.get_value('Item', selected_template, 'item_group');
						if (response && response.message && response.message.item_group !== selected_group) {
							dialog.set_value('variant_of', '');
						}
					}
					await render_attribute_filters();
					await load_filtered_items(false);
				};

				dialog.fields_dict.variant_of.df.onchange = async function () {
					dialog.set_value('item_code', '');
					await render_attribute_filters();
					await load_filtered_items(false);
				};

				function update_totals() {
					let total_qty = 0;
					let total_amount = 0;
					items_data.forEach(d => {
						total_qty += flt(d.qty);
						total_amount += flt(d.amount);
					});
					dialog.set_value('total_qty', flt(total_qty, QTY_PRECISION));
					dialog.set_value('total_amount', flt(total_amount, AMT_PRECISION));
				}

				async function add_item() {
					const values = dialog.get_values();
					if (!values.item_code) {
						frappe.show_alert({ message: __('Select Item'), indicator: 'orange' });
						dialog.fields_dict.item_code.$input.focus();
						return;
					}
					const qty = flt(values.qty);
					let rate = flt(values.rate);
					let amount = flt(values.amount);
					if (!qty || qty <= 0) {
						frappe.msgprint(__('Qty must be greater than zero'));
						return;
					}
					if ((!rate || rate === 0) && amount && qty) {
						rate = flt(amount / qty, RATE_PRECISION);
					}
					if ((!amount || amount === 0) && rate && qty) {
						amount = flt(qty * rate, AMT_PRECISION);
					}
					if (!rate || !amount) {
						frappe.msgprint(__('Enter {0} or Amount', [DATA_ENTRY_CONFIG.rate_label]));
						return;
					}
					const item_check = await validate_selected_item(values.item_code);
					if (!item_check.valid) {
						frappe.msgprint(item_check.message);
						dialog.fields_dict.item_code.$input.focus();
						return;
					}
					const row = {
						item_code: values.item_code,
						item_name: item_check.item_name,
						qty: flt(qty, QTY_PRECISION),
						rate: flt(rate, RATE_PRECISION),
						amount: flt(amount, AMT_PRECISION)
					};
					items_data.push(row);
					dialog.fields_dict.items_table.df.data = items_data;
					dialog.fields_dict.items_table.grid.refresh();
					update_totals();
					dialog.set_value('item_code', '');
					dialog.set_value('qty', 1);
					dialog.set_value('rate', '');
					dialog.set_value('amount', '');
					setTimeout(() => dialog.fields_dict.item_code.$input.focus(), 50);
					frappe.show_alert({ message: __('Item Added'), indicator: 'green' }, 2);
				}

				async function add_item_to_document(row) {
					const child = frm.add_child(DATA_ENTRY_CONFIG.items_field);
					await frappe.model.set_value(child.doctype, child.name, 'item_code', row.item_code);
					await frm.script_manager.trigger('item_code', child.doctype, child.name);
					await frappe.model.set_value(child.doctype, child.name, 'qty', row.qty);
					await frm.script_manager.trigger('qty', child.doctype, child.name);
					await frappe.model.set_value(child.doctype, child.name, DATA_ENTRY_CONFIG.rate_field, row.rate);
					await frm.script_manager.trigger(DATA_ENTRY_CONFIG.rate_field, child.doctype, child.name);
					if (DATA_ENTRY_CONFIG.after_row_insert === 'stock_entry') {
						await frm.script_manager.trigger('conversion_factor', child.doctype, child.name);
					}
					return child;
				}

				dialog.fields_dict.add_item_btn.$input.on('click', add_item);

				dialog.$wrapper.on('keydown', function (e) {
					if (e.key === 'Enter') {
						const in_grid = $(e.target).closest('.grid').length > 0;
						const is_textarea = e.target && e.target.tagName === 'TEXTAREA';
						if (in_grid || is_textarea) {
							return;
						}
						e.preventDefault();
						add_item();
					}
				});

				dialog.set_primary_action(__('Insert Items'), async function () {
					const values = dialog.get_values();
					if (DATA_ENTRY_CONFIG.party_field && DATA_ENTRY_CONFIG.party_required && !values[DATA_ENTRY_CONFIG.party_field]) {
						frappe.msgprint(__('{0} required', [__(DATA_ENTRY_CONFIG.party_label)]));
						return;
					}
					if (!items_data.length) {
						frappe.msgprint(__('Add at least one item'));
						return;
					}
					if (DATA_ENTRY_CONFIG.party_field && values[DATA_ENTRY_CONFIG.party_field]) {
						await frm.set_value(DATA_ENTRY_CONFIG.party_field, values[DATA_ENTRY_CONFIG.party_field]);
					}
					for (const row of items_data) {
						await add_item_to_document(row);
					}
					frm.refresh_field(DATA_ENTRY_CONFIG.items_field);
					if (DATA_ENTRY_CONFIG.refresh_trigger) {
						await frm.trigger(DATA_ENTRY_CONFIG.refresh_trigger);
					}
					frappe.show_alert({ message: __('Items inserted'), indicator: 'green' }, 4);
					dialog.hide();
				});

				dialog.show();
				dialog.$wrapper.find('.modal-dialog').css('max-width', '1120px');
				dialog.$wrapper.find('.modal-content').css({ 'max-height': 'calc(100vh - 40px)', 'display': 'flex', 'flex-direction': 'column' });
				dialog.$wrapper.find('.modal-body').css({ 'overflow-y': 'auto', 'max-height': 'calc(100vh - 180px)', 'padding-bottom': '12px' });
				dialog.$wrapper.find('[data-fieldname="item_code"]').closest('.frappe-control').css('margin-bottom', '6px');
				dialog.$wrapper.find('[data-fieldname="qty"]').closest('.form-column').css('width', '17%');
				dialog.$wrapper.find('[data-fieldname="rate"]').closest('.form-column').css('width', '22%');
				dialog.$wrapper.find('[data-fieldname="amount"]').closest('.form-column').css('width', '22%');
				dialog.$wrapper.find('[data-fieldname="add_item_btn"]').closest('.form-column').css({ 'width': '17%', 'display': 'flex', 'align-items': 'flex-end' });
				dialog.$wrapper.find('[data-fieldname="add_item_btn"]').closest('.frappe-control').css({ 'margin-top': '24px', 'width': '100%' });
				dialog.fields_dict.add_item_btn.$input.css({ 'width': '100%', 'background': '#e8f5e9', 'border': '1px solid #b7dfbe', 'color': '#256029', 'font-weight': '600' });
				update_filter_status(__('Choose an item group or variant template to narrow item codes.'), 'gray');
				setTimeout(async () => {
					dialog.set_value('qty', 1);
					if (dialog.fields_dict.item_code.$input) {
						dialog.fields_dict.item_code.$input.attr('placeholder', __('Start typing item code after applying filters'));
					}
					await render_attribute_filters();
					await load_filtered_items(false);
					dialog.fields_dict.item_code.$input.focus();
				}, 200);
			}).addClass('btn-primary');
		}
	});
})();
