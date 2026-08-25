import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * One tournament in a public directory (web landing page, mobile
 * tournament-entry page) — deliberately not clickable itself, same
 * separation as ap-match-card: the consuming page wraps it in whatever
 * navigation element fits its platform (routerLink on web, a button +
 * Router.navigate on mobile, see team-search.page.html on each app).
 */
@Component({
  selector: 'ap-tournament-card',
  templateUrl: './tournament-card.html',
  styleUrl: './tournament-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentCard {
  readonly name = input.required<string>();
  readonly sportName = input.required<string>();
  readonly startDate = input<string | null>(null);
  readonly endDate = input<string | null>(null);
  readonly isOnline = input<boolean>(false);
  readonly location = input<string | null>(null);
  // Already resolved to an absolute URL by the caller (AssetUrlService) --
  // this component stays a dumb presenter, same as every other input here.
  readonly logoUrl = input<string | null>(null);
  // Only set by the public directory search (a listing spanning every
  // organization) -- omitted everywhere else (landing grid, mobile
  // favorites/marquee), where the card is already scoped to one known
  // organizer and the line would be redundant.
  readonly organizerName = input<string | null>(null);

  protected readonly locationLabel = computed(() =>
    this.isOnline() ? 'En ligne' : this.location(),
  );

  protected readonly dateRangeLabel = computed(() => {
    const start = this.startDate();
    if (!start) {
      return null;
    }
    const end = this.endDate();
    const startLabel = this.formatDate(start);
    if (!end || end === start) {
      return startLabel;
    }
    return `${startLabel} – ${this.formatDate(end)}`;
  });

  private formatDate(value: string): string {
    return new Date(value).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
