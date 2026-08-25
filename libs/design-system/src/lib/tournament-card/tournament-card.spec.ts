import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TournamentCard } from './tournament-card';

@Component({
  imports: [TournamentCard],
  template: `
    <ap-tournament-card
      [name]="'Coupe de printemps'"
      [sportName]="'Football'"
      [startDate]="startDate"
      [endDate]="endDate"
      [isOnline]="isOnline"
      [location]="location"
      [organizerName]="organizerName"
    />
  `,
})
class HostComponent {
  startDate: string | null = null;
  endDate: string | null = null;
  isOnline = false;
  location: string | null = null;
  organizerName: string | null = null;
}

describe('TournamentCard', () => {
  it('shows a single date when start and end are the same day', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.startDate = '2026-09-12T00:00:00.000Z';
    fixture.componentInstance.endDate = '2026-09-12T00:00:00.000Z';
    fixture.detectChanges();

    const dates = fixture.nativeElement.querySelector('.ap-tournament-card__dates').textContent;
    expect(dates).not.toContain('–');
  });

  it('shows a date range when start and end differ', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.startDate = '2026-09-12T00:00:00.000Z';
    fixture.componentInstance.endDate = '2026-09-14T00:00:00.000Z';
    fixture.detectChanges();

    const dates = fixture.nativeElement.querySelector('.ap-tournament-card__dates').textContent;
    expect(dates).toContain('–');
  });

  it('omits the dates line entirely when no startDate is known', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.ap-tournament-card__dates')).toBeNull();
  });

  it('shows "En ligne" instead of a location for an online tournament', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.isOnline = true;
    fixture.componentInstance.location = 'Gymnase municipal';
    fixture.detectChanges();

    const location = fixture.nativeElement.querySelector('.ap-tournament-card__location');
    expect(location.textContent.trim()).toBe('En ligne');
  });

  it('shows the physical location when not online', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.location = 'Gymnase municipal';
    fixture.detectChanges();

    const location = fixture.nativeElement.querySelector('.ap-tournament-card__location');
    expect(location.textContent.trim()).toBe('Gymnase municipal');
  });

  it('omits the location line when there is none and the tournament is not online', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.ap-tournament-card__location')).toBeNull();
  });

  it('shows the organizer name when provided', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.organizerName = 'Ada Tournaments';
    fixture.detectChanges();

    const organizer = fixture.nativeElement.querySelector('.ap-tournament-card__organizer');
    expect(organizer.textContent.trim()).toBe('Ada Tournaments');
  });

  it('omits the organizer line when none is provided', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.ap-tournament-card__organizer')).toBeNull();
  });
});
