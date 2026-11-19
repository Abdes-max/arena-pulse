import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { BehaviorSubject, combineLatest, of, switchMap } from 'rxjs';

const SITE_NAME = 'TournArena';

/** Transloco keys (+ params) for one page's <title> and meta description. */
export interface PageMeta {
  title: string;
  titleParams?: Record<string, string>;
  description: string;
  descriptionParams?: Record<string, string>;
}

/**
 * Per-page <title>, <meta name="description"> and <link rel="canonical">.
 * Every page used to share index.html's bare "TournArena" title, so Search
 * Console filed the tournament sub-pages (team, standings...) as
 * "Page en double sans URL canonique". Static pages declare theirs as route
 * data (`data: { meta: PageMeta }`, applied on NavigationEnd); pages built
 * from fetched data (TournamentShell, TeamDetailPage) call set(). Any
 * navigation resets to the site defaults first, so a page that sets
 * nothing (admin, login...) never keeps the previous page's title.
 */
@Injectable({ providedIn: 'root' })
export class PageMetaService {
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly current = new BehaviorSubject<PageMeta | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);
    // selectTranslate (not translate): waits for the language file and
    // re-emits on a language switch.
    this.current
      .pipe(
        switchMap((page) =>
          combineLatest([
            page ? this.transloco.selectTranslate<string>(page.title, page.titleParams) : of(null),
            this.transloco.selectTranslate<string>(
              page?.description ?? 'seo.siteDescription',
              page?.descriptionParams,
            ),
          ]),
        ),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe(([title, description]) => {
        this.title.setTitle(title ? `${title} | ${SITE_NAME}` : SITE_NAME);
        this.meta.updateTag({ name: 'description', content: description });
      });

    this.router.events.pipe(takeUntilDestroyed(destroyRef)).subscribe((event) => {
      // Reset before the new route's components are created (they set()
      // their own meta while activating, after NavigationStart).
      if (event instanceof NavigationStart) {
        this.current.next(null);
      } else if (event instanceof NavigationEnd) {
        this.setCanonical(event.urlAfterRedirects);
        const routeMeta = this.deepestRouteMeta();
        if (routeMeta) {
          this.current.next(routeMeta);
        }
      }
    });
  }

  /** Started from provideAppInitializer, so the router listener is live from the first navigation. */
  start(): void {
    // Construction does the work.
  }

  set(page: PageMeta): void {
    this.current.next(page);
  }

  private deepestRouteMeta(): PageMeta | null {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return (route.data['meta'] as PageMeta | undefined) ?? null;
  }

  // Path only: query strings (?lang=, utm_*...) and fragments never make a
  // distinct page.
  private setCanonical(url: string): void {
    const path = url.split(/[?#]/)[0] || '/';
    const href = `${this.document.location.origin}${path}`;
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      this.document.head.appendChild(link);
    }
    link.href = href;
  }
}
