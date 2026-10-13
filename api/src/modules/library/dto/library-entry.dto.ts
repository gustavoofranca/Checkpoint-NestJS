import { ApiProperty } from '@nestjs/swagger';
import { LibraryStatus } from '../../../generated/prisma/client';
import { LibraryGameDto } from './library-game.dto';

export class LibraryEntryDto {
  @ApiProperty({ type: LibraryGameDto })
  game!: LibraryGameDto;

  @ApiProperty({ enum: LibraryStatus })
  status!: LibraryStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
