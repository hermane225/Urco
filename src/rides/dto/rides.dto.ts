import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum,
  Min,
} from 'class-validator';

export enum RideStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class CreateRideDto {
  @IsString()
  origin!: string;

  @IsString()
  destination!: string;

  @IsDateString()
  departureDate!: string;

  @IsString()
  departureTime!: string;

  @IsNumber()
  @Min(0)
  pricePerSeat!: number;

  @IsNumber()
  @Min(1)
  availableSeats!: number;

  @IsString()
  vehicleModel!: string;

  @IsString()
  vehicleColor!: string;

  @IsString()
  vehiclePlate!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateRideDto {
  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsDateString()
  departureDate?: string;

  @IsOptional()
  @IsString()
  departureTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerSeat?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  availableSeats?: number;

  @IsOptional()
  @IsString()
  vehicleModel?: string;

  @IsOptional()
  @IsString()
  vehicleColor?: string;

  @IsOptional()
  @IsString()
  vehiclePlate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(RideStatus)
  status?: RideStatus;
}

