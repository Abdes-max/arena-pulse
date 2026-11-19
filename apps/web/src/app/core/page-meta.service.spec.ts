import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { PageMetaService } from './page-meta.service';

@Component({ template: '' })
class BlankPage {}

describe('PageMetaService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: {
            fr: {
              'seo.siteDescription': 'Site',
              'seo.contact.title': 'Contact',
              'seo.contact.description': 'Écrivez-nous',
              'seo.team.title': '{{team}} – {{name}}',
            },
          },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([
          {
            path: 'contact',
            component: BlankPage,
            data: { meta: { title: 'seo.contact.title', description: 'seo.contact.description' } },
          },
          { path: '**', component: BlankPage },
        ]),
      ],
    });
    TestBed.inject(PageMetaService).start();
  });

  const head = () => TestBed.inject(DOCUMENT).head;

  it('applies route meta and a query-free canonical on navigation', async () => {
    await TestBed.inject(Router).navigateByUrl('/contact?utm_source=x#top');

    expect(TestBed.inject(Title).getTitle()).toBe('Contact | TournArena');
    expect(head().querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Écrivez-nous',
    );
    expect(head().querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
      `${TestBed.inject(DOCUMENT).location.origin}/contact`,
    );
  });

  it('resets to the site defaults on a page that sets nothing', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/contact');
    await router.navigateByUrl('/admin/tournaments');

    expect(TestBed.inject(Title).getTitle()).toBe('TournArena');
    expect(head().querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Site');
  });

  it('interpolates params passed to set()', () => {
    TestBed.inject(PageMetaService).set({
      title: 'seo.team.title',
      titleParams: { team: 'Les Aigles', name: 'Coupe' },
      description: 'seo.siteDescription',
    });

    expect(TestBed.inject(Title).getTitle()).toBe('Les Aigles – Coupe | TournArena');
  });
});
