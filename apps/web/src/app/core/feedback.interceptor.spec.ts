import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { feedbackInterceptor } from './feedback.interceptor';
import { SnackbarService } from './snackbar.service';

describe('feedbackInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let snackbar: SnackbarService;
  const url = `${environment.apiUrl}/organizations/org-1/tournaments/t-1/teams`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([feedbackInterceptor])),
        provideHttpClientTesting(),
        { provide: TranslocoService, useValue: { translate: (key: string) => key } },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    snackbar = TestBed.inject(SnackbarService);
  });

  it('confirms a successful change', async () => {
    const done = firstValueFrom(http.post(url, {}));
    controller.expectOne(url).flush({});
    await done;
    expect(snackbar.messages().map((m) => m.text)).toEqual(['feedback.saved']);
  });

  it("shows the API's message when a change fails", async () => {
    const done = firstValueFrom(http.post(url, {})).catch(() => undefined);
    controller
      .expectOne(url)
      .flush({ message: 'Nom déjà utilisé.' }, { status: 400, statusText: 'Bad Request' });
    await done;
    expect(snackbar.messages()).toEqual([
      expect.objectContaining({ kind: 'error', text: 'Nom déjà utilisé.' }),
    ]);
  });

  it('stays quiet for reads and for errors the page handles itself', async () => {
    const read = firstValueFrom(http.get(url));
    controller.expectOne(url).flush([]);
    await read;
    const handled = firstValueFrom(http.post(url, {})).catch(() => undefined);
    controller
      .expectOne(url)
      .flush(
        { message: 'x', code: 'KNOCKOUT_PROGRESS_EXISTS' },
        { status: 409, statusText: 'Conflict' },
      );
    await handled;
    expect(snackbar.messages()).toEqual([]);
  });
});
