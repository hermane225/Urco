import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { RidesService } from './rides.service';
import { CreateRideDto, UpdateRideDto } from './dto/rides.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RidesEventsService } from './rides-events.service';
import { RidesTrackingService } from './rides-tracking.service';
import type { Request } from 'express';

@Controller('rides')
export class RidesController {
  constructor(
    private ridesService: RidesService,
    private ridesEventsService: RidesEventsService,
    private ridesTrackingService: RidesTrackingService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async createRide(@Req() req: Request, @Body() createRideDto: CreateRideDto) {
    const user = req.user as any;
    return this.ridesService.createRide(user.id, createRideDto);
  }

  @Get()
  async getRides(
    @Query('origin') origin?: string,
    @Query('destination') destination?: string,
    @Query('date') date?: string,
  ) {
    return this.ridesService.getRides({ origin, destination, date });
  }

  @Get('booked')
  @UseGuards(JwtAuthGuard)
  async getBookedRides(@Req() req: Request) {
    const user = req.user as any;
    return this.ridesService.getBookedRides(user.id);
  }

  @Get(':rideId/summary')
  async getRideSummary(@Param('rideId') rideId: string) {
    return this.ridesService.getRideSummary(rideId);
  }

  @Get('nearby')
  async getNearbyRides(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius: string = '50',
    @Query('date') date?: string,
  ) {
    return this.ridesService.getNearbyRides(
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(radius),
      date,
    );
  }

  @Patch(':rideId/start')
  @UseGuards(JwtAuthGuard)
  async startRide(@Req() req: Request, @Param('rideId') rideId: string) {
    const user = req.user as any;
    return this.ridesService.startRide(rideId, user.id);
  }

  @Patch(':rideId/complete')
  @UseGuards(JwtAuthGuard)
  async completeRide(@Req() req: Request, @Param('rideId') rideId: string) {
    const user = req.user as any;
    return this.ridesService.completeRide(rideId, user.id);
  }

  @Patch(':rideId/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelRide(
    @Req() req: Request,
    @Param('rideId') rideId: string,
    @Body('reason') reason?: string,
  ) {
    const user = req.user as any;
    return this.ridesService.cancelRide(rideId, user.id, reason);
  }

  @Post(':rideId/tracking')
  @UseGuards(JwtAuthGuard)
  async updateTracking(
    @Req() req: Request,
    @Param('rideId') rideId: string,
    @Body()
    body: {
      driverLat: number;
      driverLng: number;
      accuracy?: number;
      heading?: number;
      speed?: number;
    },
  ) {
    const user = req.user as any;
    return this.ridesTrackingService.updateDriverLocation(rideId, user.id, body);
  }

  @Get(':rideId/tracking')
  @UseGuards(JwtAuthGuard)
  async getTrackingHistory(@Param('rideId') rideId: string) {
    return this.ridesTrackingService.getRideTrackingHistory(rideId);
  }

  @Get(':rideId/tracking/latest')
  @UseGuards(JwtAuthGuard)
  async getLatestTracking(@Param('rideId') rideId: string) {
    return this.ridesTrackingService.getLatestLocation(rideId);
  }

  @Get(':rideId/events')
  @UseGuards(JwtAuthGuard)
  async getRideEvents(@Param('rideId') rideId: string) {
    return this.ridesEventsService.getRideEvents(rideId);
  }

  @Get(':rideId/history')
  @UseGuards(JwtAuthGuard)
  async getRideHistory(@Param('rideId') rideId: string) {
    return this.ridesService.getRideFullHistory(rideId);
  }

  @Get(':rideId/stats')
  @UseGuards(JwtAuthGuard)
  async getRideStats(@Param('rideId') rideId: string) {
    return this.ridesService.getRideDetailedStats(rideId);
  }

  /**
   * Get all active bookings for a ride (for driver view)
   * Shows passenger details and their initial location
   */
  @Get(':rideId/bookings')
  @UseGuards(JwtAuthGuard)
  async getRideBookings(@Req() req: Request, @Param('rideId') rideId: string) {
    const user = req.user as any;
    return this.ridesService.getRideBookingsForDriver(rideId, user.id);
  }

  /**
   * Get live view of a booking (for driver to see passenger details and route)
   * Includes passenger current location, route details, and booking status
   */
  @Get(':rideId/bookings/:bookingId/live')
  @UseGuards(JwtAuthGuard)
  async getBookingLiveView(
    @Req() req: Request,
    @Param('rideId') rideId: string,
    @Param('bookingId') bookingId: string,
  ) {
    const user = req.user as any;
    return this.ridesService.getBookingLiveView(rideId, bookingId, user.id);
  }

  @Get(':rideId')
  async getRideById(@Param('rideId') rideId: string) {
    return this.ridesService.getRideById(rideId);
  }

  @Put(':rideId')
  @UseGuards(JwtAuthGuard)
  async updateRide(
    @Req() req: Request,
    @Param('rideId') rideId: string,
    @Body() updateRideDto: UpdateRideDto,
  ) {
    const user = req.user as any;
    return this.ridesService.updateRide(rideId, user.id, updateRideDto);
  }

  @Delete(':rideId')
  @UseGuards(JwtAuthGuard)
  async deleteRide(@Req() req: Request, @Param('rideId') rideId: string) {
    const user = req.user as any;
    return this.ridesService.deleteRide(rideId, user.id);
  }
}

