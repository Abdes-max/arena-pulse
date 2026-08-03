import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatchCard, MatchCardVariant } from './match-card';

@Component({
  imports: [MatchCard],
  template: `
    <ap-match-card
      [variant]="variant"
      [homeTeam]="{ name: 'Vento FC' }"
      [awayTeam]="{ name: 'Atlas United' }"
      [homeScore]="homeScore"
      [awayScore]="awayScore"
      [kickoff]="kickoff"
      [competitionLabel]="'Poule A'"
    />
  `,
})
class HostComponent {
  variant: MatchCardVariant = 'compact';
  homeScore: number | undefined;
  awayScore: number | undefined;
  kickoff: string | undefined;
}

describe('MatchCard', () => {
  it('shows a kickoff time and no score for an upcoming match', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.variant = 'upcoming';
    fixture.componentInstance.kickoff = '15:30';
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('15:30');
    expect(fixture.nativeElement.querySelectorAll('.ap-match-card__score').length).toBe(0);
  });

  it('marks the higher-scoring team as the winner', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.variant = 'result';
    fixture.componentInstance.homeScore = 3;
    fixture.componentInstance.awayScore = 1;
    fixture.detectChanges();

    const teams = fixture.nativeElement.querySelectorAll('.ap-match-card__team');
    expect(teams[0].classList.contains('ap-match-card__team--winner')).toBe(true);
    expect(teams[1].classList.contains('ap-match-card__team--winner')).toBe(false);
  });

  it('shows a green "Terminé" badge for a completed match', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.variant = 'result';
    fixture.componentInstance.homeScore = 2;
    fixture.componentInstance.awayScore = 1;
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('ap-badge[status="finished"]');
    expect(badge).not.toBeNull();
  });

  it('does not show the "Terminé" badge for a live match, even with a score entered', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.variant = 'live';
    fixture.componentInstance.homeScore = 2;
    fixture.componentInstance.awayScore = 1;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('ap-badge[status="finished"]')).toBeNull();
  });

  it('declares no winner on a draw', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.homeScore = 2;
    fixture.componentInstance.awayScore = 2;
    fixture.detectChanges();

    const winners = fixture.nativeElement.querySelectorAll('.ap-match-card__team--winner');
    expect(winners.length).toBe(0);
  });

  it('reflects the variant as a host attribute so each context can be styled differently', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.variant = 'featured';
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('ap-match-card');
    expect(host.getAttribute('data-variant')).toBe('featured');
  });
});
