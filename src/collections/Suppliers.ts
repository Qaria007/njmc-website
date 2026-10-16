import type { CollectionAfterChangeHook, CollectionConfig } from 'payload'

import { networkEnabled, networkShare, signalSupplier } from '../lib/network-client.ts'
import { signedIn } from './access.ts'

// Company installations: a supplier switched to "share with the network" goes to NJMC's database
// once (public facts only), and a problem written on a network supplier is reported as a signal.
const networkHooks: CollectionAfterChangeHook = async ({ doc, previousDoc, req, context }) => {
  if (!networkEnabled() || context.networkDone) return doc
  const problemsNew = String(doc.problems ?? '').trim() && !String(previousDoc?.problems ?? '').trim()
  if (problemsNew && doc.networkRef) signalSupplier(req.payload, doc.id, 'problem')
  if (doc.shareWithNetwork && !doc.sharedAt && !doc.networkRef) {
    try {
      const r = await networkShare({ name: String(doc.name), nameLocal: String(doc.nameLocal ?? ''), country: String(doc.country), city: String(doc.city ?? ''), website: String(doc.website ?? ''), supplies: (doc.supplies as string[]) ?? [], notes: '' })
      await req.payload.update({
        collection: 'suppliers', id: doc.id, depth: 0, overrideAccess: true, req, context: { networkDone: true },
        data: { sharedAt: new Date().toISOString(), shareNote: `Shared. ${r.sharesThisMonth} supplier${r.sharesThisMonth === 1 ? '' : 's'} shared this month (the bonus counts only for suppliers the network did not have).` } as never,
      })
    } catch (err) {
      await req.payload.update({ collection: 'suppliers', id: doc.id, depth: 0, overrideAccess: true, req, context: { networkDone: true }, data: { shareWithNetwork: false, shareNote: `Not shared: ${(err as Error).message}` } as never }).catch(() => null)
    }
  }
  return doc
}

