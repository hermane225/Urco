import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Ride } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAlertDto } from './dto/alerts.dto';
import { AlertsGateway } from './alerts.gateway';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private prisma: PrismaService,
    private alertsGateway: AlertsGateway,
  ) {}

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

  async notifyUsersForRideMatch(ride: Ride) {
    const from = new Date(ride.departureDate.getTime() - 24 * 60 * 60 * 1000);
    const to = new Date(ride.departureDate.getTime() + 24 * 60 * 60 * 1000);

    const candidateAlerts = await this.prisma.alert.findMany({
      where: {
        active: true,
        desiredDate: {
          gte: from,
          lte: to,
        },
        OR: [
          { desiredPrice: null },
          { desiredPrice: { gte: ride.pricePerSeat } },
        ],
      },
    });

    const normalizedOrigin = ride.origin.toLowerCase();
    const normalizedDestination = ride.destination.toLowerCase();

    const matchingAlerts = candidateAlerts.filter((alert) => {
      const alertOrigin = alert.origin.toLowerCase();
      const alertDestination = alert.destination.toLowerCase();

      const originMatch =
        normalizedOrigin.includes(alertOrigin) || alertOrigin.includes(normalizedOrigin);
      const destinationMatch =
        normalizedDestination.includes(alertDestination) ||
        alertDestination.includes(normalizedDestination);

      return originMatch && destinationMatch;
    });

    for (const alert of matchingAlerts) {
      this.alertsGateway.emitAlertPopup(alert.userId, {
        type: 'RIDE_MATCH',
        title: 'Nouveau trajet disponible',
        message: `Un trajet ${ride.origin} -> ${ride.destination} correspond a votre alerte.`,
        rideId: ride.id,
        alertId: alert.id,
        departureDate: ride.departureDate,
        pricePerSeat: ride.pricePerSeat,
      });
    }

    if (matchingAlerts.length > 0) {
      this.logger.log(`Ride ${ride.id}: ${matchingAlerts.length} users notified`);
    }

    return matchingAlerts.length;
  }
}

