import { loadFont as loadSpaceGrotesk } from '@remotion/google-fonts/SpaceGrotesk';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadBarlowCondensed } from '@remotion/google-fonts/BarlowCondensed';
import { loadFont as loadBarlow } from '@remotion/google-fonts/Barlow';
import { loadFont as loadRussoOne } from '@remotion/google-fonts/RussoOne';
import { loadFont as loadChakraPetch } from '@remotion/google-fonts/ChakraPetch';
import { PublicTheme } from '../../../generated/prisma/client';

/**
 * Dark-mode brand palette for the 3 organizer-selectable tournament themes,
 * hand-ported from libs/design-tokens/src/styles/_*.scss (--ap-* custom
 * properties aren't available to Remotion's standalone render -- keep this
 * in sync with those files by hand). Dark mode is used unconditionally here
 * (not the mode the organizer's admin view happens to be in) because it
 * reads better for a video clip meant to be shared on social feeds.
 */
export interface ThemePalette {
  bg: string;
  surface: string;
  fg: string;
  muted: string;
  primary: string;
  onPrimary: string;
  signal: string;
  onSignal: string;
  win: string;
  headingFont: string;
  bodyFont: string;
}

const { fontFamily: spaceGrotesk } = loadSpaceGrotesk('normal', {
  weights: ['700'],
  subsets: ['latin'],
});
const { fontFamily: inter } = loadInter('normal', {
  weights: ['400', '600'],
  subsets: ['latin'],
});
const { fontFamily: barlowCondensed } = loadBarlowCondensed('normal', {
  weights: ['700'],
  subsets: ['latin'],
});
const { fontFamily: barlow } = loadBarlow('normal', {
  weights: ['400', '600'],
  subsets: ['latin'],
});
const { fontFamily: russoOne } = loadRussoOne('normal', {
  weights: ['400'],
  subsets: ['latin'],
});
const { fontFamily: chakraPetch } = loadChakraPetch('normal', {
  weights: ['400', '600'],
  subsets: ['latin'],
});

export const THEME_PALETTES: Record<PublicTheme, ThemePalette> = {
  INK_SIGNAL: {
    bg: '#0b1220',
    surface: '#141b2e',
    fg: '#e7ecf5',
    muted: '#94a3b8',
    primary: '#c7d2e5',
    onPrimary: '#0b1220',
    signal: '#38bdf8',
    onSignal: '#0b1220',
    win: '#22c55e',
    headingFont: spaceGrotesk,
    bodyFont: inter,
  },
  PULSE_EMBER: {
    bg: '#1c1410',
    surface: '#261d17',
    fg: '#f3e7de',
    muted: '#c9b8ad',
    primary: '#f2703f',
    onPrimary: '#1a0e08',
    signal: '#f5c445',
    onSignal: '#1c1410',
    win: '#4ade80',
    headingFont: barlowCondensed,
    bodyFont: barlow,
  },
  NEON_COURT: {
    bg: '#0f0f23',
    surface: '#1e1c35',
    fg: '#ece7fb',
    muted: '#a78bfa',
    primary: '#a78bfa',
    onPrimary: '#0f0f23',
    signal: '#fb7185',
    onSignal: '#0f0f23',
    win: '#4ade80',
    headingFont: russoOne,
    bodyFont: chakraPetch,
  },
};
