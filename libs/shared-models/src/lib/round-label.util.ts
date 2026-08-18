import type { CompetitionPhase, Match } from './models';

// Knockout-round naming, by distance from the final (fromEnd = 0 is the
// final itself, 1 = semifinals, 2 = quarterfinals, 3 = round of 16...). The
// French "Xièmes de finale" naming counts *matches* in that round, not teams
// -- a round of 16 teams (8 matches) is "huitièmes de finale", not
// "seizièmes" -- see docs/product/business-rules.md. Every `lang` parameter
// below defaults to 'fr' so every existing call site (admin, mobile app --
// not translated yet, see docs/product/pull-request-plan.md's i18n entry)
// keeps its current French-only behaviour unless it opts in by passing the
// active language explicitly.
export type RoundLabelLang = 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt';

interface RoundNames {
  final: string;
  semiFinalSingular: string;
  semiFinalPlural: string;
  // Keyed by fromEnd (2 = quarterfinal, 3 = round of 16...). Each language
  // structures these compounds differently (French/Spanish/Italian/
  // Portuguese: "<ordinal> de final(e)"; English: idiomatic "Quarter-final"/
  // "Round of N"; German: a single compound word) -- full label strings per
  // round, not composed from a shared word + suffix template, so each
  // language's own idiom stays correct rather than forcing a French shape
  // onto the rest.
  ordinalSingular: Record<number, string>;
  ordinalPlural: Record<number, string>;
  eliminatedSemiFinal: string;
  eliminatedOrdinal: Record<number, string>;
  thirdPlace: string;
  groupStage: string;
  round: (n: number) => string;
  // Fallback beyond the named rounds above, given fromEnd itself (not a
  // precomputed count) since the two conventions below count different
  // things: fr/es/it/pt name the fraction by *matches* in that round
  // (2^fromEnd, e.g. "1/128 de finale" for 128 matches), matching the
  // named rounds' own "huitième"/"seizième" wording (huitième = 1/8 =
  // 8 matches); en/de instead name it by *teams* entering that round
  // (2^(fromEnd+1), the "Round of 128" convention), matching how those
  // languages' named rounds ("Round of 16", "Runde der letzten 64") are
  // read colloquially.
  fraction: (fromEnd: number) => string;
}

