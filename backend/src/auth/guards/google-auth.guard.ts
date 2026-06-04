import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const clientID = this.configService.get<string>('oauth.google.clientID');
    if (!clientID || clientID === 'dummy-client-id') {
      throw new Error('Google OAuth is not configured');
    }
    return super.canActivate(context);
  }
}
