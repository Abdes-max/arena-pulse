import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TimeFilter, TimeFilterValue } from './time-filter';

@Component({
  imports: [TimeFilter],
  template: `<ap-time-filter [value]="value" (valueChange)="changes.push($event)" />`,
})
class HostComponent {
  value: TimeFilterValue = '';
  changes: TimeFilterValue[] = [];
}

function setup(value: TimeFilterValue) {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.value = value;
  fixture.detectChanges();
  const buttons = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
  );
  return { host: fixture.componentInstance, buttons };
}

describe('TimeFilter', () => {
  it('shows the two buttons, none pressed by default', () => {
    const { buttons } = setup('');
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['À venir', 'Passés']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
  });

  it('marks the active one as pressed', () => {
    const { buttons } = setup('past');
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('emits the clicked side, and clears when the active one is clicked again', () => {
    const first = setup('');
    first.buttons[0].click();
    expect(first.host.changes).toEqual(['upcoming']);

    const second = setup('past');
    second.buttons[1].click();
    expect(second.host.changes).toEqual(['']);
  });
});
