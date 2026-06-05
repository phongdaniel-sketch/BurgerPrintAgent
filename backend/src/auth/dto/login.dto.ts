import {
  EmailField,
  PasswordField,
} from '../../common/decorators/field.decorators';

export class LoginDto {
  @EmailField({
    description: 'User email address',
    example: 'seller@example.com',
  })
  email: string;

  @PasswordField({ description: 'User password', example: 'Password123!' })
  password: string;
}
