import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum,
  Min,
  Max,
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

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  originLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  originLng?: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  destLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  destLng?: number;

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
  @IsNumber()
  @Min(-90)
  @Max(90)
  originLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  originLng?: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  destLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  destLng?: number;

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

export class StartRideDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  driverLat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  driverLng!: number;
}

export class UpdateLocationDto {
  @IsString()
  driverId!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  driverLat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  driverLng!: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number;

  @IsOptional()
  @IsNumber()
  heading?: number;

  @IsOptional()
  @IsNumber()
  speed?: number;
}

