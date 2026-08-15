import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

// The 3 shapes this generator can produce -- POOLS_AND_KNOCKOUT is the
// original (and still default) behaviour; the other two reuse the same pool
// phase creation / same knockout+bracket creation, just skipping the part
// that doesn't apply. See structure-presets.service.ts for how each format
// is built.
export enum StructurePresetFormat {
  POOLS_ONLY = 'POOLS_ONLY',
  POOLS_AND_KNOCKOUT = 'POOLS_AND_KNOCKOUT',
  KNOCKOUT_ONLY = 'KNOCKOUT_ONLY',
}

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

  // Whether this tier's bracket includes a 3rd-place match. Per-tier (not a
  // single flag on the whole DTO) since POOLS_AND_KNOCKOUT can have several
  // tiers, each with its own bracket.
  @IsOptional()
  @IsBoolean()
  hasRankingMatch?: boolean;
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
  @IsEnum(StructurePresetFormat)
  format!: StructurePresetFormat;

  @IsInt()
  @Min(1)
  teamCount!: number;

  // Not applicable to KNOCKOUT_ONLY -- there's no real pool phase to size in
  // that format (see the seed-group pattern in the service).
  @ValidateIf(
    (dto: CreateStructurePresetDto) =>
      dto.format !== StructurePresetFormat.KNOCKOUT_ONLY,
  )
  @IsInt()
  @Min(1)
  poolCount?: number;

  // Only POOLS_AND_KNOCKOUT has tiers -- POOLS_ONLY has no knockout phase at
  // all, and KNOCKOUT_ONLY names its single bracket via knockoutName instead.
  @ValidateIf(
    (dto: CreateStructurePresetDto) =>
      dto.format === StructurePresetFormat.POOLS_AND_KNOCKOUT,
  )
  @ValidateNested({ each: true })
  @Type(() => StructurePresetTierDto)
  @ArrayMinSize(1)
  tiers?: StructurePresetTierDto[];

  // KNOCKOUT_ONLY's single bracket has no tier to borrow a name from --
  // optional, defaults to "Tableau final" in the service when omitted.
  @ValidateIf((dto: CreateStructurePresetDto) => dto.knockoutName !== undefined)
  @IsString()
  @MinLength(1)
  knockoutName?: string;

  // KNOCKOUT_ONLY's single bracket has no tiers array to carry
  // hasRankingMatch on, so it gets its own root-level flag.
  @IsOptional()
  @IsBoolean()
  hasRankingMatch?: boolean;

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
