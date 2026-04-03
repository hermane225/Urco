import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class AlertsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AlertsGateway.name);

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected to alerts gateway: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from alerts gateway: ${client.id}`);
  }

  @SubscribeMessage('joinAlerts')
  async handleJoinAlerts(
    @ConnectedSocket() client: Socket,
    @MessageBody('userId') userId: string,
  ) {
    const room = this.getUserAlertsRoom(userId);
    client.join(room);
    return { event: 'joinedAlerts', data: { userId } };
  }

  emitAlertPopup(userId: string, payload: Record<string, unknown>) {
    this.server.to(this.getUserAlertsRoom(userId)).emit('alertPopup', payload);
  }

  private getUserAlertsRoom(userId: string) {
    return `user-alerts-${userId}`;
  }
}
