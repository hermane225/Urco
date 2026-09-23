import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ReservationsService } from '../reservations.service';
import { CreateReservationDto, PayReservationDto } from '../dto/ticketing.dto';

@ApiTags('Billetterie - Réservations (voyageur)')
@ApiBearerAuth('JWT-auth')
@Controller('ticketing/reservations')
@UseGuards(JwtAuthGuard)
export class TicketReservationsController {
  constructor(private reservations: ReservationsService) {}

  @Post()
  create(@Req() req: Request, @Body() dto: CreateReservationDto) {
    return this.reservations.createForUser((req.user as any).id, dto);
  }

  @Get('mine')
  listMine(@Req() req: Request) {
    return this.reservations.listMine((req.user as any).id);
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservations.getMine((req.user as any).id, id);
  }

  @Post(':id/pay')
  pay(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayReservationDto) {
    return this.reservations.pay((req.user as any).id, id, dto);
  }

  @Get(':id/payment-status')
  paymentStatus(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservations.refreshPaymentStatus((req.user as any).id, id);
  }

  @Post(':id/cancel')
  cancel(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservations.cancelMine((req.user as any).id, id);
  }
}
