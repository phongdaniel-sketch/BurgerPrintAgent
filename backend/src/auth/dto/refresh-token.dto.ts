import { StringField } from '../../common/decorators/field.decorators';

export class RefreshTokenDto {
  @StringField({
    description: 'Valid refresh token',
    example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  })
  refreshToken: string;
}
