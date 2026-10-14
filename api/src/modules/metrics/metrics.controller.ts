import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { ApiProblemResponses } from '../../common/openapi/api-problem-responses.decorator';
import { MetricsTokenGuard } from './metrics-token.guard';
import { MetricsService } from './metrics.service';

export const METRICS_AUTH = 'metrics-token';

// @Public() only skips the access token check; MetricsTokenGuard requires METRICS_TOKEN.
@ApiTags('operations')
@Public()
@UseGuards(MetricsTokenGuard)
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @ApiBearerAuth(METRICS_AUTH)
  @ApiOperation({
    summary: 'Prometheus metrics',
    description: 'Requires METRICS_TOKEN as a bearer token. Answers 404 when it is not configured.',
  })
  @ApiProduces('text/plain')
  @ApiOkResponse({ description: 'Prometheus text format', schema: { type: 'string' } })
  @ApiProblemResponses(401, 404)
  async scrape(@Res({ passthrough: true }) response: Response): Promise<string> {
    response.setHeader('Content-Type', this.metrics.registry.contentType);
    return this.metrics.registry.metrics();
  }
}
