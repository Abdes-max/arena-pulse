import type { CompetitionPhase, Match } from './models';

// French knockout-round naming, by distance from the final (fromEnd = 0 is
// the final itself, 1 = semifinals, 2 = quarterfinals, 3 = round of 16...).
// The "Xièmes de finale" naming counts *matches* in that round, not teams --
// a round of 16 teams (8 matches) is "huitièmes de finale", not "seizièmes"
// -- see docs/product/business-rules.md.
const ORDINAL_WORD: Record<number, string> = {
  1: 'Demi',
  2: 'Quart',
  3: 'Huitième',
  4: 'Seizième',
  5: 'Trente-deuxième',
  6: 'Soixante-quatrième',
};

function ordinalWord(fromEnd: number): string {
  return ORDINAL_WORD[fromEnd] ?? `1/${2 ** fromEnd}`;
}

/** Singular label for one match in that round (e.g. "Quart de finale"). */
export function roundLabel(fromEnd: number): string {
  if (fromEnd <= 0) {
    return 'Finale';
  }
  if (fromEnd === 1) {
    return 'Demi-finale';
  }
  return `${ordinalWord(fromEnd)} de finale`;
}

/** Plural label for the round as a whole (e.g. a bracket column or tab title: "Quarts de finale"). */
export function roundLabelPlural(fromEnd: number): string {
  if (fromEnd <= 0) {
    return 'Finale';
  }
  // Every round name is "<ordinal-word>[-| ]finale" -- pluralize just the
  // leading ordinal token ("Quart" -> "Quarts", "Demi-finale" -> "Demi-finales").
  return roundLabel(fromEnd).replace(/^(\S+)/, '$1s');
}

/** A team's elimination stage for the final ranking (e.g. "Quart de finaliste éliminé"). */
export function eliminatedAtLabel(fromEnd: number): string {
  if (fromEnd === 1) {
    return 'Demi-finaliste éliminé';
  }
  return `${ordinalWord(fromEnd)} de finaliste éliminé`;
}

/** Compact fraction label for tight spaces (match card headers): "1/8", "1/4", "1/2", "Finale". */
export function roundLabelCompact(fromEnd: number): string {
  return fromEnd <= 0 ? 'Finale' : `1/${2 ** fromEnd}`;
}

/**
 * A match's round, formatted for display: "Tour N" for group-stage matches
 * (round there just counts matchdays, no bracket to name rounds after), the
 * knockout round name/fraction otherwise -- style 'compact' picks the
 * "1/8"/"1/4" fraction notation, 'full' the French word ("Huitième de
 * finale") used elsewhere (bracket columns, final ranking).
 */
export function matchRoundLabel(
  phase: Pick<CompetitionPhase, 'type' | 'knockoutBracket'>,
  match: Pick<Match, 'round' | 'isThirdPlaceMatch'>,
  style: 'compact' | 'full' = 'full',
): string {
  if (phase.type === 'GROUP_STAGE' || !phase.knockoutBracket) {
    return `Tour ${match.round}`;
  }
  if (match.isThirdPlaceMatch) {
    return 'Match pour la 3e place';
  }
  const totalRounds = Math.log2(phase.knockoutBracket.size);
  const fromEnd = totalRounds - match.round;
  return style === 'compact' ? roundLabelCompact(fromEnd) : roundLabel(fromEnd);
}

export interface PhaseMatchSection {
  label: string;
  matches: Match[];
}

/**
 * Groups a phase's matches into labeled sections for organizer-facing UIs
 * (Calendrier's "Non planifiés" list, Scores) -- one heading per section,
 * shown once, rather than repeating the phase/round on every match. A
 * group-stage phase is a single "Phase de poules" section (pool matches
 * don't have a meaningfully distinct named round); a knockout phase gets
 * one section per round in full French wording ("Huitième de finale",
 * "Quart de finale"...), with the 3rd-place match split into its own
 * trailing section since it shares its round number with the final but
 * isn't the same thing.
 */
export function groupMatchesByPhaseSection(
  phase: Pick<CompetitionPhase, 'type' | 'knockoutBracket'>,
  matches: Match[],
): PhaseMatchSection[] {
  if (phase.type === 'GROUP_STAGE' || !phase.knockoutBracket) {
    return matches.length > 0 ? [{ label: 'Phase de poules', matches }] : [];
  }

  const thirdPlace = matches.filter((match) => match.isThirdPlaceMatch);
  const regular = matches.filter((match) => !match.isThirdPlaceMatch);

  const groups = new Map<number, Match[]>();
  for (const match of regular) {
    const list = groups.get(match.round) ?? [];
    list.push(match);
    groups.set(match.round, list);
  }
  const sections = [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, roundMatches]) => ({
      label: matchRoundLabel(phase, roundMatches[0], 'full'),
      matches: roundMatches,
    }));

  if (thirdPlace.length > 0) {
    sections.push({ label: 'Match pour la 3e place', matches: thirdPlace });
  }
  return sections;
}
