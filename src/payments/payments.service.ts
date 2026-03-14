import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/payments.dto';
import { UpdatePaymentStatusDto } from './dto/payments.dto';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async createPayment(userId: string, dto: CreatePaymentDto) {
    const { bookingId, amount } = dto;

    // Vérif booking existe et appartient à l'utilisateur (passager)
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { passenger: true, payment: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking non trouvé');
    }
    if (booking.passengerId !== userId) {
      throw new BadRequestException('Accès non autorisé à ce booking');
    }
    if (booking.payment) {
      throw new BadRequestException('Payment déjà créé pour ce booking');
    }

    return this.prisma.payment.create({
      data: {
        bookingId,
        amount,
        currency: 'XOF',
        status: 'pending',
        paymentMethod: dto.paymentMethod,
      },
      include: {
        booking: {
          include: { passenger: true, ride: true },
        },
      },
    });
  }

  async getPayment(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { booking: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment non trouvé');
    }

    return payment;
  }

  async getPaymentByBooking(bookingId: string) {
    return this.prisma.payment.findUnique({
      where: { bookingId },
      include: { booking: true },
    });
  }

  async updatePaymentStatus(id: string, dto: UpdatePaymentStatusDto) {
    const { status } = dto;

    const payment = await this.prisma.payment.findUnique({ where: { id } });

    if (!payment) {
      throw new NotFoundException('Payment non trouvé');
    }

    // TODO: Logique webhook (Orange Money, Wave, etc.) pour admins
    // Vérif status valide: pending → paid/failed/refunded

    return this.prisma.payment.update({
      where: { id },
      data: { status, updatedAt: new Date() },
      include: { booking: true },
    });
  }
}
