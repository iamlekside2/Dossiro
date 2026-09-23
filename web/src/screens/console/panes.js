/**
 * What each area's inspector shows, per pane.
 *
 * Every function here returns a pane spec for `ConsoleInspector` — see that
 * file for the shape. They are plain functions of the selected row so that
 * adding a pane is adding a function, not a component.
 */

const naira = (n) =>
  n >= 1_000_000_000
    ? `₦${(n / 1_000_000_000).toFixed(1)}bn`
    : n >= 1_000_000
      ? `₦${(n / 1_000_000).toFixed(1)}m`
      : `₦${Number(n).toLocaleString('en-GB')}`;

const when = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

const REGION_NAME = { 'ng-lagos-1': 'Lagos', 'ng-abuja-1': 'Abuja' };

/** Annual value per seat. The only figure in the console that is a decision. */
export const PER_SEAT = 48_000;

/* -- Tenants ---------------------------------------------------------------- */

export const TENANT_PANES = [
  ['tenant', 'Tenant'],
  ['consumption', 'Consumption'],
  ['support', 'Support access'],
  ['lifecycle', 'Lifecycle'],
];

export function tenantPane(pane, t, ctx = {}) {
  if (!t) return null;

  if (pane === 'tenant') {
    return {
      kv: [
        ['Name', t.name],
        ['Short name', t.slug],
        ['Plan', t.plan],
        ['Status', t.status?.toLowerCase()],
        ['Region', REGION_NAME[t.region] ?? t.region ?? '—'],
      ],
      list: t.domains?.length
        ? {
            title: 'Email domains',
            items: t.domains.map((d) => ({
              label: d.domain,
              chip: d.verifiedAt ? 'verified' : 'unverified',
              chipTone: d.verifiedAt ? 'green' : 'ochre',
            })),
          }
        : undefined,
      footnote:
        'Region is fixed at the first record. Nothing in this console moves a tenancy between '
        + 'regions, because nothing in the platform can.',
    };
  }

  if (pane === 'consumption') {
    const limit = t.seatLimit ?? null;
    return {
      kv: [
        ['Seats in use', `${t.seatsUsed}${limit ? ` of ${limit}` : ' (no limit)'}`],
        ['Documents', Number(t.documents).toLocaleString('en-GB')],
        ['Annual value', naira((limit ?? t.seatsUsed) * PER_SEAT)],
      ],
      callout:
        limit && t.seatsUsed >= limit
          ? {
              tone: 'ochre',
              title: 'Every seat is taken.',
              text:
                'The next person invited will be refused. Nobody is turned away without a route, '
                + 'so they are told who to ask rather than to come back later.',
            }
          : undefined,
      footnote:
        'External recipients never consume a seat, however many a customer shares with (PLT-8).',
    };
  }

  if (pane === 'support') {
    const sessions = ctx.sessions ?? [];
    const open = sessions.filter((s) => s.state === 'ACTIVE');
    return {
      kv: [
        ['Open now', open.length ? `${open.length}` : 'None'],
        ['Ever', sessions.length ? `${sessions.length}` : 'Never'],
      ],
      list: sessions.length
        ? {
            title: 'Every time we have looked',
            items: sessions.slice(0, 6).map((s) => ({
              label: s.reason,
              note: `${s.operatorName} · ${s.scope.toLowerCase()} · ${when(s.requestedAt)}`,
              chip: s.state.toLowerCase(),
              chipTone:
                s.state === 'ACTIVE' ? 'green' : s.state === 'REQUESTED' ? 'ochre' : s.state === 'REFUSED' ? 'red' : '',
            })),
          }
        : undefined,
      callout: {
        tone: open.length ? 'ochre' : '',
        title: open.length ? 'This customer is open to us right now.' : 'We cannot read this customer’s records.',
        text: open.length
          ? 'They can see it in their own administration and end it without asking us.'
          : 'Not without a session they approve, see, and can end at any point (PLT-2).',
      },
      actions: [{ label: 'Request access', tone: 'primary', onClick: ctx.onRequestAccess }],
      footnote:
        'Every request, approval and record opened is written to the tenant’s own audit trail as '
        + 'well as ours. A list only we could read would prove nothing to them.',
    };
  }

  if (pane === 'lifecycle') {
    const closed = t.status === 'SUSPENDED' || t.status === 'CLOSED';
    return {
      kv: [
        ['Status', t.status?.toLowerCase()],
        ['Created', when(t.createdAt)],
      ],
      callout: {
        tone: closed ? 'red' : '',
        title: closed ? 'Locked out.' : 'Suspension is commercial, not a delete.',
        text: closed
          ? 'Every session was revoked and new sign-ins are blocked. Their documents are untouched '
            + 'and reactivating restores access immediately.'
          : 'Suspending revokes every session and blocks sign-in at once. Documents are never '
            + 'touched by it, and the reason is written to a trail nobody can edit afterwards.',
      },
      actions: t.isPlatform
        ? []
        : closed
          ? [{ label: 'Reactivate', tone: 'primary', onClick: ctx.onReactivate }]
          : [
              ...(t.status === 'TRIAL'
                ? [{ label: 'Activate', tone: 'primary', onClick: ctx.onActivate }]
                : []),
              { label: 'Suspend', onClick: ctx.onSuspend },
            ],
      footnote: t.isPlatform ? 'This is the console’s own organisation.' : undefined,
    };
  }

  return null;
}

