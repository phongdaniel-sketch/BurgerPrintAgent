import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const clientID = configService.get<string>('oauth.google.clientID');
    const clientSecret = configService.get<string>('oauth.google.clientSecret');
    
    super({
      clientID: clientID || 'dummy-client-id', // Tránh lỗi khởi tạo nếu không cấu hình
      clientSecret: clientSecret || 'dummy-client-secret',
      callbackURL: configService.get<string>('oauth.google.callbackURL'),
      scope: ['email', 'profile'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback): Promise<any> {
    try {
      const user = await this.authService.validateOAuthUser(profile);
      const tokens = await this.authService.generateTokens(user, 'google-oauth');
      done(null, tokens);
    } catch (err) {
      done(err, false);
    }
  }
}
