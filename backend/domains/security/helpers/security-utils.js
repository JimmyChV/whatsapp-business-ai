const dns = require('dns').promises;
const net = require('net');

const PRIVATE_IPV4_RANGES = [
    ['10.0.0.0', 8],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
    ['0.0.0.0', 8]
];

function ipToLong(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isPrivateIPv4(ip) {
    if (!net.isIP(ip) || net.isIP(ip) !== 4) return false;
    const target = ipToLong(ip);
    return PRIVATE_IPV4_RANGES.some(([baseIp, cidr]) => {
        const mask = cidr === 0 ? 0 : ((0xffffffff << (32 - cidr)) >>> 0);
        return (target & mask) === (ipToLong(baseIp) & mask);
    });
}

function isPrivateIPv6(ip) {
    if (!net.isIP(ip) || net.isIP(ip) !== 6) return false;
    const normalized = ip.toLowerCase();
    return (
        normalized === '::1'
        || normalized.startsWith('fc')
        || normalized.startsWith('fd')
        || normalized.startsWith('fe80:')
        || normalized.startsWith('::ffff:127.')
        || normalized.startsWith('::ffff:10.')
        || normalized.startsWith('::ffff:192.168.')
        || /^::ffff:172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
    );
}

function isPrivateIp(ip) {
    return isPrivateIPv4(ip) || isPrivateIPv6(ip);
}

function parseCsvEnv(value) {
    return String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

async function resolveAndValidatePublicHost(hostname) {
    if (!hostname) throw new Error('Hostname invÃ¡lido.');
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length) throw new Error('No se pudo resolver el host.');

    const blocked = addresses.find((addr) => isPrivateIp(addr.address));
    if (blocked) {
        throw new Error('Host bloqueado por polÃ­tica de red.');
    }

    return addresses;
}

module.exports = {
    isPrivateIPv4,
    isPrivateIPv6,
    isPrivateIp,
    parseCsvEnv,
    resolveAndValidatePublicHost
};

