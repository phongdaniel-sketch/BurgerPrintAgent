import { IsIn, IsOptional } from 'class-validator';
import { Language } from '../../session/session.types';

export class CreateConversationDto {
  @IsOptional()
  @IsIn(['vi', 'en'])
  language?: Language;
}
