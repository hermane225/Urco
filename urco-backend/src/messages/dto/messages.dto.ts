import { IsString } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  conversationId!: string;

  @IsString()
  text!: string;
}

export class CreateConversationDto {
  @IsString()
  participantId!: string;
}

