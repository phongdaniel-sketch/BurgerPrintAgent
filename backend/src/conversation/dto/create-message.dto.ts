import { StringField } from '../../common/decorators/field.decorators';

export class CreateMessageDto {
  @StringField({
    maxLength: 4000,
    description: 'Message content',
    example: 'Hello',
  })
  message!: string;
}
