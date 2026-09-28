import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Request, Response } from 'express';

export const SESSION_COOKIE_NAME = 'rw_session';

const SESSION_COOKIE_MAX_AGE_MS = 604_800_000;
const SESSION_TOKEN_EXPIRES_IN = '7d';

const SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api',
};

interface SessionTokenPayload {
  sid: string;
}

@Injectable()
export class SessionCookieService {
  constructor(private readonly jwtService: JwtService) {}

  async issue(response: Response, sid: string): Promise<void> {
    const token = await this.jwtService.signAsync(
      { sid } satisfies SessionTokenPayload,
      { expiresIn: SESSION_TOKEN_EXPIRES_IN },
    );

    response.cookie(SESSION_COOKIE_NAME, token, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: SESSION_COOKIE_MAX_AGE_MS,
    });
  }

  clear(response: Response): void {
    response.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS);
  }

  async readSid(request: Request): Promise<string | null> {
    const cookies = request.cookies as Record<string, string> | undefined;
    const token = cookies?.[SESSION_COOKIE_NAME];

    if (!token) {
      return null;
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<SessionTokenPayload>(token);
      return payload.sid;
    } catch {
      return null;
    }
  }
}
