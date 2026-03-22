const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const passwordHashService = require('../domains/security/services/password-hash.service');

test('password_hash_service hashes and verifies PBKDF2 passwords', () => {
    const hash = passwordHashService.hashPassword('MyS3cret!');
    assert.match(hash, /^pbkdf2_sha512\$/);
    assert.equal(passwordHashService.verifyPassword('MyS3cret!', hash), true);
    assert.equal(passwordHashService.verifyPassword('wrong-pass', hash), false);
});

test('password_hash_service keeps legacy sha256 compatibility', () => {
    const legacy = crypto.createHash('sha256').update('legacy-pass', 'utf8').digest('hex');
    assert.equal(passwordHashService.verifyPassword('legacy-pass', legacy), true);
    assert.equal(passwordHashService.verifyPassword('bad-pass', legacy), false);
    assert.equal(passwordHashService.normalizeStoredHash(legacy.toUpperCase()), legacy);
});


