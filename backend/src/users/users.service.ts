import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async createLocal(
    email: string,
    passwordHash: string,
    displayName?: string,
  ): Promise<UserDocument> {
    try {
      const user = new this.userModel({
        email,
        passwordHash,
        displayName,
        authProvider: 'local',
      });
      return await user.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Email already exists');
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findOrCreateOAuth(
    provider: string,
    providerId: string,
    email: string,
    displayName?: string,
    avatar?: string,
  ): Promise<UserDocument> {
    // 1. Tìm theo providerId
    let user = await this.userModel
      .findOne({ authProvider: provider, providerId })
      .exec();
    if (user) return user;

    // 2. Nếu không có, tìm theo email để link (Option B from clarification)
    user = await this.userModel.findOne({ email }).exec();
    if (user) {
      user.providerId = providerId;
      user.authProvider = provider; // Upgrade/Link to provider
      if (!user.avatar && avatar) user.avatar = avatar;
      if (!user.displayName && displayName) user.displayName = displayName;
      return user.save();
    }

    // 3. Nếu chưa có, tạo mới
    user = new this.userModel({
      email,
      providerId,
      authProvider: provider,
      displayName,
      avatar,
    });
    return user.save();
  }

  async incrementFailedAttempts(
    userId: string,
    lockoutDurationMs: number,
  ): Promise<UserDocument | null> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) return null;

    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= 5) {
      user.lockUntil = new Date(Date.now() + lockoutDurationMs);
    }
    return user.save();
  }

  async resetFailedAttempts(userId: string): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        { $set: { failedLoginAttempts: 0 }, $unset: { lockUntil: 1 } },
      )
      .exec();
  }

  isLocked(user: UserDocument): boolean {
    if (user.lockUntil && user.lockUntil > new Date()) {
      return true;
    }
    return false;
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { $set: { lastLoginAt: new Date() } })
      .exec();
  }
}
