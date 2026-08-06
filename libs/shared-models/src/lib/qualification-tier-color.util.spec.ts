import { qualificationTierColor } from './qualification-tier-color.util';

describe('qualificationTierColor', () => {
  it('returns the strongest badge shade and row tint for a single tier', () => {
    expect(qualificationTierColor(0, 1)).toEqual({
      color: 'hsl(142 45% 28%)',
      soft: 'color-mix(in srgb, var(--ap-color-signal) 20%, transparent)',
    });
  });

  it('goes from darkest (index 0) to lightest (last index) badge color', () => {
    expect(qualificationTierColor(0, 3).color).toBe('hsl(142 45% 28%)');
    expect(qualificationTierColor(2, 3).color).toBe('hsl(142 45% 70%)');
    expect(qualificationTierColor(1, 3).color).toBe('hsl(142 45% 49%)');
  });

  it('fades the row tint mix ratio from strongest to weakest, same theme accent throughout', () => {
    expect(qualificationTierColor(0, 4).soft).toBe(
      'color-mix(in srgb, var(--ap-color-signal) 20%, transparent)',
    );
    expect(qualificationTierColor(3, 4).soft).toBe(
      'color-mix(in srgb, var(--ap-color-signal) 6%, transparent)',
    );
  });
});
