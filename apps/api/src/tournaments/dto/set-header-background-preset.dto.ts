import { IsIn } from 'class-validator';

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

export const headerBackgroundPresetUrl = (preset: HeaderBackgroundPreset) =>
  `/header-backgrounds/${preset}.jpg`;

export class SetHeaderBackgroundPresetDto {
  @IsIn(HEADER_BACKGROUND_PRESETS)
  preset!: HeaderBackgroundPreset;
}
