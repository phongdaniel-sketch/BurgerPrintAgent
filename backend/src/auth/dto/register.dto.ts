import {
  EmailField,
  PasswordField,
  StringFieldOptional,
} from '../../common/decorators/field.decorators';

export class RegisterDto {
  @EmailField({
    description: 'User email address',
    example: 'seller@example.com',
  })
  email: string;

  @PasswordField({ description: 'User password', example: 'Password123!' })
  password: string;

  @StringFieldOptional({
    maxLength: 100,
    description: 'Display name',
    example: 'John Doe',
  })
  displayName?: string;
}
