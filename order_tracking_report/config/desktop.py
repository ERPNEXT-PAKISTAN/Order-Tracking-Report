from frappe import _


def get_data():
    return [
        {
            "module_name": "Order Tracking Report",
            "category": "Modules",
            "label": _("Order Tracking Report"),
            "color": "blue",
            "icon": "octicon octicon-graph",
            "type": "module",
            "description": _("Order tracking dashboards and reports"),
        }
    ]

