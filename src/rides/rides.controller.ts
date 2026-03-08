import {
  Controller,
  Get,
  Post,
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
import type { Request } from 'express';

@Controller('rides')
export class RidesController {
  constructor(private ridesService: RidesService) {}

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

