import {
  HEADER_BACKGROUND_PRESETS,
  headerBackgroundPresetOf,
  headerBackgroundPresetUrl,
} from './header-background-presets';

describe('header background presets', () => {
  it('maps each preset to its app-relative image and back', () => {
    for (const preset of HEADER_BACKGROUND_PRESETS) {
      expect(headerBackgroundPresetOf(headerBackgroundPresetUrl(preset))).toBe(preset);
    }
  });

  it('returns null for an uploaded photo or no background', () => {
    expect(headerBackgroundPresetOf('/uploads/tournament-header-backgrounds/x.jpg')).toBeNull();
    expect(headerBackgroundPresetOf(null)).toBeNull();
  });
});