/* -- Deployment --------------------------------------------------------------- */

export const DEPLOYMENT_PANES = [
  ['deployment', 'Deployment'],
  ['licence', 'Licence'],
  ['residency', 'Residency'],
  ['remote', 'Remote support'],
];

export function deploymentPane(pane, t, ctx = {}) {
  if (!t) return null;
  const l = ctx.licence;

  if (pane === 'deployment') {
    return {
      kv: [
        ['Tenant', t.name],
        ['Model', 'On our platform'],
        ['Region', REGION_NAME[t.region] ?? t.region ?? '—'],
      ],
      callout: {
        title: 'Everything here came from our side.',
        text:
          'For a self-hosted deployment it would not. Nothing on a panel like this reaches their '
          + 'server — it is what was recorded when the bundle was issued, plus whatever they have '
          + 'told us since.',
      },
    };
  }

  if (pane === 'licence') {
    return {
      kv: [
        ['State', l?.state ?? '…'],
        ['Seats', l ? `${l.seatsUsed} of ${l.seatsAllowed ?? '∞'}` : '…'],
        ['Writes', l ? (l.writable ? 'Allowed' : 'Refused') : '…'],
        ['Expires', l?.expiresAt ? when(l.expiresAt) : 'No expiry'],
        ['Days left', l?.daysRemaining ?? '—'],
      ],
      callout: {
        title: 'Editing the database does nothing.',
        text:
          'Seat counts are read from the signed licence, not from a column, and the signature is '
          + 'verified at every start. An air-gapped installation checks the same signature with no '
          + 'network at all (PLT-4, PLT-5).',
      },
      footnote:
        'An expired licence drops to read-only for fourteen days and then refuses sign-in. Nothing '
        + 'is deleted, and installing a new one restores access at once.',
    };
  }

  if (pane === 'residency') {
    const counts = ctx.regionCounts ?? {};
    return {
      list: {
        title: 'Where records live',
        items: Object.entries(counts).map(([region, n]) => ({
          label: REGION_NAME[region] ?? region,
          note: `${n} ${n === 1 ? 'tenancy' : 'tenancies'}`,
        })),
      },
      callout: {
        tone: 'red',
        title: 'Fixed at the first record.',
        text:
          'Not changeable by the customer, by support, or by us. There is no operator action that '
          + 'relocates a tenancy — the constraint is in the platform, not in a policy document.',
      },
      footnote:
        'Lagos is the default and satisfies NDPA residency without a special arrangement. An '
        + 'offshore region needs a written request with the residency clause struck out (NFR-5).',
    };
  }

  if (pane === 'remote') {
    return {
      list: {
        title: 'How a self-hosted deployment is diagnosed',
        items: [
          { label: 'They export a diagnostic bundle', note: 'From their own installation.' },
          { label: 'They send it to us', note: 'By whatever route their policy allows.' },
          { label: 'We read it in a sandbox', note: 'Never connected to their network.' },
          { label: 'They apply a signed patch', note: 'On their schedule, not ours.' },
        ],
      },
      callout: {
        tone: 'red',
        title: 'There is no remote access path, and no back door.',
        text:
          'Nothing in this console reaches a customer’s server. That is the point of self-hosting '
          + 'and it is not something support can work around under pressure.',
      },
      footnote:
        'It costs about 3.2 days to resolve against 4 hours on our platform. That gap belongs in '
        + 'the sales conversation rather than in a surprise after signature.',
    };
  }

  return null;
}

