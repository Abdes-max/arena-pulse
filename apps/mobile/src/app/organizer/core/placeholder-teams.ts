// Same as apps/web/src/app/admin/shared/placeholder-teams.ts -- keep in sync.
// Mirrors PLACEHOLDER_TEAM_NAME_PREFIX in apps/api/src/tournaments/quick-plateau.service.ts.
const PLACEHOLDER_NAME = /^Équipe \d+$/;

/** True for a name the quick plateau flow generated and nobody has replaced yet. */
export function isPlaceholderTeamName(name: string): boolean {
  return PLACEHOLDER_NAME.test(name.trim());
}

/**
 * Turns a pasted list (one name per line, or comma/semicolon separated)
 * into new names for the given teams, in order: placeholder teams first,
 * so pasting "the clubs that are coming" fills the "Équipe N" slots without
 * touching teams already renamed. Extra names are ignored, blank ones skipped.
 */
export function assignPastedNames<T extends { id: string; name: string }>(
  teams: readonly T[],
  pasted: string,
): Map<string, string> {
  const names = pasted
    .split(/[\n;,]/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const targets = [
    ...teams.filter((team) => isPlaceholderTeamName(team.name)),
    ...teams.filter((team) => !isPlaceholderTeamName(team.name)),
  ];
  const renames = new Map<string, string>();
  names.slice(0, targets.length).forEach((name, index) => renames.set(targets[index].id, name));
  return renames;
}
