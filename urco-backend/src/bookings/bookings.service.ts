import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { BookingStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/bookings.dto';
import { MessagesService } from '../messages/messages.service';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private prisma: PrismaService,
    private messagesService: MessagesService,
  ) {}

  async createBooking(
    rideId: string,
    userId: string,
    createBookingDto: CreateBookingDto,
  ) {
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
    const booking = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { roles: true },
      });

      const nextRoles = new Set(user?.roles || []);
      nextRoles.add(UserRole.PASSENGER);

      await tx.user.update({
        where: { id: userId },
        data: {
          roles: { set: Array.from(nextRoles) },
        },
      });

      return tx.booking.create({
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
    const nextStatus = status?.toUpperCase() as BookingStatus;
    const allowedStatuses: BookingStatus[] = [
      BookingStatus.CONFIRMED,
      BookingStatus.CANCELLED,
      BookingStatus.COMPLETED,
    ];

    if (!allowedStatuses.includes(nextStatus)) {
      throw new BadRequestException('Unsupported booking status');
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { ride: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.COMPLETED
    ) {
      throw new BadRequestException('This booking can no longer be modified');
    }

    if (nextStatus === booking.status) {
      return this.getBookingById(bookingId);
    }

    if (
      nextStatus === BookingStatus.CONFIRMED &&
      booking.ride.driverId !== userId
    ) {
      throw new ForbiddenException('Only the driver can confirm bookings');
    }

    if (
      nextStatus === BookingStatus.COMPLETED &&
      booking.ride.driverId !== userId
    ) {
      throw new ForbiddenException('Only the driver can complete bookings');
    }

    if (
      nextStatus === BookingStatus.CANCELLED &&
      booking.passengerId !== userId &&
      booking.ride.driverId !== userId
    ) {
      throw new ForbiddenException(
        'Only the passenger or driver can cancel bookings',
      );
    }

    if (
      nextStatus === BookingStatus.CONFIRMED &&
      booking.status !== BookingStatus.PENDING
    ) {
      throw new BadRequestException('Only pending bookings can be confirmed');
    }

    if (
      nextStatus === BookingStatus.COMPLETED &&
      (booking.status !== BookingStatus.CONFIRMED || !booking.codeValidated)
    ) {
      throw new BadRequestException(
        'Booking must be confirmed and code validated before completion',
      );
    }

    const updatedBooking = await this.prisma.$transaction(async (tx) => {
      if (nextStatus === BookingStatus.CONFIRMED) {
        const freshRide = await tx.ride.findUnique({
          where: { id: booking.rideId },
        });
        if (!freshRide || freshRide.availableSeats < booking.seats) {
          throw new BadRequestException(
            'Not enough seats available to confirm this booking',
          );
        }

        await tx.ride.update({
          where: { id: booking.rideId },
          data: {
            availableSeats: { decrement: booking.seats },
          },
        });
      }

      if (
        nextStatus === BookingStatus.CANCELLED &&
        booking.status === BookingStatus.CONFIRMED
      ) {
        await tx.ride.update({
          where: { id: booking.rideId },
          data: {
            availableSeats: { increment: booking.seats },
          },
        });
      }

      return tx.booking.update({
        where: { id: bookingId },
        data: { status: nextStatus },
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
    });

    if (booking.ride.driverId === userId) {
      const statusLabel: Record<string, string> = {
        PENDING: 'en attente',
        CONFIRMED: 'confirmee',
        CANCELLED: 'annulee',
        COMPLETED: 'terminee',
        CODE_SENT: 'code envoye',
        CODE_VERIFIED: 'code verifie',
        RIDE_IN_PROGRESS: 'trajet en cours',
      };
      await this.notifyPassenger(
        booking.ride.driverId,
        booking.passengerId,
        `Votre reservation est maintenant ${statusLabel[nextStatus]}.`,
      );
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

  async validateSecurityCode(bookingId: string, userId: string, code: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { ride: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.ride.driverId !== userId) {
      throw new ForbiddenException('Only the driver can validate booking code');
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed bookings can be code-validated');
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

    await this.notifyPassenger(
      booking.ride.driverId,
      booking.passengerId,
      'Votre code de reservation a ete valide par le conducteur.',
    );

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

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(
        'Driver arrival can only be sent for confirmed bookings',
      );
    }

    await this.notifyPassenger(
      userId,
      booking.passengerId,
      'Le conducteur est arrive au point de rendez-vous.',
    );

    return { message: 'Passenger notified that driver arrived', booking };
  }

  private async notifyPassenger(
    driverId: string,
    passengerId: string,
    text: string,
  ): Promise<void> {
    try {
      const conversation = await this.messagesService.createConversation(driverId, passengerId);
      await this.messagesService.createMessage(conversation.id, driverId, text);
    } catch (error) {
      this.logger.warn(
        `Unable to notify passenger ${passengerId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}

