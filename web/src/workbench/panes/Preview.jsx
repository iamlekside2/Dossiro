import { useState } from 'react';
import { PlayIcon } from '../icons.jsx';
import { ins } from './ins.js';
import { btn } from '../../ui.js';

const MEDIA_KINDS = ['MP4', 'MP3', 'M4A'];

/** Placeholder body-text bar widths, per the handoff. */
const BAR_WIDTHS = [100, 96, 88, 100, 72, null, 100, 90, 64];

export default function Preview({ record }) {
  const isMedia = MEDIA_KINDS.includes(record[0]);
  return isMedia ? <MediaPreview record={record} /> : <DocumentPreview record={record} />;
}

/* -- Document sheet on a desk -------------------------------------------- */

function DocumentPreview({ record }) {
  const [, name, meta] = record;

  return (
    <div>
      <div style={{ background: 'var(--desk)', padding: 32 }}>
        <div
          style={{
            maxWidth: 660,
            margin: '0 auto',
            background: 'var(--surface)',
            padding: '34px 36px 40px',
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--text-soft)',
              marginBottom: 18,
            }}
          >
            <span>Confidential</span>
            <span>CG-2026-0841</span>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.015em', margin: '0 0 6px' }}>
            {name}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 22px' }}>{meta}</p>

          {BAR_WIDTHS.map((w, i) =>
            w === null ? (
              <div key={i} style={{ height: 12 }} />
            ) : (
              <div
                key={i}
                style={{ height: 9, width: `${w}%`, background: 'var(--border-faint)', marginBottom: 7 }}
              />
            ),
          )}

          {/* Extracted-clause callout */}
          <div
            style={{
              margin: '22px 0',
              padding: '11px 13px',
              background: 'var(--blue-bg)',
              borderLeft: '2px solid var(--blue)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: 'var(--blue)',
                marginBottom: 5,
              }}
            >
              Liability cap · 94% confidence
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)' }}>
              Aggregate liability shall not exceed{' '}
              <span style={{ background: 'var(--highlight)' }}>twelve (12) months of fees</span> paid
              under this agreement.
            </div>
          </div>

          {/* Signature block: one signed, one waiting */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 30 }}>
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
                Amina Okoro
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 5 }}>
                Signed 14 August 2026, 09:12
              </div>
            </div>
            <UnsignedField />
          </div>

          <div
            style={{
              position: 'absolute',
              right: 36,
              bottom: 14,
              fontSize: 11,
              color: 'var(--text-faint)',
            }}
          >
            4
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            maxWidth: 660,
            margin: '12px auto 0',
            fontSize: 11.5,
            color: 'var(--text-soft)',
          }}
        >
          <span>Page 4 of 18</span>
          <span>Checked out by you</span>
        </div>
      </div>

      <SigningPanel />
    </div>
  );
}

function UnsignedField() {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        border: `1px dashed var(--ochre-dash)`,
        background: hover ? 'var(--highlight)' : 'var(--ochre-bg)',
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12.5,
        color: 'var(--ochre)',
        cursor: 'pointer',
      }}
    >
      Sign here
    </div>
  );
}

/* -- Signing panel -------------------------------------------------------- */

