// Optional, admin-installable modules ("plugins"). Each is built into LinkBank
// but only active when an administrator enables it for the instance; individual
// users then choose whether to show it. To add a module: append here, gate its
// UI on the enabled set, and add any per-user visibility flag in prefs.ts.

export interface ModuleDef {
  id: string;
  name: string;
  description: string;
}

export const MODULES: ModuleDef[] = [
  {
    id: 'currency',
    name: 'Currency converter',
    description:
      'A quick currency converter in the top bar, using official ECB daily rates. Users can hide it individually.'
  },
  {
    id: 'password',
    name: 'Password generator',
    description:
      'A top-bar password generator (length + character classes), generated in the browser. Users can hide it individually.'
  }
];

export const MODULE_IDS = MODULES.map((m) => m.id);

export function isModuleId(id: unknown): id is string {
  return typeof id === 'string' && MODULE_IDS.includes(id);
}
