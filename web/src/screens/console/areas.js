/**
 * What the operator console is made of.
 *
 * The handoff specifies eight areas. Five have something real behind them and
 * three do not — service health, release rings and a control register are all
 * systems we have not built. They are listed with what they would need rather
 * than filled with convincing numbers, for the same reason the workbench marks
 * its unbuilt areas: a console full of green ticks nobody wired is worse than
 * an empty one, because it gets believed.
 */

export const REAL = 'real';
export const UNBUILT = 'unbuilt';

export const CONSOLE_AREAS = [
  {
    id: 'tenants',
    label: 'Tenants',
    state: REAL,
    heading: 'Every organisation on the platform',
    note: 'Plan, seats, region and lifecycle. Support access to any of them starts here.',
  },
  {
    id: 'deployment',
    label: 'Deployment',
    state: REAL,
    heading: 'Where each tenancy runs, and under what licence',
    note:
      'Seat counts come from the signed licence rather than the database column, which is why '
      + 'editing the row changes nothing (PLT-5).',
  },
  {
    id: 'billing',
    label: 'Billing',
    state: REAL,
    heading: 'Seats and what they are worth',
    note:
      'External recipients never consume a seat, however many of them a customer shares with '
      + '(PLT-8).',
  },
  {
    id: 'support',
    label: 'Support',
    state: REAL,
    heading: 'Every time we have looked inside a tenancy',
    note:
      'The same list the customer sees in their own administration. Neither side is shown '
      + 'anything the other cannot (PLT-2).',
  },
  {
    id: 'operators',
    label: 'Operators',
    state: REAL,
    heading: 'Who can act on the platform side',
    note: 'And, below, what none of them can do — enforced in the platform, not in this screen.',
  },
  {
    id: 'health',
    label: 'Health',
    state: UNBUILT,
    heading: 'Service health',
    needs: 'A service registry and a probe for each, reporting into one place',
    note:
      'Nothing measures this yet. The design shows nine services and an open incident; inventing '
      + 'nine green ticks would make the console less useful than an empty page, because somebody '
      + 'would rely on it.',
  },
  {
    id: 'releases',
    label: 'Releases',
    state: UNBUILT,
    heading: 'Release rings',
    needs: 'Versioned releases, a ring per tenant, and a deployment pipeline that honours pinning',
    note:
      'There is one version of Dossiro and no way to pin a tenant to an older one. The rule the '
      + 'design states — a pinned tenant cannot be force-upgraded, even for a security fix — is a '
      + 'promise we are not yet able to keep or to break.',
  },
  {
    id: 'trust',
    label: 'Trust',
    state: UNBUILT,
    heading: 'Fleet controls and evidence',
    needs: 'A control register mapped to frameworks, with evidence attached to each',
    note:
      'SOC 2 is a P1 requirement and we hold no report. A page listing controls as satisfied would '
      + 'be the most dangerous screen in the product.',
  },
];

export const areaById = (id) => CONSOLE_AREAS.find((a) => a.id === id) ?? CONSOLE_AREAS[0];
