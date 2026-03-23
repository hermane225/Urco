import { IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateBookingDto {
  @IsNumber()
  seats!: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  passengerLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
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

export class VerifyCodeDto {
  @IsString()
  @Length(4, 4)
  code!: string;
}

