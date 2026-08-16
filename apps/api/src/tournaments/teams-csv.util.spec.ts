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
  const EMPTY_MANAGER_AND_LOGO = {
    managerName: null,
    managerEmail: null,
    managerPhone: null,
    logoUrl: null,
  };

  it('produces a header followed by one row per team', () => {
    const csv = serializeTeamsCsv([
      {
        name: 'Les Aigles',
        categoryName: 'U10',
        divisionName: 'Poule A',
        ...EMPTY_MANAGER_AND_LOGO,
      },
      {
        name: 'Les Lions',
        categoryName: 'U12',
        divisionName: null,
        ...EMPTY_MANAGER_AND_LOGO,
      },
    ]);

    expect(csv).toBe(
      'nom;categorie;division;responsable;email_responsable;telephone_responsable;logo\r\n' +
        'Les Aigles;U10;Poule A;;;;\r\n' +
        'Les Lions;U12;;;;;',
    );
  });

  it('quotes fields containing the delimiter or quotes', () => {
    const csv = serializeTeamsCsv([
      {
        name: 'Les Aigles; Nord',
        categoryName: 'U10',
        divisionName: 'Poule "A"',
        ...EMPTY_MANAGER_AND_LOGO,
      },
    ]);

    expect(csv).toBe(
      'nom;categorie;division;responsable;email_responsable;telephone_responsable;logo\r\n' +
        '"Les Aigles; Nord";U10;"Poule ""A""";;;;',
    );
  });

  it('includes manager and logo columns when present', () => {
    const csv = serializeTeamsCsv([
      {
        name: 'Les Aigles',
        categoryName: 'U10',
        divisionName: null,
        managerName: 'Jean Dupont',
        managerEmail: 'jean@example.com',
        managerPhone: '0600000000',
        logoUrl: '/uploads/team-logos/abc.png',
      },
    ]);

    expect(csv).toBe(
      'nom;categorie;division;responsable;email_responsable;telephone_responsable;logo\r\n' +
        'Les Aigles;U10;;Jean Dupont;jean@example.com;0600000000;/uploads/team-logos/abc.png',
    );
  });
});

describe('parseTeamsCsv manager and logo columns', () => {
  it('parses manager and logo columns when present', () => {
    const csv =
      'nom;categorie;division;responsable;email_responsable;telephone_responsable;logo\n' +
      'Les Aigles;U10;;Jean Dupont;jean@example.com;0600000000;https://example.com/logo.png';

    const { rows, errors } = parseTeamsCsv(csv);

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        name: 'Les Aigles',
        categoryName: 'U10',
        divisionName: undefined,
        managerName: 'Jean Dupont',
        managerEmail: 'jean@example.com',
        managerPhone: '0600000000',
        logoUrl: 'https://example.com/logo.png',
      },
    ]);
  });

  it('leaves manager and logo undefined when the columns are absent', () => {
    const csv = 'nom;categorie;division\nLes Aigles;U10;';

    const { rows } = parseTeamsCsv(csv);

    expect(rows[0].managerName).toBeUndefined();
    expect(rows[0].managerEmail).toBeUndefined();
    expect(rows[0].managerPhone).toBeUndefined();
    expect(rows[0].logoUrl).toBeUndefined();
  });
});
