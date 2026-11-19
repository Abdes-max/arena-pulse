import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { showErrorsInSnackbar } from './error-snackbar';
import { SnackbarService } from './snackbar.service';

@Component({ template: '' })
class Host {
  readonly errorMessage = signal<string | null>(null);
  private readonly errorSnackbar = showErrorsInSnackbar(this.errorMessage);
}

describe('showErrorsInSnackbar', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { fr: { 'teams.errors.save': 'Enregistrement impossible.' } },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
          preloadLangs: true,
        }),
      ],
    });
  });

  const texts = () =>
    TestBed.inject(SnackbarService)
      .messages()
      .map((m) => [m.kind, m.text]);

  it('shows the translated error in the red snackbar, then resets the signal', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.errorMessage.set('teams.errors.save');
    TestBed.tick();

    expect(texts()).toEqual([['error', 'Enregistrement impossible.']]);
    expect(fixture.componentInstance.errorMessage()).toBeNull();
  });

  it("doesn't repeat a request failure the API message already reported", () => {
    const snackbar = TestBed.inject(SnackbarService);
    const fixture = TestBed.createComponent(Host);
    snackbar.error('Le nom est obligatoire.');
    fixture.componentInstance.errorMessage.set('teams.errors.save');
    TestBed.tick();

    expect(texts()).toEqual([['error', 'Le nom est obligatoire.']]);
  });
});