// Manufacturers NJMC sources from. Private: docs/02 "Confidentiality" forbids publishing any
// supplier name, so nothing here is readable without an admin login.
export const Suppliers: CollectionConfig = {
  slug: 'suppliers',
  admin: {
    useAsTitle: 'name',
    group: 'Suppliers',
    defaultColumns: ['name', 'category', 'country', 'city', 'status'],
    listSearchableFields: ['name', 'nameLocal', 'city', 'notes'],
  },
  access: { read: signedIn, create: signedIn, update: signedIn, delete: () => false },
  hooks: { afterChange: [networkHooks] },
  timestamps: true,
  fields: [
    { name: 'scorecard', type: 'ui', admin: { components: { Field: '/components/admin/SupplierScore#SupplierScore' } } },
    { name: 'name', type: 'text', required: true, unique: true },
    { name: 'nameLocal', type: 'text', label: 'Name in local language' },
    {
      type: 'row',
      fields: [
        { name: 'country', type: 'text', required: true },
        { name: 'city', type: 'text' },
      ],
    },
    { name: 'address', type: 'textarea' },
    {
      type: 'row',
      fields: [
        { name: 'website', type: 'text' },
        { name: 'email', type: 'text' },
        { name: 'phone', type: 'text' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'contactPerson', type: 'text', label: 'Contact person', admin: { description: 'Name and title, e.g. from the business card' } },
        { name: 'wechat', type: 'text', label: 'WeChat / WhatsApp' },
      ],
    },
    {
      name: 'category',
      type: 'select',
      hasMany: true,
      index: true,
      admin: { description: 'What kind of supplier this is. Set from their product range; a supplier can be in more than one.' },
      options: [
        { label: 'Pharmaceutical ingredients and packaging', value: 'pharma' },
        { label: 'Imaging and radiology', value: 'imaging' },
        { label: 'Patient monitoring and diagnostics', value: 'monitoring' },
        { label: 'Anaesthesia, respiratory and life support', value: 'life-support' },
        { label: 'Surgical instruments and equipment', value: 'surgical' },
        { label: 'Operating room equipment', value: 'or-equipment' },
        { label: 'Medical consumables and disposables', value: 'consumables' },
        { label: 'Injection, infusion and catheters', value: 'infusion' },
        { label: 'Wound care, dressings and bandages', value: 'wound-care' },
        { label: 'Laboratory and IVD', value: 'laboratory' },
        { label: 'Sterilization and infection control', value: 'sterilization' },
        { label: 'Hospital furniture and patient transport', value: 'furniture' },
        { label: 'Rehabilitation, physiotherapy and home care', value: 'rehabilitation' },
        { label: 'Orthopaedic implants and supports', value: 'orthopaedic' },
        { label: 'Cardiovascular and interventional', value: 'cardiovascular' },
        { label: 'Dental', value: 'dental' },
        { label: 'Ophthalmic and optical', value: 'ophthalmic' },
        { label: 'ENT, neurology and other specialties', value: 'specialties' },
        { label: 'Medical aesthetics', value: 'aesthetics' },
        { label: 'Traditional Chinese medicine', value: 'tcm' },
        { label: 'Components, materials and OEM manufacturing', value: 'components' },
        { label: 'Hospital construction, cleanroom and gas systems', value: 'hospital-build' },
        { label: 'Software, IT, training and services', value: 'services' },
        { label: 'Emergency, ambulance and first aid', value: 'emergency' },
        { label: 'Veterinary', value: 'veterinary' },
        { label: 'Nutrition and health food', value: 'nutrition' },
      ],
    },
    {
      name: 'supplies',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'APIs', value: 'api' },
        { label: 'Intermediates', value: 'intermediate' },
        { label: 'Excipients', value: 'excipient' },
        { label: 'Colours', value: 'colour' },
        { label: 'Medical devices', value: 'device' },
        { label: 'Medical consumables', value: 'consumable' },
        { label: 'Other', value: 'other' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'new',
      options: [
        { label: 'New (documents received)', value: 'new' },
        { label: 'Contacted', value: 'contacted' },
        { label: 'Samples', value: 'samples' },
        { label: 'Qualified', value: 'qualified' },
        { label: 'Approved', value: 'approved' },
        { label: 'On hold', value: 'on-hold' },
        { label: 'Rejected', value: 'rejected' },
      ],
    },
    { name: 'source', type: 'text', admin: { description: 'Where we met them, e.g. CPHI Shanghai 2026' } },
    { name: 'documentsFolder', type: 'text', admin: { description: 'Link to the Drive folder or files' } },
    {
      type: 'row',
      fields: [
        {
          name: 'rating', type: 'select', label: 'Our rating',
          options: [
            { label: '5 Excellent', value: '5' }, { label: '4 Good', value: '4' }, { label: '3 Acceptable', value: '3' }, { label: '2 Problems', value: '2' }, { label: '1 Do not use', value: '1' },
          ],
        },
      ],
    },
    { name: 'problems', type: 'textarea', label: 'Problems with this supplier (quality, delays, documents)', admin: { rows: 3 } },
    { name: 'notes', type: 'textarea' },
    {
      type: 'collapsible',
      label: 'Supplier network',
      admin: { initCollapsed: true, hidden: !networkEnabled() },
      fields: [
        {
          name: 'shareWithNetwork', type: 'checkbox', defaultValue: false, label: 'Share this supplier with the network',
          admin: { description: 'Sends the name, country, website and what they make to the network, once. Never your prices, contacts or orders. Each shared supplier gives you 2 extra product searches this month. A supplier that came from the network cannot be shared back.' },
        },
        { type: 'row', fields: [
          { name: 'sharedAt', type: 'date', label: 'Shared on', access: { create: () => false, update: () => false }, admin: { readOnly: true } },
          { name: 'shareNote', type: 'text', label: 'Result', access: { create: () => false, update: () => false }, admin: { readOnly: true } },
        ] },
      ],
    },
    // Set when the supplier came from the network: lets the network learn how they behave with us.
    { name: 'networkRef', type: 'text', index: true, admin: { hidden: true }, access: { create: () => false, update: () => false } },
    {
      type: 'collapsible',
      label: 'Enquiries, purchase orders, payments and documents',
      admin: { initCollapsed: true },
      fields: [
        { name: 'orders', type: 'join', collection: 'supplier-orders', on: 'supplier', admin: { defaultColumns: ['number', 'kind', 'status', 'sentAt'] } },
        { name: 'payments', type: 'join', collection: 'payments', on: 'supplier', admin: { defaultColumns: ['date', 'amount', 'currency', 'reference'] } },
        { name: 'documents', type: 'join', collection: 'trade-files', on: 'supplier', admin: { defaultColumns: ['filename', 'kind', 'date', 'title'] } },
      ],
    },
  ],
}
