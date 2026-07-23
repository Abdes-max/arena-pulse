import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Sport } from './models';

@Injectable({ providedIn: 'root' })
export class SportsService {
  private readonly http = inject(HttpClient);

  listSports(): Promise<Sport[]> {
    return firstValueFrom(this.http.get<Sport[]>(`${environment.apiUrl}/sports`));
  }
}
