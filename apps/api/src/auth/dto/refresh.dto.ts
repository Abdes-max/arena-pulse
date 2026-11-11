import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Native apps (Capacitor) keep the refresh token in their own storage and
 * present it here, because the webview's cross-site cookie jar is not
 * reliable on iOS (cookies set by the API from a capacitor:// origin get
 * dropped). Web keeps using the httpOnly cookie and sends no body.
 */
export class RefreshDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  refreshToken?: string;
}
