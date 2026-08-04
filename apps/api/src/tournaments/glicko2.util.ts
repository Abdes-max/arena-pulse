// Glicko-2 rating system (Mark Glickman, "Example of the Glicko-2 system").
// Pure math, no I/O -- verified in glicko2.util.spec.ts against the paper's
// published worked example.

const SCALE = 173.7178;

export const DEFAULT_RATING = 1500;
export const DEFAULT_RATING_DEVIATION = 350;
export const DEFAULT_VOLATILITY = 0.06;
export const DEFAULT_TAU = 0.5;
const CONVERGENCE_EPSILON = 0.000001;

export interface GlickoPlayer {
  rating: number;
  ratingDeviation: number;
  volatility: number;
}

export interface GlickoOpponentResult {
  opponent: GlickoPlayer;
  score: 0 | 0.5 | 1;
}

function toGlickoScale(player: GlickoPlayer): { mu: number; phi: number } {
  return {
    mu: (player.rating - DEFAULT_RATING) / SCALE,
    phi: player.ratingDeviation / SCALE,
  };
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectedScore(
  mu: number,
  muOpponent: number,
  phiOpponent: number,
): number {
  return 1 / (1 + Math.exp(-g(phiOpponent) * (mu - muOpponent)));
}

/**
 * Updates a single player's rating from the results of a rating period
 * (called with a period of size one per match, since ratings here update
 * live rather than in batches). Both players in a match must be updated
 * from a snapshot of each other's *pre-match* rating -- never sequentially,
 * or the second update would see the first player's already-updated value.
 */
export function updateGlicko2(
  player: GlickoPlayer,
  results: GlickoOpponentResult[],
  tau: number = DEFAULT_TAU,
): GlickoPlayer {
  const { mu, phi } = toGlickoScale(player);
  const sigma = player.volatility;

  if (results.length === 0) {
    // No games this period: rating and volatility are unchanged, but
    // uncertainty (RD) grows since we haven't confirmed the rating is
    // still accurate.
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return {
      rating: player.rating,
      ratingDeviation: phiStar * SCALE,
      volatility: sigma,
    };
  }

  const terms = results.map(({ opponent, score }) => {
    const { mu: muJ, phi: phiJ } = toGlickoScale(opponent);
    const gPhiJ = g(phiJ);
    const eValue = expectedScore(mu, muJ, phiJ);
    return { gPhiJ, eValue, score };
  });

  const vInverse = terms.reduce(
    (sum, { gPhiJ, eValue }) => sum + gPhiJ * gPhiJ * eValue * (1 - eValue),
    0,
  );
  const v = 1 / vInverse;

  const deltaSum = terms.reduce(
    (sum, { gPhiJ, eValue, score }) => sum + gPhiJ * (score - eValue),
    0,
  );
  const delta = v * deltaSum;

  const newVolatility = solveNewVolatility(delta, phi, v, sigma, tau);

  const phiStar = Math.sqrt(phi * phi + newVolatility * newVolatility);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * deltaSum;

  return {
    rating: SCALE * newMu + DEFAULT_RATING,
    ratingDeviation: SCALE * newPhi,
    volatility: newVolatility,
  };
}

/** Illinois-method root-find for the new volatility (Glickman's paper, step 5). */
function solveNewVolatility(
  delta: number,
  phi: number,
  v: number,
  sigma: number,
  tau: number,
): number {
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const numerator = ex * (delta * delta - phi * phi - v - ex);
    const denominator = 2 * Math.pow(phi * phi + v + ex, 2);
    return numerator / denominator - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) {
      k += 1;
    }
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > CONVERGENCE_EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB < 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }

  return Math.exp(A / 2);
}
