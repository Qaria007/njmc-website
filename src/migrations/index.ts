import * as migration_20260927_083718_initial from './20260927_083718_initial';
import * as migration_20260927_111243_leads from './20260927_111243_leads';
import * as migration_20260928_083733_catalogue from './20260928_083733_catalogue';
import * as migration_20260930_084117_order_matching from './20260930_084117_order_matching';
import * as migration_20260930_123456_product_categories from './20260930_123456_product_categories';
import * as migration_20261001_063312_supplier_contacts from './20261001_063312_supplier_contacts';
import * as migration_20261002_173307_trade_documents from './20261002_173307_trade_documents';
import * as migration_20261008_125945_order_desk from './20261008_125945_order_desk';
import * as migration_20261008_134614_rates_ai_mode from './20261008_134614_rates_ai_mode';

export const migrations = [
  {
    up: migration_20260927_083718_initial.up,
    down: migration_20260927_083718_initial.down,
    name: '20260927_083718_initial',
  },
  {
    up: migration_20260927_111243_leads.up,
    down: migration_20260927_111243_leads.down,
    name: '20260927_111243_leads',
  },
  {
    up: migration_20260928_083733_catalogue.up,
    down: migration_20260928_083733_catalogue.down,
    name: '20260928_083733_catalogue',
  },
  {
    up: migration_20260930_084117_order_matching.up,
    down: migration_20260930_084117_order_matching.down,
    name: '20260930_084117_order_matching',
  },
  {
    up: migration_20260930_123456_product_categories.up,
    down: migration_20260930_123456_product_categories.down,
    name: '20260930_123456_product_categories',
  },
  {
    up: migration_20261001_063312_supplier_contacts.up,
    down: migration_20261001_063312_supplier_contacts.down,
    name: '20261001_063312_supplier_contacts',
  },
  {
    up: migration_20261002_173307_trade_documents.up,
    down: migration_20261002_173307_trade_documents.down,
    name: '20261002_173307_trade_documents',
  },
  {
    up: migration_20261008_125945_order_desk.up,
    down: migration_20261008_125945_order_desk.down,
    name: '20261008_125945_order_desk',
  },
  {
    up: migration_20261008_134614_rates_ai_mode.up,
    down: migration_20261008_134614_rates_ai_mode.down,
    name: '20261008_134614_rates_ai_mode'
  },
];
