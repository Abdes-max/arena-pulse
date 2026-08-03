#!/usr/bin/env node
// Seeds a rich demo dataset via the public API: 6 tournaments spanning
// different sports, public themes, and competition formats (pure knockout,
// pure round-robin/championship, groups + knockout, groups-only/multi-pool,
// a larger bracket, and a multi-category tournament). Meant for manual UI
// verification — safe to re-run any time the local dev database is reset
// (each run creates a fresh organization and fresh tournaments).
//
// Usage: node infra/scripts/seed-demo-data.mjs
// Env:   API_URL (default http://localhost:3000/api/v1)

const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';

async function api(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

/** Deterministic, plausible-looking score for a given sport family. */
function sampleScore(sportName, seed) {
  const ranges = {
    Football: [0, 4],
    Handball: [18, 34],
    Basketball: [58, 92],
    Rugby: [8, 32],
    Volleyball: [0, 3], // sets won
    Tennis: [0, 2], // sets won
  };
  const [lo, hi] = ranges[sportName] ?? [0, 3];
  const span = hi - lo + 1;
  const home = lo + ((seed * 7 + 3) % span);
  let away = lo + ((seed * 5 + 1) % span);
  if (away === home) away = lo + ((away - lo + 1) % span);
  return { homeScore: home, awayScore: away };
}

async function createTournament(token, orgId, { name, sportId, theme, startDate, endDate }) {
  return api('POST', `/organizations/${orgId}/tournaments`, token, {
    name,
    sportId,
    theme,
    startDate,
    endDate,
  });
}

async function createVenueAndField(token, orgId, tournamentId, venueName, fieldName) {
  const venue = await api('POST', `/organizations/${orgId}/tournaments/${tournamentId}/venues`, token, {
    name: venueName,
  });
  const field = await api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/venues/${venue.id}/fields`,
    token,
    { name: fieldName },
  );
  return field.id;
}

async function createCategory(token, orgId, tournamentId, name) {
  return api('POST', `/organizations/${orgId}/tournaments/${tournamentId}/categories`, token, { name });
}

async function createPhase(token, orgId, tournamentId, categoryId, { name, type }) {
  return api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/categories/${categoryId}/phases`,
    token,
    { name, type },
  );
}

async function createGroup(token, orgId, tournamentId, phaseId, name) {
  return api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/phases/${phaseId}/groups`,
    token,
    { name },
  );
}

async function createTeam(token, orgId, tournamentId, { name, categoryId }) {
  return api('POST', `/organizations/${orgId}/tournaments/${tournamentId}/teams`, token, {
    name,
    categoryId,
  });
}

async function assignTeamGroup(token, orgId, tournamentId, teamId, groupId) {
  return api(
    'PATCH',
    `/organizations/${orgId}/tournaments/${tournamentId}/teams/${teamId}/group`,
    token,
    { groupId },
  );
}

async function createQualificationRule(token, orgId, tournamentId, groupId, dto) {
  return api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/groups/${groupId}/qualification-rules`,
    token,
    dto,
  );
}

async function createKnockoutBracket(token, orgId, tournamentId, phaseId, dto) {
  return api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/phases/${phaseId}/knockout-bracket`,
    token,
    dto,
  );
}

async function generateSchedule(token, orgId, tournamentId, phaseId, { fieldIds, startDateTime }) {
  return api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/phases/${phaseId}/generate-schedule`,
    token,
    { fieldIds, startDateTime },
  );
}

async function generateBracketMatches(token, orgId, tournamentId, bracketId) {
  return api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/knockout-brackets/${bracketId}/generate-matches`,
    token,
  );
}

async function putScore(token, orgId, tournamentId, matchId, dto) {
  return api('PUT', `/organizations/${orgId}/tournaments/${tournamentId}/matches/${matchId}/score`, token, dto);
}

async function validateScore(token, orgId, tournamentId, matchId) {
  return api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/matches/${matchId}/score/validate`,
    token,
  );
}

