import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/bookings.dto';

@Injectable()
export class BookingsService {
  constructor(private prisma: PrismaService) {}

  async createBooking(rideId: string, userId: string, createBookingDto: CreateBookingDto) {
  const { seats, passengerLat, passengerLng, message } = createBookingDto;

    // Get ride details
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (ride.status !== 'ACTIVE') {
      throw new BadRequestException('This ride is no longer available');
    }

    if (ride.availableSeats < seats) {
      throw new BadRequestException('Not enough seats available');
    }

    // Check if user already has a booking for this ride
    const existingBooking = await this.prisma.booking.findFirst({
      where: {
        rideId,
        passengerId: userId,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    });

    if (existingBooking) {
      throw new BadRequestException('You already have a booking for this ride');
    }

    // Calculate total price
    const totalPrice = ride.pricePerSeat * seats;

    // Create booking
    const booking = await this.prisma.booking.create({
      data: {
        rideId,
        passengerId: userId,
        seats,
        totalPrice,
        passengerLat,
        passengerLng,
        message,
        securityCode: Math.floor(1000 + Math.random() * 9000).toString(),
        status: 'PENDING',
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
                phone: true,
              },
            },
          },
        },
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
    });

    return booking;
  }

  async getBookingById(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
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
                phone: true,
              },
            },
          },
        },
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
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  async updateBookingStatus(bookingId: string, userId: string, status: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { ride: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Only the driver can confirm/cancel, only the passenger can cancel their own booking
    if (status === 'CONFIRMED' && booking.ride.driverId !== userId) {
      throw new BadRequestException('Only the driver can confirm bookings');
    }

    if (status === 'CANCELLED' && booking.passengerId !== userId && booking.ride.driverId !== userId) {
      throw new BadRequestException('Only the passenger or driver can cancel bookings');
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: status as any },
      include: {
        ride: true,
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
    });

    // If confirmed, update available seats
    if (status === 'CONFIRMED') {
      await this.prisma.ride.update({
        where: { id: booking.rideId },
        data: {
          availableSeats: { decrement: booking.seats },
        },
      });
    }

    // If cancelled and was confirmed, restore available seats
    if (status === 'CANCELLED' && booking.status === 'CONFIRMED') {
      await this.prisma.ride.update({
        where: { id: booking.rideId },
        data: {
          availableSeats: { increment: booking.seats },
        },
      });
    }

    return updatedBooking;
  }

  async getUserBookings(userId: string) {
    return this.prisma.booking.findMany({
      where: { passengerId: userId },
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
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

async getDriverBookings(userId: string) {
  const rides = await this.prisma.ride.findMany({
    where: { driverId: userId },
    select: { id: true },
  });

  const rideIds = rides.map((ride) => ride.id);

  return this.prisma.booking.findMany({
    where: { rideId: { in: rideIds } },
    include: {
      ride: true,
      passenger: {
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
    orderBy: { createdAt: 'desc' },
  });
}

async validateSecurityCode(bookingId: string, code: string) {
  const booking = await this.prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw new NotFoundException('Booking not found');
  }

  if (booking.securityCode !== code) {
    throw new BadRequestException('Invalid security code');
  }

  if (booking.codeValidated) {
    throw new BadRequestException('Code already validated');
  }

  const updatedBooking = await this.prisma.booking.update({
    where: { id: bookingId },
    data: { codeValidated: true },
    include: {
      ride: true,
      passenger: true,
    },
  });

  return { message: 'Code validated', booking: updatedBooking };
}

async markDriverArrived(bookingId: string, userId: string) {
  const booking = await this.prisma.booking.findUnique({
    where: { id: bookingId },
    include: { ride: true },
  });

  if (!booking) {
    throw new NotFoundException('Booking not found');
  }

  if (booking.ride.driverId !== userId) {
    throw new BadRequestException('Only driver can mark arrival');
  }

  // Update booking status or add arrived field - here set to special status or notify
  const updatedBooking = await this.prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'DRIVER_ARRIVED' as any },
  });

  return { message: 'Driver marked as arrived', booking: updatedBooking };
}
}

