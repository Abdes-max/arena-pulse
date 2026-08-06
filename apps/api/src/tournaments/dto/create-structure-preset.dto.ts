import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
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

  // Pool-stage calendar, generated immediately -- round-robin fixtures only
  // need teams assigned to their pool, not any match result.
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  fieldIds!: string[];

  @IsISO8601()
  startDateTime!: string;

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

  // Knockout-stage calendar can't be generated yet (its matchups depend on
  // pool standings, which don't exist until pool play concludes) -- these
  // are captured now anyway and stored on each tier's bracket, so "Générer
  // les matchs du tableau" on the Calendrier page can pre-fill from them
  // later instead of asking the organizer to re-enter the same choices.
  // Shared across every tier's bracket -- the organizer adjusts per-bracket
  // timing later, when actually generating that bracket's matches.
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  knockoutFieldIds!: string[];

  @IsISO8601()
  knockoutStartDateTime!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  knockoutMatchDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  knockoutBreakDurationMinutes?: number;
}
