import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TournamentMarquee, TournamentMarqueeItem } from './tournament-marquee';

const ITEMS: TournamentMarqueeItem[] = [
  {
    id: '1',
    slug: 'coupe-de-printemps',
    name: 'Coupe de Printemps',
    sportName: 'Football',
    startDate: '2026-09-12T00:00:00.000Z',
    endDate: '2026-09-14T00:00:00.000Z',
    isOnline: false,
    location: 'Andenne, BE',
  },
  {
    id: '2',
    slug: 'trophee-des-copains',
    name: 'Trophée des Copains',
    sportName: 'Futsal',
    startDate: null,
    endDate: null,
    isOnline: true,
    location: null,
  },
];

@Component({
  imports: [TournamentMarquee],
  template: `<ap-tournament-marquee [tournaments]="items" (tournamentClick)="clicked = $event" />`,
})
class HostComponent {
  items: TournamentMarqueeItem[] = ITEMS;
  clicked: TournamentMarqueeItem | null = null;
}

describe('TournamentMarquee', () => {
  it('duplicates the list for a seamless loop, hiding the duplicate from assistive tech', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('.ap-tournament-marquee__card');
    expect(cards.length).toBe(4);
    expect(cards[0].getAttribute('aria-hidden')).toBeNull();
    expect(cards[2].getAttribute('aria-hidden')).toBe('true');
  });

  it('alternates the signal/ember accent per card', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('.ap-tournament-marquee__card');
    expect(cards[0].getAttribute('data-accent')).toBe('signal');
    expect(cards[1].getAttribute('data-accent')).toBe('ember');
  });

  it('shows "En ligne" instead of a location for an online tournament', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const locs = fixture.nativeElement.querySelectorAll('.ap-tournament-marquee__loc');
    expect(locs[1].textContent.trim()).toBe('En ligne');
  });

  it('emits tournamentClick with the clicked tournament', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('.ap-tournament-marquee__card');
    cards[0].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.clicked?.id).toBe('1');
  });
});
