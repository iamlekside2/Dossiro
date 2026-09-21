import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../lib/api.js';
import PasscodeInput from './PasscodeInput.jsx';
import SignaturePad from './SignaturePad.jsx';
import {
  Button, Callout, Card, Foot, H1, Label, Lede, SheetPage, Terms, TextInput,
} from './parts.jsx';

/**
 * What the external recipient sees at cv.link/<token>. No account, no install.
 *
 * Three states, sequential in production: passcode gate -> reader -> signing.
 * The prototype exposed them as review chips; here they are driven by real
 * state and, where the token is real, by the API.
 *
 * Visiting /s/demo renders the handoff's sample content so the design can be
 * reviewed without provisioning a share.
 */

const DEMO = {
  name: 'Master Services Agreement, v3.2',
  sharedBy: 'Amina Okoro',
  mimeType: 'application/pdf',
  size: 284_512,
  pageCount: 18,
  expiresAt: '2026-08-21T17:00:00+01:00',
  allowDownload: false,
  allowPrint: false,
  watermark: true,
  requiresPassword: true,
  requiresEmail: false,
  downloadsRemaining: null,
  viewerEmail: 'd.kowalski@northwind.com',
};

const PAGE_LINES = [1, 0.96, 0.88, 1, 0.72, 0, 1, 0.92, 0.8, 0.6];

/**
 * Dates are pinned to en-GB rather than the viewer's locale. The design writes
 * every date day-first ("21 August", "14 Aug 2026"), Calm Global is in Lagos,
 * and a recipient's browser locale would otherwise flip contract dates into
 * month-first — which is genuinely ambiguous on a legal document.
 */
const LOCALE = 'en-GB';

const dayMonth = (d) => d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });

