import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthUser, CompaniesService } from '../companies.service';
import { TripActor, TripsService } from '../trips.service';
import { ReservationsService } from '../reservations.service';
import { TicketsService } from '../tickets.service';
import { TicketingStatsService } from '../ticketing-stats.service';
import {
  CreateCompanyDto,
  CreateInspectorDto,
  CreateStationDto,
  CreateTripDto,
  DateRangeQuery,
  ListQuery,
  UpdateCompanyDto,
  UpdateInspectorDto,
  UpdateStationDto,
  UpdateTripDto,
  ValidateTicketDto,
} from '../dto/ticketing.dto';
import { LogoUploadInterceptor, logoPathFrom } from './logo-upload';

/** Tableau de bord compagnie (propriétaire de la compagnie ou admin plateforme). */
@ApiTags('Billetterie - Tableau de bord compagnie')
@ApiBearerAuth('JWT-auth')
@Controller('ticketing/company')
@UseGuards(JwtAuthGuard)
export class CompanyController {
  constructor(
    private companies: CompaniesService,
    private trips: TripsService,
    private reservations: ReservationsService,
    private tickets: TicketsService,
    private stats: TicketingStatsService,
  ) {}

  private user(req: Request): AuthUser {
    return req.user as AuthUser;
  }

  private async actor(req: Request, companyId: string): Promise<TripActor> {
    const user = this.user(req);
    await this.companies.assertCompanyAdmin(user, companyId);
    return { type: user.isAdmin ? 'PLATFORM_ADMIN' : 'COMPANY_ADMIN', id: user.id, companyId };
  }

  // ------------------------------------------------------------ Profil

  @Post()
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(LogoUploadInterceptor)
  create(@Req() req: Request, @Body() dto: CreateCompanyDto, @UploadedFiles() files?: Express.Multer.File[]) {
    return this.companies.createCompany(this.user(req), dto, logoPathFrom(files));
  }

  @Get('mine')
  mine(@Req() req: Request) {
    return this.companies.listMyCompanies(this.user(req));
  }

  @Get(':companyId')
  get(@Req() req: Request, @Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.companies.getCompanyForAdmin(this.user(req), companyId);
  }

  @Patch(':companyId')
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(LogoUploadInterceptor)
  update(
    @Req() req: Request,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: UpdateCompanyDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.companies.updateCompany(this.user(req), companyId, dto, logoPathFrom(files));
  }

  // ------------------------------------------------------------ Gares

  @Post(':companyId/stations')
  createStation(@Req() req: Request, @Param('companyId', ParseUUIDPipe) companyId: string, @Body() dto: CreateStationDto) {
    return this.companies.createStation(this.user(req), companyId, dto);
  }

  @Get(':companyId/stations')
  listStations(@Req() req: Request, @Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.companies.listStations(this.user(req), companyId);
  }

  @Get(':companyId/stations/:stationId')
  getStation(
    @Req() req: Request,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('stationId', ParseUUIDPipe) stationId: string,
  ) {
    return this.companies.getStation(this.user(req), companyId, stationId);
  }

  @Patch(':companyId/stations/:stationId')
  updateStation(
    @Req() req: Request,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Body() dto: UpdateStationDto,
  ) {
    return this.companies.updateStation(this.user(req), companyId, stationId, dto);
  }

  @Delete(':companyId/stations/:stationId')
  deleteStation(
    @Req() req: Request,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('stationId', ParseUUIDPipe) stationId: string,
  ) {
    return this.companies.deleteStation(this.user(req), companyId, stationId);
  }

  @Post(':companyId/stations/:stationId/reset-access')
  resetStationAccess(
    @Req() req: Request,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('stationId', ParseUUIDPipe) stationId: string,
  ) {
    return this.companies.resetStationAccess(this.user(req), companyId, stationId);
  }

  // ------------------------------------------------------------ Contrôleurs

  @Post(':companyId/inspectors')
  createInspector(@Req() req: Request, @Param('companyId', ParseUUIDPipe) companyId: string, @Body() dto: CreateInspectorDto) {
    return this.companies.createInspector(this.user(req), companyId, dto);
  }

  @Get(':companyId/inspectors')
  listInspectors(@Req() req: Request, @Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.companies.listInspectors(this.user(req), companyId);
  }

  @Patch(':companyId/inspectors/:inspectorId')
  updateInspector(
    @Req() req: Request,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('inspectorId', ParseUUIDPipe) inspectorId: string,
    @Body() dto: UpdateInspectorDto,
  ) {
    return this.companies.updateInspector(this.user(req), companyId, inspectorId, dto);
  }

