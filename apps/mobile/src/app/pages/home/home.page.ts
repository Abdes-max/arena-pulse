import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { FillBar, MatchCard, MatchCardTeam } from 'design-system';
import { AssetUrlService, PublicApiService } from 'api-client';
import { Match, PublicRegistrationInfo } from 'shared-models';
import { OrganizerAuthService } from '../../organizer/core/auth.service';
import { TournamentContextService } from '../../core/tournament-context.service';

/** Mirrors apps/web's home.page.ts (the "Tournoi" tab's content). */
@Component({
  selector: 'app-home-page',
  imports: [FillBar, IonContent, MatchCard, RouterLink, TranslocoPipe],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly api = inject(PublicApiService);
  protected readonly context = inject(TournamentContextService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly transloco = inject(TranslocoService);

  protected readonly tournament = this.context.tournament;
  protected readonly upcomingMatches = signal<Match[]>([]);
  // "Inscriptions ouvertes" block (same as apps/web's home page): pre-register
  // a team, and the manager's space once signed in.
  protected readonly registration = signal<PublicRegistrationInfo | null>(null);

  // Under a category's fill bar: "4 place(s) restante(s) · clôture le
  // samedi 12 décembre".
  protected fillNote(
    category: PublicRegistrationInfo['categories'][number],
    closesAt: string | null,
  ): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.transloco.translate('manager.home.' + key, params);
    const parts = [
      category.remaining === 0 ? t('full') : t('left', { remaining: category.remaining }),
    ];
    if (closesAt) {
      const date = new Date(closesAt).toLocaleDateString(this.transloco.getActiveLang(), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      parts.push(t('closes', { date }));
    }
    return parts.join(' · ');
  }
  protected readonly player = inject(OrganizerAuthService).currentUser;
  // Teams the signed-in manager already registered here ("Déjà inscrit").
  protected readonly myTeams = signal(0);
  protected readonly canRegisterMore = computed(
    () => this.myTeams() < (this.registration()?.maxTeamsPerRegistrant ?? 1),
  );

  constructor() {
    void this.load();
    effect(() => {
      if (this.context.lastMatchEvent()) {
        void this.api
          .listUpcomingMatches(this.context.slug(), 3)
          .then((matches) => this.upcomingMatches.set(matches));
      }
    });
  }

  private async load(): Promise<void> {
    const slug = this.context.slug();
    if (!slug) {
      return;
    }
    void this.api
      .getRegistrationInfo(slug)
      .then((info) => this.registration.set(info))
      .catch(() => this.registration.set(null));
    if (this.player()) {
      void this.api
        .listMyRegistrations()
        .then((mine) =>
          this.myTeams.set(
            mine.filter(
              (r) =>
                r.tournament.slug === slug && r.status !== 'REJECTED' && r.status !== 'CANCELLED',
            ).length,
          ),
        )
        .catch(() => this.myTeams.set(0));
    }
    this.upcomingMatches.set(await this.api.listUpcomingMatches(slug, 3));
  }

  protected formatKickoff(startTime: string): string {
    return new Date(startTime).toLocaleString(this.transloco.getActiveLang(), {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  // Resolves the logo's relative API path into a URL fetchable from
  // wherever this app is actually running -- mobile runs on a different
  // Capacitor origin than the API, unlike web, see AssetUrlService.
  protected teamCardInput(
    team: { name: string; logoUrl: string | null } | null,
    fallbackLabel: string,
  ): MatchCardTeam {
    return team
      ? { name: team.name, logoUrl: this.assetUrl.resolve(team.logoUrl) }
      : { name: fallbackLabel };
  }

  protected logoUrl(url: string | null): string | null {
    return this.assetUrl.resolve(url);
  }

  // Featured highlight goes to every match tied for the earliest kickoff,
  // not just the first one in the list -- a plateau round routinely starts
  // several matches at the same time on different fields.
  protected isFeatured(match: Match): boolean {
    const earliest = this.upcomingMatches()[0]?.timeSlot?.startTime;
    return earliest !== undefined && match.timeSlot?.startTime === earliest;
  }

  protected competitionLabel(match: Match): string {
    if (match.isThirdPlaceMatch) {
      return this.transloco.translate('home.competition.thirdPlace');
    }
    if (match.knockoutBracketId) {
      return this.transloco.translate('home.competition.final');
    }
    return this.transloco.translate('home.competition.round', { round: match.round });
  }
}
