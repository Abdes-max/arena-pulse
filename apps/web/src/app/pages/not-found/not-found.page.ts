import { ChangeDetectionStrategy, Component, OnDestroy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Logo } from 'design-system';
import { RobotsMetaService } from '../../core/robots-meta.service';

/**
 * Catch-all ('**') page: replaces the old redirect to '' so an unknown URL
 * no longer serves the landing page under a dead address (a "Soft 404"
 * for Google), and flags itself noindex while displayed.
 */
@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink, Logo, TranslocoPipe],
  templateUrl: './not-found.page.html',
  styleUrl: './not-found.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage implements OnDestroy {
  private readonly robotsMeta = inject(RobotsMetaService);

  constructor() {
    this.robotsMeta.setNoIndex(true);
  }

  ngOnDestroy(): void {
    this.robotsMeta.setNoIndex(false);
  }
}
