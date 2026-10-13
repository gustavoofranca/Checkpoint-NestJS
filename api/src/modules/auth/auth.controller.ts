import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser, Public } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { ApiProblemResponses } from '../../common/openapi/api-problem-responses.decorator';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { AccessTokenResponseDto } from './dto/access-token-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TrustedOriginGuard } from './guards/trusted-origin.guard';
import {
  REFRESH_COOKIE,
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create an account' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiProblemResponses(400, 409)
  register(@Body() dto: RegisterDto): Promise<UserResponseDto> {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sign in',
    description: `Returns an access token and sets the ${REFRESH_COOKIE} cookie.`,
  })
  @ApiOkResponse({ type: AccessTokenResponseDto })
  @ApiProblemResponses(400, 401)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessTokenResponseDto> {
    const session = await this.auth.login(dto);
    setRefreshCookie(response, session.refreshToken);
    return session.body;
  }

  @Public()
  @UseGuards(TrustedOriginGuard)
  @Post('refresh')
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Get a new access token',
    description:
      'Rotates the refresh cookie. Reusing a rotated cookie ends the session. Requires an allow-listed Origin header.',
  })
  @ApiOkResponse({ type: AccessTokenResponseDto })
  @ApiProblemResponses(401, 403)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessTokenResponseDto> {
    const session = await this.auth.refresh(readRefreshCookie(request));
    setRefreshCookie(response, session.refreshToken);
    return session.body;
  }

  // Idempotent: answers 204 and clears the cookie even when there is no session to revoke.
  @Public()
  @UseGuards(TrustedOriginGuard)
  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Sign out',
    description: 'Revokes the session and clears the cookie. Requires an allow-listed Origin.',
  })
  @ApiNoContentResponse()
  @ApiProblemResponses(403)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(request));
    clearRefreshCookie(response);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The signed-in account' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiProblemResponses(401, 404)
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.users.findAccount(user.id);
  }
}
