import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/client';

// The caller's own account. Built from an explicit field list; the password hash never leaves
// the service layer.
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ example: 'demo_ana' })
  username!: string;

  @ApiProperty({ enum: Role })
  role!: Role;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export const USER_RESPONSE_SELECT = {
  id: true,
  email: true,
  username: true,
  role: true,
  createdAt: true,
} as const;
