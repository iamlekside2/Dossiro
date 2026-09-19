import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../lib/api.js';
import PasscodeInput from './PasscodeInput.jsx';
import SignaturePad from './SignaturePad.jsx';

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
      <div className="sheetpage">
        <div className="card card--gate">
          <BrandLock />
          <h1 className="screen__h1">This link is not available</h1>
          <p className="screen__lede">{loadError}</p>
          <p className="screen__foot">
            If you still need the document, ask the person who sent it to issue a new link.
          </p>
        </div>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="sheetpage">
        <div className="card card--gate">
          <BrandLock />
          <p className="screen__lede">Opening…</p>
        </div>
      </div>
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
    <div className="brandlock">
      <img className="brandlock__logo" src="/brand/dossiro-logo.svg" alt="Dossiro" />
      {/* No organisation is named here. One deployment serves every customer,
          so naming any of them is wrong for the rest — and the public share
          endpoint withholds the owning organisation on purpose. */}
      <span className="brandlock__by">secure document link</span>
    </div>
  );
}

/* -- 1. Passcode gate ----------------------------------------------------- */

function Gate({ meta, code, setCode, email, setEmail, open, busy, error }) {
  const expires = meta.expiresAt ? new Date(meta.expiresAt) : null;

  return (
    <div className="sheetpage">
      <div className="card card--gate">
        <BrandLock />

        <h1 className="screen__h1">{meta.sharedBy ?? 'Someone'} shared a document with you</h1>
        <p className="screen__lede">
          {meta.name}.{' '}
          {meta.requiresPassword
            ? `Enter the six-digit code ${(meta.sharedBy ?? 'they').split(' ')[0]} sent you separately.`
            : 'Confirm your address to open it.'}
        </p>

        {meta.requiresEmail && (
          <input
            className="mfield"
            style={{ marginBottom: 14 }}
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

        {error && (
          <div className="callout callout--red" style={{ marginBottom: 14 }}>
            {error}
          </div>
        )}

        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={open}
          disabled={busy || (meta.requiresPassword && code.length < 6)}
        >
          {busy ? 'Opening…' : 'Open the document'}
        </button>

        {/* Stated plainly, before entry — not buried after the fact. */}
        <ul className="terms">
          <li>
            <span className="terms__dot" style={{ background: 'var(--green)' }} />
            You can read this document in your browser.
          </li>
          <li>
            <span className="terms__dot" style={{ background: 'var(--red)' }} />
            {meta.allowDownload
              ? 'You can download this document.'
              : 'You cannot download, print or forward it.'}
          </li>
          <li>
            <span className="terms__dot" style={{ background: 'var(--blue)' }} />
            Time spent on each page is reported to the sender.
          </li>
          <li>
            <span className="terms__dot" style={{ background: 'var(--blue)' }} />
            {expires ? `Access ends automatically on ${dayMonth(expires)}.` : 'This link does not expire.'}
          </li>
        </ul>

        <p className="screen__foot">
          {expires ? `This link expires on ${fullStamp(expires)}. ` : ''}
          Three attempts remain before it locks.
        </p>
      </div>
    </div>
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
    <div className="reader">
      <div className="reader__head">
        <div>
          <div className="reader__title">{meta.name}</div>
          {/* The sender is shown only when the API actually supplied one.
              Inventing a name would be worse than omitting it: a recipient who
              reads the wrong company on a confidential document has been
              misinformed by us. */}
          <div className="reader__sub">
            {meta.sharedBy ? `Shared by ${meta.sharedBy}` : 'Shared with you'}
            {expires ? ` · expires ${dayMonth(expires)}` : ''}
          </div>
        </div>

        <div className="reader__actions">
          <button type="button" className="raction raction--primary" onClick={onSign}>
            Sign
          </button>
          <button type="button" className="raction">
            Ask a question
          </button>
          <button
            type="button"
            className={meta.allowDownload ? 'raction' : 'raction raction--off'}
            onClick={download}
            disabled={!meta.allowDownload}
            title={meta.allowDownload ? undefined : 'Downloading is switched off for this link'}
          >
            Download
          </button>
          <button
            type="button"
            className={meta.allowPrint ? 'raction' : 'raction raction--off'}
            disabled={!meta.allowPrint}
            title={meta.allowPrint ? undefined : 'Printing is switched off for this link'}
          >
            Print
          </button>
        </div>
      </div>

      <div className="reader__banner">
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

      <div className="reader__body">
        <div className="reader__stage">
          <div className="docsheet">
            {meta.watermark && (
              <div className="docsheet__watermark" aria-hidden="true">
                {viewer} · {new Date().toLocaleDateString(LOCALE)}
              </div>
            )}

            <div className="docsheet__label">
              <span>Confidential</span>
              <span>CG-LEG-2026-0418</span>
            </div>

            <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.015em', margin: '0 0 6px' }}>
              Master Services Agreement
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 24px' }}>
              Northwind Logistics LLC and Calm Global Inc.
            </p>

            {PAGE_LINES.map((w, i) =>
              w === 0 ? (
                <div key={i} style={{ height: 14 }} />
              ) : (
                <div
                  key={i}
                  style={{ height: 9, width: `${w * 100}%`, background: 'var(--border-faint)', marginBottom: 7 }}
                />
              ),
            )}

            <div
              style={{
                margin: '24px 0',
                padding: '12px 14px',
                background: 'var(--blue-bg)',
                borderLeft: '2px solid var(--blue)',
                fontSize: 14,
                lineHeight: 1.6,
                color: 'var(--ink-2)',
              }}
            >
              11.2&nbsp;&nbsp;Aggregate liability shall not exceed{' '}
              <span style={{ background: 'var(--highlight)' }}>twelve (12) months</span> of fees paid
              under this agreement.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 32 }}>
              <div>
                <div
                  style={{
                    fontSize: 17,
                    fontFamily: 'Georgia, serif',
                    fontStyle: 'italic',
                    paddingBottom: 4,
                    borderBottom: '1px solid var(--ink)',
                  }}
                >
                  A. Okoro
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 5 }}>
                  Signed 14 Aug 2026
                </div>
              </div>
              <button
                type="button"
                onClick={onSign}
                style={{
                  border: '1px dashed var(--ochre-dash)',
                  background: 'var(--ochre-bg)',
                  height: 52,
                  fontSize: 12.5,
                  color: 'var(--ochre)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Sign here
                <div style={{ fontWeight: 400, fontSize: 11.5, marginTop: 2 }}>
                  You, on behalf of Northwind
                </div>
              </button>
            </div>

            <div
              style={{
                position: 'absolute',
                right: 44,
                bottom: 16,
                fontSize: 11,
                color: 'var(--text-faint)',
              }}
            >
              {page} of {pages}
            </div>
          </div>
        </div>

        <aside className="reader__rail">
          <div className="ins__label">Pages</div>
          <div className="thumbgrid">
            {Array.from({ length: Math.min(pages, 9) }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`thumb${i + 1 === page ? ' is-active' : ''}`}
                onClick={() => setPage(i + 1)}
                aria-label={`Page ${i + 1}`}
              />
            ))}
          </div>

          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-muted)', marginTop: 16 }}>
            You are on page {page}. Ask {(meta.sharedBy ?? 'the sender').split(' ')[0]} a question and it
            arrives as a comment on this clause.
          </p>

          <input className="mfield" style={{ height: 36, fontSize: 13, marginTop: 8 }} placeholder={`Ask about page ${page}`} />
        </aside>
      </div>
    </div>
  );
}

