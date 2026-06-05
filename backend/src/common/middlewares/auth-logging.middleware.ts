import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class AuthLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('AuthAccess');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;

    // Intercept response to log status code
    const originalSend = res.send;
    res.send = function (body) {
      // Restore original send
      res.send = originalSend;

      const statusCode = res.statusCode;
      if (originalUrl.includes('/auth/login')) {
        const email = req.body?.email || 'unknown';
        if (statusCode >= 400) {
          Logger.warn(
            `Failed login attempt for ${email} from ${ip} - Status: ${statusCode}`,
            'AuthAccess',
          );
        } else {
          Logger.log(`Successful login for ${email} from ${ip}`, 'AuthAccess');
        }
      }

      return res.send(body);
    };

    next();
  }
}
