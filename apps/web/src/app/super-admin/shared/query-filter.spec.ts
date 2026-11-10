import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { queryFilter } from './query-filter';

@Component({ selector: 'app-query-filter-host', template: '' })
class Host {
  readonly query = queryFilter('q', '');
  readonly status = queryFilter('status', '');
}

describe('queryFilter', () => {
  async function setup(url: string) {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Host }])],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return { router, host: fixture.componentInstance, fixture };
  }

  it('starts from the URL and falls back to the default', async () => {
    const { host } = await setup('/list?q=dupont');
    expect(host.query()).toBe('dupont');
    expect(host.status()).toBe('');
  });

  it('writes a change to the URL and drops a value back at its default', async () => {
    const { router, host, fixture } = await setup('/list');
    host.status.set('PUBLISHED');
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(router.url).toBe('/list?status=PUBLISHED');

    host.status.set('');
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(router.url).toBe('/list');
  });

  it('clears several filters changed in the same tick with one navigation', async () => {
    const { router, host, fixture } = await setup('/list?q=a&status=DRAFT');
    host.query.set('');
    host.status.set('');
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(router.url).toBe('/list');
  });
});
