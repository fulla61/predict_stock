import type { Request, Response, NextFunction } from 'express';

// 簡易レートリミット（メモリ・10req/分/IP）
const WINDOW_MS = 60_000;
const LIMIT = 10;

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(name: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + WINDOW_MS };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > LIMIT) {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'リクエストが多すぎます。しばらくしてからお試しください' },
      });
      return;
    }
    next();
  };
}
