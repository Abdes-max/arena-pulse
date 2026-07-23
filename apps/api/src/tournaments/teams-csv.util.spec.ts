import { parseTeamsCsv, serializeTeamsCsv } from './teams-csv.util';

describe('parseTeamsCsv', () => {
  it('parses simple rows, skipping the header', () => {
    const csv =
      'nom;categorie;division\nLes Aigles;U10;Poule A\nLes Lions;U10;';

    const { rows, errors } = parseTeamsCsv(csv);

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        name: 'Les Aigles',
        categoryName: 'U10',
        divisionName: 'Poule A',
      },
      {
        line: 3,
        name: 'Les Lions',
        categoryName: 'U10',
        divisionName: undefined,
      },
    ]);
  });

  it('handles quoted fields containing the delimiter and escaped quotes', () => {
    const csv = 'nom;categorie;division\n"Les Aigles; Nord";U10;"Poule ""A"""';

    const { rows } = parseTeamsCsv(csv);

    expect(rows).toEqual([
      {
        line: 2,
        name: 'Les Aigles; Nord',
        categoryName: 'U10',
        divisionName: 'Poule "A"',
      },
    ]);
  });

  it('skips blank lines', () => {
    const csv = 'nom;categorie;division\n\nLes Aigles;U10;\n\n';

    const { rows } = parseTeamsCsv(csv);

    expect(rows).toHaveLength(1);
  });

  it('reports a missing team name', () => {
    const csv = 'nom;categorie;division\n;U10;';

    const { rows, errors } = parseTeamsCsv(csv);

    expect(rows).toEqual([]);
    expect(errors).toEqual([{ line: 2, message: "Nom d'équipe manquant." }]);
  });

  it('reports a missing category', () => {
    const csv = 'nom;categorie;division\nLes Aigles;;';

    const { rows, errors } = parseTeamsCsv(csv);

    expect(rows).toEqual([]);
    expect(errors).toEqual([{ line: 2, message: 'Catégorie manquante.' }]);
  });
});

describe('serializeTeamsCsv', () => {
  it('produces a header followed by one row per team', () => {
    const csv = serializeTeamsCsv([
      { name: 'Les Aigles', categoryName: 'U10', divisionName: 'Poule A' },
      { name: 'Les Lions', categoryName: 'U12', divisionName: null },
    ]);

    expect(csv).toBe(
      'nom;categorie;division\r\nLes Aigles;U10;Poule A\r\nLes Lions;U12;',
    );
  });

  it('quotes fields containing the delimiter or quotes', () => {
    const csv = serializeTeamsCsv([
      {
        name: 'Les Aigles; Nord',
        categoryName: 'U10',
        divisionName: 'Poule "A"',
      },
    ]);

    expect(csv).toBe(
      'nom;categorie;division\r\n"Les Aigles; Nord";U10;"Poule ""A"""',
    );
  });
});
