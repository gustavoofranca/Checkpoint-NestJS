import { Module } from '@nestjs/common';
import { RedisModule } from '../../redis/redis.module';
import { SyncModule } from '../sync/sync.module';
import { MetricsTokenGuard } from './metrics-token.guard';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [RedisModule, SyncModule],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsTokenGuard],
  exports: [MetricsService],
})
export class MetricsModule {}
