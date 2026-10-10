import * as migration_20260927_083718_initial from './20260927_083718_initial';
import * as migration_20260927_111243_leads from './20260927_111243_leads';
import * as migration_20260928_083733_catalogue from './20260928_083733_catalogue';
import * as migration_20260930_084117_order_matching from './20260930_084117_order_matching';
import * as migration_20260930_123456_product_categories from './20260930_123456_product_categories';
import * as migration_20261001_063312_supplier_contacts from './20261001_063312_supplier_contacts';
import * as migration_20261002_173307_trade_documents from './20261002_173307_trade_documents';
import * as migration_20261008_125945_order_desk from './20261008_125945_order_desk';
import * as migration_20261008_134614_rates_ai_mode from './20261008_134614_rates_ai_mode';
import * as migration_20261008_170534_phase_a from './20261008_170534_phase_a';
import * as migration_20261009_022940_phase_b from './20261009_022940_phase_b';
import * as migration_20261009_023151_phase_b_coa from './20261009_023151_phase_b_coa';
import * as migration_20261009_023800_roles_activity from './20261009_023800_roles_activity';
import * as migration_20261009_024034_portal from './20261009_024034_portal';
import * as migration_20261010_042902_our_companies_certificates from './20261010_042902_our_companies_certificates';

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
    name: '20261008_134614_rates_ai_mode',
  },
  {
    up: migration_20261008_170534_phase_a.up,
    down: migration_20261008_170534_phase_a.down,
    name: '20261008_170534_phase_a',
  },
  {
    up: migration_20261009_022940_phase_b.up,
    down: migration_20261009_022940_phase_b.down,
    name: '20261009_022940_phase_b',
  },
  {
    up: migration_20261009_023151_phase_b_coa.up,
    down: migration_20261009_023151_phase_b_coa.down,
    name: '20261009_023151_phase_b_coa',
  },
  {
    up: migration_20261009_023800_roles_activity.up,
    down: migration_20261009_023800_roles_activity.down,
    name: '20261009_023800_roles_activity',
  },
  {
    up: migration_20261009_024034_portal.up,
    down: migration_20261009_024034_portal.down,
    name: '20261009_024034_portal',
  },
  {
    up: migration_20261010_042902_our_companies_certificates.up,
    down: migration_20261010_042902_our_companies_certificates.down,
    name: '20261010_042902_our_companies_certificates'
  },
];
