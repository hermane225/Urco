import { IsNumber, IsOptional, Min, IsDateString } from 'class-validator';

export class NearbyRidesDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsNumber()
  @Min(0)
  radiusKm: number = 50;

  @IsOptional()
  @IsDateString()
  date?: string;
}
