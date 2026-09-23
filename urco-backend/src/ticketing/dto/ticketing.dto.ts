import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CompanyStatus, TicketPaymentMethod } from '@prisma/client';

// En multipart/form-data les tableaux arrivent en chaîne : accepte un JSON
// ("["Abidjan","Bouaké"]") ou une liste séparée par des virgules.
function toStringArray({ value }: { value: any }): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  const str = String(value).trim();
  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
    } catch {
      // repli sur le format séparé par des virgules
    }
  }
  return str.split(',').map((v) => v.trim()).filter(Boolean);
}

// ---------------------------------------------------------------- Auth staff

export class StaffLoginDto {
  @ApiProperty({ example: 'GARE-7KQ2MX', description: 'ID Gare ou ID Contrôleur' })
  @IsString()
  @IsNotEmpty()
  loginId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class StaffChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MaxLength(128)
  newPassword: string;
}

// ------------------------------------------------------------------ Compagnie

export class CreateCompanyDto {
  @ApiProperty({ example: 'UTB' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ description: 'URL du logo, si aucun fichier "logo" n\'est envoyé' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsapp?: string;

  @ApiPropertyOptional({ type: [String], example: ['Abidjan', 'Bouaké'] })
  @IsOptional()
  @Transform(toStringArray)
  @IsString({ each: true })
  @ArrayMaxSize(200)
  coveredCities?: string[];

  @ApiPropertyOptional({ example: 60, description: 'Trajets non modifiables X minutes avant départ' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(7 * 24 * 60)
  tripEditCutoffMinutes?: number;
}

export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {}

export class UpdateCompanyStatusDto {
  @ApiProperty({ enum: CompanyStatus })
  @IsEnum(CompanyStatus)
  status: CompanyStatus;
}

// ----------------------------------------------------------------------- Gare

export class CreateStationDto {
  @ApiProperty({ example: 'Gare d\'Adjamé' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'Abidjan' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'Adjamé, près du marché' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ example: 'Lun-Dim 05:00-22:00' })
  @IsOptional()
  @IsString()
  openingHours?: string;

  @ApiPropertyOptional({ description: 'Numéro recevant les identifiants par SMS' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Email recevant les identifiants' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class UpdateStationDto extends PartialType(CreateStationDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Ce qu'un agent peut modifier sur sa propre gare */
export class UpdateOwnStationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  openingHours?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
}

// ----------------------------------------------------------------- Contrôleur

export class CreateInspectorDto {
  @ApiProperty({ example: 'Koffi Yao' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class UpdateInspectorDto extends PartialType(CreateInspectorDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

// --------------------------------------------------------------------- Trajet

export class CreateTripDto {
  @ApiPropertyOptional({ description: 'Obligatoire pour la compagnie, ignoré pour un agent (sa gare)' })
  @IsOptional()
  @IsUUID()
  stationId?: string;

  @ApiProperty({ example: 'Bouaké' })
  @IsString()
  @IsNotEmpty()
  destinationCity: string;

  @ApiPropertyOptional({ description: 'Gare d\'arrivée (même compagnie)' })
  @IsOptional()
  @IsUUID()
  arrivalStationId?: string;

  @ApiProperty({ example: '2026-10-01T07:30:00Z', description: 'Date et heure de départ (ISO 8601)' })
  @IsDateString()
  departureAt: string;

  @ApiProperty({ example: 'Car climatisé 70 places' })
  @IsString()
  @IsNotEmpty()
  vehicleType: string;

  @ApiProperty({ example: 70 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  totalSeats: number;

  @ApiProperty({ example: 6000, description: 'Tarif par place en XOF' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ description: 'Conditions de modification / remboursement' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  conditions?: string;
}

export class UpdateTripDto extends PartialType(OmitType(CreateTripDto, ['stationId'] as const)) {}

export class TripSearchQuery {
  @ApiPropertyOptional({ description: 'Ville de départ' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Ville de destination' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  stationId?: string;
}

export class DateRangeQuery {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}

export class ListQuery extends DateRangeQuery {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  stationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

// ---------------------------------------------------------------- Réservation

const MOBILE_MONEY_METHODS = ['ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'WAVE'] as const;

export class CreateReservationDto {
  @ApiProperty()
  @IsUUID()
  tripId: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  seats: number;

  @ApiPropertyOptional({ description: 'Par défaut : nom du compte' })
  @IsOptional()
  @IsString()
  passengerName?: string;

  @ApiPropertyOptional({ description: 'Par défaut : téléphone du compte' })
  @IsOptional()
  @IsString()
  passengerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  passengerEmail?: string;
}

export class PayReservationDto {
  @ApiProperty({ enum: MOBILE_MONEY_METHODS })
  @IsIn(MOBILE_MONEY_METHODS as unknown as string[])
  method: TicketPaymentMethod;

  @ApiProperty({ example: '0701020304', description: 'Numéro Mobile Money débité' })
  @IsString()
  @IsNotEmpty()
  payerPhone: string;
}

/** Vente au guichet par un agent de gare (paiement en agence) */
export class CounterSaleDto {
  @ApiProperty()
  @IsUUID()
  tripId: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  seats: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  passengerName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  passengerPhone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  passengerEmail?: string;
}

// ------------------------------------------------------------------ Contrôle

export class ValidateTicketDto {
  @ApiProperty({ example: 'URCO-7KQ2MX', description: 'Code URCO saisi ou contenu du QR code' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ description: 'Marquer le billet comme utilisé (embarquement)', default: false })
  @IsOptional()
  @IsBoolean()
  board?: boolean;
}
