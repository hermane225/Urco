import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRideDto, UpdateRideDto } from './dto/rides.dto';
import { Client } from '@googlemaps/google-maps-services-js';

@Injectable()
export class RidesService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
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

  async createRide(userId: string, createRideDto: CreateRideDto) {
    const { departureDate, originLat, originLng, destLat, destLng, ...rest } = createRideDto;

    // Reverse geocode if lat/lng provided without address
    if (originLat !== undefined && originLng !== undefined) {
      rest.origin = await this.reverseGeocode(originLat, originLng);
    }
    if (destLat !== undefined && destLng !== undefined) {
      rest.destination = await this.reverseGeocode(destLat, destLng);
    }

    const rideData = {
      ...rest,
      originLat: originLat ?? null,
      originLng: originLng ?? null,
      destLat: destLat ?? null,
      destLng: destLng ?? null,
      departureDate: new Date(departureDate),
      driverId: userId,
    };

    return this.prisma.ride.create({
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

    return this.prisma.ride.findMany({
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

    return nearbyRides;
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
              },
            },
          },
        },
      },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    return ride;
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

    return this.prisma.ride.update({
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

    return bookings;
  }
}

