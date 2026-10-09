import { Controller, Get } from '@nestjs/common';
import type { LivenessResponse, ReadinessResponse } from './dto/health-response.dto';
import { HealthService } from './health.service';

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
