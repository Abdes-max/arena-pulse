import { z } from 'zod';

/**
 * Props for the MatchRecap composition. Kept intentionally small -- just
 * what's needed to render the clip -- rather than passing a full Match/
 * Tournament object through to the render layer.
 */
export const matchRecapSchema = z.object({
  tournamentName: z.string(),
  venueName: z.string().nullable(),
  theme: z.enum([
    'INK_SIGNAL',
    'PULSE_EMBER',
    'NEON_COURT',
    'FRESH_PITCH',
    'CRIMSON_CHARGE',
  ]),
  homeTeamName: z.string(),
  awayTeamName: z.string(),
  homeScore: z.number().int().nonnegative(),
  awayScore: z.number().int().nonnegative(),
});

export type MatchRecapProps = z.infer<typeof matchRecapSchema>;
