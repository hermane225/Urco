import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';
import { CreatePaymentDto } from './dto/payments.dto';
import { UpdatePaymentStatusDto } from './dto/payments.dto';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post()
  async createPayment(@Req() req: Request, @Body() dto: CreatePaymentDto) {
    const user = req.user as any;
    return this.paymentsService.createPayment(user.id, dto);
  }

  @Get(':id')
  async getPayment(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.getPayment(id);
  }

  @Get('booking/:bookingId')
  async getPaymentByBooking(@Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.paymentsService.getPaymentByBooking(bookingId);
  }

  @Patch(':id/status')
  async updatePaymentStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentStatusDto,
  ) {
    return this.paymentsService.updatePaymentStatus(id, dto);
  }
}
