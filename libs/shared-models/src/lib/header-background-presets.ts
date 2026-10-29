// Ready-made header backgrounds an organizer can pick instead of uploading
// their own photo ("Autre"). The images ship inside each app's public/
// folder (apps/web/public/header-backgrounds, apps/mobile/public/
// header-backgrounds -- same files), not on the API: a preset is stored in
// Tournament.headerBackgroundUrl as that app-relative path, which
// resolveAssetUrl leaves untouched. Keep in sync with
// apps/api/src/tournaments/dto/set-header-background-preset.dto.ts.
export const HEADER_BACKGROUND_PRESETS = ['vert', 'marron', 'violet', 'bleu', 'rouge'] as const;

export type HeaderBackgroundPreset = (typeof HEADER_BACKGROUND_PRESETS)[number];

export const HEADER_BACKGROUND_PRESET_PREFIX = '/header-backgrounds/';

export function headerBackgroundPresetUrl(preset: HeaderBackgroundPreset): string {
  return `${HEADER_BACKGROUND_PRESET_PREFIX}${preset}.jpg`;
}

/** The preset a stored headerBackgroundUrl points to, or null for an uploaded photo / none. */
export function headerBackgroundPresetOf(
  url: string | null | undefined,
): HeaderBackgroundPreset | null {
  return (
    HEADER_BACKGROUND_PRESETS.find((preset) => url === headerBackgroundPresetUrl(preset)) ?? null
  );
}
