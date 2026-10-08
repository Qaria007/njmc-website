import type { GlobalConfig } from 'payload'

import { signedIn } from './access.ts'

// One page with the money picture: received, paid, costs, what clients and suppliers still owe,
// profit per sale, and an Excel file for the accountant. Everything is read from Money in and out,
// the buyer documents and the purchase orders; nothing is stored here.
export const AccountsOverview: GlobalConfig = {
  slug: 'accounts-overview',
  label: 'Accounts overview',
  admin: { group: 'Accounts', description: 'Totals for a period, balances, profit per sale. Download the Excel for the accountant.' },
  access: { read: signedIn, update: () => false },
  fields: [{ name: 'view', type: 'ui', admin: { components: { Field: '/components/admin/AccountsPanel#AccountsPanel' } } }],
}
