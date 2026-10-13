import { ApiProperty } from '@nestjs/swagger';
import { LibraryEntryDto } from './library-entry.dto';

export class LibraryPageDto {
  @ApiProperty({ type: [LibraryEntryDto] })
  data!: LibraryEntryDto[];

  @ApiProperty({ type: String, nullable: true, description: 'null on the last page' })
  nextCursor!: string | null;
}
