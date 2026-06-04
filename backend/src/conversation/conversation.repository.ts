import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';

@Injectable()
export class ConversationRepository {
  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
  ) {}

  async createConversation(userId: string, title?: string): Promise<ConversationDocument> {
    const conversation = new this.conversationModel({
      userId,
      title: title || 'New Conversation',
      status: 'active',
    });
    return conversation.save();
  }

  async findConversationById(id: string): Promise<ConversationDocument | null> {
    return this.conversationModel.findById(id).exec();
  }

  async findActiveConversationsByUser(userId: string): Promise<ConversationDocument[]> {
    return this.conversationModel.find({ userId, status: 'active' }).sort({ updatedAt: -1 }).exec();
  }

  async saveMessage(conversationId: string, role: string, content: string, metadata?: any): Promise<MessageDocument> {
    const message = new this.messageModel({
      conversationId,
      role,
      content,
      metadata,
    });
    return message.save();
  }

  async getMessagesByConversation(conversationId: string): Promise<MessageDocument[]> {
    return this.messageModel.find({ conversationId }).sort({ timestamp: 1 }).exec();
  }

  async updateConversationTitle(id: string, title: string): Promise<void> {
    await this.conversationModel.updateOne({ _id: id }, { $set: { title } }).exec();
  }
}
