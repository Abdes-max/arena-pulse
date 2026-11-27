/** One knockout tier of a "Poules puis élimination directe" structure, as typed in the wizard. */
export interface PresetTierDraft {
  name: string;
  qualifiersPerPool: string;
}

/** The "meilleurs classés" option: the `count` best teams finishing at `position`. */
export interface PresetBestOfPosition {
  position: number;
  count: number;
}

/** An i18n key under organizer.wizard.structure.errors, with its parameters. */
export interface PresetError {
  key: string;
  params: Record<string, string | number>;
}

const isPowerOfTwo = (n: number) => n >= 2 && (n & (n - 1)) === 0;

/**
 * Why a "Poules puis élimination directe" structure can't be generated, or
 * null when it can -- the same checks as the web's Structure page
 * (apps/web admin/pages/structure presetValidationError), so the wizard
 * blocks "Suivant" with a clear message instead of an API error.
 * `tierName(i)` names a tier left blank ("Palier 2"...).
 */
export function poolsKnockoutPresetError(options: {
  teamCount: number;
  poolCount: number;
  tiers: PresetTierDraft[];
  bestOfPosition: PresetBestOfPosition | null;
  tierName: (index: number) => string;
}): PresetError | null {
  const { teamCount, poolCount, tiers, bestOfPosition, tierName } = options;
  if (!poolCount || !teamCount || tiers.some((tier) => !Number(tier.qualifiersPerPool))) {
    return null;
  }
  if (poolCount > teamCount) {
    return { key: 'poolsExceedTeams', params: {} };
  }
  const smallestPoolSize = Math.floor(teamCount / poolCount);
  const totalQualifiers = tiers.reduce((sum, tier) => sum + Number(tier.qualifiersPerPool), 0);
  if (totalQualifiers > smallestPoolSize) {
    return {
      key: 'tooManyQualifiersForSmallestPool',
      params: { teamCount, poolCount, smallestPoolSize, totalQualifiers },
    };
  }
  const bestCount = bestOfPosition?.count ?? 0;
  if (bestOfPosition && bestOfPosition.position && bestCount) {
    const bestPosition = bestOfPosition.position;
    if (bestCount > poolCount) {
      return { key: 'bestOfPositionExceedsPools', params: { bestCount, bestPosition, poolCount } };
    }
    if (bestPosition <= totalQualifiers) {
      return { key: 'bestOfPositionOverlapsDirect', params: { bestPosition, totalQualifiers } };
    }
    if (bestPosition > smallestPoolSize) {
      return { key: 'bestOfPositionNotInSmallestPool', params: { bestPosition, smallestPoolSize } };
    }
  }
  for (const [index, tier] of tiers.entries()) {
    const qualifiers = Number(tier.qualifiersPerPool);
    // The best-placed teams join the first tier's bracket.
    const tierBest = index === 0 ? bestCount : 0;
    const bracketSize = poolCount * qualifiers + tierBest;
    if (!isPowerOfTwo(bracketSize)) {
      const name = tier.name.trim() || tierName(index);
      return tierBest
        ? {
            key: 'tierBracketNotPowerOfTwoWithBest',
            params: { tierName: name, poolCount, qualifiers, bestCount: tierBest, bracketSize },
          }
        : {
            key: 'tierBracketNotPowerOfTwo',
            params: { tierName: name, poolCount, qualifiers, bracketSize },
          };
    }
  }
  return null;
}