const ROUND_NAMES: Record<RoundLabelLang, RoundNames> = {
  fr: {
    final: 'Finale',
    semiFinalSingular: 'Demi-finale',
    semiFinalPlural: 'Demi-finales',
    ordinalSingular: {
      2: 'Quart de finale',
      3: 'Huitième de finale',
      4: 'Seizième de finale',
      5: 'Trente-deuxième de finale',
      6: 'Soixante-quatrième de finale',
    },
    ordinalPlural: {
      2: 'Quarts de finale',
      3: 'Huitièmes de finale',
      4: 'Seizièmes de finale',
      5: 'Trente-deuxièmes de finale',
      6: 'Soixante-quatrièmes de finale',
    },
    eliminatedSemiFinal: 'Demi-finaliste éliminé',
    eliminatedOrdinal: {
      2: 'Quart de finaliste éliminé',
      3: 'Huitième de finaliste éliminé',
      4: 'Seizième de finaliste éliminé',
      5: 'Trente-deuxième de finaliste éliminé',
      6: 'Soixante-quatrième de finaliste éliminé',
    },
    thirdPlace: 'Pour la 3e place',
    groupStage: 'Phase de poules',
    round: (n) => `Tour ${n}`,
    fraction: (fromEnd) => `1/${2 ** fromEnd} de finale`,
  },
  en: {
    final: 'Final',
    semiFinalSingular: 'Semi-final',
    semiFinalPlural: 'Semi-finals',
    ordinalSingular: {
      2: 'Quarter-final',
      3: 'Round of 16',
      4: 'Round of 32',
      5: 'Round of 64',
      6: 'Round of 128',
    },
    ordinalPlural: {
      2: 'Quarter-finals',
      3: 'Round of 16',
      4: 'Round of 32',
      5: 'Round of 64',
      6: 'Round of 128',
    },
    eliminatedSemiFinal: 'Eliminated in the semi-finals',
    eliminatedOrdinal: {
      2: 'Eliminated in the quarter-finals',
      3: 'Eliminated in the round of 16',
      4: 'Eliminated in the round of 32',
      5: 'Eliminated in the round of 64',
      6: 'Eliminated in the round of 128',
    },
    thirdPlace: 'Third-place match',
    groupStage: 'Group stage',
    round: (n) => `Round ${n}`,
    fraction: (fromEnd) => `Round of ${2 ** (fromEnd + 1)}`,
  },
  es: {
    final: 'Final',
    semiFinalSingular: 'Semifinal',
    semiFinalPlural: 'Semifinales',
    ordinalSingular: {
      2: 'Cuartos de final',
      3: 'Octavos de final',
      4: 'Dieciseisavos de final',
      5: 'Treintaidosavos de final',
      6: 'Sesentaicuatroavos de final',
    },
    ordinalPlural: {
      2: 'Cuartos de final',
      3: 'Octavos de final',
      4: 'Dieciseisavos de final',
      5: 'Treintaidosavos de final',
      6: 'Sesentaicuatroavos de final',
    },
    eliminatedSemiFinal: 'Semifinalista eliminado',
    eliminatedOrdinal: {
      2: 'Cuartofinalista eliminado',
      3: 'Octavofinalista eliminado',
      4: 'Eliminado en dieciseisavos',
      5: 'Eliminado en treintaidosavos',
      6: 'Eliminado en sesentaicuatroavos',
    },
    thirdPlace: 'Por el 3er puesto',
    groupStage: 'Fase de grupos',
    round: (n) => `Jornada ${n}`,
    fraction: (fromEnd) => `1/${2 ** fromEnd} de final`,
  },
  de: {
    final: 'Finale',
    semiFinalSingular: 'Halbfinale',
    semiFinalPlural: 'Halbfinals',
    ordinalSingular: {
      2: 'Viertelfinale',
      3: 'Achtelfinale',
      4: 'Sechzehntelfinale',
      5: 'Zweiunddreißigstelfinale',
      6: 'Vierundsechzigstelfinale',
    },
    ordinalPlural: {
      2: 'Viertelfinals',
      3: 'Achtelfinals',
      4: 'Sechzehntelfinals',
      5: 'Zweiunddreißigstelfinals',
      6: 'Vierundsechzigstelfinals',
    },
    eliminatedSemiFinal: 'Im Halbfinale ausgeschieden',
    eliminatedOrdinal: {
      2: 'Im Viertelfinale ausgeschieden',
      3: 'Im Achtelfinale ausgeschieden',
      4: 'Im Sechzehntelfinale ausgeschieden',
      5: 'Im Zweiunddreißigstelfinale ausgeschieden',
      6: 'Im Vierundsechzigstelfinale ausgeschieden',
    },
    thirdPlace: 'Spiel um Platz 3',
    groupStage: 'Gruppenphase',
    round: (n) => `Runde ${n}`,
    fraction: (fromEnd) => `Runde der letzten ${2 ** (fromEnd + 1)}`,
  },
  it: {
    final: 'Finale',
    semiFinalSingular: 'Semifinale',
    semiFinalPlural: 'Semifinali',
    ordinalSingular: {
      2: 'Quarti di finale',
      3: 'Ottavi di finale',
      4: 'Sedicesimi di finale',
      5: 'Trentaduesimi di finale',
      6: 'Sessantaquattresimi di finale',
    },
    ordinalPlural: {
      2: 'Quarti di finale',
      3: 'Ottavi di finale',
      4: 'Sedicesimi di finale',
      5: 'Trentaduesimi di finale',
      6: 'Sessantaquattresimi di finale',
    },
    eliminatedSemiFinal: 'Eliminato in semifinale',
    eliminatedOrdinal: {
      2: 'Eliminato ai quarti di finale',
      3: 'Eliminato agli ottavi di finale',
      4: 'Eliminato ai sedicesimi di finale',
      5: 'Eliminato ai trentaduesimi di finale',
      6: 'Eliminato ai sessantaquattresimi di finale',
    },
    thirdPlace: 'Finale per il 3° posto',
    groupStage: 'Fase a gironi',
    round: (n) => `Giornata ${n}`,
    fraction: (fromEnd) => `1/${2 ** fromEnd} di finale`,
  },
  pt: {
    final: 'Final',
    semiFinalSingular: 'Meia-final',
    semiFinalPlural: 'Meias-finais',
    ordinalSingular: {
      2: 'Quartos de final',
      3: 'Oitavos de final',
      4: 'Dezasseisavos de final',
      5: 'Trinta e dois avos de final',
      6: 'Sessenta e quatro avos de final',
    },
    ordinalPlural: {
      2: 'Quartos de final',
      3: 'Oitavos de final',
      4: 'Dezasseisavos de final',
      5: 'Trinta e dois avos de final',
      6: 'Sessenta e quatro avos de final',
    },
    eliminatedSemiFinal: 'Eliminado nas meias-finais',
    eliminatedOrdinal: {
      2: 'Eliminado nos quartos de final',
      3: 'Eliminado nos oitavos de final',
      4: 'Eliminado nos dezasseisavos de final',
      5: 'Eliminado nos trinta e dois avos de final',
      6: 'Eliminado nos sessenta e quatro avos de final',
    },
    thirdPlace: 'Jogo pelo 3.º lugar',
    groupStage: 'Fase de grupos',
    round: (n) => `Jornada ${n}`,
    fraction: (fromEnd) => `1/${2 ** fromEnd} de final`,
  },
};

/** Singular label for one match in that round (e.g. "Quart de finale"). */
export function roundLabel(fromEnd: number, lang: RoundLabelLang = 'fr'): string {
  const names = ROUND_NAMES[lang];
  if (fromEnd <= 0) {
    return names.final;
  }
  if (fromEnd === 1) {
    return names.semiFinalSingular;
  }
  return names.ordinalSingular[fromEnd] ?? names.fraction(fromEnd);
}

