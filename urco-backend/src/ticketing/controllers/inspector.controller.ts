import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { InspectorGuard } from '../auth/staff-auth.guards';
import { StaffPrincipal } from '../auth/staff-jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketsService } from '../tickets.service';
import { ListQuery, ValidateTicketDto } from '../dto/ticketing.dto';

/** Contrôleur : vérification des billets en lecture seule + historique. */
@ApiTags('Billetterie - Contrôleur')
@ApiBearerAuth('JWT-auth')
@Controller('ticketing/inspector')
@UseGuards(InspectorGuard)
export class InspectorController {
  constructor(
    private prisma: PrismaService,
    private tickets: TicketsService,
  ) {}

  @Get('me')
  me(@Req() req: Request) {
    return this.prisma.ticketInspector.findUnique({
      where: { id: (req.user as StaffPrincipal).id },
      select: {
        id: true,
        name: true,
        loginId: true,
        phone: true,
        email: true,
        company: { select: { id: true, name: true, logo: true } },
      },
    });
  }

  @Post('tickets/verify')
  verifyTicket(@Req() req: Request, @Body() dto: ValidateTicketDto) {
    const staff = req.user as StaffPrincipal;
    return this.tickets.verify({ type: 'inspector', id: staff.id, companyId: staff.companyId }, dto.code, false);
  }

  @Get('validations')
  listValidations(@Req() req: Request, @Query() query: ListQuery) {
    return this.tickets.listValidations({ inspectorId: (req.user as StaffPrincipal).id }, query.page, query.limit);
  }
}