/* -- Billing ------------------------------------------------------------------- */

export const BILLING_PANES = [
  ['seats', 'Seats'],
  ['value', 'Value'],
];

export function billingPane(pane, t) {
  if (!t) return null;
  const limit = t.seatLimit ?? null;

  if (pane === 'seats') {
    return {
      kv: [
        ['Tenant', t.name],
        ['In use', `${t.seatsUsed}`],
        ['Licensed', limit ?? 'No limit'],
        ['Spare', limit ? Math.max(0, limit - t.seatsUsed) : '∞'],
      ],
      callout: {
        tone: 'ochre',
        title: 'Reserved and pooled seats are not built.',
        text:
          'The schema holds one limit per tenant, so this is a limit rather than a pool with a '
          + 'high-water mark. The distinction PLT-6 and PLT-7 turn on is a pricing decision still '
          + 'open, and inventing the numbers here would be inventing the decision.',
      },
      footnote: 'External recipients never consume a seat (PLT-8).',
    };
  }

  return {
    kv: [
      ['Annual value', naira((limit ?? t.seatsUsed) * PER_SEAT)],
      ['Per seat', naira(PER_SEAT)],
      ['Documents held', Number(t.documents).toLocaleString('en-GB')],
    ],
    footnote:
      'Storage is not metered yet, so value is seats alone. A customer holding a terabyte and one '
      + 'holding a gigabyte are billed the same today.',
  };
}

/* -- Operators ------------------------------------------------------------------ */

export const OPERATOR_PANES = [
  ['operator', 'Operator'],
  ['rules', 'Rules'],
];

/** What nobody on the vendor side can do. Enforced in the platform, not here. */
const RULES = [
  ['Read a tenant’s documents unasked', 'Only through a session the tenant approves, sees and can end.'],
  ['Alter a tenant’s audit trail', 'The database refuses modification and deletion outright.'],
  ['Move records between regions', 'Residency is fixed at the first record.'],
  ['Delete anything under legal hold', 'A hold outranks retention, an administrator, and us.'],
  ['Act without leaving an entry', 'Every consequential action is recorded, including refusals.'],
];

export function operatorPane(pane, o) {
  if (pane === 'rules') {
    return {
      list: { title: 'What none of us can do', items: RULES.map(([label, note]) => ({ label, note })) },
      callout: {
        title: 'Enforced in the platform, not in this interface.',
        text:
          'Removing the buttons would not remove the capability. The capability was never granted.',
      },
    };
  }

  if (!o) return null;
  return {
    kv: [
      ['Name', o.displayName],
      ['Email', o.email],
      ['Tier', String(o.tier).replace(/_/g, ' ').toLowerCase()],
      ['Two-factor', o.mfaEnabled ? 'On' : 'Off'],
      ['Last signed in', when(o.lastLoginAt)],
    ],
    list: o.roles?.length ? { title: 'Roles', items: o.roles.map((r) => ({ label: r })) } : undefined,
    callout: o.mfaEnabled
      ? undefined
      : {
          tone: 'ochre',
          title: 'Two-factor is off for this operator.',
          text:
            'They can request support access to any tenancy. An account that reaches customer '
            + 'records should not rest on a password alone.',
        },
  };
}

/* -- Support -------------------------------------------------------------------- */

export const SUPPORT_PANES = [['session', 'Session']];

export function supportPane(pane, s) {
  if (!s) return null;
  return {
    kv: [
      ['Tenant', s.tenantName],
      ['State', s.state?.toLowerCase()],
      ['Scope', s.scope?.toLowerCase()],
      ['Operator', s.operatorName],
      ['Asked', when(s.requestedAt)],
      ['Expires', when(s.expiresAt)],
      ['Records opened', s.viewCount ?? 0],
    ],
    callout: s.breakGlass
      ? {
          tone: 'red',
          title: 'Taken without an approver.',
          text:
            'Break-glass, for a confirmed outage. Capped at thirty minutes and reviewed within one '
            + 'business day.',
        }
      : undefined,
    footnote: s.reason,
  };
}
