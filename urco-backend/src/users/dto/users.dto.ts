import { IsString, IsOptional, IsEnum, IsDateString, IsNumber } from 'class-validator';

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  DRIVER = 'DRIVER',
  PASSENGER = 'PASSENGER',
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class UploadDocumentDto {
  @IsString()
  documentType!: string;
}

export class VerifyUserDto {
  @IsOptional()
  idDocumentVerified?: boolean;

  @IsOptional()
  driverLicenseVerified?: boolean;

  @IsOptional()
  carInsuranceVerified?: boolean;

  @IsOptional()
  verified?: boolean;
}

