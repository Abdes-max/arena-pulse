import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Badge, BadgeStatus } from './badge';

@Component({
  imports: [Badge],
  template: `<ap-badge [status]="status" [label]="label" />`,
})
class HostComponent {
  status: BadgeStatus = 'live';
  label: string | undefined;
}

describe('Badge', () => {
  it('renders the default French label for a status', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('En direct');
  });

  it('always renders a text label, even for the "eliminated" status (never color alone)', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.status = 'eliminated';
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('Éliminé');
  });

  it('lets the caller override the label while keeping the status-driven styling', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.status = 'qualified';
    fixture.componentInstance.label = 'Qualifié pour la finale';
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('ap-badge');
    expect(host.getAttribute('data-status')).toBe('qualified');
    expect(fixture.nativeElement.textContent).toContain('Qualifié pour la finale');
  });

  it.each([
    ['draft', 'Brouillon'],
    ['published', 'Publié'],
    ['unpublished', 'Dépublié'],
    ['archived', 'Archivé'],
  ] satisfies [BadgeStatus, string][])(
    'renders the tournament lifecycle status "%s" with its French label',
    (status, label) => {
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.status = status;
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent.trim()).toBe(label);
    },
  );
});
