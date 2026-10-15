import type { CollectionConfig } from 'payload'

import { signedIn } from './access.ts'

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
