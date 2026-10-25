import { IsNumber, Max, Min, ValidateIf } from 'class-validator';

/** `null` clears the credit hours; a missing field is rejected. */
export class SetCreditHoursDto {
  @ValidateIf((o: SetCreditHoursDto) => o.creditHours !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.25)
  @Max(20)
  creditHours!: number | null;
}
