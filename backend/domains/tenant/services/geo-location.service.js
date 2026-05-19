const { queryPostgres } = require('../../../config/persistence-runtime');

const GEO_TYPES = Object.freeze(['district', 'province', 'department']);
const TYPE_PRIORITY = Object.freeze({ district: 3, province: 2, department: 1 });
const geoLocationWarnings = new Set();
const STOPWORDS = new Set([
    'vivo', 'vive', 'soy', 'estoy', 'esta', 'ubicado', 'ubicada', 'ubicacion',
    'direccion', 'donde', 'para', 'envio', 'delivery', 'pedido', 'cliente',
    'quiero', 'quisiera', 'necesito', 'precio', 'cuanto', 'cuesta', 'demora',
    'llegan', 'llega', 'domicilio', 'distrito', 'provincia', 'departamento',
    'peru', 'casa', 'zona', 'reparto', 'pago', 'pagar', 'pagos', 'metodo',
    'metodos', 'yape', 'plin', 'transferencia', 'tarjeta', 'credito',
    'creditos', 'cuota', 'cuotas', 'plazo', 'plazos', 'financiamiento',
    'fiado', 'abono', 'abonos', 'adelanto', 'contra', 'contraentrega',
    'entrega', 'puedo', 'puedes', 'podria', 'podrias', 'hablo',
    'hola', 'buen', 'buenos', 'buenas', 'dias', 'dia', 'tardes',
    'noches', 'saludos', 'uenos'
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

function warnGeoLocationsEmptyOrUnreachable(reason = 'empty', error = null) {
    const key = `${reason}:${text(error?.code || '')}:${text(error?.message || '')}`;
    if (geoLocationWarnings.has(key)) return;
    geoLocationWarnings.add(key);
    console.warn('[Geo] geo_locations table empty or unreachable', {
        reason,
        code: text(error?.code || '') || null,
        message: text(error?.message || '') || null
    });
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

function stripLocationPrefix(value = '') {
    return text(value)
        .replace(/^\s*\[(?:cliente|asesor|patty|usuario)[^\]]*\]\s*:?\s*/i, '')
        .replace(/^\s*(?:cliente|asesor|patty|usuario)?\s*:?\s*/i, '')
        .replace(/^\s*(?:vivo|vive|soy|estoy|esta|ubicado|ubicada|direccion|domicilio|llegan|llega|delivery|envio)\s+(?:en|de|desde|a)?\s+/i, '')
        .replace(/^\s*(?:en|de|desde|a)\s+/i, '')
        .trim();
}

function extractCompoundLocationSegments(value = '') {
    const source = text(value);
    if (!source) return [];
    const normalized = normalizeLocationName(source);
    if (/\b(?:cerca|referencia|referencia de)\s+de\b/.test(normalized)) {
        return [];
    }
    const pieces = source
        .split(/[,;|/\n\r]+/g)
        .map(stripLocationPrefix)
        .map((piece) => piece.replace(/\s+/g, ' ').trim())
        .filter((piece) => {
            const clean = normalizeLocationName(piece);
            if (!clean || clean.length < 4) return false;
            return clean.split(' ').some((word) => word.length >= 4 && !STOPWORDS.has(word));
        });
    const seen = new Set();
    return pieces.filter((piece) => {
        const key = normalizeLocationName(piece);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function shouldAskForDistrictInsteadOfAssuming(value = '') {
    const normalized = normalizeLocationName(value);
    if (!normalized) return false;
    return /\blima\s+(?:norte|sur|este|oeste|centro)\b/.test(normalized)
        || /\b(?:norte|sur|este|oeste|centro)\s+de\s+lima\b/.test(normalized)
        || /\blima\b.*\bcerca\s+de\b/.test(normalized)
        || /\bcerca\s+de\b.*\blima\b/.test(normalized);
}

async function loadGeoLocations() {
    try {
        const { rows } = await queryPostgres(
            `SELECT id, type, name, normalized_name, parent_id, ubigeo
               FROM geo_locations
              WHERE is_active = TRUE
              ORDER BY type ASC, normalized_name ASC`
        );
        const sourceRows = Array.isArray(rows) ? rows : [];
        if (!sourceRows.length) {
            warnGeoLocationsEmptyOrUnreachable('empty');
        }
        return sourceRows.map(normalizeLocationRow).filter((row) => row.id && GEO_TYPES.includes(row.type));
    } catch (error) {
        if (missingRelation(error)) {
            warnGeoLocationsEmptyOrUnreachable('missing_relation', error);
            return [];
        }
        warnGeoLocationsEmptyOrUnreachable('query_failed', error);
        throw error;
    }
}

function hydrateLocation(match = null, byId = new Map(), confidence = 'none', matchedText = '', candidates = []) {
    if (!match) {
        return {
            district: null,
            province: null,
            department: null,
            confidence: 'none',
            matchedType: null,
            matchedText: null,
            candidates: []
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
        ubigeo: district?.ubigeo || province?.ubigeo || department?.ubigeo || null,
        candidates
    };
}

function describeLocationCandidate(row = {}, byId = new Map(), matchedText = '') {
    const hydrated = hydrateLocation(row, byId, 'exact', matchedText);
    return {
        id: hydrated.locationId || row.id || null,
        type: row.type || null,
        name: row.name || null,
        district: hydrated.district,
        province: hydrated.province,
        department: hydrated.department,
        ubigeo: hydrated.ubigeo || null
    };
}

function sameKnownBranch(left = {}, right = {}) {
    for (const key of ['department', 'province', 'district']) {
        if (left[key] && right[key] && left[key] !== right[key]) return false;
    }
    return true;
}

function allCandidatesShareBranch(candidates = []) {
    if (candidates.length <= 1) return true;
    for (let i = 0; i < candidates.length; i += 1) {
        for (let j = i + 1; j < candidates.length; j += 1) {
            if (!sameKnownBranch(candidates[i], candidates[j])) return false;
        }
    }
    return true;
}

function uniqueLocationCandidates(candidates = []) {
    const seen = new Set();
    return candidates.filter((candidate) => {
        const key = candidate.id || [candidate.type, candidate.name, candidate.province, candidate.department].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function hydrateAmbiguousLocation(matches = [], byId = new Map(), matchedText = '') {
    const candidates = uniqueLocationCandidates(
        matches.map((match) => describeLocationCandidate(match.row, byId, matchedText))
    );
    return {
        district: null,
        province: null,
        department: null,
        confidence: 'ambiguous',
        matchedType: null,
        matchedText: text(matchedText) || null,
        candidates
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
        ambiguous: topMatches.length > 1,
        topMatches
    };
}

function resolveExactMatchSet(matches = [], byId = new Map(), candidate = '') {
    if (!matches.length) return null;
    const candidateRows = uniqueLocationCandidates(
        matches.map((match) => describeLocationCandidate(match.row, byId, candidate))
    );
    if (!allCandidatesShareBranch(candidateRows)) {
        return hydrateAmbiguousLocation(matches, byId, candidate);
    }
    const sorted = [...matches].sort((left, right) => {
        const priorityDelta = (TYPE_PRIORITY[right.row.type] || 0) - (TYPE_PRIORITY[left.row.type] || 0);
        if (priorityDelta !== 0) return priorityDelta;
        return right.row.normalizedName.length - left.row.normalizedName.length;
    });
    return hydrateLocation(sorted[0].row, byId, sorted[0].confidence, candidate);
}

function resolveAgainstLoadedLocations(value = '', locations = [], byId = new Map()) {
    const candidates = extractLocationCandidates(value);
    if (!candidates.length) return hydrateLocation(null);

    for (const candidate of candidates) {
        const exactMatches = GEO_TYPES.flatMap((type) => findMatches(locations, candidate, type, { allowPartial: false }));
        const exactResult = resolveExactMatchSet(exactMatches, byId, candidate);
        if (exactResult) return exactResult;
    }

    for (const candidate of candidates) {
        const partialMatches = GEO_TYPES.flatMap((type) => findMatches(locations, candidate, type, { allowPartial: true }))
            .filter((match) => match.confidence === 'partial');
        if (!partialMatches.length) continue;
        const best = chooseBestMatch(partialMatches);
        if (!best) continue;
        if (best.ambiguous) {
            return hydrateAmbiguousLocation(best.topMatches || partialMatches, byId, candidate);
        }
        return hydrateLocation(best.row, byId, best.confidence, candidate);
    }

    return hydrateLocation(null);
}

function expandAmbiguousLocationWithPartialCandidates(result = {}, value = '', locations = [], byId = new Map(), zoneRules = []) {
    if (result?.confidence !== 'ambiguous') return result;
    const baseCandidates = Array.isArray(result.candidates) ? result.candidates : [];
    const lookupCandidates = Array.from(new Set([
        normalizeLocationName(result.matchedText || ''),
        ...extractLocationCandidates(value).map(normalizeLocationName)
    ].filter((entry) => entry && entry.length >= 5)));
    if (!lookupCandidates.length) return result;

    const existingIds = new Set(baseCandidates.map((candidate) => candidate.id).filter(Boolean));
    const additional = [];
    for (const candidateText of lookupCandidates) {
        locations
            .filter((row) => row.type === 'district')
            .filter((row) => row.normalizedName !== candidateText)
            .filter((row) => row.normalizedName.startsWith(`${candidateText} `) || row.normalizedName.includes(` ${candidateText} `))
            .forEach((row) => {
                if (!row?.id || existingIds.has(row.id)) return;
                const location = hydrateLocation(row, byId, 'partial', candidateText);
                const zoneMatch = resolveZoneFromLocation(location, zoneRules);
                const startsWithCandidate = row.normalizedName.startsWith(`${candidateText} `);
                if (!zoneMatch && !startsWithCandidate) return;
                additional.push(describeLocationCandidate(row, byId, candidateText));
                existingIds.add(row.id);
            });
    }
    if (!additional.length) return result;
    return {
        ...result,
        candidates: uniqueLocationCandidates([...baseCandidates, ...additional])
    };
}

function contextBranchesFromResult(result = {}) {
    if (Array.isArray(result.candidates) && result.candidates.length) return result.candidates;
    if (!result || result.confidence === 'none') return [];
    return [{
        id: result.locationId || null,
        type: result.matchedType || null,
        name: result.matchedText || null,
        district: result.district || null,
        province: result.province || null,
        department: result.department || null,
        ubigeo: result.ubigeo || null
    }];
}

function scoreCandidateAgainstContext(candidate = {}, context = {}) {
    let score = 0;
    if (context.province && candidate.province === context.province) score += 60;
    if (context.department && candidate.department === context.department) score += 30;
    if (context.district && candidate.district === context.district) score += 10;
    return score;
}

function disambiguateWithContext(primaryResult = {}, contextResults = [], byId = new Map()) {
    const candidates = Array.isArray(primaryResult.candidates) ? primaryResult.candidates : [];
    if (primaryResult.confidence !== 'ambiguous' || !candidates.length || !contextResults.length) return null;
    const contextBranches = contextResults.flatMap((entry) => contextBranchesFromResult(entry.result || entry));
    if (!contextBranches.length) return null;

    const scored = candidates
        .map((candidate) => ({
            candidate,
            score: Math.max(0, ...contextBranches.map((context) => scoreCandidateAgainstContext(candidate, context)))
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || (TYPE_PRIORITY[right.candidate.type] || 0) - (TYPE_PRIORITY[left.candidate.type] || 0));

    if (!scored.length) return null;
    const topScore = scored[0].score;
    const top = scored.filter((entry) => entry.score === topScore);
    if (top.length !== 1) return null;
    const row = byId.get(top[0].candidate.id);
    if (!row) return null;
    return hydrateLocation(row, byId, 'exact', primaryResult.matchedText || top[0].candidate.name, [top[0].candidate]);
}

function chooseBestCompoundResult(segmentResults = [], byId = new Map()) {
    if (segmentResults.length < 2) return null;

    const primary = segmentResults[0];
    if (primary?.result?.confidence === 'ambiguous') {
        const disambiguated = disambiguateWithContext(
            primary.result,
            segmentResults.slice(1),
            byId
        );
        if (disambiguated) return disambiguated;
        return null;
    }

    if (['exact', 'partial'].includes(primary?.result?.confidence) && primary?.result?.matchedType === 'district') {
        return primary.result;
    }

    const resolved = segmentResults
        .filter((entry) => ['exact', 'partial'].includes(entry.result?.confidence))
        .sort((left, right) => {
            const priorityDelta = (TYPE_PRIORITY[right.result?.matchedType] || 0) - (TYPE_PRIORITY[left.result?.matchedType] || 0);
            if (priorityDelta !== 0) return priorityDelta;
            return left.index - right.index;
        });
    return resolved[0]?.result || null;
}

async function resolveLocationFromText(value = '', options = {}) {
    if (shouldAskForDistrictInsteadOfAssuming(value)) return hydrateLocation(null);

    const locations = await loadGeoLocations();
    if (!locations.length) return hydrateLocation(null);

    const byId = new Map(locations.map((row) => [row.id, row]));
    const zoneRules = ensureArray(options?.zoneRules);
    const compoundSegments = extractCompoundLocationSegments(value);
    if (compoundSegments.length >= 2) {
        const segmentResults = compoundSegments
            .map((segment, index) => ({
                segment,
                index,
                result: expandAmbiguousLocationWithPartialCandidates(
                    resolveAgainstLoadedLocations(segment, locations, byId),
                    segment,
                    locations,
                    byId,
                    zoneRules
                )
            }))
            .filter((entry) => entry.result?.confidence && entry.result.confidence !== 'none');
        const compoundResult = chooseBestCompoundResult(segmentResults, byId);
        if (compoundResult) return compoundResult;
    }

    return expandAmbiguousLocationWithPartialCandidates(
        resolveAgainstLoadedLocations(value, locations, byId),
        value,
        locations,
        byId,
        zoneRules
    );
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
