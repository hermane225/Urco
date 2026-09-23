import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { CompaniesService } from '../companies.service';
import { TripsService } from '../trips.service';
import { StaffAuthService } from '../auth/staff-auth.service';
import { STAFF_JWT_STRATEGY } from '../auth/staff-jwt.strategy';
import { StaffChangePasswordDto, StaffLoginDto, TripSearchQuery } from '../dto/ticketing.dto';

@ApiTags('Billetterie - Public')
@Controller('ticketing')
export class PublicTicketingController {
  constructor(
    private companies: CompaniesService,
    private trips: TripsService,
    private staffAuth: StaffAuthService,
  ) {}

  // Parcours : ville -> compagnie -> gare -> trajet

  @Get('cities')
  listCities() {
    return this.companies.listCities();
  }

  @Get('companies')
  listCompanies(@Query('city') city?: string) {
    return this.companies.listPublicCompanies(city);
  }

  @Get('companies/:companyId')
  getCompany(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.companies.getPublicCompany(companyId);
  }

  @Get('companies/:companyId/stations')
  listStations(@Param('companyId', ParseUUIDPipe) companyId: string, @Query('city') city?: string) {
    return this.companies.listPublicStations(companyId, city);
  }

  @Get('trips/search')
  searchTrips(@Query() query: TripSearchQuery) {
    return this.trips.search(query);
  }

  @Get('trips/:tripId')
  getTrip(@Param('tripId', ParseUUIDPipe) tripId: string) {
    return this.trips.getPublicTrip(tripId);
  }

  // Connexion agents de gare / contrôleurs

  @Post('auth/station/login')
  loginStation(@Body() dto: StaffLoginDto) {
    return this.staffAuth.loginStation(dto.loginId, dto.password);
  }

  @Post('auth/inspector/login')
  loginInspector(@Body() dto: StaffLoginDto) {
    return this.staffAuth.loginInspector(dto.loginId, dto.password);
  }

  @Post('auth/staff/change-password')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(AuthGuard(STAFF_JWT_STRATEGY))
  changePassword(@Req() req: Request, @Body() dto: StaffChangePasswordDto) {
    return this.staffAuth.changePassword(req.user as any, dto.currentPassword, dto.newPassword);
  }
}
