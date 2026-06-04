/** DI token cho ioredis client. Đặt riêng để tránh circular import giữa module và service. */
export const REDIS_CLIENT = 'REDIS_CLIENT';
