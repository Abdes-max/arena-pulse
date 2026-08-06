import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

// One knockout tier per qualification tranche (e.g. "Ligue des Champions" for
// positions 1-2, "Europa League" for 3-4...) -- the "no multi-tier" case is
// just a one-entry array, not a separate code path.
export class StructurePresetTierDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(1)
  qualifiersPerPool!: number;
}

// Optional: on top of the direct per-pool qualifiers above, also qualifies
// the `bestCount` best-ranked teams at `position` across every pool (e.g.
// "8 best 3rd places") -- joins the first tier's bracket.
export class StructurePresetBestOfPositionDto {
  @IsInt()
  @Min(1)
  position!: number;

  @IsInt()
  @Min(1)
  bestCount!: number;
}

export class CreateStructurePresetDto {
  @IsInt()
  @Min(1)
  teamCount!: number;

  @IsInt()
  @Min(1)
  poolCount!: number;

  @ValidateNested({ each: true })
  @Type(() => StructurePresetTierDto)
  @ArrayMinSize(1)
  tiers!: StructurePresetTierDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => StructurePresetBestOfPositionDto)
  bestOfPosition?: StructurePresetBestOfPositionDto;

  // Structural pool-phase defaults only -- this generator sets up the
  // structure (phases, pools, team assignment, brackets, qualification
  // rules), it never schedules any matches. Calendar generation for both
  // the pool phase and the knockout tier(s) happens separately on the
  // Calendrier page, once the organizer is ready.
  @IsOptional()
  @IsInt()
  @Min(1)
  matchDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  breakDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  refereesPerMatch?: number;

  @IsOptional()
  @IsBoolean()
  doubleRoundRobin?: boolean;
}
