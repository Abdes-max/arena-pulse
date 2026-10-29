import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AutocompleteField, AutocompleteSuggestion } from './autocomplete-field';

@Component({
  imports: [AutocompleteField],
  template: `<ap-autocomplete-field
    label="Lieu"
    [value]="value()"
    [suggestions]="suggestions()"
    (valueChange)="value.set($event)"
    (suggestionSelect)="picked = $event"
  />`,
})
class HostComponent {
  readonly value = signal('');
  readonly suggestions = signal<AutocompleteSuggestion[]>([]);
  picked: number | null = null;
}

describe('AutocompleteField', () => {
  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    return { fixture, host: fixture.componentInstance, input };
  }

  it('emits what is typed', () => {
    const { host, input } = setup();
    input.value = 'stade';
    input.dispatchEvent(new Event('input'));
    expect(host.value()).toBe('stade');
  });

  it('lists suggestions while focused and picks one with the keyboard', () => {
    const { fixture, host, input } = setup();
    host.suggestions.set([{ label: 'Stade A', detail: '13290 Aix' }, { label: 'Stade B' }]);
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    const options = fixture.nativeElement.querySelectorAll('[role="option"]');
    expect(options.length).toBe(2);
    expect(input.getAttribute('aria-expanded')).toBe('true');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    expect(host.picked).toBe(1);
    expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();
  });

  it('picks a suggestion on mousedown', () => {
    const { fixture, host, input } = setup();
    host.suggestions.set([{ label: 'Gymnase' }]);
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    fixture.nativeElement
      .querySelector('[role="option"]')
      .dispatchEvent(new MouseEvent('mousedown', { cancelable: true }));
    expect(host.picked).toBe(0);
  });
});
