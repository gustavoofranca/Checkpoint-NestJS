import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

@Module({
  imports: [PrismaModule],
  controllers: [GamesController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
