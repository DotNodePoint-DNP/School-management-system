import { IsBoolean, IsOptional } from 'class-validator';

export class CreateGuardianLoginDto {
  /** Required (true) when the guardian has a phone number: credentials will be sent to it. */
  @IsOptional() @IsBoolean() phoneConfirmed?: boolean;
}
