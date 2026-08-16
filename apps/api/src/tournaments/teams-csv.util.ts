const DELIMITER = ';';

/** Minimal RFC4180-style tokenizer (quoted fields, "" escaping, embedded delimiter/newline). */
function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === DELIMITER) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function escapeCsvField(value: string): string {
  if (
    value.includes(DELIMITER) ||
    value.includes('"') ||
    value.includes('\n')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export interface TeamCsvRow {
  line: number;
  name: string;
  categoryName: string;
  divisionName?: string;
  managerName?: string;
  managerEmail?: string;
  managerPhone?: string;
  // Either an existing /uploads/team-logos/... path (re-referenced as-is,
  // no re-upload needed -- typically a value round-tripped from a previous
  // export) or an absolute http(s) URL to fetch and store as a fresh logo.
  // See TeamsService.resolveImportLogoUrl.
  logoUrl?: string;
}

export interface TeamCsvRowError {
  line: number;
  message: string;
}

export interface TeamCsvParseResult {
  rows: TeamCsvRow[];
  errors: TeamCsvRowError[];
}

/** First line is treated as a header and skipped; blank lines are ignored. */
export function parseTeamsCsv(csv: string): TeamCsvParseResult {
  const allRows = tokenizeCsv(csv).filter(
    (fields) => !fields.every((cell) => cell.trim() === ''),
  );
  const dataRows = allRows.slice(1);

  const rows: TeamCsvRow[] = [];
  const errors: TeamCsvRowError[] = [];

  dataRows.forEach((fields, index) => {
    const line = index + 2;
    const [
      name,
      categoryName,
      divisionName,
      managerName,
      managerEmail,
      managerPhone,
      logoUrl,
    ] = fields;
    if (!name?.trim()) {
      errors.push({ line, message: "Nom d'équipe manquant." });
      return;
    }
    if (!categoryName?.trim()) {
      errors.push({ line, message: 'Catégorie manquante.' });
      return;
    }
    rows.push({
      line,
      name: name.trim(),
      categoryName: categoryName.trim(),
      divisionName: divisionName?.trim() || undefined,
      managerName: managerName?.trim() || undefined,
      managerEmail: managerEmail?.trim() || undefined,
      managerPhone: managerPhone?.trim() || undefined,
      logoUrl: logoUrl?.trim() || undefined,
    });
  });

  return { rows, errors };
}

export interface TeamCsvExportRow {
  name: string;
  categoryName: string;
  divisionName: string | null;
  managerName: string | null;
  managerEmail: string | null;
  managerPhone: string | null;
  logoUrl: string | null;
}

export function serializeTeamsCsv(rows: TeamCsvExportRow[]): string {
  const lines = [
    [
      'nom',
      'categorie',
      'division',
      'responsable',
      'email_responsable',
      'telephone_responsable',
      'logo',
    ],
    ...rows.map((row) => [
      row.name,
      row.categoryName,
      row.divisionName ?? '',
      row.managerName ?? '',
      row.managerEmail ?? '',
      row.managerPhone ?? '',
      row.logoUrl ?? '',
    ]),
  ];
  return lines
    .map((line) => line.map(escapeCsvField).join(DELIMITER))
    .join('\r\n');
}
