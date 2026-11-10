import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppInstallBanner } from './shared/app-install-banner/app-install-banner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppInstallBanner],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
