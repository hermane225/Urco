import { IsEmail, IsString, MinLength, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { Gender, UserRole } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class SignupDto {
  @ApiProperty({ example: 'johndoe', description: 'Username' })
  @IsString()
  @MinLength(3)
  username: string;

  @ApiProperty({ example: 'john@example.com', description: 'User email' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', description: 'User password' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: '+1234567890', description: 'Phone number' })
  @IsString()
  phone: string;

  @ApiProperty({ enum: Gender, description: 'Gender', required: false })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ example: '1990-01-01', description: 'Date of birth', required: false })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ enum: UserRole, description: 'User role', required: false })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class LoginDto {
  @ApiProperty({ example: 'john@example.com', description: 'User email' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', description: 'User password' })
  @IsString()
  password: string;
}

export class SendCodeDto {
  @ApiProperty({ example: '+221771234567', description: 'User phone number' })
  @IsString()
  phone: string;
}

export class VerifyCodeDto {
  @ApiProperty({ example: '+221771234567', description: 'User phone number' })
  @IsString()
  phone: string;

  @ApiProperty({ example: '123456', description: 'Verification code' })
  @IsString()
  code: string;
}

export class ForgotPasswordRequestDto {
  @ApiProperty({ example: 'john@example.com', description: 'User email' })
  @IsEmail()
  email: string;
}

export class ForgotPasswordResetDto {
  @ApiProperty({ example: 'john@example.com', description: 'User email' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456', description: 'OTP code received by email' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'newSecurePassword123', description: 'New password' })
  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class SendWhatsAppCodeDto {
  @ApiProperty({ example: '+1234567890', description: 'Phone number' })
  @IsString()
  phone: string;
}

export class VerifyWhatsAppCodeDto {
  @ApiProperty({ example: '+1234567890', description: 'Phone number' })
  @IsString()
  phone: string;

  @ApiProperty({ example: '123456', description: 'Verification code' })
  @IsString()
  code: string;
}

