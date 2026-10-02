import type { CollectionBeforeChangeHook, CollectionConfig, PayloadHandler, PayloadRequest } from 'payload'

import { type BuyerDoc, buyerDocGaps, buyerDocSpec, type BuyerDocType, type BuyerItem, safeFileName } from '../lib/trade-docs.ts'
import { renderPdf } from '../lib/trade-pdf.ts'
import { signedIn } from './access.ts'
import { CURRENCIES, INCOTERMS, nextNumber } from './SupplierOrders.ts'
import { loadSeller } from './TradeSettings.ts'

type AnyDoc = Record<string, unknown> & { id: number | string }
const s = (v: unknown) => (v == null ? '' : String(v))
const day = (v: unknown) => s(v).slice(0, 10)
const admin = (req: PayloadRequest) => req.user?.collection === 'users'
const TYPES: BuyerDocType[] = ['pi', 'invoice', 'packing-list']

function toDoc(d: AnyDoc): BuyerDoc {
  return {
    piNumber: s(d.piNumber), piDate: day(d.piDate), invoiceNumber: s(d.invoiceNumber), invoiceDate: day(d.invoiceDate),
    buyerName: s(d.buyerName), buyerAddress: s(d.buyerAddress), buyerCountry: s(d.buyerCountry), buyerContact: s(d.buyerContact),
    consignee: s(d.consignee), notifyParty: s(d.notifyParty), buyerReference: s(d.buyerReference),
    items: ((d.items as BuyerItem[]) ?? []).map((i) => ({ ...i })),
    currency: s(d.currency), incoterm: s(d.incoterm), incotermPlace: s(d.incotermPlace), paymentTerms: s(d.paymentTerms),
    portOfLoading: s(d.portOfLoading), portOfDischarge: s(d.portOfDischarge), shipmentBy: s(d.shipmentBy), deliveryTime: s(d.deliveryTime),
    validity: day(d.validity), vessel: s(d.vessel), blNumber: s(d.blNumber), shippingMarks: s(d.shippingMarks),
    freight: d.freight as number | null, insurance: d.insurance as number | null, discount: d.discount as number | null, remarks: s(d.remarks),
  }
}

const numbers: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (operation === 'create' || !s(data.piNumber ?? originalDoc?.piNumber)) data.piNumber = s(data.piNumber) || (await nextNumber(req.payload, 'buyer-documents', 'piNumber', 'PI', req))
  // The invoice number is given when the invoice date is first filled in, so a proforma that never
  // ships does not use up an invoice number.
  const invoiceNumber = s(operation === 'create' ? data.invoiceNumber : (data.invoiceNumber ?? originalDoc?.invoiceNumber))
  if (!invoiceNumber && (data.invoiceDate ?? originalDoc?.invoiceDate)) data.invoiceNumber = await nextNumber(req.payload, 'buyer-documents', 'invoiceNumber', 'INV', req)
  if (data.invoiceNumber === '') data.invoiceNumber = null
  if (!data.piDate && !originalDoc?.piDate) data.piDate = new Date().toISOString()
  return data
}

// GET /api/buyer-documents/:id/pdf/pi | invoice | packing-list
const pdfEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const type = s(req.routeParams?.type) as BuyerDocType
  if (!TYPES.includes(type)) return Response.json({ error: 'Unknown document' }, { status: 404 })
  const doc = (await req.payload.findByID({ collection: 'buyer-documents', id: s(req.routeParams?.id), depth: 0, overrideAccess: true, req })) as unknown as AnyDoc
  const spec = buyerDocSpec(toDoc(doc), await loadSeller(req.payload, req), type)
  return new Response(Buffer.from(await renderPdf(spec)), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${safeFileName(spec.fileName)}"`, 'Cache-Control': 'no-store' },
  })
}

const checkEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const doc = (await req.payload.findByID({ collection: 'buyer-documents', id: s(req.routeParams?.id), depth: 0, overrideAccess: true, req })) as unknown as AnyDoc
  const seller = await loadSeller(req.payload, req)
  const d = toDoc(doc)
  return Response.json({ gaps: Object.fromEntries(TYPES.map((t) => [t, buyerDocGaps(d, seller, t)])) })
}

