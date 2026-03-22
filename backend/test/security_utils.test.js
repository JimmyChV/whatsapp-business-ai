const test = require('node:test');
const assert = require('node:assert/strict');
const { isPrivateIPv4, isPrivateIPv6, isPrivateIp, parseCsvEnv } = require('../domains/security/helpers/security-utils');

test('detects private IPv4 ranges', () => {
    assert.equal(isPrivateIPv4('127.0.0.1'), true);
    assert.equal(isPrivateIPv4('10.10.10.10'), true);
    assert.equal(isPrivateIPv4('172.20.0.1'), true);
    assert.equal(isPrivateIPv4('8.8.8.8'), false);
});

test('detects private IPv6 ranges', () => {
    assert.equal(isPrivateIPv6('::1'), true);
    assert.equal(isPrivateIPv6('fd12::1'), true);
    assert.equal(isPrivateIPv6('fe80::1'), true);
    assert.equal(isPrivateIPv6('2001:4860:4860::8888'), false);
});

test('detects private IP utility for both versions', () => {
    assert.equal(isPrivateIp('192.168.1.20'), true);
    assert.equal(isPrivateIp('2001:4860:4860::8888'), false);
});

test('parseCsvEnv handles empty and spaced values', () => {
    assert.deepEqual(parseCsvEnv('a, b,,c '), ['a', 'b', 'c']);
    assert.deepEqual(parseCsvEnv(''), []);
});

