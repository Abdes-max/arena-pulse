import React from 'react';
import { loadFont } from '@remotion/google-fonts/SpaceGrotesk';

// The TournArena brand mark, ported from
// libs/design-system/src/lib/logo/{logo.html,logo.scss} ("on-dark" variant
// only -- this composition always renders on a dark theme background, see
// theme-palette.ts). Colors/font are fixed regardless of the selected
// tournament theme, mirroring that component's own doc comment: the brand
// mark must not shift with the organizer's theme choice.
const { fontFamily } = loadFont('normal', { weights: ['700'], subsets: ['latin'] });

export function Logo({ size = 64, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.2 }}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <rect
          x={2}
          y={2}
          width={60}
          height={60}
          rx={14}
          fill="none"
          stroke="rgba(231, 236, 245, 0.28)"
          strokeWidth={2}
        />
        <path
          d="M22 16 L42 32 L22 48"
          fill="none"
          stroke="#e7ecf5"
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={45} cy={32} r={10} fill="#38bdf8" opacity={0.22} />
        <circle cx={45} cy={32} r={5.5} fill="#38bdf8" />
      </svg>
      {wordmark && (
        <span
          style={{
            fontFamily,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            fontSize: size * 0.5,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: '#e7ecf5' }}>Tourn</span>
          <span style={{ color: '#38bdf8' }}>Arena</span>
        </span>
      )}
    </div>
  );
}
