import type { Role } from '../../../generated/prisma/client';

// The caller's own account. Built from an explicit field list; the password hash never leaves
// the service layer.
export interface UserResponse {
  id: string;
  email: string;
  username: string;
  role: Role;
  createdAt: Date;
}

export const USER_RESPONSE_SELECT = {
  id: true,
  email: true,
  username: true,
  role: true,
  createdAt: true,
} as const;
