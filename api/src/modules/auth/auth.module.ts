import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../../config/app-config';
import { PrismaModule } from '../../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { TrustedOriginGuard } from './guards/trusted-origin.guard';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AccessTokenService,
  JWT_AUDIENCE,
  JWT_ISSUER,
} from './tokens/access-token.service';
import { RefreshTokenService } from './tokens/refresh-token.service';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.jwtSecret,
        signOptions: {
          algorithm: 'HS256',
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
        // Pinning the algorithm rejects "none" and any token signed some other way.
        verifyOptions: { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessTokenService,
    RefreshTokenService,
    TrustedOriginGuard,
    // Order matters: authentication first, then the role check.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
