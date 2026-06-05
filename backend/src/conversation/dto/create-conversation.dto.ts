import { StringFieldOptional } from '../../common/decorators/field.decorators';
import { Language } from '../../session/session.types';

export class CreateConversationDto {
  @StringFieldOptional({
    description: 'Language for conversation',
    example: 'vi',
    enum: ['vi', 'en'],
  })
  language?: Language;
}