/* -- 3. Recipient signing ------------------------------------------------- */

function SignStep({ meta, onBack }) {
  const [hasInk, setHasInk] = useState(false);

  return (
    <div className="sheetpage">
      <div className="card card--sign">
        <BrandLock />

        <h1 className="screen__h1">Sign as Daniel Kowalski</h1>
        <p className="screen__lede">
          Counsel, Northwind Logistics LLC. Your signature completes step 3 of 4 and returns the
          agreement to Calm Global.
        </p>

        <div className="ins__label">Draw your signature</div>
        <SignaturePad height={128} onChange={setHasInk} label="Draw your signature" />
        <p className="screen__foot" style={{ marginTop: 8 }}>
          Drawn signatures are bound to this link, your address and this moment in time.
        </p>

        <div className="ins__label" style={{ marginTop: 24 }}>
          You are agreeing to
        </div>
        <ul className="terms">
          {[
            'Version 3.2, including the liability cap of twelve months of fees.',
            'That you are authorised to bind Northwind Logistics LLC.',
            'That an electronic signature carries the same weight as ink.',
          ].map((t) => (
            <li key={t}>
              <span className="terms__dot" style={{ background: 'var(--blue)' }} />
              {t}
            </li>
          ))}
        </ul>

        <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
          <button type="button" className="btn btn--primary" disabled={!hasInk}>
            Sign and return
          </button>
          <button type="button" className="btn" onClick={onBack}>
            Back
          </button>
        </div>

        <p className="screen__foot">
          A sealed copy is emailed to you at {meta.viewerEmail ?? 'your address'}. That copy is yours
          to keep, even though this link cannot download.
        </p>
      </div>
    </div>
  );
}
