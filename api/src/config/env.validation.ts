import { Type, plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

class EnvVars {
  @IsEnum(NodeEnv)
  NODE_ENV!: NodeEnv;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT!: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGINS!: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL_SECONDS: number = 900;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  REFRESH_TOKEN_TTL_DAYS: number = 7;

  @IsIn(['console', 'disabled'])
  SMS_PROVIDER: string = 'disabled';

  @IsIn(['console', 'disabled'])
  EMAIL_PROVIDER: string = 'disabled';

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  SCHOOL_NAME: string = 'School';
}

export function validateEnv(config: Record<string, unknown>): EnvVars {
  const validated = plainToInstance(EnvVars, config);
  const errors = validateSync(validated);
  if (errors.length > 0) {
    const details = errors.map(
      (e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
    );
    throw new Error(`Invalid environment configuration\n${details.join('\n')}`);
  }
  if (
    validated.NODE_ENV === NodeEnv.Production &&
    (validated.SMS_PROVIDER === 'console' ||
      validated.EMAIL_PROVIDER === 'console')
  ) {
    throw new Error(
      'SMS_PROVIDER and EMAIL_PROVIDER must not be "console" in production: messages would only be printed to the log',
    );
  }
  return validated;
}
