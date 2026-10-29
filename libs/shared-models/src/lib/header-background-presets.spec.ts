import {
  HEADER_BACKGROUND_PRESETS,
  headerBackgroundPresetOf,
  headerBackgroundPresetsFor,
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

  it('puts the theme-recommended preset first', () => {
    expect(headerBackgroundPresetsFor('INK_SIGNAL')).toEqual([
      'bleu',
      'vert',
      'marron',
      'violet',
      'rouge',
    ]);
    expect(headerBackgroundPresetsFor('PULSE_EMBER')[0]).toBe('marron');
    expect(headerBackgroundPresetsFor('NEON_COURT')[0]).toBe('violet');
    expect(headerBackgroundPresetsFor('FRESH_PITCH')[0]).toBe('vert');
    expect(headerBackgroundPresetsFor('CRIMSON_CHARGE')[0]).toBe('rouge');
  });
});
