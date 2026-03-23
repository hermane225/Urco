import { IsOptional, IsEnum, IsBoolean, IsInt, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from './users.dto';

export class ListUsersQuery {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  pendingValidation?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

export class UpdateUserRolesDto {
  @IsEnum(UserRole, { each: true })
  roles: UserRole[];
}
