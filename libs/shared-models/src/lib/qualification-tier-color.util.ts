export interface QualificationTierColor {
  /**
   * Badge text/border -- a fixed "win" green family (sport-outcome
   * semantic, same as ap-badge's own "qualified" status), darkest for the
   * first/top tier down to lightest for the last one.
   */
  color: string;
  /**
   * Row background wash -- the tournament's own theme accent
   * (--ap-color-signal), never a hardcoded hue, so it still matches
   * whichever theme the organizer picked (ink-signal/pulse-ember/
   * neon-court) the same way the previous single-tier highlight
   * (--ap-color-signal-soft) did. Only the mix ratio (how strong the tint
   * is) varies per tier -- the color itself never changes.
   */
  soft: string;
}

/**
 * Dark-to-light shades of green, one per knockout tier a pool's teams can be
 * routed to (e.g. 1-2 -> LDC, 3-4 -> EP, 5 -> CF) -- index 0 (the
 * first/top tier) gets the strongest badge shade and row tint, the last
 * tier the lightest, so the standings table's "Qualifié" badge and its row
 * highlight can show which specific tier a team is headed to instead of one
 * generic look once there's more than one.
 */
export function qualificationTierColor(index: number, total: number): QualificationTierColor {
  const step = total > 1 ? index / (total - 1) : 0;
  const lightness = 28 + step * 42;
  const mixPercent = 20 - step * 14;
  return {
    color: `hsl(142 45% ${lightness}%)`,
    soft: `color-mix(in srgb, var(--ap-color-signal) ${mixPercent}%, transparent)`,
  };
}
