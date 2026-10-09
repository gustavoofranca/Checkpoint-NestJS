import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';
import { CurrentUser, Public, Roles } from '../../src/common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../src/common/auth/authenticated-user';
import { Role } from '../../src/generated/prisma/client';

export class ProbeDto {
  @IsString()
  @Length(1, 20)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;
}

// Test-only routes that drive the global pipeline: body parsing, validation and error mapping.
@Public()
@Controller('probe')
export class ProbeController {
  @Post()
  @HttpCode(200)
  echo(@Body() body: ProbeDto): ProbeDto {
    return body;
  }

  @Get('crash')
  crash(): never {
    throw new Error('relation "users" does not exist at /srv/app/dist/users.repository.js:42');
  }

  // Lets the suite check that its response guard catches a leaked hash.
  @Get('leak')
  leak(): { passwordHash: string } {
    return { passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA' };
  }
}

// Test-only routes behind the global guards: any signed-in user, and admins only.
@Controller('probe/protected')
export class ProtectedProbeController {
  @Get()
  whoAmI(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Roles(Role.ADMIN)
  @Get('admin')
  adminOnly(): { ok: true } {
    return { ok: true };
  }
}
