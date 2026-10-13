import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GamesModule } from '../games/games.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [PrismaModule, GamesModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
