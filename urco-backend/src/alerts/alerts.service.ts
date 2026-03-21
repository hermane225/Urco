import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAlertDto } from './dto/alerts.dto';

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  async createAlert(userId: string, createAlertDto: CreateAlertDto) {
    const { desiredDate, ...rest } = createAlertDto;

    return this.prisma.alert.create({
      data: {
        ...rest,
        desiredDate: new Date(desiredDate),
        userId,
      },
    });
  }

  async getUserAlerts(userId: string) {
    return this.prisma.alert.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteAlert(alertId: string, userId: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.userId !== userId) {
      throw new NotFoundException('You can only delete your own alerts');
    }

    await this.prisma.alert.delete({
      where: { id: alertId },
    });

    return { message: 'Alert deleted successfully' };
  }

  async checkMatchingRides(alertId: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
    });

    if (!alert || !alert.active) {
      return [];
    }

    const rides = await this.prisma.ride.findMany({
      where: {
        origin: { contains: alert.origin, mode: 'insensitive' },
        destination: { contains: alert.destination, mode: 'insensitive' },
        departureDate: {
          gte: new Date(alert.desiredDate),
          lte: new Date(new Date(alert.desiredDate).getTime() + 24 * 60 * 60 * 1000),
        },
        status: 'ACTIVE',
        availableSeats: { gt: 0 },
      },
      include: {
        driver: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
            rating: true,
          },
        },
      },
    });

    return rides;
  }
}

