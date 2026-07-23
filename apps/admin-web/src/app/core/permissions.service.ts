import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Permission } from './models';

@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private readonly http = inject(HttpClient);

  listPermissions(): Promise<Permission[]> {
    return firstValueFrom(this.http.get<Permission[]>(`${environment.apiUrl}/permissions`));
  }
}
