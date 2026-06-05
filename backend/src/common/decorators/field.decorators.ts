import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export function StringField(
  options: ApiPropertyOptions = {},
): PropertyDecorator {
  const decorators = [IsString(), IsNotEmpty()];

  if (options.maxLength) {
    decorators.push(MaxLength(options.maxLength));
  }

  if (options.minLength) {
    decorators.push(MinLength(options.minLength));
  }

  decorators.push(ApiProperty({ type: String, ...options }));

  return applyDecorators(...decorators);
}

export function StringFieldOptional(
  options: ApiPropertyOptions = {},
): PropertyDecorator {
  const decorators = [IsOptional(), IsString()];

  if (options.maxLength) {
    decorators.push(MaxLength(options.maxLength));
  }

  decorators.push(ApiProperty({ type: String, required: false, ...options }));

  return applyDecorators(...decorators);
}

export function PasswordField(
  options: ApiPropertyOptions = {},
): PropertyDecorator {
  return applyDecorators(
    IsString(),
    IsNotEmpty(),
    MinLength(8),
    Matches(/(?=.*[A-Z])(?=.*\d)/, {
      message:
        'Password must contain at least one uppercase letter and one number',
    }),
    ApiProperty({ type: String, minLength: 8, ...options }),
  );
}

export function EmailField(
  options: ApiPropertyOptions = {},
): PropertyDecorator {
  return applyDecorators(
    IsEmail(),
    IsNotEmpty(),
    ApiProperty({ type: String, ...options }),
  );
}
