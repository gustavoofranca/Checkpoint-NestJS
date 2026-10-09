import type { Role } from '../../generated/prisma/client';

// What the access token proves about the caller. Ownership always comes from here, never from
// the request body or query (docs/SECURITY.md section 1).
export interface AuthenticatedUser {
  id: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }
}
