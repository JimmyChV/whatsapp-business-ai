class RateLimiter {
    constructor({ windowMs = 10000, max = 20 } = {}) {
        this.windowMs = windowMs;
        this.max = max;
        this.buckets = new Map();
    }

    check(key) {
        const now = Date.now();
        const bucket = this.buckets.get(key);

        if (!bucket || now > bucket.resetAt) {
            this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
            return { allowed: true, remaining: this.max - 1 };
        }

        if (bucket.count >= this.max) {
            return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, bucket.resetAt - now) };
        }

        bucket.count += 1;
        return { allowed: true, remaining: this.max - bucket.count };
    }
}

module.exports = RateLimiter;
