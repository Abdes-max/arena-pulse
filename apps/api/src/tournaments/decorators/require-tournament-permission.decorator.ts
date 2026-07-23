import { SetMetadata } from '@nestjs/common';

export const REQUIRE_TOURNAMENT_PERMISSION_KEY = 'requireTournamentPermission';
export const RequireTournamentPermission = (permissionKey: string) =>
  SetMetadata(REQUIRE_TOURNAMENT_PERMISSION_KEY, permissionKey);
