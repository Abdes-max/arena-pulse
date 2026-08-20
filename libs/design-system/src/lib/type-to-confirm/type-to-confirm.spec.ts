import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TypeToConfirm } from './type-to-confirm';

@Component({
  imports: [TypeToConfirm],
  template: `<ap-type-to-confirm
    [confirmWord]="confirmWord"
    [pending]="pending()"
    (confirm)="onConfirm()"
    (cancelled)="onCancel()"
  />`,
})
class HostComponent {
  confirmWord = 'SUPPRIMER';
  pending = signal(false);
  confirmed = 0;
  cancelled = 0;
  onConfirm(): void {
    this.confirmed++;
  }
  onCancel(): void {
    this.cancelled++;
  }
}

function typeInto(fixture: ReturnType<typeof TestBed.createComponent>, value: string): void {
  const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function actionButtons(fixture: ReturnType<typeof TestBed.createComponent>): HTMLButtonElement[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll('.ap-type-to-confirm__actions button'),
  ) as HTMLButtonElement[];
}

function confirmButton(fixture: ReturnType<typeof TestBed.createComponent>): HTMLButtonElement {
  return actionButtons(fixture)[1];
}

describe('TypeToConfirm', () => {
  it('keeps the confirm button disabled until the typed text matches', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    expect(confirmButton(fixture).disabled).toBe(true);

    typeInto(fixture, 'nope');
    expect(confirmButton(fixture).disabled).toBe(true);

    typeInto(fixture, 'SUPPRIMER');
    expect(confirmButton(fixture).disabled).toBe(false);
  });

  it('matches case- and whitespace-insensitively', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    typeInto(fixture, '  supprimer  ');
    expect(confirmButton(fixture).disabled).toBe(false);
  });

  it('emits confirm only when the typed text matches', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    confirmButton(fixture).click();
    expect(fixture.componentInstance.confirmed).toBe(0);

    typeInto(fixture, 'SUPPRIMER');
    confirmButton(fixture).click();
    expect(fixture.componentInstance.confirmed).toBe(1);
  });

  it('emits cancel when the cancel button is clicked', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    actionButtons(fixture)[0].click();
    expect(fixture.componentInstance.cancelled).toBe(1);
  });

  it('never emits confirm while pending, even with matching text and a click', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    typeInto(fixture, 'SUPPRIMER');
    fixture.componentInstance.pending.set(true);
    fixture.detectChanges();

    confirmButton(fixture).click();

    expect(fixture.componentInstance.confirmed).toBe(0);
  });

  it('respects a custom confirmWord', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.confirmWord = 'DELETE';
    fixture.detectChanges();

    typeInto(fixture, 'SUPPRIMER');
    expect(confirmButton(fixture).disabled).toBe(true);

    typeInto(fixture, 'DELETE');
    expect(confirmButton(fixture).disabled).toBe(false);
  });
});
