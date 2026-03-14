import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateBookingDto {
@IsNumber()
  seats!: number;

  @IsOptional()
  @IsNumber()
  passengerLat?: number;

  @IsOptional()
  @IsNumber()
  passengerLng?: number;

  @IsOptional()
  @IsString()
  message?: string;
}

export class UpdateBookingDto {
  @IsOptional()
  @IsNumber()
  seats?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

