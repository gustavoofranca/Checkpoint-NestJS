import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser, Public } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import type { UserResponse } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { AccessTokenResponse } from './dto/access-token-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TrustedOriginGuard } from './guards/trusted-origin.guard';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<UserResponse> {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessTokenResponse> {
    const session = await this.auth.login(dto);
    setRefreshCookie(response, session.refreshToken);
    return session.body;
  }

  @Public()
  @UseGuards(TrustedOriginGuard)
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessTokenResponse> {
    const session = await this.auth.refresh(readRefreshCookie(request));
    setRefreshCookie(response, session.refreshToken);
    return session.body;
  }

  // Idempotent: answers 204 and clears the cookie even when there is no session to revoke.
  @Public()
  @UseGuards(TrustedOriginGuard)
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(request));
    clearRefreshCookie(response);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponse> {
    return this.users.findAccount(user.id);
  }
}