// One record per sale to a buyer: it prints the proforma invoice, the commercial invoice and the
// packing list from the same items. Private: buyer names and prices.
export const BuyerDocuments: CollectionConfig = {
  slug: 'buyer-documents',
  labels: { singular: 'Buyer documents (PI, invoice, packing list)', plural: 'Buyer documents (PI, invoice, packing list)' },
  admin: {
    group: 'Orders',
    useAsTitle: 'piNumber',
    defaultColumns: ['piNumber', 'buyerName', 'status', 'piDate'],
    description: 'Fill in the buyer, the items and the prices once. The proforma invoice, the invoice and the packing list are printed from the same record.',
  },
  access: { read: signedIn, create: signedIn, update: signedIn, delete: () => false },
  hooks: { beforeChange: [numbers] },
  endpoints: [
    { path: '/:id/pdf/:type', method: 'get', handler: pdfEndpoint },
    { path: '/:id/check', method: 'get', handler: checkEndpoint },
  ],
  timestamps: true,
  fields: [
    { name: 'actions', type: 'ui', admin: { components: { Field: '/components/admin/BuyerDocActions#BuyerDocActions' } } },
    {
      type: 'row',
      fields: [
        { name: 'piNumber', type: 'text', label: 'PI no.', unique: true, index: true, admin: { description: 'Given automatically; you can change it' } },
        { name: 'piDate', type: 'date', label: 'PI date', admin: { date: { displayFormat: 'yyyy-MM-dd' } } },
        { name: 'validity', type: 'date', label: 'PI valid until', admin: { date: { displayFormat: 'yyyy-MM-dd' } } },
        {
          name: 'status', type: 'select', defaultValue: 'draft',
          options: ['draft', 'PI sent', 'paid', 'shipped', 'closed', 'cancelled'].map((v) => ({ label: v, value: v })),
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'invoiceNumber', type: 'text', label: 'Invoice no.', unique: true, index: true, admin: { description: 'Given automatically when you fill in the invoice date. Also printed on the packing list' } },
        { name: 'invoiceDate', type: 'date', label: 'Invoice date', admin: { date: { displayFormat: 'yyyy-MM-dd' }, description: 'Fill in when the goods ship' } },
        { name: 'buyerReference', type: 'text', label: "Buyer's order reference" },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'buyerName', type: 'text', required: true, label: 'Buyer (company)' },
        { name: 'buyerCountry', type: 'text', label: 'Country' },
        { name: 'buyerContact', type: 'text', label: 'Contact person' },
      ],
    },
    { name: 'buyerAddress', type: 'textarea', label: 'Buyer address', admin: { rows: 3 } },
    {
      type: 'row',
      fields: [
        { name: 'consignee', type: 'textarea', admin: { rows: 3, description: 'Only if different from the buyer' } },
        { name: 'notifyParty', type: 'textarea', admin: { rows: 3 } },
      ],
    },
    {
      name: 'items', type: 'array', labels: { singular: 'Item', plural: 'Items' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'description', type: 'text', required: true, label: 'Description of goods' },
            { name: 'spec', type: 'text', label: 'Grade / specification' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'quantity', type: 'number', min: 0 },
            { name: 'unit', type: 'text', defaultValue: 'kg' },
            { name: 'unitPrice', type: 'number', min: 0, label: 'Unit price (selling)' },
            { name: 'hsCode', type: 'text', label: 'HS code' },
            { name: 'origin', type: 'text', defaultValue: 'China' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'packages', type: 'number', min: 0, label: 'Number of packages', admin: { description: 'Packing list' } },
            { name: 'packageType', type: 'text', label: 'Package', admin: { description: 'e.g. 25 kg fibre drums' } },
            { name: 'netWeight', type: 'number', min: 0, label: 'Net weight (kg)' },
            { name: 'grossWeight', type: 'number', min: 0, label: 'Gross weight (kg)' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'batchNo', type: 'text', label: 'Batch no.' },
            { name: 'mfgDate', type: 'text', label: 'Manufacturing date' },
            { name: 'expDate', type: 'text', label: 'Expiry date' },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'currency', type: 'select', defaultValue: 'USD', options: CURRENCIES.map((v) => ({ label: v, value: v })) },
        { name: 'incoterm', type: 'select', label: 'Price basis', options: INCOTERMS.map((v) => ({ label: v, value: v })) },
        { name: 'incotermPlace', type: 'text', label: 'Port or place', admin: { description: 'e.g. Aden' } },
        { name: 'paymentTerms', type: 'text', admin: { description: 'e.g. 100% T/T in advance' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'freight', type: 'number', min: 0, admin: { description: 'Only if shown separately' } },
        { name: 'insurance', type: 'number', min: 0 },
        { name: 'discount', type: 'number', min: 0 },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'portOfLoading', type: 'text' },
        { name: 'portOfDischarge', type: 'text' },
        { name: 'shipmentBy', type: 'select', label: 'Shipment by', options: ['Sea', 'Air', 'Courier', 'Land'].map((v) => ({ label: v, value: v })) },
        { name: 'deliveryTime', type: 'text', admin: { description: 'e.g. 30 days after payment' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'vessel', type: 'text', label: 'Vessel / flight', admin: { description: 'Invoice and packing list' } },
        { name: 'blNumber', type: 'text', label: 'B/L or AWB no.' },
      ],
    },
    { name: 'shippingMarks', type: 'textarea', admin: { rows: 3 } },
    { name: 'remarks', type: 'textarea', label: 'Remarks printed on the documents', admin: { rows: 3 } },
    { name: 'order', type: 'relationship', relationTo: 'order-matches', label: 'Customer order', admin: { description: 'For our records only' } },
    { name: 'internalNotes', type: 'textarea', label: 'Internal notes (never printed)' },
  ],
}
