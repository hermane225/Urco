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

  async notifyAdminsDriverDocumentsSubmitted(params: {
    userId: string;
    isResubmission?: boolean;
  }) {
    const admins = await this.prisma.user.findMany({
      where: {
        OR: [{ isAdmin: true }, { role: 'ADMIN' }],
      },
      select: { id: true },
    });

    const payload = {
      type: 'DRIVER_DOCUMENTS_SUBMITTED',
      title: 'Documents conducteur a verifier',
      message: params.isResubmission
        ? 'Un chauffeur a re-soumis ses documents pour verification.'
        : 'Un chauffeur a soumis ses documents pour verification.',
      userId: params.userId,
      submittedAt: new Date(),
    };

    for (const admin of admins) {
      this.alertsGateway.emitAlertPopup(admin.id, payload);
    }

    return admins.length;
  }

  async notifyDriverDocumentsReviewResult(params: {
    userId: string;
    approved: boolean;
    details?: string;
  }) {
    this.alertsGateway.emitAlertPopup(params.userId, {
      type: 'DRIVER_DOCUMENTS_REVIEWED',
      title: params.approved ? 'Documents valides' : 'Documents a corriger',
      message: params.approved
        ? 'Vos documents conducteur ont ete valides par l\'admin.'
        : params.details || 'Certains documents ont ete rejetes. Merci de les mettre a jour.',
      approved: params.approved,
      reviewedAt: new Date(),
    });
  }
}