const fullStamp = (d) =>
  d.toLocaleString(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function ShareLink() {
  const { token } = useParams();
  const isDemo = token === 'demo';

  const [meta, setMeta] = useState(isDemo ? DEMO : null);
  const [loadError, setLoadError] = useState(null);
  const [step, setStep] = useState('gate');
  const [code, setCode] = useState(isDemo ? '941' : '');
  const [email, setEmail] = useState('');
  const [ticket, setTicket] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isDemo) return undefined;
    let cancelled = false;
    api.publicShare
      .meta(token)
      .then((m) => !cancelled && setMeta(m))
      .catch((e) => !cancelled && setLoadError(e.body?.message || e.message));
    return () => {
      cancelled = true;
    };
  }, [token, isDemo]);

  // A link with no passcode and no named recipients opens straight into the
  // reader — making someone click through an empty gate teaches nothing.
  useEffect(() => {
    if (meta && !meta.requiresPassword && !meta.requiresEmail && step === 'gate' && !isDemo) {
      void open();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      if (isDemo) {
        setTicket('demo');
      } else {
        const res = await api.publicShare.authorize(token, code || undefined, email || undefined);
        setTicket(res.ticket);
      }
      setStep('read');
    } catch (e) {
      setError(e.body?.message || e.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <SheetPage>
        <Card width="gate">
          <BrandLock />
          <H1>This link is not available</H1>
          <Lede>{loadError}</Lede>
          <Foot>
            If you still need the document, ask the person who sent it to issue a new link.
          </Foot>
        </Card>
      </SheetPage>
    );
  }

  if (!meta) {
    return (
      <SheetPage>
        <Card width="gate">
          <BrandLock />
          <Lede>Opening…</Lede>
        </Card>
      </SheetPage>
    );
  }

  if (step === 'gate') {
    return <Gate {...{ meta, code, setCode, email, setEmail, open, busy, error }} />;
  }
  if (step === 'sign') {
    return <SignStep meta={meta} onBack={() => setStep('read')} />;
  }
  return <Reader meta={meta} token={token} ticket={ticket} isDemo={isDemo} onSign={() => setStep('sign')} />;
}

function BrandLock() {
  return (
    <div className="mb-[26px] flex items-center gap-[9px]">
      <img className="block h-[30px] w-auto" src="/brand/dossiro-logo.svg" alt="Dossiro" />
      {/* No organisation is named here. One deployment serves every customer,
          so naming any of them is wrong for the rest — and the public share
          endpoint withholds the owning organisation on purpose. */}
      <span className="text-detail text-dim">secure document link</span>
    </div>
  );
}

/* -- 1. Passcode gate ----------------------------------------------------- */

function Gate({ meta, code, setCode, email, setEmail, open, busy, error }) {
  const expires = meta.expiresAt ? new Date(meta.expiresAt) : null;

  return (
    <SheetPage>
      <Card width="gate">
        <BrandLock />

        <H1>{meta.sharedBy ?? 'Someone'} shared a document with you</H1>
        <Lede>
          {meta.name}.{' '}
          {meta.requiresPassword
            ? `Enter the six-digit code ${(meta.sharedBy ?? 'they').split(' ')[0]} sent you separately.`
            : 'Confirm your address to open it.'}
        </Lede>

        {meta.requiresEmail && (
          <TextInput
            className="mb-[14px]"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Your email address"
          />
        )}

        {meta.requiresPassword && (
          <PasscodeInput value={code} onChange={setCode} autoFocus onComplete={open} />
        )}

        {error && <Callout tone="red" className="mb-[14px]">{error}</Callout>}

        <Button
          tone="primary"
          block
          onClick={open}
          disabled={busy || (meta.requiresPassword && code.length < 6)}
        >
          {busy ? 'Opening…' : 'Open the document'}
        </Button>

        {/* Stated plainly, before entry — not buried after the fact. */}
        <Terms
          items={[
            ['green', 'You can read this document in your browser.'],
            [
              'red',
              meta.allowDownload
                ? 'You can download this document.'
                : 'You cannot download, print or forward it.',
            ],
            ['blue', 'Time spent on each page is reported to the sender.'],
            [
              'blue',
              expires
                ? `Access ends automatically on ${dayMonth(expires)}.`
                : 'This link does not expire.',
            ],
          ]}
        />

        <Foot>
          {expires ? `This link expires on ${fullStamp(expires)}. ` : ''}
          Three attempts remain before it locks.
        </Foot>
      </Card>
    </SheetPage>
  );
}

/* -- 2. Reader ------------------------------------------------------------ */

function Reader({ meta, token, ticket, isDemo, onSign }) {
  const [page, setPage] = useState(4);
  const pages = meta.pageCount ?? 9;
  const expires = meta.expiresAt ? new Date(meta.expiresAt) : null;
  const viewer = meta.viewerEmail ?? 'this recipient';

  function download() {
    if (!meta.allowDownload || isDemo) return;
    window.open(api.publicShare.contentUrl(token, ticket) + '&disposition=attachment', '_blank', 'noopener');
  }

  return (
    <div className="flex min-h-screen flex-col bg-desk">
      <div className="flex flex-none flex-wrap items-center gap-[14px] border-b border-line bg-surface px-5 py-[14px]">
        <div>
          <div className="text-body font-semibold">{meta.name}</div>
          {/* The sender is shown only when the API actually supplied one.
              Inventing a name would be worse than omitting it: a recipient who
              reads the wrong company on a confidential document has been
              misinformed by us. */}
          <div className="text-detail text-dim">
            {meta.sharedBy ? `Shared by ${meta.sharedBy}` : 'Shared with you'}
            {expires ? ` · expires ${dayMonth(expires)}` : ''}
          </div>
        </div>

        <div className="ml-auto flex gap-2">
          <ReaderAction primary onClick={onSign}>
            Sign
          </ReaderAction>
          <ReaderAction>Ask a question</ReaderAction>
          <ReaderAction
            off={!meta.allowDownload}
            onClick={download}
            title={meta.allowDownload ? undefined : 'Downloading is switched off for this link'}
          >
            Download
          </ReaderAction>
          <ReaderAction
            off={!meta.allowPrint}
            title={meta.allowPrint ? undefined : 'Printing is switched off for this link'}
          >
            Print
          </ReaderAction>
        </div>
      </div>

      <div className="flex flex-none flex-wrap justify-between gap-[14px] border-b border-red-border bg-red-bg px-5 py-[9px] text-detail text-red">
        <span>
          This document is confidential. Download, print and forwarding are switched off, and your
          reading time is reported to the sender.
        </span>
        <span>
          {viewer} ·{' '}
          {new Date().toLocaleString(LOCALE, {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto p-8">
          <div className="relative mx-auto max-w-[660px] overflow-hidden bg-surface px-11 pb-12 pt-10">
            {/* Carries the recipient's own address and the time they opened it,
                so a screenshot identifies who it was sent to. */}
            {meta.watermark && (
              <div
                className="pointer-events-none absolute inset-0 flex rotate-[-24deg] items-center justify-center whitespace-nowrap text-mobile font-bold text-[rgba(26,29,33,0.07)]"
                aria-hidden="true"
              >
                {viewer} · {new Date().toLocaleDateString(LOCALE)}
              </div>
            )}

            <div className="mb-5 flex justify-between text-label font-bold uppercase tracking-[0.07em] text-soft">
              <span>Confidential</span>
              <span>CG-LEG-2026-0418</span>
            </div>

            <h2 className="mb-1.5 text-sheet font-bold tracking-[-0.015em]">
              Master Services Agreement
            </h2>
            <p className="mb-6 text-ui text-dim">Northwind Logistics LLC and Calm Global Inc.</p>

            {PAGE_LINES.map((w, i) =>
              w === 0 ? (
                <div key={i} className="h-[14px]" />
              ) : (
                <div
                  key={i}
                  className="mb-[7px] h-[9px] bg-line-faint"
                  style={{ width: `${w * 100}%` }}
                />
              ),
            )}

            <div
              className="my-6 border-l-2 border-blue bg-blue-bg px-[14px] py-3 text-body leading-[1.6] text-ink-2"
            >
              11.2&nbsp;&nbsp;Aggregate liability shall not exceed{' '}
              <span className="bg-highlight">twelve (12) months</span> of fees paid
              under this agreement.
            </div>

            <div className="mt-8 grid grid-cols-2 gap-5">
              <div>
                <div className="border-b border-ink pb-1 font-[Georgia,serif] text-head-lg italic">
                  A. Okoro
                </div>
                <div className="mt-[5px] text-chip text-dim">Signed 14 Aug 2026</div>
              </div>
              <button
                type="button"
                onClick={onSign}
                className="h-[52px] cursor-pointer border border-dashed border-ochre-dash bg-ochre-bg text-detail font-semibold text-ochre hover:bg-highlight"
              >
                Sign here
                <div className="mt-0.5 text-chip font-normal">You, on behalf of Northwind</div>
              </button>
            </div>

            <div className="absolute bottom-4 right-11 text-label text-faint">
              {page} of {pages}
            </div>
          </div>
        </div>

        <aside className="w-[264px] shrink-0 overflow-y-auto border-l border-line bg-surface-2 p-4">
          <Label>Pages</Label>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: Math.min(pages, 9) }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`h-[52px] cursor-pointer border bg-surface p-0 ${
                  i + 1 === page ? 'border-blue shadow-thumb' : 'border-line'
                }`}
                onClick={() => setPage(i + 1)}
                aria-label={`Page ${i + 1}`}
              />
            ))}
          </div>

          <p className="mt-4 text-detail leading-[1.55] text-muted">
            You are on page {page}. Ask {(meta.sharedBy ?? 'the sender').split(' ')[0]} a question and it
            arrives as a comment on this clause.
          </p>

          {/* Its own classes rather than TextInput with overrides: two
              conflicting height utilities resolve by stylesheet order, not by
              the order they appear in the attribute. */}
          <input
            className="mt-2 h-9 w-full border border-line-strong bg-surface px-[14px] text-ui"
            placeholder={`Ask about page ${page}`}
          />
        </aside>
      </div>
    </div>
  );
}

