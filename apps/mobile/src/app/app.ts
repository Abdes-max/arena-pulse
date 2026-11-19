import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { SnackbarHost } from './shared/snackbar-host/snackbar-host';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet, SnackbarHost],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
