import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SetDraft, SetsInput } from './sets-input';

@Component({
  imports: [SetsInput],
  template: `
    <ap-sets-input [sets]="sets" [setsToWin]="setsToWin" (setsChange)="changes.push($event)" />
  `,
})
class HostComponent {
  sets: SetDraft[] = [];
  setsToWin = 2;
  changes: SetDraft[][] = [];
}

function setup(sets: SetDraft[], setsToWin = 2) {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.sets = sets;
  fixture.componentInstance.setsToWin = setsToWin;
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, host: fixture.componentInstance, root };
}

const rows = (root: HTMLElement) => root.querySelectorAll('.ap-sets-input__row');
const button = (root: HTMLElement, text: string) =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('.ap-sets-input__button')).find((b) =>
    b.textContent?.includes(text),
  );

describe('SetsInput', () => {
  it('shows one empty row when nothing is entered yet', () => {
    expect(rows(setup([]).root)).toHaveLength(1);
  });

  it('previews the sets won from the rows', () => {
    const { root } = setup([
      { home: '4', away: '6' },
      { home: '6', away: '3' },
      { home: '10', away: '7' },
    ]);

    expect(root.querySelector('.ap-sets-input__total')?.textContent?.trim()).toBe('2 - 1');
  });

  it('adds a row up to the format maximum (best of 3 -> 3 sets)', () => {
    const { root, host, fixture } = setup([
      { home: '6', away: '4' },
      { home: '4', away: '6' },
    ]);

    button(root, '+ Set')!.click();
    expect(host.changes.at(-1)).toHaveLength(3);

    host.sets = [
      { home: '6', away: '4' },
      { home: '4', away: '6' },
      { home: '', away: '' },
    ];
    fixture.detectChanges();
    expect(button(root, '+ Set')).toBeUndefined();
  });

  it('allows more rows when more sets are needed (3 sets to win -> up to 5)', () => {
    const { root } = setup(
      [
        { home: '1', away: '0' },
        { home: '1', away: '0' },
        { home: '1', away: '0' },
      ],
      3,
    );

    expect(button(root, '+ Set')).toBeDefined();
  });

  it('emits the edited value for the right row and side', () => {
    const { root, host } = setup([
      { home: '6', away: '4' },
      { home: '', away: '' },
    ]);
    const fields = root.querySelectorAll<HTMLInputElement>('.ap-sets-input__field');

    fields[3].value = '7';
    fields[3].dispatchEvent(new Event('input'));

    expect(host.changes.at(-1)).toEqual([
      { home: '6', away: '4' },
      { home: '', away: '7' },
    ]);
  });

  it('removes the last row', () => {
    const { root, host } = setup([
      { home: '6', away: '4' },
      { home: '3', away: '6' },
    ]);

    button(root, 'Retirer')!.click();

    expect(host.changes.at(-1)).toEqual([{ home: '6', away: '4' }]);
  });
});
