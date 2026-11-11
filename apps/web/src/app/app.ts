import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppInstallBanner } from './shared/app-install-banner/app-install-banner';
import { SnackbarHost } from './shared/snackbar-host/snackbar-host';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppInstallBanner, SnackbarHost],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
