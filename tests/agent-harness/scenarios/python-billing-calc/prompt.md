The billing system is producing incorrect invoices. A customer on the starter plan with moderate usage across storage, API calls, bandwidth, and compute is being billed $48.00 when they should be billed $158.00. The API calls line item is completely missing from the invoice, and the storage charge looks too low.

The main files are `billing.py` (invoice generation), `pricing.py` (tier lookup and charges), `usage.py` (usage aggregation), and `models.py` (data structures). Run `python3 -m pytest test_billing.py -v` to see the failing tests.
