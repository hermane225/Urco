import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { CreateMessageDto, CreateConversationDto } from './dto/messages.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';

@Controller('message')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Post('conversations')
  async createConversation(@Req() req: Request, @Body() createConversationDto: CreateConversationDto) {
    const user = req.user as any;
    return this.messagesService.createConversation(user.id, createConversationDto.participantId);
  }

  @Get('conversations')
  async getUserConversations(@Req() req: Request) {
    const user = req.user as any;
    return this.messagesService.getUserConversations(user.id);
  }

  @Get(':conversationId/get')
  async getMessages(@Req() req: Request, @Param('conversationId') conversationId: string) {
    const user = req.user as any;
    return this.messagesService.getMessages(conversationId, user.id);
  }

  @Post('send')
  async sendMessage(@Req() req: Request, @Body() createMessageDto: CreateMessageDto) {
    const user = req.user as any;
    return this.messagesService.createMessage(
      createMessageDto.conversationId,
      user.id,
      createMessageDto.text,
    );
  }
}

