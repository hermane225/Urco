import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateLocationDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsOptional()
  @IsString()
  bookingId?: string;
}
