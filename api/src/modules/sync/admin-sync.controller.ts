import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/auth/auth.decorators';
import { ApiProblemResponses } from '../../common/openapi/api-problem-responses.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { Role } from '../../generated/prisma/client';
import { SyncRunPageDto } from './dto/sync-run-page.dto';
import { SyncStartedDto } from './dto/sync-started.dto';
import { SyncRunsService } from './sync-runs.service';
import { SyncTriggerService } from './sync-trigger.service';

// Admin only. There is no HTTP route that grants ADMIN (admin:promote is a CLI).
@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/sync')
export class AdminSyncController {
  constructor(
    private readonly trigger: SyncTriggerService,
    private readonly runs: SyncRunsService,
  ) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Start a catalog sync now',
    description: 'The worker runs it; follow it in GET /admin/sync/runs.',
  })
  @ApiAcceptedResponse({ type: SyncStartedDto })
  @ApiProblemResponses(401, 403, 409, 503)
  async start(): Promise<SyncStartedDto> {
    return { runId: await this.trigger.startManual() };
  }

  @Get('runs')
  @ApiOperation({ summary: 'Recent sync runs, newest first' })
  @ApiOkResponse({ type: SyncRunPageDto })
  @ApiProblemResponses(400, 401, 403)
  list(@Query() query: PaginationQueryDto): Promise<SyncRunPageDto> {
    return this.runs.list(query);
  }
}
