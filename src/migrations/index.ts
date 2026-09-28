import * as migration_20260927_083718_initial from './20260927_083718_initial';
import * as migration_20260927_111243_leads from './20260927_111243_leads';
import * as migration_20260928_083733_catalogue from './20260928_083733_catalogue';

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
    name: '20260928_083733_catalogue'
  },
];
