import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ShareButton } from 'design-system';
import type { OrganizationDashboardStats } from 'shared-models';
import { environment } from '../../../../environments/environment';
import { OrganizerTournament } from '../../core/models';
import { OrganizerStatsService } from '../../core/stats.service';

const OPEN_STORAGE_KEY = 'arena-pulse:setup-guide-open';
const DISMISSED_STORAGE_KEY = 'arena-pulse:setup-guide-dismissed';
// Steps with no server-side trace (sharing, opening the slideshow or the
// PDF export) are ticked locally, the first time the organizer does them.
const LOCAL_DONE_STORAGE_KEY = 'arena-pulse:setup-guide-done';
// Matches apps/api's Tournament.theme column default, same as the wizard's own DEFAULT_THEME.
const DEFAULT_THEME = 'INK_SIGNAL';

type LocalStep = 'share' | 'slideshow' | 'pdf';

/** Where a step leads: an in-app screen, an admin-web page, or the native share sheet. */
type SetupTarget =
  | { kind: 'route'; link: string; queryParams?: Record<string, number> }
  | { kind: 'external'; href: string }
  | { kind: 'share' };

interface SetupStep {
  key: string;
  done: boolean;
  target: SetupTarget;
  /** Set on the steps ticked locally, see LOCAL_DONE_STORAGE_KEY. */
  local?: LocalStep;
}

// "Guide de configuration" -- a pill pinned bottom-right ("🚀 Guide 3/9")
// that unfolds into a checklist of the first steps of a new organizer, each
// line leading to the screen where that step is done. Most steps are read
// from the organization's dashboard stats and tournament list (no extra
// endpoint); the rest are ticked locally (LOCAL_DONE_STORAGE_KEY). "Masquer"
// hides it for good; it also disappears on its own once every step is done.
@Component({
  selector: 'app-organizer-setup-guide',
  imports: [NgTemplateOutlet, RouterLink, ShareButton, TranslocoPipe],
  templateUrl: './organizer-setup-guide.html',
  styleUrl: './organizer-setup-guide.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerSetupGuide {
  readonly organizationId = input.required<string>();
  readonly tournaments = input<OrganizerTournament[]>([]);
  /** Bumped by the page on every (re)load, so the checklist follows along. */
  readonly refreshKey = input(0);

  private readonly statsService = inject(OrganizerStatsService);
  private readonly shareButton = viewChild<ShareButton>('shareButton');

  private readonly stats = signal<OrganizationDashboardStats | null>(null);
  private readonly localDone = signal(readLocalDone());
  protected readonly open = signal(readFlag(OPEN_STORAGE_KEY));
  protected readonly dismissed = signal(readFlag(DISMISSED_STORAGE_KEY));

  /** The tournament the steps point to: the first published one, else the first non-archived one. */
  protected readonly tournament = computed(() => {
    const active = this.tournaments().filter((t) => t.status !== 'ARCHIVED');
    return active.find((t) => t.status === 'PUBLISHED') ?? active[0] ?? null;
  });

  protected readonly publicUrl = computed(() => {
    const t = this.tournament();
    return t ? `${environment.webUrl}/${t.slug}` : '';
  });

  protected readonly steps = computed<SetupStep[]>(() => {
    const s = this.stats();
    if (!s) {
      return [];
    }
    const t = this.tournament();
    const local = this.localDone();
    const create: SetupTarget = { kind: 'route', link: '/organizer/tournaments/new-plateau' };
    const at = (page: string, step?: number): SetupTarget =>
      t
        ? {
            kind: 'route',
            link: `/organizer/tournaments/${t.id}/${page}`,
            queryParams: step ? { step } : undefined,
          }
        : create;
    // Sharing and the slideshow need a public page: until then, send to publication.
    const published = t?.status === 'PUBLISHED';
    const whenPublished = (target: SetupTarget): SetupTarget =>
      published ? target : at('edit', 5);
    return [
      { key: 'createTournament', done: s.tournaments.total > 0, target: create },
      {
        key: 'customize',
        done: this.tournaments().some(
          (x) => !!x.logoUrl || !!x.headerBackgroundUrl || x.theme !== DEFAULT_THEME,
        ),
        target: at('edit', 1),
      },
      { key: 'addTeams', done: s.teamsCount > 0, target: at('edit', 2) },
      { key: 'schedule', done: s.matches.total > 0, target: at('structure') },
      { key: 'publish', done: s.tournaments.byStatus.PUBLISHED > 0, target: at('edit', 5) },
      {
        key: 'share',
        done: local.includes('share'),
        target: whenPublished({ kind: 'share' }),
        local: 'share',
      },
      {
        key: 'slideshow',
        done: local.includes('slideshow'),
        target: whenPublished({ kind: 'external', href: `${this.publicUrl()}/tv` }),
        local: 'slideshow',
      },
      {
        key: 'pdf',
        done: local.includes('pdf'),
        target: t
          ? {
              kind: 'external',
              href: `${environment.webUrl}/admin/tournaments/${t.id}/export`,
            }
          : create,
        local: 'pdf',
      },
      { key: 'firstScore', done: s.matches.played > 0, target: at('scores') },
    ];
  });

  protected readonly doneCount = computed(() => this.steps().filter((step) => step.done).length);
  protected readonly visible = computed(
    () => !this.dismissed() && this.steps().length > 0 && this.doneCount() < this.steps().length,
  );

  constructor() {
    effect(() => {
      const organizationId = this.organizationId();
      this.refreshKey();
      void this.load(organizationId);
    });
  }

  private async load(organizationId: string): Promise<void> {
    try {
      this.stats.set(await this.statsService.getOrganizationStats(organizationId));
    } catch {
      // Best-effort, same as OrganizerDashboard: a failed load just hides the guide.
    }
  }

  /** Ticks a local step only once it is really done (an in-app route or a redirect to publication doesn't count). */
  protected onStepClick(step: SetupStep): void {
    if (step.target.kind === 'share') {
      void this.shareButton()?.triggerShare();
    }
    if (step.local && step.target.kind !== 'route') {
      this.markLocalDone(step.local);
    }
  }

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    writeFlag(OPEN_STORAGE_KEY, next);
  }

  protected dismiss(): void {
    this.dismissed.set(true);
    writeFlag(DISMISSED_STORAGE_KEY, true);
  }

  private markLocalDone(step: LocalStep): void {
    if (this.localDone().includes(step)) {
      return;
    }
    const next = [...this.localDone(), step];
    this.localDone.set(next);
    try {
      localStorage.setItem(LOCAL_DONE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable (private mode) -- the tick still holds for this visit.
    }
  }
}

function readLocalDone(): LocalStep[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LOCAL_DONE_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as LocalStep[]) : [];
  } catch {
    return [];
  }
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Storage can be unavailable (private mode) -- the state still holds for this visit.
  }
}
