import type { GlobalConfig, Payload, PayloadRequest } from 'payload'

import type { Seller } from '../lib/trade-docs.ts'
import { signedIn } from './access.ts'

// Company details printed on enquiries, purchase orders, proforma invoices, invoices and packing
// lists, and used to sign the emails to suppliers. Private: bank details live here.
export const TradeSettings: GlobalConfig = {
  slug: 'trade-settings',
  label: 'Company details for documents',
  admin: { group: 'Orders', description: 'Printed on every enquiry, purchase order, proforma invoice, invoice and packing list. Fill in once.' },
  access: { read: signedIn, update: signedIn },
  fields: [
    { name: 'companyName', type: 'text', required: true, defaultValue: 'NJMC Medical Supplies Co., Ltd', admin: { description: 'The legal name of the company that buys and sells' } },
    { name: 'address', type: 'textarea', defaultValue: 'Jianye District, Nanjing, Jiangsu, China', admin: { description: 'Full registered address, as on the business licence' } },
    {
      type: 'row',
      fields: [
        { name: 'phone', type: 'text', defaultValue: '+86 132 4453 6191' },
        { name: 'email', type: 'text', defaultValue: 'sale@njmcmedicsupp.com', admin: { description: 'Suppliers reply to this address' } },
        { name: 'website', type: 'text', defaultValue: 'njmcmedicsupp.com' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'signatoryName', type: 'text', label: 'Signed by (name)' },
        { name: 'signatoryTitle', type: 'text', label: 'Title' },
      ],
    },
    { name: 'copyTo', type: 'text', label: 'Send me a copy of every supplier message at', admin: { description: 'One or more email addresses. Leave empty for no copy.' } },
    { name: 'bankDetails', type: 'textarea', admin: { rows: 6, description: 'Printed on the proforma invoice and the invoice: beneficiary, bank, account number, SWIFT, bank address' } },
    {
      type: 'row',
      fields: [
        { name: 'supplierPaymentTerms', type: 'text', label: 'Usual payment terms to suppliers', admin: { description: 'Pre-filled on new purchase orders' } },
        { name: 'buyerPaymentTerms', type: 'text', label: 'Usual payment terms for buyers', admin: { description: 'Pre-filled on new proforma invoices' } },
      ],
    },
    {
      name: 'documentsRequired',
      type: 'textarea',
      label: 'Documents required from the supplier',
      defaultValue: 'Certificate of analysis for each batch\nMSDS\nCommercial invoice and packing list\nCertificate of origin if requested',
      admin: { description: 'Pre-filled on new purchase orders' },
    },
  ],
}

type Settings = Record<string, string | null | undefined>

export async function loadSeller(payload: Payload, req?: PayloadRequest): Promise<Seller & { copyTo: string; supplierPaymentTerms: string; buyerPaymentTerms: string; documentsRequired: string }> {
  const g = (await payload.findGlobal({ slug: 'trade-settings', depth: 0, overrideAccess: true, req })) as unknown as Settings
  return {
    companyName: g.companyName || 'NJMC Medical Supplies Co., Ltd',
    address: g.address,
    phone: g.phone,
    email: g.email || 'sale@njmcmedicsupp.com',
    website: g.website,
    signatoryName: g.signatoryName,
    signatoryTitle: g.signatoryTitle,
    bankDetails: g.bankDetails,
    copyTo: g.copyTo || '',
    supplierPaymentTerms: g.supplierPaymentTerms || '',
    buyerPaymentTerms: g.buyerPaymentTerms || '',
    documentsRequired: g.documentsRequired || '',
  }
}
