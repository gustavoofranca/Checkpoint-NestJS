import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth/auth.decorators';
import type { LivenessResponse, ReadinessResponse } from './dto/health-response.dto';
import { HealthService } from './health.service';

// Probed by orchestrators and load balancers, which hold no token. Nothing here is user data.
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live(): LivenessResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  ready(): Promise<ReadinessResponse> {
    return this.health.ensureReady();
  }
}
