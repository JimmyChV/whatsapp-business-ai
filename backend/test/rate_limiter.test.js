const test = require('node:test');
const assert = require('node:assert/strict');
const RateLimiter = require('../rate_limiter');

test('allows up to max requests in window', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 2 });
    assert.equal(limiter.check('k').allowed, true);
    assert.equal(limiter.check('k').allowed, true);
    assert.equal(limiter.check('k').allowed, false);
});