function SigningPanel() {
  const [mode, setMode] = useState('draw');

  return (
    <div className={ins.pane}>
      <div className={ins.label}>Apply your signature</div>

      <div style={{ display: 'flex', border: '1px solid var(--border-strong)', width: 'fit-content' }}>
        {[
          ['draw', 'Draw'],
          ['type', 'Type'],
          ['cert', 'Certificate'],
        ].map(([id, label], i) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            style={{
              height: 28,
              padding: '0 14px',
              fontSize: 12.5,
              fontWeight: mode === id ? 600 : 400,
              border: 0,
              borderLeft: i ? '1px solid var(--border-strong)' : 0,
              background: mode === id ? 'var(--blue)' : 'var(--surface)',
              color: mode === id ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        {mode === 'draw' && (
          <div>
            <div
              style={{
                height: 96,
                border: '1px dashed var(--border-strong)',
                background: 'var(--surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="190" height="56" viewBox="0 0 190 56" aria-label="Drawn signature">
                <path
                  d="M8 40c14-26 22 6 32-6s10-22 20-14 4 30 16 22 12-30 24-24 6 26 18 20 14-18 26-14 12 14 20 10"
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <button
              type="button"
              style={{
                marginTop: 6,
                background: 'none',
                border: 0,
                padding: 0,
                fontSize: 12.5,
                color: 'var(--blue)',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>
        )}

        {mode === 'type' && (
          <div
            style={{
              height: 96,
              border: '1px solid var(--border-strong)',
              background: 'var(--surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              fontFamily: 'Georgia, serif',
              fontStyle: 'italic',
              color: '#1F3560',
            }}
          >
            Amina Okoro
          </div>
        )}

        {mode === 'cert' && (
          <div style={{ border: '1px solid var(--border-strong)', background: 'var(--surface)', padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>CG-SIG-88412</div>
            {[
              ['Issued to', 'Amina Okoro, Records Manager'],
              ['Valid until', '4 March 2028'],
              ['SHA-256', 'a41f··· 9c02'],
              ['Held on', 'Hardware key, slot 2'],
            ].map(([k, v]) => (
              <div className={ins.kvrow} key={k}>
                <span className={ins.k}>{k}</span>
                <span style={{ fontSize: 12.5 }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <button type="button" className={btn('primary')}>
          Apply signature
        </button>
        <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
          Timestamped and sealed on apply
        </span>
      </div>
    </div>
  );
}

/* -- Media player + transcript ------------------------------------------- */

const TRANSCRIPT = [
  ['31:44', 'R. Tan', 'We are close. The remaining gap is the cap and the notice period.'],
  ['32:02', 'D. Kowalski', 'Our board will not go past twelve months on the cap.'],
  ['32:18', 'D. Kowalski', 'We can live with the indemnification cap if notice stays at ninety days.'],
  ['32:41', 'A. Okoro', 'Ninety days is already in the draft. I will mark the cap as agreed.'],
  ['33:05', 'R. Tan', 'Then we are agreed subject to the General Counsel signing off.'],
];

function MediaPreview({ record }) {
  const [, name, meta] = record;
  const played = 38;

  return (
    <div>
      <div style={{ background: 'var(--ink-2)', padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            type="button"
            aria-label="Play"
            style={{
              width: 38,
              height: 38,
              flex: '0 0 38px',
              background: 'var(--surface)',
              border: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <PlayIcon size={14} />
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 38, flex: '1 1 auto' }}>
            {Array.from({ length: 48 }, (_, i) => {
              // Deterministic pseudo-waveform: no randomness, so it is stable
              // across renders and screenshots.
              const h = 8 + ((i * 37) % 26);
              return (
                <div
                  key={i}
                  style={{
                    flex: '1 1 auto',
                    height: h,
                    background: i / 48 < played / 100 ? '#fff' : 'var(--text-dim)',
                  }}
                />
              );
            })}
          </div>

          <span style={{ fontSize: 12, color: '#fff', flex: '0 0 auto' }}>32:18 / 48:04</span>
          <button
            type="button"
            style={{
              fontSize: 12,
              color: '#fff',
              background: 'transparent',
              border: '1px solid #5a6068',
              height: 24,
              padding: '0 8px',
              cursor: 'pointer',
            }}
          >
            1.0×
          </button>
        </div>

        <div style={{ marginTop: 12, height: 2, background: '#5a6068' }}>
          <div style={{ width: `${played}%`, height: 2, background: '#fff' }} />
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-ghost)' }}>{name}</div>
      </div>

      <div className={ins.section} style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{meta} · 3 speakers · searchable</span>
        <button
          type="button"
          style={{ background: 'none', border: 0, padding: 0, fontSize: 12.5, color: 'var(--blue)', cursor: 'pointer' }}
        >
          Jump to hit
        </button>
      </div>

      <div>
        {TRANSCRIPT.map(([t, who, text]) => (
          <div
            key={t}
            style={{
              display: 'grid',
              gridTemplateColumns: '44px 1fr',
              gap: 10,
              padding: '9px 16px',
              borderBottom: '1px solid var(--border-faint)',
              background: t === '32:18' ? 'var(--blue-tint)' : 'transparent',
            }}
          >
            <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{t}</span>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{who}</div>
              <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink-2)' }}>{text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
