import frappe


def apply_so_detail_status_from_tmp():
	with open("/tmp/so_detail_status.js", encoding="utf-8") as f:
		js_script = f.read()
	with open("/tmp/so_detail_status.py", encoding="utf-8") as f:
		py_script = f.read()

	client = frappe.get_doc("Client Script", "Sales Order Detail Status")
	client.script = js_script
	client.enabled = 1
	client.save(ignore_permissions=True)

	server = frappe.get_doc("Server Script", "Sales Order Detail Status")
	server.script = py_script
	server.disabled = 0
	server.save(ignore_permissions=True)

	frappe.db.commit()
	return {"client_len": len(js_script), "server_len": len(py_script)}