async function publishTournament(token, orgId, tournamentId) {
  return api('POST', `/organizations/${orgId}/tournaments/${tournamentId}/publish`, token);
}

async function playMatches(ctx, { tournamentId, matches, sportName, playRatio, liveOne }) {
  const { token, orgId } = ctx;
  const playCount = Math.round(matches.length * playRatio);
  let markedLive = false;
  for (let i = 0; i < matches.length && i < playCount; i++) {
    const match = matches[i];
    const score = sampleScore(sportName, i + 1);
    await putScore(token, orgId, tournamentId, match.id, score);
    if (liveOne && !markedLive && i === playCount - 1) {
      // Leave the very last one "live" (score entered, not validated) for a visible EN DIRECT badge.
      markedLive = true;
      continue;
    }
    await validateScore(token, orgId, tournamentId, match.id);
  }
}

async function buildRoundRobinCategory(ctx, { tournamentId, sportName, categoryName, groupNames, teamsPerGroup, playRatio, liveOne }) {
  const { token, orgId, fieldId, startDateTime } = ctx;
  const category = await createCategory(token, orgId, tournamentId, categoryName);
  const phase = await createPhase(token, orgId, tournamentId, category.id, { name: 'Poules', type: 'GROUP_STAGE' });

  for (let g = 0; g < groupNames.length; g++) {
    const group = await createGroup(token, orgId, tournamentId, phase.id, groupNames[g]);
    for (const name of teamsPerGroup[g]) {
      const team = await createTeam(token, orgId, tournamentId, { name, categoryId: category.id });
      await assignTeamGroup(token, orgId, tournamentId, team.id, group.id);
    }
  }

  const matches = await generateSchedule(token, orgId, tournamentId, phase.id, {
    fieldIds: [fieldId],
    startDateTime,
  });
  await playMatches(ctx, { tournamentId, matches, sportName, playRatio, liveOne });
  return { category, phase };
}

async function buildGroupsPlusKnockoutCategory(ctx, {
  tournamentId,
  sportName,
  categoryName,
  groupNames,
  teamsPerGroup,
  qualifyPerGroup,
  bracketSize,
  hasRankingMatch,
  playRatio,
}) {
  const { token, orgId, fieldId, startDateTime } = ctx;
  const category = await createCategory(token, orgId, tournamentId, categoryName);
  const groupPhase = await createPhase(token, orgId, tournamentId, category.id, {
    name: 'Phase de poules',
    type: 'GROUP_STAGE',
  });

  const groups = [];
  for (let g = 0; g < groupNames.length; g++) {
    const group = await createGroup(token, orgId, tournamentId, groupPhase.id, groupNames[g]);
    for (const name of teamsPerGroup[g]) {
      const team = await createTeam(token, orgId, tournamentId, { name, categoryId: category.id });
      await assignTeamGroup(token, orgId, tournamentId, team.id, group.id);
    }
    groups.push(group);
  }

  const groupMatches = await generateSchedule(token, orgId, tournamentId, groupPhase.id, {
    fieldIds: [fieldId],
    startDateTime,
  });
  await playMatches(ctx, { tournamentId, matches: groupMatches, sportName, playRatio, liveOne: false });

  const knockoutPhase = await createPhase(token, orgId, tournamentId, category.id, {
    name: 'Phase finale',
    type: 'KNOCKOUT',
  });
  for (const group of groups) {
    await createQualificationRule(token, orgId, tournamentId, group.id, {
      fromPosition: 1,
      toPosition: qualifyPerGroup,
      targetPhaseId: knockoutPhase.id,
    });
  }
  const bracket = await createKnockoutBracket(token, orgId, tournamentId, knockoutPhase.id, {
    name: 'Tableau final',
    size: bracketSize,
    hasRankingMatch,
  });
  const bracketMatches = await generateBracketMatches(token, orgId, tournamentId, bracket.id);
  await playMatches(ctx, { tournamentId, matches: bracketMatches, sportName, playRatio: 0.5, liveOne: true });

  return { category, groupPhase, knockoutPhase, bracket };
}

