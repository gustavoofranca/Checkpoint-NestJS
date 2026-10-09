import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/auth.decorators';
import { ApiProblemResponses } from '../../common/openapi/api-problem-responses.decorator';
import { LivenessResponseDto } from './dto/liveness-response.dto';
import { ReadinessResponseDto } from './dto/readiness-response.dto';
import { HealthService } from './health.service';

// Probed by orchestrators and load balancers, which hold no token. Nothing here is user data.
@ApiTags('operations')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'The process is up' })
  @ApiOkResponse({ type: LivenessResponseDto })
  live(): LivenessResponseDto {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'PostgreSQL and Redis are reachable' })
  @ApiOkResponse({ type: ReadinessResponseDto })
  @ApiProblemResponses(503)
  ready(): Promise<ReadinessResponseDto> {
    return this.health.ensureReady();
  }
}
