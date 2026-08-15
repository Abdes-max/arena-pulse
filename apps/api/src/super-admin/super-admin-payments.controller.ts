import {
  Body,
  Controller,
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
import { AnnotatePaymentDto } from './dto/annotate-payment.dto';
import { SuperAdminPaymentsService } from './super-admin-payments.service';

@ApiTags('super-admin')
@Public()
@UseGuards(SuperAdminJwtAuthGuard)
@Controller('super-admin/payments')
export class SuperAdminPaymentsController {
  constructor(private readonly paymentsService: SuperAdminPaymentsService) {}

  @Get()
  list() {
    return this.paymentsService.list();
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':type/:id/annotate')
  annotate(
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() dto: AnnotatePaymentDto,
    @CurrentSuperAdmin() superAdmin: AuthenticatedSuperAdmin,
  ) {
    return this.paymentsService.annotate(type, id, dto.note, superAdmin.id);
  }
}