/* -- 3. Recipient signing ------------------------------------------------- */

function SignStep({ meta, onBack }) {
  const [hasInk, setHasInk] = useState(false);

  return (
    <SheetPage>
      <Card width="sign">
        <BrandLock />

        <H1>Sign as Daniel Kowalski</H1>
        <Lede>
          Counsel, Northwind Logistics LLC. Your signature completes step 3 of 4 and returns the
          agreement to Calm Global.
        </Lede>

        <Label>Draw your signature</Label>
        <SignaturePad height={128} onChange={setHasInk} label="Draw your signature" />
        <Foot className="mt-2">
          Drawn signatures are bound to this link, your address and this moment in time.
        </Foot>

        <div className="mt-6">
          <Label>You are agreeing to</Label>
        </div>
        <Terms
          items={[
            ['blue', 'Version 3.2, including the liability cap of twelve months of fees.'],
            ['blue', 'That you are authorised to bind Northwind Logistics LLC.'],
            ['blue', 'That an electronic signature carries the same weight as ink.'],
          ]}
        />

        <div className="mt-6 flex gap-2">
          <Button tone="primary" disabled={!hasInk}>
            Sign and return
          </Button>
          <Button onClick={onBack}>Back</Button>
        </div>

        <Foot>
          A sealed copy is emailed to you at {meta.viewerEmail ?? 'your address'}. That copy is yours
          to keep, even though this link cannot download.
        </Foot>
      </Card>
    </SheetPage>
  );
}

/* -- Reader toolbar action -------------------------------------------------

   `off` renders struck through and not-allowed rather than hidden. The
   recipient has to understand the constraint — a missing Download button
   reads as a broken page, a struck-through one reads as a decision.
   -------------------------------------------------------------------------- */

function ReaderAction({ primary, off, children, ...props }) {
  const skin = off
    ? 'border-line-soft text-crumb-sep line-through cursor-not-allowed'
    : primary
      ? 'border-blue bg-blue text-white cursor-pointer'
      : 'border-line-strong bg-surface text-muted cursor-pointer';
  return (
    <button
      type="button"
      disabled={off}
      {...props}
      className={`inline-flex h-8 items-center border px-[13px] text-ui font-semibold ${skin}`}
    >
      {children}
    </button>
  );
}
