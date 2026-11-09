import { Injectable, computed, signal } from '@angular/core';

export const REMINDER_MINUTES_OPTIONS = [5, 15, 30, 60] as const;
export type ReminderMinutes = (typeof REMINDER_MINUTES_OPTIONS)[number];

export interface NotificationPrefs {
  /** Master switch: off = nothing at all for this scope. */
  enabled: boolean;
  /** "Your match starts in N minutes" -- scheduled ahead, works with the app closed. */
  reminder: boolean;
  /** "The match has started" -- only while the app is running. */
  started: boolean;
  /** Live score changes -- only while the app is running. */
  score: boolean;
  /** Final result -- only while the app is running. */
  result: boolean;
  reminderMinutes: ReminderMinutes;
  sound: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  reminder: true,
  started: true,
  score: true,
  result: true,
  reminderMinutes: 15,
  sound: true,
};

interface StoredSettings {
  global: NotificationPrefs;
  /** Per favorite team (key: "<tournamentSlug>:<teamId>"), only what differs from global. */
  teams: Record<string, Partial<NotificationPrefs>>;
}

const STORAGE_KEY = 'arena-pulse:notification-settings';

const BOOLEAN_KEYS = ['enabled', 'reminder', 'started', 'score', 'result', 'sound'] as const;

/**
 * User-configurable notification settings: one global set, plus an optional
 * override per favorite team (same fields, only the ones the user changed).
 * Persisted in localStorage like FavoritesService -- no mobile account to
 * attach them to (docs/architecture/mobile-foundation.md).
 */
@Injectable({ providedIn: 'root' })
export class NotificationSettingsService {
  private readonly state = signal<StoredSettings>(this.readFromStorage());

  /** The whole stored object, as a signal -- read it to react to any change. */
  readonly settings = this.state.asReadonly();
  readonly global = computed(() => this.state().global);

  teamKey(tournamentSlug: string, teamId: string): string {
    return `${tournamentSlug}:${teamId}`;
  }

  /** Effective settings for a team: its own overrides on top of the global ones. */
  prefsFor(tournamentSlug: string, teamId: string): NotificationPrefs {
    const { global, teams } = this.state();
    return { ...global, ...teams[this.teamKey(tournamentSlug, teamId)] };
  }

  hasTeamOverride(tournamentSlug: string, teamId: string): boolean {
    return this.teamKey(tournamentSlug, teamId) in this.state().teams;
  }

  setGlobal(patch: Partial<NotificationPrefs>): void {
    this.update((current) => ({ ...current, global: { ...current.global, ...patch } }));
  }

  /** Starts (or edits) a team's own settings, first copying the current effective ones. */
  setTeam(tournamentSlug: string, teamId: string, patch: Partial<NotificationPrefs>): void {
    const key = this.teamKey(tournamentSlug, teamId);
    this.update((current) => ({
      ...current,
      teams: { ...current.teams, [key]: { ...current.global, ...current.teams[key], ...patch } },
    }));
  }

  /** Back to the global settings for this team. */
  clearTeam(tournamentSlug: string, teamId: string): void {
    const key = this.teamKey(tournamentSlug, teamId);
    this.update((current) => ({
      ...current,
      teams: Object.fromEntries(Object.entries(current.teams).filter(([k]) => k !== key)),
    }));
  }

  private update(change: (current: StoredSettings) => StoredSettings): void {
    const next = change(this.state());
    this.state.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private browsing, quota): the choice holds for this session only.
    }
  }

  private readFromStorage(): StoredSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return emptySettings();
      }
      const parsed = JSON.parse(raw) as Partial<StoredSettings>;
      const teams: Record<string, Partial<NotificationPrefs>> = {};
      for (const [key, value] of Object.entries(parsed.teams ?? {})) {
        teams[key] = sanitize(value);
      }
      return { global: { ...DEFAULT_NOTIFICATION_PREFS, ...sanitize(parsed.global) }, teams };
    } catch {
      return emptySettings();
    }
  }
}

function emptySettings(): StoredSettings {
  return { global: { ...DEFAULT_NOTIFICATION_PREFS }, teams: {} };
}

/** Keeps only well-typed known fields -- a stale or hand-edited value never reaches the scheduler. */
function sanitize(value: unknown): Partial<NotificationPrefs> {
  const source = (value ?? {}) as Record<string, unknown>;
  const clean: Partial<NotificationPrefs> = {};
  for (const key of BOOLEAN_KEYS) {
    if (typeof source[key] === 'boolean') {
      clean[key] = source[key];
    }
  }
  const minutes = source['reminderMinutes'];
  if ((REMINDER_MINUTES_OPTIONS as readonly unknown[]).includes(minutes)) {
    clean.reminderMinutes = minutes as ReminderMinutes;
  }
  return clean;
}
