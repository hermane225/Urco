import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRideDto, UpdateRideDto } from './dto/rides.dto';
import { Client } from '@googlemaps/google-maps-services-js';
import { RidesEventsService } from './rides-events.service';
import { RidesTrackingService } from './rides-tracking.service';
import { MessagesService } from '../messages/messages.service';
import { AlertsService } from '../alerts/alerts.service';

@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private ridesEventsService: RidesEventsService,
    private ridesTrackingService: RidesTrackingService,
    private messagesService: MessagesService,
    private alertsService: AlertsService,
  ) {}

  private async reverseGeocode(lat: number, lng: number): Promise<string> {
    const token = this.configService.getOrThrow('GOOGLE_MAPS_API_KEY') as string;
    const client = new Client({});
    const response = await client.reverseGeocode({
      params: {
        latlng: `${lat},${lng}`,
        key: token,
      },
      timeout: 1000,
    });

    if (!response.data.results || response.data.results.length === 0) {
      throw new BadRequestException('Geocoding failed: No results found');
    }

    return response.data.results[0].formatted_address;
  }

  async createRide(
    userId: string,
    createRideDto: CreateRideDto,
    files?: {
      driverLicensePhoto?: Express.Multer.File[];
      carInsurancePhoto?: Express.Multer.File[];
      vehiclePhoto?: Express.Multer.File[];
    },
  ) {
    const { departureDate, originLat, originLng, destLat, destLng, ...rest } =
      createRideDto;

    // Reverse geocode if lat/lng provided without address
    if (originLat !== undefined && originLng !== undefined) {
      rest.origin = await this.reverseGeocode(originLat, originLng);
    }
    if (destLat !== undefined && destLng !== undefined) {
      rest.destination = await this.reverseGeocode(destLat, destLng);
    }

    const driverLicensePhotoPath = files?.driverLicensePhoto?.[0]
      ? `/uploads/${files.driverLicensePhoto[0].filename}`
      : null;
    const carInsurancePhotoPath = files?.carInsurancePhoto?.[0]
      ? `/uploads/${files.carInsurancePhoto[0].filename}`
      : null;
    const vehiclePhotoPath = files?.vehiclePhoto?.[0]
      ? `/uploads/${files.vehiclePhoto[0].filename}`
      : null;

    const rideData: any = {
      ...rest,
      originLat: originLat ?? null,
      originLng: originLng ?? null,
      destLat: destLat ?? null,
      destLng: destLng ?? null,
      departureDate: new Date(departureDate),
      driverId: userId,
    };

    if (driverLicensePhotoPath) {
      rideData.driverLicensePhoto = driverLicensePhotoPath;
    }

    if (carInsurancePhotoPath) {
      rideData.carInsurancePhoto = carInsurancePhotoPath;
    }

    const ridePayload = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          role: true,
          roles: true,
          driverLicense: true,
          carInsurance: true,
          idDocumentPhoto: true,
          driverLicenseVerified: true,
          carInsuranceVerified: true,
          idDocumentVerified: true,
        },
      });

      const ridesCount = await tx.ride.count({ where: { driverId: userId } });
      const isFirstRide = ridesCount === 0;

      const finalDriverLicense = driverLicensePhotoPath ?? user?.driverLicense ?? null;
      const finalCarInsurance = carInsurancePhotoPath ?? user?.carInsurance ?? null;
      const finalVehiclePhoto = vehiclePhotoPath ?? user?.idDocumentPhoto ?? null;

      const missingDocuments: string[] = [];
      if (!finalDriverLicense) missingDocuments.push('driverLicense');
      if (!finalCarInsurance) missingDocuments.push('carInsurance');
      if (!finalVehiclePhoto) missingDocuments.push('vehiclePhoto');

      const uploadedAnyDriverDocument =
        !!driverLicensePhotoPath || !!carInsurancePhotoPath || !!vehiclePhotoPath;

      const nextRoles = new Set(user?.roles || []);
      nextRoles.add(UserRole.DRIVER);

      const userUpdateData: any = {
        role: UserRole.DRIVER,
        roles: { set: Array.from(nextRoles) },
      };

      if (driverLicensePhotoPath) {
        userUpdateData.driverLicense = driverLicensePhotoPath;
        userUpdateData.driverLicenseVerified = false;
      }

      if (carInsurancePhotoPath) {
        userUpdateData.carInsurance = carInsurancePhotoPath;
        userUpdateData.carInsuranceVerified = false;
      }

      if (vehiclePhotoPath) {
        // Reuse idDocumentPhoto slot as vehicle document photo for now.
        userUpdateData.idDocumentPhoto = vehiclePhotoPath;
        userUpdateData.idDocumentVerified = false;
      }

      await tx.user.update({
        where: { id: userId },
        data: userUpdateData,
      });

      const ride = await tx.ride.create({
        data: rideData,
        include: {
          driver: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              rating: true,
              ridesCompleted: true,
            },
          },
        },
      });

      return {
        ride,
        isFirstRide,
        missingDocuments,
        uploadedAnyDriverDocument,
        reviewStatus: {
          driverLicenseVerified: driverLicensePhotoPath ? false : user?.driverLicenseVerified,
          carInsuranceVerified: carInsurancePhotoPath ? false : user?.carInsuranceVerified,
          vehiclePhotoVerified: vehiclePhotoPath ? false : user?.idDocumentVerified,
        },
      };
    });

    const createdRide = ridePayload.ride;

    try {
      await this.alertsService.notifyUsersForRideMatch(createdRide);
    } catch (error) {
      this.logger.error(`Unable to notify alert users for ride ${createdRide.id}`, error as any);
    }

    if (ridePayload.uploadedAnyDriverDocument) {
      try {
        await this.alertsService.notifyAdminsDriverDocumentsSubmitted({
          userId,
          isResubmission: !ridePayload.isFirstRide,
        });
      } catch (error) {
        this.logger.error(`Unable to notify admins for driver docs from user ${userId}`, error as any);
      }
    }

    const firstRideNeedsDocuments =
      ridePayload.isFirstRide && ridePayload.missingDocuments.length > 0;

    const rideWithUrls = this.withPublicMediaUrls(createdRide);

    return {
      ...rideWithUrls,
      driverDocuments: {
        firstRide: ridePayload.isFirstRide,
        missingDocuments: ridePayload.missingDocuments,
        firstRideNeedsDocuments,
        reviewStatus: ridePayload.reviewStatus,
        message: firstRideNeedsDocuments
          ? 'Publie avec succes. Ajoutez vos documents conducteur pour verification admin.'
          : 'Publie avec succes. Vos documents seront verifies par l\'admin si necessaire.',
      },
    };
  }

  async getRides(filters?: {
    origin?: string;
    destination?: string;
    date?: string;
  }) {
    const where: any = {
      status: 'ACTIVE',
      availableSeats: { gt: 0 },
    };

    if (filters?.origin) {
      where.origin = { contains: filters.origin, mode: 'insensitive' };
    }

    if (filters?.destination) {
      where.destination = { contains: filters.destination, mode: 'insensitive' };
    }

    if (filters?.date) {
      const date = new Date(filters.date);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      where.departureDate = {
        gte: date,
        lt: nextDay,
      };
    }

    const rides = await this.prisma.ride.findMany({
      where,
      include: {
        driver: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
            rating: true,
            ridesCompleted: true,
            verified: true,
          },
        },
      },
      orderBy: {
        departureDate: 'asc',
      },
    });

    return rides.map((ride) => this.withPublicMediaUrls(ride));
  }

  async getNearbyRides(lat: number, lng: number, radiusKm: number = 50, date?: string) {
    const rides = await this.prisma.ride.findMany({
      where: {
        status: 'ACTIVE',
        availableSeats: { gt: 0 },
        OR: [
          {
            originLat: { not: null, gte: lat - 0.5, lte: lat + 0.5 },
            originLng: { not: null, gte: lng - 0.5, lte: lng + 0.5 },
          },
          {
            destLat: { not: null, gte: lat - 0.5, lte: lat + 0.5 },
            destLng: { not: null, gte: lng - 0.5, lte: lng + 0.5 },
          },
        ],
      },
      include: {
        driver: true,
      },
      orderBy: {
        departureDate: 'asc',
      },
    });

    // Client-side haversine filter (backend approx for now)
    const nearbyRides = rides.filter(ride => {
      if (ride.originLat && ride.originLng) {
        const distance = this.haversine(lat, lng, ride.originLat, ride.originLng);
        if (distance <= radiusKm) return true;
      }
      if (ride.destLat && ride.destLng) {
        const distance = this.haversine(lat, lng, ride.destLat, ride.destLng);
        if (distance <= radiusKm) return true;
      }
      return false;
    });

    return nearbyRides.map((ride) => this.withPublicMediaUrls(ride));
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  async getRideById(rideId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        driver: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
            rating: true,
            ridesCompleted: true,
            verified: true,
            phone: true,
          },
        },
        bookings: {
          include: {
            passenger: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    return this.withPublicMediaUrls(ride);
  }

  async updateRide(rideId: string, userId: string, updateRideDto: UpdateRideDto) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (ride.driverId !== userId) {
      throw new BadRequestException('You can only update your own rides');
    }

  const { departureDate, ...rest } = updateRideDto; // now includes lat/lng

    const updatedRide = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        ...rest,
        departureDate: departureDate ? new Date(departureDate) : undefined,
      },
      include: {
        driver: {
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

    return this.withPublicMediaUrls(updatedRide);
  }

  async deleteRide(rideId: string, userId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (ride.driverId !== userId) {
      throw new BadRequestException('You can only delete your own rides');
    }

    await this.prisma.ride.delete({
      where: { id: rideId },
    });

    return { message: 'Ride deleted successfully' };
  }

  async getRideSummary(rideId: string) {
    const ride = await this.getRideById(rideId);

    const confirmedBookings = ride.bookings.filter(
      (booking) => booking.status === 'CONFIRMED',
    );

    const totalSeatsBooked = confirmedBookings.reduce(
      (sum, booking) => sum + booking.seats,
      0,
    );

    return {
      ride: {
        id: ride.id,
        origin: ride.origin,
        destination: ride.destination,
        departureDate: ride.departureDate,
        departureTime: ride.departureTime,
        pricePerSeat: ride.pricePerSeat,
        availableSeats: ride.availableSeats,
        vehicleModel: ride.vehicleModel,
        vehicleColor: ride.vehicleColor,
        vehiclePlate: ride.vehiclePlate,
        status: ride.status,
      },
      driver: ride.driver,
      bookings: {
        total: ride.bookings.length,
        confirmed: confirmedBookings.length,
        totalSeatsBooked,
        seatsRemaining: ride.availableSeats - totalSeatsBooked,
      },
    };
  }

  async getBookedRides(userId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        passengerId: userId,
      },
      include: {
        ride: {
          include: {
            driver: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true,
                rating: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return bookings.map((booking) => ({
      ...booking,
      ride: this.withPublicMediaUrls(booking.ride),
    }));
  }

  /**
   * Démarrer un trajet (chauffeur)
   */
  async startRide(rideId: string, driverId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: { bookings: true },
    });

    if (!ride) {
      throw new NotFoundException('Trajet non trouvé');
    }

    if (ride.driverId !== driverId) {
      throw new ForbiddenException('Seul le chauffeur peut démarrer ce trajet');
    }

    if (ride.status !== 'ACTIVE') {
      throw new BadRequestException(`Le trajet n'est pas actif (etat actuel: ${ride.status})`);
    }

    const updatedRide = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        actualStartTime: new Date(),
      } as any,
      include: {
        driver: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        bookings: true,
      },
    });

    await this.ridesEventsService.createRideEvent(
      rideId,
      'STARTED_BY_DRIVER',
      driverId,
      { startTime: new Date() },
      'Le chauffeur a démarré le trajet'
    );

    const confirmedBookings = ride.bookings.filter((b) => b.status === 'CONFIRMED');

    for (const booking of confirmedBookings) {
      const securityCode = Math.floor(1000 + Math.random() * 9000).toString();

      await this.prisma.booking.update({
        where: { id: booking.id },
        data: {
          securityCode,
          status: 'CODE_SENT' as any,
        } as any,
      });

      await this.ridesEventsService.createRideEvent(
        rideId,
        'PASSENGER_CODE_SENT',
        booking.passengerId,
        { bookingId: booking.id, code: securityCode },
        'Code de sécurité envoyé au passager'
      );

      // Envoi du code dans le chat (message automatique)
      // On cherche la conversation entre le chauffeur et le passager
      let conversation = await this.messagesService.createConversation(driverId, booking.passengerId);
      // Le chauffeur envoie le code au passager
      await this.messagesService.createMessage(conversation.id, driverId, `Votre code de sécurité pour ce trajet est : ${securityCode}`);
    }

    return updatedRide;
  }

  /**
   * Terminer un trajet (chauffeur)
   */
  async completeRide(rideId: string, driverId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: { bookings: true },
    });

    if (!ride) {
      throw new NotFoundException('Trajet non trouvé');
    }

    if (ride.driverId !== driverId) {
      throw new ForbiddenException('Seul le chauffeur peut terminer ce trajet');
    }

    if (ride.status !== 'ACTIVE') {
      throw new BadRequestException(`Le trajet n'est pas actif (etat actuel: ${ride.status})`);
    }

    const completedRide = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'COMPLETED',
        actualEndTime: new Date(),
      } as any,
      include: {
        driver: true,
        bookings: true,
      },
    });

    await this.prisma.booking.updateMany({
      where: {
        rideId,
        status: { in: ['CODE_VERIFIED', 'RIDE_IN_PROGRESS'] as any },
      },
      data: {
        status: 'COMPLETED' as any,
      },
    });

    await this.ridesEventsService.createRideEvent(
      rideId,
      'RIDE_COMPLETED',
      driverId,
      { endTime: new Date() },
      'Le trajet a été complété'
    );

    return completedRide;
  }

  /**
   * Annuler un trajet
   */
  async cancelRide(rideId: string, userId: string, reason?: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Trajet non trouvé');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true, role: true, roles: true },
    });

    const hasAdminAccess =
      user?.isAdmin ||
      user?.role === ('ADMIN' as any) ||
      user?.roles?.includes('ADMIN' as any);

    if (ride.driverId !== userId && !hasAdminAccess) {
      throw new ForbiddenException('Vous ne pouvez pas annuler ce trajet');
    }

    if (ride.status === 'COMPLETED') {
      throw new BadRequestException('Impossible d\'annuler un trajet déjà complété');
    }

    const cancelledRide = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'CANCELLED',
      },
    });

    await this.prisma.booking.updateMany({
      where: {
        rideId,
        status: { not: 'COMPLETED' },
      },
      data: {
        status: 'CANCELLED',
      },
    });

    await this.ridesEventsService.createRideEvent(
      rideId,
      'RIDE_CANCELLED',
      userId,
      { reason },
      `Le trajet a été annulé: ${reason || 'Raison non spécifiée'}`
    );

    return cancelledRide;
  }

  /**
   * Obtenir l'historique complet d'un trajet
   */
  async getRideFullHistory(rideId: string) {
    const ride = await this.getRideById(rideId);
    const events = await this.ridesEventsService.getRideEvents(rideId);

    return {
      ride,
      events,
    };
  }

  /**
   * Obtenir les statistiques détaillées d'un trajet
   */
  async getRideDetailedStats(rideId: string) {
    const ride = await this.getRideById(rideId);
    const rideAny = ride as any;
    
    const trackings = await this.ridesTrackingService.getRideTrackingHistory(rideId);

    const confirmedBookings = ride.bookings.filter((b) => b.status === 'COMPLETED');
    const totalSeatsBooked = confirmedBookings.reduce((sum, b) => sum + b.seats, 0);

    return {
      ride: {
        id: ride.id,
        status: ride.status,
        origin: ride.origin,
        destination: ride.destination,
        departureDate: ride.departureDate,
        actualStartTime: rideAny.actualStartTime ?? null,
        actualEndTime: rideAny.actualEndTime ?? null,
      },
      stats: {
        totalLocationUpdates: trackings.length,
        totalPassengers: ride.bookings.length,
        confirmedPassengers: confirmedBookings.length,
        totalSeatsBooked,
        estimatedRevenue: ride.pricePerSeat * totalSeatsBooked,
      },
      timeline: {
        createdAt: ride.createdAt,
        startedAt: rideAny.actualStartTime ?? null,
        completedAt: rideAny.actualEndTime ?? null,
        duration: rideAny.actualStartTime && rideAny.actualEndTime 
          ? Math.floor((rideAny.actualEndTime.getTime() - rideAny.actualStartTime.getTime()) / 1000 / 60)
          : null,
      },
    };
  }

  /**
   * Get all active bookings for a specific ride (for driver view)
   * Shows passenger details, their pickup location, and booking status
   */
  async getRideBookingsForDriver(rideId: string, driverId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Trajet non trouvé');
    }

    if (ride.driverId !== driverId) {
      throw new ForbiddenException('Seul le chauffeur de ce trajet peut voir les bookings');
    }

    const bookings = await this.prisma.booking.findMany({
      where: {
        rideId,
        status: { in: ['CONFIRMED', 'CODE_SENT', 'CODE_VERIFIED', 'RIDE_IN_PROGRESS'] },
      },
      include: {
        passenger: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
            phone: true,
            rating: true,
            verified: true,
            ridesCompleted: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const liveLocations = await this.prisma.liveLocation.findMany({
      where: {
        bookingId: {
          in: bookings.map((booking) => booking.id),
        },
      },
    });

    const liveByBookingId = new Map(liveLocations.map((location) => [location.bookingId, location]));

    return {
      ride: {
        id: ride.id,
        origin: ride.origin,
        destination: ride.destination,
        originLat: ride.originLat,
        originLng: ride.originLng,
        destLat: ride.destLat,
        destLng: ride.destLng,
        departureDate: ride.departureDate,
        status: ride.status,
      },
      bookings: bookings.map((booking) => ({
        id: booking.id,
        passengerId: booking.passengerId,
        seats: booking.seats,
        totalPrice: booking.totalPrice,
        pickupLocation: {
          lat: booking.passengerLat,
          lng: booking.passengerLng,
        },
        liveLocation: liveByBookingId.get(booking.id)
          ? {
              lat: liveByBookingId.get(booking.id)?.lat,
              lng: liveByBookingId.get(booking.id)?.lng,
              updatedAt: liveByBookingId.get(booking.id)?.updatedAt,
            }
          : null,
        message: booking.message,
        status: booking.status,
        codeValidated: booking.codeValidated,
        passenger: {
          ...booking.passenger,
          avatarUrl: this.toPublicFileUrl(booking.passenger.avatar),
        },
      })),
    };
  }

  /**
   * Get live view of a specific booking during a ride
   * Shows passenger info, their current/initial location, route details, and booking status
   * For use by the driver to see individual passenger details
   */
  async getBookingLiveView(rideId: string, bookingId: string, driverId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Trajet non trouvé');
    }

    if (ride.driverId !== driverId) {
      throw new ForbiddenException('Seul le chauffeur peut accéder à cette vue');
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        passenger: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatar: true,
            phone: true,
            rating: true,
            verified: true,
            ridesCompleted: true,
          },
        },
      },
    });

    if (!booking || booking.rideId !== rideId) {
      throw new NotFoundException('Booking non trouvé pour ce trajet');
    }

    if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
      throw new BadRequestException('Ce booking n\'est plus actif');
    }

    const passengerLiveLocation = await this.prisma.liveLocation.findFirst({
      where: {
        bookingId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const latestDriverTracking = await this.prisma.rideTracking.findFirst({
      where: {
        rideId,
        driverId,
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    return {
      ride: {
        id: ride.id,
        origin: ride.origin,
        destination: ride.destination,
        originLat: ride.originLat,
        originLng: ride.originLng,
        destLat: ride.destLat,
        destLng: ride.destLng,
        status: ride.status,
        vehicleModel: ride.vehicleModel,
        vehicleColor: ride.vehicleColor,
        vehiclePlate: ride.vehiclePlate,
      },
      booking: {
        id: booking.id,
        seats: booking.seats,
        totalPrice: booking.totalPrice,
        message: booking.message,
        status: booking.status,
        codeValidated: booking.codeValidated,
        securityCode: booking.codeValidated ? booking.securityCode : null,
      },
      passengerLiveLocation: passengerLiveLocation
        ? {
            lat: passengerLiveLocation.lat,
            lng: passengerLiveLocation.lng,
            updatedAt: passengerLiveLocation.updatedAt,
          }
        : null,
      driverLiveLocation: latestDriverTracking
        ? {
            lat: latestDriverTracking.driverLat,
            lng: latestDriverTracking.driverLng,
            accuracy: latestDriverTracking.accuracy,
            heading: latestDriverTracking.heading,
            speed: latestDriverTracking.speed,
            updatedAt: latestDriverTracking.timestamp,
          }
        : null,
      passenger: {
        ...booking.passenger,
        avatarUrl: this.toPublicFileUrl((booking.passenger as any)?.avatar),
      },
      pickupLocation: {
        lat: booking.passengerLat,
        lng: booking.passengerLng,
        description: 'Localisation au moment de la réservation',
      },
    };
  }

  private toPublicFileUrl(filePath?: string | null) {
    if (!filePath) {
      return null;
    }

    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }

    const baseUrl =
      this.configService.get<string>('PUBLIC_BASE_URL') ||
      `http://localhost:${this.configService.get<string>('PORT') || '3002'}`;

    return `${baseUrl}${filePath.startsWith('/') ? filePath : `/${filePath}`}`;
  }

  private withPublicMediaUrls<T extends any>(payload: T): T {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    const cloned: any = { ...payload };

    if (cloned.driver) {
      cloned.driver = {
        ...cloned.driver,
        avatarUrl: this.toPublicFileUrl(cloned.driver.avatar),
      };
    }

    if (Array.isArray(cloned.bookings)) {
      cloned.bookings = cloned.bookings.map((booking: any) => ({
        ...booking,
        passenger: booking.passenger
          ? {
              ...booking.passenger,
              avatarUrl: this.toPublicFileUrl(booking.passenger.avatar),
            }
          : booking.passenger,
      }));
    }

    cloned.driverLicensePhotoUrl = this.toPublicFileUrl(cloned.driverLicensePhoto);
    cloned.carInsurancePhotoUrl = this.toPublicFileUrl(cloned.carInsurancePhoto);

    return cloned as T;
  }
}

