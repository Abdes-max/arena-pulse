import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export interface TournamentMarqueeItem {
  id: string;
  slug: string;
  name: string;
  sportName: string;
  startDate: string | null;
  endDate: string | null;
  isOnline: boolean;
  location: string | null;
}

/**
 * Auto-scrolling "proof of life" row for the landing/entry hero -- always
 * rendered on the dark Ink & Signal hero (see landing.page.html/
 * tournament-entry.page.html, which scope data-theme/data-mode="dark" on
 * the hero regardless of the page's own light/dark toggle), alternating the
 * signal/ember accent per card for the cool/warm marketing duo. Presentational
 * only, same separation as ap-match-card/ap-tournament-card -- the consuming
 * page decides what a click does via (tournamentClick).
 */
@Component({
  selector: 'ap-tournament-marquee',
  templateUrl: './tournament-marquee.html',
  styleUrl: './tournament-marquee.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentMarquee {
  readonly tournaments = input.required<TournamentMarqueeItem[]>();
  readonly tournamentClick = output<TournamentMarqueeItem>();

  // Duplicated so the CSS loop (translateX 0 -> -50%) reads as seamless --
  // the second copy is aria-hidden in the template so screen readers only
  // ever hear each tournament once.
  protected readonly loop = computed(() => {
    const items = this.tournaments();
    return items.length > 0 ? [...items, ...items] : [];
  });

  protected accentFor(index: number): 'signal' | 'ember' {
    return index % 2 === 0 ? 'signal' : 'ember';
  }

  protected locationLabel(t: TournamentMarqueeItem): string | null {
    return t.isOnline ? 'En ligne' : t.location;
  }

  protected dateRangeLabel(t: TournamentMarqueeItem): string | null {
    if (!t.startDate) {
      return null;
    }
    const start = this.formatDate(t.startDate);
    if (!t.endDate || t.endDate === t.startDate) {
      return start;
    }
    return `${start} – ${this.formatDate(t.endDate)}`;
  }

  private formatDate(value: string): string {
    return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }
}
