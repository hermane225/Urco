
import { IsString, IsDateString, IsOptional, IsNumber } from 'class-validator';

export class CreateAlertDto {
  @IsString()
  origin!: string;

  @IsString()
  destination!: string;

  @IsDateString()
  desiredDate!: string;

  @IsOptional()
  @IsNumber()
  desiredPrice?: number;

  @IsOptional()
  @IsString()
  departureLocation?: string;

  @IsOptional()
  @IsString()
  arrivalLocation?: string;
}

export class UpdateAlertDto {
  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsDateString()
  desiredDate?: string;

  @IsOptional()
  @IsNumber()
  desiredPrice?: number;

  @IsOptional()
  @IsString()
  departureLocation?: string;

  @IsOptional()
  @IsString()
  arrivalLocation?: string;

  @IsOptional()
  @IsString()
  active?: string;
}

