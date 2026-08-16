import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Logo } from 'design-system';

@Component({
  selector: 'app-privacy-page',
  imports: [RouterLink, Logo],
  templateUrl: './privacy.page.html',
  styleUrl: './legal-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPage {
  private readonly location = inject(Location);

  protected goBack(): void {
    this.location.back();
  }
}
