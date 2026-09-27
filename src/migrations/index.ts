import * as migration_20260927_083718_initial from './20260927_083718_initial';

export const migrations = [
  {
    up: migration_20260927_083718_initial.up,
    down: migration_20260927_083718_initial.down,
    name: '20260927_083718_initial'
  },
];
