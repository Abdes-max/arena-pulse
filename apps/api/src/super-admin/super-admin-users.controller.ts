import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentSuperAdmin } from '../super-admin-auth/decorators/current-super-admin.decorator';
import { SuperAdminJwtAuthGuard } from '../super-admin-auth/guards/super-admin-jwt-auth.guard';
import type { AuthenticatedSuperAdmin } from '../super-admin-auth/strategies/super-admin-jwt.strategy';
import { DeleteUserDto } from './dto/delete-user.dto';
import { SuperAdminUsersService } from './super-admin-users.service';

@ApiTags('super-admin')
@Public()
@UseGuards(SuperAdminJwtAuthGuard)
@Controller('super-admin/users')
export class SuperAdminUsersController {
  constructor(private readonly usersService: SuperAdminUsersService) {}

  @Get()
  list() {
    return this.usersService.list();
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':userId/verify-email')
  verifyEmail(
    @Param('userId') userId: string,
    @CurrentSuperAdmin() superAdmin: AuthenticatedSuperAdmin,
  ) {
    return this.usersService.verifyEmail(userId, superAdmin.id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':userId')
  deleteUser(
    @Param('userId') userId: string,
    @Body() dto: DeleteUserDto,
    @CurrentSuperAdmin() superAdmin: AuthenticatedSuperAdmin,
  ) {
    return this.usersService.deleteUser(userId, superAdmin.id, dto);
  }
}
