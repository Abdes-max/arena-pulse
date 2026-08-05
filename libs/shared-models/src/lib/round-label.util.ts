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
