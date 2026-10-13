import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { LibraryStatus } from '../../../generated/prisma/client';

export class ListLibraryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LibraryStatus })
  @IsOptional()
  @IsEnum(LibraryStatus)
  status?: LibraryStatus;
}
