import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard)
@Controller(
  'organizations/:organizationId/tournaments/:tournamentId/categories',
)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Post()
  create(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(organizationId, tournamentId, dto);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get()
  list(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.categoriesService.list(organizationId, tournamentId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Patch(':categoryId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(
      organizationId,
      tournamentId,
      categoryId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':categoryId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.categoriesService.remove(
      organizationId,
      tournamentId,
      categoryId,
    );
  }
}
