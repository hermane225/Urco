import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRideDto, UpdateRideDto } from './dto/rides.dto';

@Injectable()
export class RidesService {
  constructor(private prisma: PrismaService) {}

  async createRide(userId: string, createRideDto: CreateRideDto) {
    const { departureDate, ...rest } = createRideDto;

    return this.prisma.ride.create({
      data: {
        ...rest,
        departureDate: new Date(departureDate),
        driverId: userId,
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

    const { departureDate, ...rest } = updateRideDto;

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