async function buildKnockoutOnlyCategory(ctx, {
  tournamentId,
  sportName,
  categoryName,
  teamNames,
  bracketSize,
  hasRankingMatch,
}) {
  const { token, orgId } = ctx;
  const category = await createCategory(token, orgId, tournamentId, categoryName);
  // A single "seeding" group is required by the data model even for a pure
  // knockout: qualification rules always point from a group's standings.
  // With no matches played, standings default to alphabetical team-name
  // order, which is a fine, deterministic seed for demo data.
  const seedPhase = await createPhase(token, orgId, tournamentId, category.id, {
    name: 'Engagés',
    type: 'GROUP_STAGE',
  });
  const seedGroup = await createGroup(token, orgId, tournamentId, seedPhase.id, 'Engagés');
  for (const name of teamNames) {
    const team = await createTeam(token, orgId, tournamentId, { name, categoryId: category.id });
    await assignTeamGroup(token, orgId, tournamentId, team.id, seedGroup.id);
  }

  const knockoutPhase = await createPhase(token, orgId, tournamentId, category.id, {
    name: 'Tableau',
    type: 'KNOCKOUT',
  });
  await createQualificationRule(token, orgId, tournamentId, seedGroup.id, {
    fromPosition: 1,
    toPosition: teamNames.length,
    targetPhaseId: knockoutPhase.id,
  });
  const bracket = await createKnockoutBracket(token, orgId, tournamentId, knockoutPhase.id, {
    name: 'Tableau principal',
    size: bracketSize,
    hasRankingMatch,
  });
  const matches = await generateBracketMatches(token, orgId, tournamentId, bracket.id);
  await playMatches(ctx, { tournamentId, matches, sportName, playRatio: 0.5, liveOne: true });

  return { category, knockoutPhase, bracket };
}

