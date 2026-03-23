import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RidesEventsService {
  private readonly logger = new Logger(RidesEventsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Enregistrer un événement du trajet (audit trail)
   */
  async createRideEvent(
    rideId: string,
    type: string,
    userId?: string,
    data?: any,
    description?: string,
  ) {
    const event = await this.prisma.rideEvent.create({
      data: {
        rideId,
        type,
        userId,
        data,
        description,
      },
    });

    this.logger.debug(`Événement ${type} créé pour le trajet ${rideId}`);

    return event;
  }

  /**
   * Récupérer tous les événements d'un trajet
   */
  async getRideEvents(rideId: string) {
    const events = await this.prisma.rideEvent.findMany({
      where: { rideId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });

    return events;
  }

  /**
   * Récupérer l'audit trail complet (pour l'admin)
   */
  async getAuditTrail(rideId: string) {
    return this.getRideEvents(rideId);
  }

  /**
   * Compter les événements par type
   */
  async countEventsByType(rideId: string) {
    const events = await this.prisma.rideEvent.groupBy({
      by: ['type'],
      where: { rideId },
      _count: true,
    });

    const result = {};
    events.forEach((e) => {
      result[e.type] = e._count;
    });

    return result;
  }

  /**
   * Obtenir statistiques du trajet
   */
  async getRideStats(rideId: string) {
    const events = await this.getRideEvents(rideId);
    const eventTypes = this.countEventsByType(rideId);

    const createdAt = events.find((e) => e.type === 'CREATED')?.createdAt;
    const startedAt = events.find((e) => e.type === 'STARTED_BY_DRIVER')?.createdAt;
    const completedAt = events.find((e) => e.type === 'RIDE_COMPLETED')?.createdAt;

    let duration: number | null = null;
    if (startedAt && completedAt) {
      duration = Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000 / 60); // en minutes
    }

    return {
      totalEvents: events.length,
      createdAt,
      startedAt,
      completedAt,
      duration,
      eventTypes: await eventTypes,
    };
  }
}
