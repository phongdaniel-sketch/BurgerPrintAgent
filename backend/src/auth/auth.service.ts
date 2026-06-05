import {
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import {
  RefreshToken,
  RefreshTokenDocument,
} from '../users/schemas/refresh-token.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { ConfigService } from '@nestjs/config';
import {
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  MAX_REFRESH_TOKENS_PER_USER,
} from './auth.constants';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectModel(RefreshToken.name)
    private refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  async register(dto: RegisterDto) {
    const saltOrRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltOrRounds);
    const user = await this.usersService.createLocal(
      dto.email,
      passwordHash,
      dto.displayName,
    );
    return this.generateTokens(user, 'local-register');
  }

  async login(email: string, pass: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (this.usersService.isLocked(user)) {
      const remainingTime = Math.ceil(
        (user.lockUntil!.getTime() - Date.now()) / 1000 / 60,
      );
      throw new HttpException(
        `Account is locked. Try again in ${remainingTime} minutes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) {
      await this.usersService.incrementFailedAttempts(
        user._id.toString(),
        LOCKOUT_DURATION_MS,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.usersService.resetFailedAttempts(user._id.toString());
    await this.usersService.updateLastLogin(user._id.toString());

    return this.generateTokens(user, 'local-login');
  }

  async validateOAuthUser(profile: any) {
    const email = profile.emails[0].value;
    const displayName = profile.displayName;
    const avatar = profile.photos?.[0]?.value;
    const user = await this.usersService.findOrCreateOAuth(
      'google',
      profile.id,
      email,
      displayName,
      avatar,
    );
    return user;
  }

  async refreshToken(token: string) {
    const tokenDoc = await this.refreshTokenModel
      .findOne({ token })
      .populate('userId')
      .exec();
    if (!tokenDoc || tokenDoc.expiresAt < new Date() || tokenDoc.revokedAt) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = tokenDoc.userId as unknown as UserDocument;

    // Revoke old token
    tokenDoc.revokedAt = new Date();
    await tokenDoc.save();

    return this.generateTokens(user, 'refresh');
  }

  async logout(refreshToken: string) {
    if (refreshToken) {
      await this.refreshTokenModel
        .updateOne({ token: refreshToken }, { $set: { revokedAt: new Date() } })
        .exec();
    }
  }

  async generateTokens(user: UserDocument, userAgent?: string) {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = uuidv4();
    const refreshExpiresInStr =
      this.configService.get<string>('jwt.refreshExpiresIn') || '7d';
    // Simple parsing for '7d' logic, assuming 'd' or fallback
    const days = parseInt(refreshExpiresInStr) || 7;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const tokenDoc = new this.refreshTokenModel({
      token: refreshToken,
      userId: user._id,
      expiresAt,
      userAgent,
    });
    await tokenDoc.save();

    // FIFO Cleanup
    const userTokens = await this.refreshTokenModel
      .find({ userId: user._id, revokedAt: null })
      .sort({ createdAt: 1 })
      .exec();

    if (userTokens.length > MAX_REFRESH_TOKENS_PER_USER) {
      const tokensToRemove = userTokens.slice(
        0,
        userTokens.length - MAX_REFRESH_TOKENS_PER_USER,
      );
      const tokenIds = tokensToRemove.map((t) => t._id);
      await this.refreshTokenModel
        .updateMany(
          { _id: { $in: tokenIds } },
          { $set: { revokedAt: new Date() } },
        )
        .exec();
    }

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        avatar: user.avatar,
      },
    };
  }
}
