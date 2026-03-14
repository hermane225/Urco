import { IsUUID, IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiProperty({ example: 'uuid-booking-123' })
  @IsUUID()
  bookingId: string;

  @ApiProperty({ example: 25000, description: 'Montant en centimes XOF' })
  @IsNumber()
  @Min(100)
  amount: number;

  @ApiProperty({ example: 'ORANGE_MONEY', required: false })
  @IsOptional()
  @IsString()
  paymentMethod?: string;
}

export class UpdatePaymentStatusDto {
  @ApiProperty({ enum: ['pending', 'paid', 'failed', 'refunded'], example: 'paid' })
  @IsString()
  status: 'pending' | 'paid' | 'failed' | 'refunded';
}