async function main() {
  const stamp = Date.now();
  const email = `demo-${stamp}@example.com`;
  const password = 'a-very-strong-password';

  console.log(`Registering demo organization (${email})…`);
  const register = await api('POST', '/auth/register', null, {
    email,
    password,
    organizationName: `Demo Data ${stamp}`,
    firstName: 'Demo',
    lastName: 'Data',
  });
  const token = register.accessToken;
  const orgId = register.organization.id;

  const sports = await api('GET', '/sports', token);
  const sportId = (name) => {
    const sport = sports.find((s) => s.name === name);
    if (!sport) throw new Error(`Sport not found: ${name}`);
    return sport.id;
  };

  const results = [];

  // 1. Football — pure knockout showcase (8 teams, 3rd-place match) — INK_SIGNAL
  {
    const sportName = 'Football';
    const tournament = await createTournament(token, orgId, {
      name: 'Coupe Éliminatoire',
      sportId: sportId(sportName),
      theme: 'INK_SIGNAL',
      startDate: '2026-08-15',
      endDate: '2026-08-16',
    });
    const fieldId = await createVenueAndField(token, orgId, tournament.id, 'Stade Municipal', 'Terrain 1');
    const ctx = { token, orgId, fieldId, startDateTime: '2026-08-15T09:00:00.000Z' };
    await buildKnockoutOnlyCategory(ctx, {
      tournamentId: tournament.id,
      sportName,
      categoryName: 'Senior',
      teamNames: [
        'Les Aigles',
        'Les Lions',
        'Les Requins',
        'Les Panthères',
        'Les Loups',
        'Les Tigres',
        'Les Faucons',
        'Les Guépards',
      ],
      bracketSize: 8,
      hasRankingMatch: true,
    });
    await publishTournament(token, orgId, tournament.id);
    results.push({ tournament, sportName, theme: 'INK_SIGNAL', format: 'Élimination directe (8 équipes + petite finale)' });
  }

  // 2. Basketball — pure round-robin championship (6 teams) — PULSE_EMBER
  {
    const sportName = 'Basketball';
    const tournament = await createTournament(token, orgId, {
      name: 'Championnat Régional',
      sportId: sportId(sportName),
      theme: 'PULSE_EMBER',
      startDate: '2026-08-20',
      endDate: '2026-08-24',
    });
    const fieldId = await createVenueAndField(token, orgId, tournament.id, 'Gymnase Central', 'Terrain A');
    const ctx = { token, orgId, fieldId, startDateTime: '2026-08-20T10:00:00.000Z' };
    await buildRoundRobinCategory(ctx, {
      tournamentId: tournament.id,
      sportName,
      categoryName: 'Senior',
      groupNames: ['Poule Unique'],
      teamsPerGroup: [
        ['Les Slammers', 'Les Rockets', 'Les Titans', 'Les Comètes', 'Les Éclairs', 'Les Griffons'],
      ],
      playRatio: 0.7,
      liveOne: true,
    });
    await publishTournament(token, orgId, tournament.id);
    results.push({ tournament, sportName, theme: 'PULSE_EMBER', format: 'Championnat (poule unique, toutes rondes, pas de phase finale)' });
  }

  // 3. Handball — groups + knockout (2 groups of 4 -> top 2 -> bracket of 4) — NEON_COURT
  {
    const sportName = 'Handball';
    const tournament = await createTournament(token, orgId, {
      name: 'Trophée Régional',
      sportId: sportId(sportName),
      theme: 'NEON_COURT',
      startDate: '2026-09-05',
      endDate: '2026-09-07',
    });
    const fieldId = await createVenueAndField(token, orgId, tournament.id, 'Palais des Sports', 'Aire de jeu 1');
    const ctx = { token, orgId, fieldId, startDateTime: '2026-09-05T09:00:00.000Z' };
    await buildGroupsPlusKnockoutCategory(ctx, {
      tournamentId: tournament.id,
      sportName,
      categoryName: 'Senior',
      groupNames: ['Groupe A', 'Groupe B'],
      teamsPerGroup: [
        ['Les Spartiates', 'Les Vikings', 'Les Gladiateurs', 'Les Centurions'],
        ['Les Berserkers', 'Les Samouraïs', 'Les Cosaques', 'Les Mousquetaires'],
      ],
      qualifyPerGroup: 2,
      bracketSize: 4,
      hasRankingMatch: true,
      playRatio: 0.75,
    });
    await publishTournament(token, orgId, tournament.id);
    results.push({ tournament, sportName, theme: 'NEON_COURT', format: 'Poules (2x4) + phase finale à élimination directe' });
  }

  // 4. Volleyball — groups only, no knockout (2 pools, each its own mini-championship) — INK_SIGNAL
  {
    const sportName = 'Volleyball';
    const tournament = await createTournament(token, orgId, {
      name: 'Ligue de Poules',
      sportId: sportId(sportName),
      theme: 'INK_SIGNAL',
      startDate: '2026-09-12',
      endDate: '2026-09-14',
    });
    const fieldId = await createVenueAndField(token, orgId, tournament.id, 'Complexe Sportif', 'Terrain B');
    const ctx = { token, orgId, fieldId, startDateTime: '2026-09-12T09:00:00.000Z' };
    await buildRoundRobinCategory(ctx, {
      tournamentId: tournament.id,
      sportName,
      categoryName: 'Senior',
      groupNames: ['Groupe A', 'Groupe B'],
      teamsPerGroup: [
        ['Les Dauphins', 'Les Marlins', 'Les Orques', 'Les Barracudas'],
        ['Les Piranhas', 'Les Hippocampes', 'Les Murènes', 'Les Anguilles'],
      ],
      playRatio: 0.6,
      liveOne: false,
    });
    await publishTournament(token, orgId, tournament.id);
    results.push({ tournament, sportName, theme: 'INK_SIGNAL', format: 'Poules uniquement (2 groupes), pas de phase finale' });
  }

  // 5. Tennis — larger bracket (16 players, no ranking match) — PULSE_EMBER
  {
    const sportName = 'Tennis';
    const tournament = await createTournament(token, orgId, {
      name: 'Grand Chelem Test',
      sportId: sportId(sportName),
      theme: 'PULSE_EMBER',
      startDate: '2026-09-20',
      endDate: '2026-09-24',
    });
    const fieldId = await createVenueAndField(token, orgId, tournament.id, 'Club de Tennis', 'Court Central');
    const ctx = { token, orgId, fieldId, startDateTime: '2026-09-20T09:00:00.000Z' };
    await buildKnockoutOnlyCategory(ctx, {
      tournamentId: tournament.id,
      sportName,
      categoryName: 'Simple Messieurs',
      teamNames: [
        'Alex Dupont',
        'Marie Lefèvre',
        'Karim Haddad',
        'Julie Moreau',
        'Thomas Bernard',
        'Sophie Girard',
        'Nathan Petit',
        'Camille Rousseau',
        'Lucas Fontaine',
        'Emma Chevalier',
        'Hugo Lambert',
        'Léa Robert',
        'Maxime Roux',
        'Chloé Vidal',
        'Antoine Faure',
        'Manon Barbier',
      ],
      bracketSize: 16,
      hasRankingMatch: false,
    });
    await publishTournament(token, orgId, tournament.id);
    results.push({ tournament, sportName, theme: 'PULSE_EMBER', format: 'Élimination directe, tableau de 16' });
  }

  // 6. Rugby — multi-category tournament (Senior: groups+knockout; Vétérans: championship) — NEON_COURT
  {
    const sportName = 'Rugby';
    const tournament = await createTournament(token, orgId, {
      name: 'Tournoi Multi-Catégories',
      sportId: sportId(sportName),
      theme: 'NEON_COURT',
      startDate: '2026-10-03',
      endDate: '2026-10-05',
    });
    const fieldId = await createVenueAndField(token, orgId, tournament.id, 'Stade Rugby Club', 'Terrain d\'Honneur');
    const ctx = { token, orgId, fieldId, startDateTime: '2026-10-03T09:00:00.000Z' };
    await buildGroupsPlusKnockoutCategory(ctx, {
      tournamentId: tournament.id,
      sportName,
      categoryName: 'Senior',
      groupNames: ['Groupe A', 'Groupe B'],
      teamsPerGroup: [
        ['Les Rhinos', 'Les Bisons', 'Les Sangliers', 'Les Ours'],
        ['Les Aigles Royaux', 'Les Faucons Noirs', 'Les Loups Gris', 'Les Taureaux'],
      ],
      qualifyPerGroup: 2,
      bracketSize: 4,
      hasRankingMatch: true,
      playRatio: 0.75,
    });
    await buildRoundRobinCategory(ctx, {
      tournamentId: tournament.id,
      sportName,
      categoryName: 'Vétérans',
      groupNames: ['Poule Unique'],
      teamsPerGroup: [
        ['Les Vétérans du Nord', 'Les Anciens', 'Les Sages', 'Les Masters', 'Les Doyens', 'Les Increvables'],
      ],
      playRatio: 0.6,
      liveOne: false,
    });
    await publishTournament(token, orgId, tournament.id);
    results.push({
      tournament,
      sportName,
      theme: 'NEON_COURT',
      format: 'Multi-catégories : Senior (poules + finale) et Vétérans (championnat)',
    });
  }

  console.log('\n=== Jeu de données créé ===');
  console.log(`Organisation : ${register.organization.name} (login : ${email} / ${password})\n`);
  for (const r of results) {
    console.log(`- ${r.tournament.name} [${r.sportName} · ${r.theme}]`);
    console.log(`    Format   : ${r.format}`);
    console.log(`    Slug     : ${r.tournament.slug}`);
    console.log(`    Public   : http://localhost:4200/${r.tournament.slug}`);
    console.log(`    Admin    : http://localhost:4300/tournaments/${r.tournament.id}`);
  }
}

main().catch((error) => {
  console.error('\nÉchec du seed :', error.message ?? error);
  process.exit(1);
});
