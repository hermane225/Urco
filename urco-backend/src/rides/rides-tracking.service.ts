import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RidesTrackingService {
  private readonly logger = new Logger(RidesTrackingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Enregistrer la localisation en temps réel du chauffeur
   */
  async updateDriverLocation(
    rideId: string,
    driverId: string,
    locationData: {
      driverLat: number;
      driverLng: number;
      accuracy?: number;
      heading?: number;
      speed?: number;
    },
  ) {
    // Vérifier que le trajet existe et appartient au chauffeur
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Trajet non trouvé');
    }

    if (ride.driverId !== driverId) {
      throw new ForbiddenException('Seul le chauffeur peut mettre à jour sa localisation');
    }

    // Créer l'entrée de suivi
    const tracking = await this.prisma.rideTracking.create({
      data: {
        rideId,
        driverId,
        driverLat: locationData.driverLat,
        driverLng: locationData.driverLng,
        accuracy: locationData.accuracy,
        heading: locationData.heading,
        speed: locationData.speed,
      },
    });

    this.logger.debug(`Localisation mise à jour pour le trajet ${rideId}`);

    return tracking;
  }

  /**
   * Récupérer l'historique de localisation d'un trajet
   */
  async getRideTrackingHistory(rideId: string) {
    const trackings = await this.prisma.rideTracking.findMany({
      where: { rideId },
      orderBy: { timestamp: 'asc' },
    });

    return trackings;
  }

  /**
   * Récupérer la dernière localisation connue du chauffeur
   */
  async getLatestLocation(rideId: string) {
    const latest = await this.prisma.rideTracking.findFirst({
      where: { rideId },
      orderBy: { timestamp: 'desc' },
      take: 1,
    });

    return latest;
  }

  /**
   * Récupérer les N dernières localisations (pour affichage sur la carte)
   */
  async getRecentLocations(rideId: string, limit: number = 50) {
    const trackings = await this.prisma.rideTracking.findMany({
      where: { rideId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return trackings.reverse();
  }

  /**
   * Calculer la distance entre deux points (formule de Haversine)
   */
  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Rayon de la Terre en km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
