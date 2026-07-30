import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BracketMatch } from './bracket-match';

@Component({
  imports: [BracketMatch],
  template: `
    <ap-bracket-match
      [homeTeam]="{ name: 'Vento FC' }"
      [awayTeam]="{ name: 'Atlas United' }"
      [homeScore]="homeScore"
      [awayScore]="awayScore"
      [forfeitedTeamName]="forfeitedTeamName"
    />
  `,
})
class HostComponent {
  homeScore: number | undefined;
  awayScore: number | undefined;
  forfeitedTeamName: string | undefined;
}

describe('BracketMatch', () => {
  it('shows no score when the match has not been played', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.ap-bracket-match__score').length).toBe(0);
  });

  it('marks the higher-scoring team as the winner', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.homeScore = 3;
    fixture.componentInstance.awayScore = 1;
    fixture.detectChanges();

    const teams = fixture.nativeElement.querySelectorAll('.ap-bracket-match__team');
    expect(teams[0].classList.contains('ap-bracket-match__team--winner')).toBe(true);
    expect(teams[1].classList.contains('ap-bracket-match__team--winner')).toBe(false);
  });

  it('declares no winner on a draw', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.homeScore = 2;
    fixture.componentInstance.awayScore = 2;
    fixture.detectChanges();

    const winners = fixture.nativeElement.querySelectorAll('.ap-bracket-match__team--winner');
    expect(winners.length).toBe(0);
  });

  it('shows a forfeit notice when a team forfeited', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.forfeitedTeamName = 'Atlas United';
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Forfait');
    expect(text).toContain('Atlas United');
  });
});
