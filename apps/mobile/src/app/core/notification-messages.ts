/**
 * Texts of the app's local notifications, in the 6 supported languages.
 * A plain dictionary rather than Transloco keys: notifications are built
 * outside any component (and some are scheduled hours ahead), so the
 * language is passed in explicitly by the caller.
 */
export type NotificationKind = 'reminder' | 'started' | 'score' | 'result' | 'test';

interface MessageParams {
  team?: string;
  home?: string;
  away?: string;
  homeScore?: number;
  awayScore?: number;
  minutes?: number;
  field?: string | null;
}

type Formatter = (params: MessageParams) => string;

const score = (p: MessageParams) =>
  `${p.home ?? '?'} ${p.homeScore} - ${p.awayScore} ${p.away ?? '?'}`;
const fieldSuffix = (field: string | null | undefined, joiner: string) =>
  field ? ` ${joiner} ${field}` : '';

const MESSAGES: Record<string, Record<NotificationKind, Formatter>> = {
  fr: {
    reminder: (p) =>
      `${p.home} - ${p.away} commence dans ${p.minutes} min${fieldSuffix(p.field, 'sur')}`,
    started: (p) => `${p.team} : le match a commencé`,
    score,
    result: (p) => `Match terminé : ${score(p)}`,
    test: () => 'Notification de test : tout fonctionne.',
  },
  en: {
    reminder: (p) =>
      `${p.home} - ${p.away} starts in ${p.minutes} min${fieldSuffix(p.field, 'on')}`,
    started: (p) => `${p.team}: the match has started`,
    score,
    result: (p) => `Full time: ${score(p)}`,
    test: () => 'Test notification: everything works.',
  },
  es: {
    reminder: (p) =>
      `${p.home} - ${p.away} empieza en ${p.minutes} min${fieldSuffix(p.field, 'en')}`,
    started: (p) => `${p.team}: el partido ha comenzado`,
    score,
    result: (p) => `Final del partido: ${score(p)}`,
    test: () => 'Notificación de prueba: todo funciona.',
  },
  de: {
    reminder: (p) =>
      `${p.home} - ${p.away} beginnt in ${p.minutes} Min.${fieldSuffix(p.field, 'auf')}`,
    started: (p) => `${p.team}: Das Spiel hat begonnen`,
    score,
    result: (p) => `Spielende: ${score(p)}`,
    test: () => 'Testbenachrichtigung: Alles funktioniert.',
  },
  it: {
    reminder: (p) =>
      `${p.home} - ${p.away} inizia tra ${p.minutes} min${fieldSuffix(p.field, 'su')}`,
    started: (p) => `${p.team}: la partita è iniziata`,
    score,
    result: (p) => `Partita finita: ${score(p)}`,
    test: () => 'Notifica di prova: tutto funziona.',
  },
  pt: {
    reminder: (p) =>
      `${p.home} - ${p.away} começa dentro de ${p.minutes} min${fieldSuffix(p.field, 'em')}`,
    started: (p) => `${p.team}: o jogo começou`,
    score,
    result: (p) => `Fim do jogo: ${score(p)}`,
    test: () => 'Notificação de teste: tudo funciona.',
  },
};

export function notificationBody(
  language: string,
  kind: NotificationKind,
  params: MessageParams = {},
): string {
  const dictionary = MESSAGES[language] ?? MESSAGES['fr'];
  return dictionary[kind](params);
}

const CHANNEL_NAMES: Record<string, { alerts: string; silent: string }> = {
  fr: { alerts: 'Alertes de matchs', silent: 'Alertes de matchs (sans son)' },
  en: { alerts: 'Match alerts', silent: 'Match alerts (silent)' },
  es: { alerts: 'Alertas de partidos', silent: 'Alertas de partidos (sin sonido)' },
  de: { alerts: 'Spielmeldungen', silent: 'Spielmeldungen (lautlos)' },
  it: { alerts: 'Avvisi delle partite', silent: 'Avvisi delle partite (senza suono)' },
  pt: { alerts: 'Alertas de jogos', silent: 'Alertas de jogos (sem som)' },
};

/** Android notification channel names, as shown in the system settings. */
export function channelNames(language: string): { alerts: string; silent: string } {
  return CHANNEL_NAMES[language] ?? CHANNEL_NAMES['fr'];
}
