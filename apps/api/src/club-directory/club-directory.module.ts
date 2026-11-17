import { Module } from '@nestjs/common';
import { ClubDirectoryController } from './club-directory.controller';
import { ClubDirectoryService } from './club-directory.service';

@Module({
  controllers: [ClubDirectoryController],
  providers: [ClubDirectoryService],
  exports: [ClubDirectoryService],
})
export class ClubDirectoryModule {}
