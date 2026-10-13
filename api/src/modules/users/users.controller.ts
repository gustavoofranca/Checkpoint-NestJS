import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/auth.decorators';
import { ApiProblemResponses } from '../../common/openapi/api-problem-responses.decorator';
import { PublicProfileDto } from './dto/public-profile.dto';
import { UsernameParamDto } from './dto/username-param.dto';
import { UsersService } from './users.service';

@ApiTags('profiles')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Public()
  @Get(':username')
  @ApiOperation({ summary: 'Public profile: username, join date and latest reviews' })
  @ApiOkResponse({ type: PublicProfileDto })
  @ApiProblemResponses(400, 404)
  profile(@Param() params: UsernameParamDto): Promise<PublicProfileDto> {
    return this.users.findPublicProfile(params.username);
  }
}
