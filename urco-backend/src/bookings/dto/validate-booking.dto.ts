import { IsString, IsNumber } from 'class-validator';

export class ValidateBookingCodeDto {
  @IsString()
  code!: string;
}