  @Delete(':companyId/inspectors/:inspectorId')
  deleteInspector(
    @Req() req: Request,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('inspectorId', ParseUUIDPipe) inspectorId: string,
  ) {
    return this.companies.deleteInspector(this.user(req), companyId, inspectorId);
  }

  @Post(':companyId/inspectors/:inspectorId/reset-access')
  resetInspectorAccess(
    @Req() req: Request,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('inspectorId', ParseUUIDPipe) inspectorId: string,
  ) {
    return this.companies.resetInspectorAccess(this.user(req), companyId, inspectorId);
  }

  // ------------------------------------------------------------ Trajets & tarifs

  @Post(':companyId/trips')
  async createTrip(@Req() req: Request, @Param('companyId', ParseUUIDPipe) companyId: string, @Body() dto: CreateTripDto) {
    if (!dto.stationId) {
      throw new BadRequestException('stationId est obligatoire');
    }
    return this.trips.create(await this.actor(req, companyId), dto.stationId, dto);
  }

  @Get(':companyId/trips')
  async listTrips(@Req() req: Request, @Param('companyId', ParseUUIDPipe) companyId: string, @Query() query: ListQuery) {
    await this.actor(req, companyId);
    return this.trips.listForCompany(companyId, query);
  }

  @Get(':companyId/trips/:tripId')
  async getTrip(
    @Req() req: Request,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('tripId', ParseUUIDPipe) tripId: string,
  ) {
    await this.actor(req, companyId);
    return this.trips.getTripForCompany(companyId, tripId);
  }

  @Patch(':companyId/trips/:tripId')
  async updateTrip(
    @Req() req: Request,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() dto: UpdateTripDto,
  ) {
    return this.trips.update(await this.actor(req, companyId), tripId, dto);
  }

  @Post(':companyId/trips/:tripId/cancel')
  async cancelTrip(
    @Req() req: Request,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('tripId', ParseUUIDPipe) tripId: string,
  ) {
    return this.trips.cancel(await this.actor(req, companyId), tripId);
  }

  @Delete(':companyId/trips/:tripId')
  async deleteTrip(
    @Req() req: Request,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('tripId', ParseUUIDPipe) tripId: string,
  ) {
    return this.trips.remove(await this.actor(req, companyId), tripId);
  }

  @Get(':companyId/trips/:tripId/passengers')
  async passengers(
    @Req() req: Request,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('tripId', ParseUUIDPipe) tripId: string,
  ) {
    await this.actor(req, companyId);
    return this.trips.listPassengers(companyId, tripId);
  }

  // ------------------------------------------------------------ Suivi

  @Get(':companyId/reservations')
  async listReservations(@Req() req: Request, @Param('companyId', ParseUUIDPipe) companyId: string, @Query() query: ListQuery) {
    await this.actor(req, companyId);
    return this.reservations.listForCompany(companyId, query);
  }

  @Get(':companyId/transactions')
  async listTransactions(@Req() req: Request, @Param('companyId', ParseUUIDPipe) companyId: string, @Query() query: ListQuery) {
    await this.actor(req, companyId);
    return this.reservations.listTransactions(companyId, query);
  }

  @Get(':companyId/stats')
  async getStats(
    @Req() req: Request,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: DateRangeQuery,
    @Query('stationId') stationId?: string,
  ) {
    await this.actor(req, companyId);
    if (stationId) await this.companies.assertStationOfCompany(companyId, stationId);
    return this.stats.compute(companyId, query, stationId);
  }

  @Post(':companyId/tickets/verify')
  async verifyTicket(@Req() req: Request, @Param('companyId', ParseUUIDPipe) companyId: string, @Body() dto: ValidateTicketDto) {
    const actor = await this.actor(req, companyId);
    return this.tickets.verify({ type: 'company', id: actor.id, companyId }, dto.code, false);
  }

  @Get(':companyId/validations')
  async listValidations(@Req() req: Request, @Param('companyId', ParseUUIDPipe) companyId: string, @Query() query: ListQuery) {
    await this.actor(req, companyId);
    return this.tickets.listValidations({ companyId, stationId: query.stationId }, query.page, query.limit);
  }

  @Get(':companyId/audit-logs')
  auditLogs(@Req() req: Request, @Param('companyId', ParseUUIDPipe) companyId: string, @Query() query: ListQuery) {
    return this.companies.listAuditLogs(this.user(req), companyId, query.page, query.limit);
  }
}
