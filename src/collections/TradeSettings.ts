import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { GlobalConfig, Payload, PayloadRequest } from 'payload'

import type { Rates } from '../lib/order-desk.ts'
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
    { name: 'logo', type: 'upload', relationTo: 'media', admin: { description: 'Optional. A PNG or JPG logo printed at the top of every document' } },
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
      type: 'row',
      fields: [
        { name: 'defaultMargin', type: 'number', min: 0, label: 'Usual markup on cost (%)', admin: { description: 'Selling price = cost + this %. Pre-filled when a proforma invoice is made from the supplier prices; you can change it per item' } },
        { name: 'cnyPerUsd', type: 'number', min: 0, label: 'Exchange rate: CNY for 1 USD', admin: { description: 'e.g. 7.10. Used to compare prices and for the accounts' } },
        { name: 'usdPerEur', type: 'number', min: 0, label: 'Exchange rate: USD for 1 EUR', admin: { description: 'e.g. 1.08' } },
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

type Settings = Record<string, string | null | undefined> & { logo?: { filename?: string | null } | number | null; defaultMargin?: number | null; cnyPerUsd?: number | null; usdPerEur?: number | null }

// The logo file from the public media folder, when it is a PNG or a JPG.
async function logoOf(g: Settings): Promise<Seller['logo']> {
  const name = g.logo && typeof g.logo === 'object' ? path.basename(String(g.logo.filename ?? '')) : ''
  const type = /\.png$/i.test(name) ? 'png' : /\.jpe?g$/i.test(name) ? 'jpg' : null
  if (!type) return null
  try {
    return { data: new Uint8Array(await readFile(path.resolve(process.env.MEDIA_DIR || 'media', name))), type }
  } catch {
    return null
  }
}

export async function loadSeller(payload: Payload, req?: PayloadRequest): Promise<Seller & { copyTo: string; supplierPaymentTerms: string; buyerPaymentTerms: string; documentsRequired: string; defaultMargin: number | null; rates: Rates }> {
  const g = (await payload.findGlobal({ slug: 'trade-settings', depth: 1, overrideAccess: true, req })) as unknown as Settings
  return {
    logo: await logoOf(g),
    defaultMargin: g.defaultMargin ?? null,
    rates: { cnyPerUsd: g.cnyPerUsd ?? null, usdPerEur: g.usdPerEur ?? null },
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
