import { ArrayMaxSize, IsArray, IsInt, Min, ValidateIf } from 'class-validator';

export class SetFirstRoundDto {
  /** Qualifier numbers (0-based) position by position, or null for the standard seeding. */
  @ValidateIf((dto: SetFirstRoundDto) => dto.order !== null)
  @IsArray()
  @ArrayMaxSize(256)
  @IsInt({ each: true })
  @Min(0, { each: true })
  order!: number[] | null;
}
