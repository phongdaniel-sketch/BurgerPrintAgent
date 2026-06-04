import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string): Promise<any> {
    // AuthService.login throws exceptions on failure, but passport expects validate to return false on auth failure usually.
    // However, our authService.login directly returns tokens and handles lockouts via exceptions.
    // So LocalStrategy will just delegate and if it succeeds, return the tokens.
    // Wait, Passport strategy usually returns the user object, and then AuthController generates tokens.
    // Let's adjust this: The controller calls authService.login. LocalStrategy is typically used via AuthGuard('local').
    // Since our requirements just want `authService.login()` directly or via guard, let's have it return the user.
    // Actually, in NestJS, it's common to validate user here, then generate tokens in controller.
    // I will use authService.login to do the full flow or separate it.
    // Let's refactor AuthService login slightly or just use it as is if we don't use LocalGuard.
    // Since we need LocalStrategy (T019):
    const tokens = await this.authService.login(email, password);
    if (!tokens) {
      throw new UnauthorizedException();
    }
    return tokens;
  }
}
