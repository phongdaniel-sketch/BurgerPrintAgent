import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Conversation } from './conversation.schema';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  })
  conversationId: Conversation;

  @Prop({ required: true, enum: ['user', 'assistant'] })
  role: string;

  @Prop({ required: true })
  content: string;

  @Prop({ default: Date.now })
  timestamp: Date;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: any;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
