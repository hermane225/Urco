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
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/messages.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private messagesService: MessagesService) {}

  async handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody('conversationId') conversationId: string,
  ) {
    client.join(conversationId);
    return { event: 'joined', data: conversationId };
  }

  @SubscribeMessage('leaveConversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody('conversationId') conversationId: string,
  ) {
    client.leave(conversationId);
    return { event: 'left', data: conversationId };
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() createMessageDto: CreateMessageDto & { senderId: string },
  ) {
    const message = await this.messagesService.createMessage(
      createMessageDto.conversationId,
      createMessageDto.senderId,
      createMessageDto.text,
    );

    // Emit to all clients in the conversation
    this.server.to(createMessageDto.conversationId).emit('newMessage', message);

    // Update conversation last message
    await this.messagesService.updateConversationLastMessage(
      createMessageDto.conversationId,
      createMessageDto.text,
    );

    return message;
  }

  @SubscribeMessage('markAsRead')
  async handleMarkAsRead(
    @MessageBody() data: { conversationId: string; userId: string },
  ) {
    await this.messagesService.markMessagesAsRead(data.conversationId, data.userId);
    return { event: 'messagesRead', data: data.conversationId };
  }
}

