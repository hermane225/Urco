import { IsString, IsDateString, IsOptional } from 'class-validator';

export class CreateAlertDto {
  @IsString()
  origin!: string;

  @IsString()
  destination!: string;

  @IsDateString()
  desiredDate!: string;
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
  @IsString()
  active?: string;
}

