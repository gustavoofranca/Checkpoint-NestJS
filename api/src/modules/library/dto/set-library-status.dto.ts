import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { LibraryStatus } from '../../../generated/prisma/client';

// The status only. Whose library it is comes from the access token, never from the body.
export class SetLibraryStatusDto {
  @ApiProperty({ enum: LibraryStatus })
  @IsEnum(LibraryStatus)
  status!: LibraryStatus;
}
