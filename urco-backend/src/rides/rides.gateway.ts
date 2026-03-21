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

  constructor(private ridesTrackingService: RidesTrackingService) {}

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Leave all ride rooms
    this.activeRides.forEach((clients) => {
      clients.delete(client.id);
    });
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
   * Broadcasts to driver only
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

    // Broadcast to all in ride (driver + other passengers)
    this.server.to(room).emit('passengerLocationUpdate', {
      rideId,
      passengerId,
      bookingId,
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
