import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

export const STATS_PERIODS = ['all', '7d', '30d', '365d', 'custom'] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export class StatsQueryDto {
  @ApiPropertyOptional({ enum: STATS_PERIODS, default: 'all' })
  @IsOptional()
  @IsIn(STATS_PERIODS)
  period?: StatsPeriod;

  // YYYY-MM-DD, only read when period is "custom".
  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @IsDateString()
  to?: string;

  // Demo / test organizations are left out unless this is "true".
  @ApiPropertyOptional({ enum: ['true', 'false'], default: 'false' })
  @IsOptional()
  @IsIn(['true', 'false'])
  includeTest?: 'true' | 'false';
}
