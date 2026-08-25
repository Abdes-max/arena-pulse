import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { provideApiClient } from 'api-client';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { DiscoverPage } from './discover.page';

const SEARCH_URL = 'http://localhost/api/v1/public/tournaments/search';
// Comfortably past the component's 300ms debounce -- real timers (this
// project's Vitest-based `@angular/build:unit-test` runner has no
// zone.js/fakeAsync support, see angular.json), so these tests genuinely
// wait this long rather than fast-forwarding a mock clock.
const PAST_DEBOUNCE_MS = 400;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function directoryItem(id: string, name: string) {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    sportName: 'Football',
    startDate: null,
    endDate: null,
    isOnline: false,
    location: null,
    logoUrl: null,
    organizerName: `Org ${id}`,
  };
}

// Same TranslocoTestingModule/HttpClientTesting stand-in as landing.page.spec.ts.
function configureTestBed() {
  return TestBed.configureTestingModule({
    imports: [
      TranslocoTestingModule.forRoot({
        langs: { fr: {} },
        translocoConfig: { defaultLang: 'fr' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideApiClient({ apiUrl: 'http://localhost/api/v1' }),
    ],
  }).compileComponents();
}

// Drives the name filter through its real native <input> (the same event
// path a user typing triggers), rather than reaching into the component's
// protected signals directly.
function typeName(root: HTMLElement, value: string): void {
  const input = root.querySelector<HTMLInputElement>('.ap-text-field__input');
  if (!input) {
    throw new Error('name filter input not found');
  }
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('DiscoverPage', () => {
  it('debounces the search request instead of firing one per filter change', async () => {
    await configureTestBed();
    const fixture = TestBed.createComponent(DiscoverPage);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    // listSports() fires immediately (not debounced) -- flush it out of the
    // way so it doesn't get mistaken for a search request below.
    httpMock.expectOne('http://localhost/api/v1/sports').flush([]);

    // The initial filters$ emission is debounced too (300ms) -- nothing
    // requested yet right after construction.
    httpMock.expectNone(SEARCH_URL);

    // Two rapid filter changes inside the debounce window collapse into a
    // single request carrying only the latest value.
    typeName(root, 'Prin');
    await wait(100);
    typeName(root, 'Printemps');
    await wait(PAST_DEBOUNCE_MS);

    const req = httpMock.expectOne(
      (r) => r.url === SEARCH_URL && r.params.get('q') === 'Printemps',
    );
    req.flush({ items: [], total: 0 });

    httpMock.verify();
  });

  it('appends results on "load more" instead of replacing them', async () => {
    await configureTestBed();
    const fixture = TestBed.createComponent(DiscoverPage);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    httpMock.expectOne('http://localhost/api/v1/sports').flush([]);

    await wait(PAST_DEBOUNCE_MS);
    httpMock
      .expectOne((r) => r.url === SEARCH_URL)
      .flush({ items: [directoryItem('a', 'Coupe A')], total: 2 });
    // flush() resolves the underlying HTTP Promise synchronously, but the
    // `await` inside runSearch() that sets items()/total() only continues
    // on a later microtask -- give it one before asserting on the DOM.
    await wait(0);
    fixture.detectChanges();

    expect(root.querySelectorAll('.discover-page__card-link')).toHaveLength(1);
    const loadMoreBtn = root.querySelector<HTMLButtonElement>('.discover-page__load-more');
    expect(loadMoreBtn).not.toBeNull();

    loadMoreBtn!.click();
    httpMock
      .expectOne((r) => r.url === SEARCH_URL && r.params.get('page') === '2')
      .flush({ items: [directoryItem('b', 'Coupe B')], total: 2 });
    await wait(0);
    fixture.detectChanges();

    expect(root.querySelectorAll('.discover-page__card-link')).toHaveLength(2);
    // Every result now loaded (2 of 2) -- the button drops off.
    expect(root.querySelector('.discover-page__load-more')).toBeNull();

    httpMock.verify();
  });
});
