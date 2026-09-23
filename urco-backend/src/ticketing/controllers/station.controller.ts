import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { StationAgentGuard } from '../auth/staff-auth.guards';
import { StaffPrincipal } from '../auth/staff-jwt.strategy';
import { CompaniesService } from '../companies.service';
import { TripActor, TripsService } from '../trips.service';
import { ReservationsService } from '../reservations.service';
import { TicketsService } from '../tickets.service';
import { TicketingStatsService } from '../ticketing-stats.service';
import {
  CounterSaleDto,
  CreateTripDto,
  DateRangeQuery,
  ListQuery,
  UpdateOwnStationDto,
  UpdateTripDto,
  ValidateTicketDto,
} from '../dto/ticketing.dto';

/**
 * Tableau de bord gare (agent). Tout est limité à la gare du jeton :
 * l'agent ne voit ni les autres gares ni les finances globales.
 */
@ApiTags('Billetterie - Tableau de bord gare')
@ApiBearerAuth('JWT-auth')
@Controller('ticketing/station')
@UseGuards(StationAgentGuard)
export class StationController {
  constructor(
    private companies: CompaniesService,
    private trips: TripsService,
    private reservations: ReservationsService,
    private tickets: TicketsService,
    private stats: TicketingStatsService,
  ) {}

  private staff(req: Request): StaffPrincipal & { stationId: string } {
    return req.user as any;
  }

  private actor(req: Request): TripActor {
    const staff = this.staff(req);
    return { type: 'STATION_AGENT', id: staff.id, companyId: staff.companyId };
  }

  @Get('me')
  me(@Req() req: Request) {
    return this.companies.getOwnStation(this.staff(req).stationId);
  }

  @Patch('me')
  updateMe(@Req() req: Request, @Body() dto: UpdateOwnStationDto) {
    return this.companies.updateOwnStation(this.staff(req).stationId, dto);
  }

  @Post('trips')
  createTrip(@Req() req: Request, @Body() dto: CreateTripDto) {
    return this.trips.create(this.actor(req), this.staff(req).stationId, dto);
  }

  @Get('trips')
  listTrips(@Req() req: Request, @Query() query: ListQuery) {
    const staff = this.staff(req);
    return this.trips.listForCompany(staff.companyId, { ...query, stationId: staff.stationId });
  }

  @Get('trips/:tripId')
  getTrip(@Req() req: Request, @Param('tripId', ParseUUIDPipe) tripId: string) {
    const staff = this.staff(req);
    return this.trips.getTripForCompany(staff.companyId, tripId, staff.stationId);
  }

  @Patch('trips/:tripId')
  updateTrip(@Req() req: Request, @Param('tripId', ParseUUIDPipe) tripId: string, @Body() dto: UpdateTripDto) {
    return this.trips.update(this.actor(req), tripId, dto, this.staff(req).stationId);
  }

  @Post('trips/:tripId/cancel')
  cancelTrip(@Req() req: Request, @Param('tripId', ParseUUIDPipe) tripId: string) {
    return this.trips.cancel(this.actor(req), tripId, this.staff(req).stationId);
  }

  @Get('trips/:tripId/passengers')
  passengers(@Req() req: Request, @Param('tripId', ParseUUIDPipe) tripId: string) {
    const staff = this.staff(req);
    return this.trips.listPassengers(staff.companyId, tripId, staff.stationId);
  }

  /** Vente au guichet (paiement en agence) */
  @Post('sales')
  counterSale(@Req() req: Request, @Body() dto: CounterSaleDto) {
    const staff = this.staff(req);
    return this.reservations.counterSale(staff.stationId, staff.companyId, dto);
  }

  @Get('reservations')
  listReservations(@Req() req: Request, @Query() query: ListQuery) {
    const staff = this.staff(req);
    return this.reservations.listForCompany(staff.companyId, query, staff.stationId);
  }

  @Get('transactions')
  listTransactions(@Req() req: Request, @Query() query: ListQuery) {
    const staff = this.staff(req);
    return this.reservations.listTransactions(staff.companyId, query, staff.stationId);
  }

  @Get('stats')
  getStats(@Req() req: Request, @Query() query: DateRangeQuery) {
    const staff = this.staff(req);
    return this.stats.compute(staff.companyId, query, staff.stationId);
  }

  @Post('tickets/verify')
  verifyTicket(@Req() req: Request, @Body() dto: ValidateTicketDto) {
    const staff = this.staff(req);
    return this.tickets.verify(
      { type: 'station', id: staff.id, companyId: staff.companyId, stationId: staff.stationId },
      dto.code,
      dto.board ?? false,
    );
  }

  @Get('validations')
  listValidations(@Req() req: Request, @Query() query: ListQuery) {
    return this.tickets.listValidations({ stationId: this.staff(req).stationId }, query.page, query.limit);
  }
}
