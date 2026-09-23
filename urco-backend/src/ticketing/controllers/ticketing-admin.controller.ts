import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CompaniesService } from '../companies.service';
import { UpdateCompanyStatusDto } from '../dto/ticketing.dto';

/** Administration plateforme URCO : validation / suspension des compagnies. */
@ApiTags('Billetterie - Admin plateforme')
@ApiBearerAuth('JWT-auth')
@Controller('ticketing/admin')
@UseGuards(JwtAuthGuard)
export class TicketingAdminController {
  constructor(private companies: CompaniesService) {}

  private assertAdmin(req: Request) {
    const user = req.user as any;
    if (!user?.isAdmin && user?.role !== 'ADMIN') {
      throw new ForbiddenException('Réservé aux administrateurs');
    }
    return user;
  }

  @Get('companies')
  list(@Req() req: Request, @Query('status') status?: string) {
    this.assertAdmin(req);
    return this.companies.listAllCompanies(status);
  }

  @Patch('companies/:companyId/status')
  updateStatus(@Req() req: Request, @Param('companyId', ParseUUIDPipe) companyId: string, @Body() dto: UpdateCompanyStatusDto) {
    const admin = this.assertAdmin(req);
    return this.companies.updateCompanyStatus(admin.id, companyId, dto);
  }
}
