import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { RidesTrackingService } from './rides-tracking.service';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RidesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RidesGateway.name);
  private activeRides = new Map<string, Set<string>>();
  private clientUsers = new Map<string, string>();

  private readonly activeBookingStatuses = [
    'CONFIRMED',
    'CODE_SENT',
    'CODE_VERIFIED',
    'RIDE_IN_PROGRESS',
  ] as const;

  constructor(
    private ridesTrackingService: RidesTrackingService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    const disconnectedUserId = this.clientUsers.get(client.id);
    // Leave all ride rooms
    this.activeRides.forEach((clients) => {
      if (disconnectedUserId) {
        clients.delete(disconnectedUserId);
      }
    });
    this.clientUsers.delete(client.id);
  }

  /**
   * Join a ride tracking room
   * `userId` peut être le chauffeur ou un passager
   */
  @SubscribeMessage('joinRideTracking')
  async handleJoinRideTracking(
    @ConnectedSocket() client: Socket,
    @MessageBody('rideId') rideId: string,
    @MessageBody('userId') userId: string,
  ) {
    const room = `ride-${rideId}`;
    client.join(room);

    if (!this.activeRides.has(rideId)) {
      this.activeRides.set(rideId, new Set());
    }
    const clients = this.activeRides.get(rideId);
    if (clients) {
      clients.add(userId);
    }
    this.clientUsers.set(client.id, userId);

    const passengersSnapshot = await this.getRidePassengersSnapshot(rideId);
    client.emit('ridePassengersSnapshot', {
      rideId,
      passengers: passengersSnapshot,
      timestamp: new Date(),
    });

    this.logger.log(`User ${userId} joined ride tracking for ${rideId}`);
    return { event: 'joinedRideTracking', data: { rideId } };
  }

  /**
   * Leave ride tracking room
   */
  @SubscribeMessage('leaveRideTracking')
  async handleLeaveRideTracking(
    @ConnectedSocket() client: Socket,
    @MessageBody('rideId') rideId: string,
    @MessageBody('userId') userId: string,
  ) {
    const room = `ride-${rideId}`;
    client.leave(room);

    const clients = this.activeRides.get(rideId);
    if (clients) {
      clients.delete(userId);
    }

    this.logger.log(`User ${userId} left ride tracking for ${rideId}`);
    return { event: 'leftRideTracking', data: { rideId } };
  }

  /**
   * Driver sends real-time location during ride
   * Broadcasts to all participants (passengers in the ride)
   */
  @SubscribeMessage('driverLocationUpdate')
  async handleDriverLocationUpdate(
    @MessageBody()
    data: {
      rideId: string;
      driverId: string;
      lat: number;
      lng: number;
      accuracy?: number;
      heading?: number;
      speed?: number;
    },
  ) {
    const { rideId, driverId, lat, lng, accuracy, heading, speed } = data;
    const room = `ride-${rideId}`;

    // Save tracking info using the updateDriverLocation method
    const tracking = await this.ridesTrackingService.updateDriverLocation(
      rideId,
      driverId,
      {
        driverLat: lat,
        driverLng: lng,
        accuracy,
        heading,
        speed,
      },
    );

    // Broadcast to all passengers in this ride
    this.server.to(room).emit('driverLocationUpdate', {
      rideId,
      driverId,
      location: {
        lat,
        lng,
        accuracy,
        heading,
        speed,
      },
      timestamp: new Date(),
    });

    return { event: 'locationSaved', data: { rideId } };
  }

  /**
  * Passenger sends real-time location during ride
  * Broadcasts to all participants in the ride room
   */
  @SubscribeMessage('passengerLocationUpdate')
  async handlePassengerLocationUpdate(
    @MessageBody()
    data: {
      rideId: string;
      passengerId: string;
      bookingId: string;
      lat: number;
      lng: number;
      accuracy?: number;
    },
  ) {
    const { rideId, passengerId, bookingId, lat, lng, accuracy } = data;
    const room = `ride-${rideId}`;

    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        select: { passengerId: true },
      });

      if (booking) {
        await this.prisma.liveLocation.upsert({
          where: { bookingId },
          update: {
            userId: booking.passengerId,
            lat,
            lng,
          },
          create: {
            userId: booking.passengerId,
            bookingId,
            lat,
            lng,
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Unable to persist passenger location for booking ${bookingId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    // Broadcast to all in ride (driver + other passengers)
    this.server.to(room).emit('passengerLocationUpdate', {
      rideId,
      passengerId,
      bookingId,
      lat,
      lng,
      location: {
        lat,
        lng,
        accuracy,
      },
      timestamp: new Date(),
    });

    this.logger.log(
      `Passenger ${passengerId} sent location for ride ${rideId}`,
    );
    return { event: 'passengerLocationSaved' };
  }

  private async getRidePassengersSnapshot(rideId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        rideId,
        status: { in: [...this.activeBookingStatuses] as any },
      },
      select: {
        id: true,
        passengerId: true,
        passengerLat: true,
        passengerLng: true,
      },
    });

    const liveLocations = await this.prisma.liveLocation.findMany({
      where: {
        bookingId: {
          in: bookings.map((booking) => booking.id),
        },
      },
      select: {
        bookingId: true,
        lat: true,
        lng: true,
        updatedAt: true,
      },
    });

    const liveByBookingId = new Map(
      liveLocations.map((location) => [location.bookingId, location]),
    );

    return bookings.map((booking) => {
      const live = liveByBookingId.get(booking.id);
      return {
        bookingId: booking.id,
        passengerId: booking.passengerId,
        pickupLocation: {
          lat: booking.passengerLat,
          lng: booking.passengerLng,
        },
        liveLocation: live
          ? {
              lat: live.lat,
              lng: live.lng,
              updatedAt: live.updatedAt,
            }
          : null,
      };
    });
  }

  /**
   * Notify participants that driver has arrived at pickup
   */
  @SubscribeMessage('driverArrivedAtPickup')
  async handleDriverArrivedAtPickup(
    @MessageBody()
    data: {
      rideId: string;
      driverId: string;
      bookingId?: string;
      lat: number;
      lng: number;
    },
  ) {
    const { rideId, driverId, bookingId, lat, lng } = data;
    const room = `ride-${rideId}`;

    this.server.to(room).emit('driverArrivedAtPickup', {
      rideId,
      driverId,
      bookingId,
      location: { lat, lng },
      timestamp: new Date(),
    });

    this.logger.log(`Driver ${driverId} arrived for ride ${rideId}`);
    return { event: 'arrivalNotified' };
  }

  /**
   * Notify participants that ride has started en route to destination
   */
  @SubscribeMessage('rideStarted')
  async handleRideStarted(
    @MessageBody()
    data: {
      rideId: string;
      driverId: string;
    },
  ) {
    const { rideId, driverId } = data;
    const room = `ride-${rideId}`;

    this.server.to(room).emit('rideStarted', {
      rideId,
      driverId,
      timestamp: new Date(),
    });

    this.logger.log(`Ride ${rideId} started by driver ${driverId}`);
    return { event: 'rideStartedNotified' };
  }

  /**
   * Notify participants that ride is completed
   */
  @SubscribeMessage('rideCompleted')
  async handleRideCompleted(
    @MessageBody()
    data: {
      rideId: string;
      driverId: string;
    },
  ) {
    const { rideId, driverId } = data;
    const room = `ride-${rideId}`;

    this.server.to(room).emit('rideCompleted', {
      rideId,
      driverId,
      timestamp: new Date(),
    });

    this.logger.log(`Ride ${rideId} completed by driver ${driverId}`);
    this.activeRides.delete(rideId);

    return { event: 'rideCompletedNotified' };
  }
}
