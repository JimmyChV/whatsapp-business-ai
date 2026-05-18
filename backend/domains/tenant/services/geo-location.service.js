const { queryPostgres } = require('../../../config/persistence-runtime');

const GEO_TYPES = Object.freeze(['district', 'province', 'department']);
const TYPE_PRIORITY = Object.freeze({ district: 3, province: 2, department: 1 });
const STOPWORDS = new Set([
    'vivo', 'vive', 'soy', 'estoy', 'esta', 'ubicado', 'ubicada', 'ubicacion',
    'direccion', 'donde', 'para', 'envio', 'delivery', 'pedido', 'cliente',
    'quiero', 'quisiera', 'necesito', 'precio', 'cuanto', 'cuesta', 'demora',
    'llegan', 'llega', 'domicilio', 'distrito', 'provincia', 'departamento',
    'peru', 'casa', 'zona'
]);

function text(value = '') {
    return String(value || '').trim();
}

function normalizeLocationName(value = '') {
    return text(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function safeObject(value = {}) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function ensureArray(value = []) {
    return Array.isArray(value) ? value : [];
}

function missingRelation(error) {
    return text(error?.code) === '42P01';
}

function normalizeLocationRow(row = {}) {
    return {
        id: text(row.id),
        type: text(row.type),
        name: text(row.name),
        normalizedName: normalizeLocationName(row.normalized_name || row.name),
        parentId: text(row.parent_id) || null,
        ubigeo: text(row.ubigeo) || null
    };
}

function extractLocationCandidates(value = '') {
    const normalized = normalizeLocationName(value);
    if (!normalized) return [];
    const words = normalized.split(' ').filter(Boolean);
    const candidates = new Set();

    for (let size = Math.min(5, words.length); size >= 2; size -= 1) {
        for (let index = 0; index <= words.length - size; index += 1) {
            const phraseWords = words.slice(index, index + size);
            const phrase = phraseWords.join(' ').trim();
            if (phrase.length < 4) continue;
            if (!phraseWords.some((word) => word.length >= 4 && !STOPWORDS.has(word))) continue;
            candidates.add(phrase);
        }
    }

    words
        .filter((word) => word.length >= 4 && !STOPWORDS.has(word))
        .forEach((word) => candidates.add(word));

    return Array.from(candidates)
        .sort((left, right) => right.length - left.length || left.localeCompare(right, 'es'));
}

async function loadGeoLocations() {
    try {
        const { rows } = await queryPostgres(
            `SELECT id, type, name, normalized_name, parent_id, ubigeo
               FROM geo_locations
              WHERE is_active = TRUE
              ORDER BY type ASC, normalized_name ASC`
        );
        return (Array.isArray(rows) ? rows : []).map(normalizeLocationRow).filter((row) => row.id && GEO_TYPES.includes(row.type));
    } catch (error) {
        if (missingRelation(error)) return [];
        throw error;
    }
}

function hydrateLocation(match = null, byId = new Map(), confidence = 'none', matchedText = '') {
    if (!match) {
        return {
            district: null,
            province: null,
            department: null,
            confidence: 'none',
            matchedType: null,
            matchedText: null
        };
    }

    let district = null;
    let province = null;
    let department = null;

    if (match.type === 'district') {
        district = match;
        province = byId.get(match.parentId) || null;
        department = province ? byId.get(province.parentId) || null : null;
    } else if (match.type === 'province') {
        province = match;
        department = byId.get(match.parentId) || null;
    } else if (match.type === 'department') {
        department = match;
    }

    return {
        district: district?.name || null,
        province: province?.name || null,
        department: department?.name || null,
        confidence,
        matchedType: match.type,
        matchedText: text(matchedText) || match.name || null,
        locationId: match.id,
        ubigeo: district?.ubigeo || province?.ubigeo || department?.ubigeo || null
    };
}

function findMatches(locations = [], candidate = '', type = '', { allowPartial = true } = {}) {
    const normalizedCandidate = normalizeLocationName(candidate);
    if (!normalizedCandidate || !type) return [];
    const scoped = locations.filter((row) => row.type === type);
    const exact = scoped.filter((row) => row.normalizedName === normalizedCandidate);
    if (exact.length) return exact.map((row) => ({ row, confidence: 'exact' }));
    if (!allowPartial) return [];
    if (normalizedCandidate.length < 5) return [];
    return scoped
        .filter((row) => row.normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(row.normalizedName))
        .map((row) => ({ row, confidence: 'partial' }))
        .sort((left, right) => right.row.normalizedName.length - left.row.normalizedName.length);
}

function chooseBestMatch(matches = []) {
    if (!matches.length) return null;
    const bestScore = (match) => {
        const confidenceScore = match.confidence === 'exact' ? 1000 : 500;
        return confidenceScore + (TYPE_PRIORITY[match.row.type] || 0) * 100 + match.row.normalizedName.length;
    };
    const sorted = [...matches].sort((left, right) => bestScore(right) - bestScore(left));
    const topScore = bestScore(sorted[0]);
    const topMatches = sorted.filter((match) => bestScore(match) === topScore);
    return {
        ...sorted[0],
        ambiguous: topMatches.length > 1
    };
}

async function resolveLocationFromText(value = '') {
    const candidates = extractLocationCandidates(value);
    if (!candidates.length) return hydrateLocation(null);

    const locations = await loadGeoLocations();
    if (!locations.length) return hydrateLocation(null);

    const byId = new Map(locations.map((row) => [row.id, row]));

    for (const allowPartial of [false, true]) {
        for (const candidate of candidates) {
            for (const type of GEO_TYPES) {
                const matches = findMatches(locations, candidate, type, { allowPartial });
                if (!matches.length) continue;
                const best = chooseBestMatch(matches);
                if (!best) continue;
                return hydrateLocation(
                    best.row,
                    byId,
                    best.ambiguous ? 'ambiguous' : best.confidence,
                    candidate
                );
            }
        }
    }

    return hydrateLocation(null);
}

function collectRuleValues(rulesJson = {}, keys = []) {
    const output = [];
    const visit = (value) => {
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (!value || typeof value !== 'object') return;
        keys.forEach((key) => {
            const entry = value[key];
            if (Array.isArray(entry)) {
                entry.forEach((item) => output.push(item));
            }
        });
        Object.values(value).forEach((entry) => {
            if (entry && typeof entry === 'object') visit(entry);
        });
    };
    visit(rulesJson);
    return output
        .map((entry) => (entry && typeof entry === 'object' ? (entry.name || entry.label || entry.value || entry.id) : entry))
        .map(normalizeLocationName)
        .filter(Boolean);
}

function getRuleJson(rule = {}) {
    return safeObject(rule.rulesJson || rule.rules_json || rule.rules || rule.metadata);
}

function resolveZoneFromLocation(location = {}, zoneRules = []) {
    const confidence = text(location?.confidence);
    if (!location || confidence === 'none' || confidence === 'ambiguous') return null;

    const activeRules = ensureArray(zoneRules).filter((rule) => rule && rule.isActive !== false && rule.is_active !== false);
    const checks = [
        {
            level: 'district',
            value: location.district,
            keys: ['districts', 'districtNames', 'distritos']
        },
        {
            level: 'province',
            value: location.province,
            keys: ['provinces', 'provinceNames', 'provincias']
        },
        {
            level: 'department',
            value: location.department,
            keys: ['departments', 'departmentNames', 'departamentos']
        }
    ];

    for (const check of checks) {
        const normalizedValue = normalizeLocationName(check.value);
        if (!normalizedValue) continue;
        const rule = activeRules.find((candidate) => collectRuleValues(getRuleJson(candidate), check.keys).includes(normalizedValue));
        if (rule) {
            return {
                rule,
                matchedLevel: check.level,
                location
            };
        }
    }

    return null;
}

module.exports = {
    normalizeLocationName,
    extractLocationCandidates,
    resolveLocationFromText,
    resolveZoneFromLocation
};
