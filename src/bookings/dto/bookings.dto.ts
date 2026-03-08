import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateBookingDto {
  @IsNumber()
  seats!: number;
}

export class UpdateBookingDto {
  @IsOptional()
  @IsNumber()
  seats?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

