import { InjectionToken, Provider } from '@angular/core';

export interface ApiClientConfig {
  apiUrl: string;
}

export const API_CLIENT_CONFIG = new InjectionToken<ApiClientConfig>('API_CLIENT_CONFIG');

export function provideApiClient(config: ApiClientConfig): Provider {
  return { provide: API_CLIENT_CONFIG, useValue: config };
}
