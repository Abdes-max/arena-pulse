import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideApiClient } from './api-client.config';
import { PublicApiService } from './public-api.service';

describe('PublicApiService', () => {
  let service: PublicApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClient({ apiUrl: 'http://api.test/api/v1' }),
      ],
    });
    service = TestBed.inject(PublicApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('builds the tournament URL from the injected apiUrl config', async () => {
    const promise = service.getTournament('my-slug');
    const req = httpMock.expectOne('http://api.test/api/v1/public/tournaments/my-slug');
    expect(req.request.method).toBe('GET');
    req.flush({ id: 't1' });
    await expect(promise).resolves.toEqual({ id: 't1' });
  });

  it('passes an optional categoryId as a query param when listing teams', async () => {
    const promise = service.listTeams('my-slug', 'cat-1');
    const req = httpMock.expectOne(
      (r) => r.url === 'http://api.test/api/v1/public/tournaments/my-slug/teams',
    );
    expect(req.request.params.get('categoryId')).toBe('cat-1');
    req.flush([]);
    await expect(promise).resolves.toEqual([]);
  });
});
