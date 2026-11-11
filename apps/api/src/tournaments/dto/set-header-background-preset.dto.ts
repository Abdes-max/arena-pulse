import { IsIn } from 'class-validator';
import { PublicTheme } from '../../../generated/prisma/client';

// Keep in sync with libs/shared-models/src/lib/header-background-presets.ts
// (the images themselves ship in apps/web/public and apps/mobile/public,
// under header-backgrounds/<preset>.jpg).
export const HEADER_BACKGROUND_PRESETS = [
  'vert',
  'marron',
  'violet',
  'bleu',
  'rouge',
] as const;

export type HeaderBackgroundPreset = (typeof HEADER_BACKGROUND_PRESETS)[number];

// The preset that matches each public theme (keep in sync with
// RECOMMENDED_HEADER_BACKGROUND in libs/shared-models): the header a tournament
// starts with when nobody picked one, e.g. an event created in one go.
export const RECOMMENDED_HEADER_BACKGROUND: Record<
  PublicTheme,
  HeaderBackgroundPreset
> = {
  INK_SIGNAL: 'bleu',
  PULSE_EMBER: 'marron',
  NEON_COURT: 'violet',
  FRESH_PITCH: 'vert',
  CRIMSON_CHARGE: 'rouge',
};

export const headerBackgroundPresetUrl = (preset: HeaderBackgroundPreset) =>
  `/header-backgrounds/${preset}.jpg`;

export class SetHeaderBackgroundPresetDto {
  @IsIn(HEADER_BACKGROUND_PRESETS)
  preset!: HeaderBackgroundPreset;
}