/** Plural label for the round as a whole (e.g. a bracket column or tab title: "Quarts de finale"). */
export function roundLabelPlural(fromEnd: number, lang: RoundLabelLang = 'fr'): string {
  const names = ROUND_NAMES[lang];
  if (fromEnd <= 0) {
    return names.final;
  }
  if (fromEnd === 1) {
    return names.semiFinalPlural;
  }
  return names.ordinalPlural[fromEnd] ?? names.fraction(fromEnd);
}

/** A team's elimination stage for the final ranking (e.g. "Quart de finaliste éliminé"). */
export function eliminatedAtLabel(fromEnd: number, lang: RoundLabelLang = 'fr'): string {
  const names = ROUND_NAMES[lang];
  if (fromEnd === 1) {
    return names.eliminatedSemiFinal;
  }
  return names.eliminatedOrdinal[fromEnd] ?? names.fraction(fromEnd);
}

/** Compact fraction label for tight spaces (match card headers): "1/8", "1/4", "1/2", "Finale". */
export function roundLabelCompact(fromEnd: number, lang: RoundLabelLang = 'fr'): string {
  return fromEnd <= 0 ? ROUND_NAMES[lang].final : `1/${2 ** fromEnd}`;
}

/**
 * A match's round, formatted for display: a matchday label for group-stage
 * matches (round there just counts matchdays, no bracket to name rounds
 * after), the knockout round name/fraction otherwise -- style 'compact'
 * picks the "1/8"/"1/4" fraction notation, 'full' the idiomatic round name
 * ("Huitième de finale"/"Round of 16") used elsewhere (bracket columns,
 * final ranking).
 */
export function matchRoundLabel(
  phase: Pick<CompetitionPhase, 'type' | 'knockoutBracket'>,
  match: Pick<Match, 'round' | 'isThirdPlaceMatch'>,
  style: 'compact' | 'full' = 'full',
  lang: RoundLabelLang = 'fr',
): string {
  if (phase.type === 'GROUP_STAGE' || !phase.knockoutBracket) {
    return ROUND_NAMES[lang].round(match.round);
  }
  if (match.isThirdPlaceMatch) {
    return ROUND_NAMES[lang].thirdPlace;
  }
  const totalRounds = Math.log2(phase.knockoutBracket.size);
  const fromEnd = totalRounds - match.round;
  return style === 'compact' ? roundLabelCompact(fromEnd, lang) : roundLabel(fromEnd, lang);
}

// Final-ranking stage labels ("Vainqueur"/"Finaliste"/"3e place"/"4e place")
// -- a separate small vocabulary from the round names above (used by
// final-ranking.util.ts's computeFinalRanking), kept in this same file since
// it's still part of the same "how do we name a bracket outcome" concern.
export interface FinalRankingStageLabels {
  winner: string;
  finalist: string;
  thirdPlace: string;
  fourthPlace: string;
}

const FINAL_RANKING_STAGE_LABELS: Record<RoundLabelLang, FinalRankingStageLabels> = {
  fr: {
    winner: 'Vainqueur',
    finalist: 'Finaliste',
    thirdPlace: '3e place',
    fourthPlace: '4e place',
  },
  en: { winner: 'Winner', finalist: 'Finalist', thirdPlace: '3rd place', fourthPlace: '4th place' },
  es: {
    winner: 'Campeón',
    finalist: 'Finalista',
    thirdPlace: '3er puesto',
    fourthPlace: '4.º puesto',
  },
  de: { winner: 'Sieger', finalist: 'Finalist', thirdPlace: '3. Platz', fourthPlace: '4. Platz' },
  it: {
    winner: 'Vincitore',
    finalist: 'Finalista',
    thirdPlace: '3° posto',
    fourthPlace: '4° posto',
  },
  pt: {
    winner: 'Vencedor',
    finalist: 'Finalista',
    thirdPlace: '3.º lugar',
    fourthPlace: '4.º lugar',
  },
};

export function finalRankingStageLabels(lang: RoundLabelLang = 'fr'): FinalRankingStageLabels {
  return FINAL_RANKING_STAGE_LABELS[lang];
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
 * one section per round in full wording ("Huitième de finale", "Quart de
 * finale"...), with the 3rd-place match split into its own trailing section
 * since it shares its round number with the final but isn't the same thing.
 */
export function groupMatchesByPhaseSection(
  phase: Pick<CompetitionPhase, 'type' | 'knockoutBracket'>,
  matches: Match[],
  lang: RoundLabelLang = 'fr',
): PhaseMatchSection[] {
  if (phase.type === 'GROUP_STAGE' || !phase.knockoutBracket) {
    return matches.length > 0 ? [{ label: ROUND_NAMES[lang].groupStage, matches }] : [];
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
      label: matchRoundLabel(phase, roundMatches[0], 'full', lang),
      matches: roundMatches,
    }));

  if (thirdPlace.length > 0) {
    sections.push({ label: ROUND_NAMES[lang].thirdPlace, matches: thirdPlace });
  }
  return sections;
}
