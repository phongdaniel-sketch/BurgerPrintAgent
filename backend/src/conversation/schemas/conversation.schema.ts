import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type ConversationDocument = Conversation & Document;

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: User;

  @Prop()
  title?: string;

  @Prop({ required: true, enum: ['active', 'archived'], default: 'active' })
  status: string;

  @Prop()
  activeSessionId?: string;

  @Prop()
  summary?: string;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
