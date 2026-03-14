import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/bookings.dto';
import { ValidateBookingCodeDto } from './dto/validate-booking.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';

@Controller()
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private bookingsService: BookingsService) {}

  @Post('rides/:rideId/book')
  async createBooking(
    @Req() req: Request,
    @Param('rideId') rideId: string,
    @Body() createBookingDto: CreateBookingDto,
  ) {
    const user = req.user as any;
    return this.bookingsService.createBooking(rideId, user.id, createBookingDto);
  }

  @Get('bookings')
  async getUserBookings(@Req() req: Request) {
    const user = req.user as any;
    return this.bookingsService.getUserBookings(user.id);
  }

  @Get('bookings/driver')
  async getDriverBookings(@Req() req: Request) {
    const user = req.user as any;
    return this.bookingsService.getDriverBookings(user.id);
  }

  @Get('bookings/:bookingId')
  async getBookingById(@Param('bookingId') bookingId: string) {
    return this.bookingsService.getBookingById(bookingId);
  }

@Put('bookings/:bookingId/status')
  async updateBookingStatus(
    @Req() req: Request,
    @Param('bookingId') bookingId: string,
    @Body('status') status: string,
  ) {
    const user = req.user as any;
    return this.bookingsService.updateBookingStatus(bookingId, user.id, status);
  }

@Post('bookings/:bookingId/validate-code')
async validateCode(
  @Param('bookingId') bookingId: string,
  @Body() dto: ValidateBookingCodeDto,
) {
  return this.bookingsService.validateSecurityCode(bookingId, dto.code);
}

@Put('bookings/:bookingId/driver-arrived')
@UseGuards(JwtAuthGuard)
async markDriverArrived(
  @Req() req: Request,
  @Param('bookingId') bookingId: string,
) {
  const user = req.user as any;
  return this.bookingsService.markDriverArrived(bookingId, user.id);
}
}

