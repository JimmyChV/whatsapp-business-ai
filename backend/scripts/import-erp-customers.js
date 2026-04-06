#!/usr/bin/env node
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    DEFAULT_TENANT_ID,
    getStorageDriver,
    normalizeTenantId,
    queryPostgres
} = require('../config/persistence-runtime');
const {
    parseCsvRows,
    normalizePhone,
    toText,
    toLower,
    toBool
} = require('../domains/tenant/helpers/customers-normalizers.helpers');

const DEFAULT_ERP_DIR = path.join(__dirname, '..', 'config', 'data', 'erp');

function parseArgs(argv = []) {
    const args = {
        tenant: DEFAULT_TENANT_ID,
        dir: DEFAULT_ERP_DIR,
        moduleId: '',
        actor: 'erp_import_script'
    };

    for (let i = 0; i < argv.length; i += 1) {
        const token = String(argv[i] || '').trim();
        if (!token) continue;

        if (token.startsWith('--tenant=')) {
            args.tenant = token.split('=').slice(1).join('=').trim();
            continue;
        }
        if (token === '--tenant') {
            args.tenant = String(argv[i + 1] || '').trim();
            i += 1;
            continue;
        }

        if (token.startsWith('--dir=')) {
            args.dir = token.split('=').slice(1).join('=').trim();
            continue;
        }
        if (token === '--dir') {
            args.dir = String(argv[i + 1] || '').trim();
            i += 1;
            continue;
        }

        if (token.startsWith('--module=')) {
            args.moduleId = token.split('=').slice(1).join('=').trim();
            continue;
        }
        if (token === '--module') {
            args.moduleId = String(argv[i + 1] || '').trim();
            i += 1;
            continue;
        }

        if (token.startsWith('--actor=')) {
            args.actor = token.split('=').slice(1).join('=').trim();
            continue;
        }
        if (token === '--actor') {
            args.actor = String(argv[i + 1] || '').trim();
            i += 1;
            continue;
        }
    }

    args.tenant = normalizeTenantId(args.tenant || DEFAULT_TENANT_ID);
    args.dir = path.resolve(args.dir || DEFAULT_ERP_DIR);
    args.moduleId = String(args.moduleId || '').trim();
    args.actor = String(args.actor || 'erp_import_script').trim() || 'erp_import_script';
    return args;
}

function normalizeHeader(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
}

function normalizeFilename(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
}

function readCsvText(csvPath = '') {
    const buffer = fs.readFileSync(csvPath);
    const utf8 = buffer.toString('utf8');
    const latin1 = buffer.toString('latin1');
    const maybeMojibake = /Ã.|â.|�/.test(utf8);
    return maybeMojibake ? latin1 : utf8;
}

function csvToObjects(csvPath = '') {
    const raw = readCsvText(csvPath);
    const rows = parseCsvRows(raw, ',');
    if (rows.length < 1) return [];
    const headers = rows[0].map((entry) => String(entry || '').trim());
    const keyMap = headers.map((header) => normalizeHeader(header));
    const out = [];
    for (let i = 1; i < rows.length; i += 1) {
        const row = rows[i];
        const obj = {};
        keyMap.forEach((key, idx) => {
            obj[key] = String(row[idx] || '').trim();
        });
        obj.__rowNumber = i + 1;
        out.push(obj);
    }
    return out;
}

function mustFindFile(dirPath, preferredTokens = []) {
    const files = fs.readdirSync(dirPath, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.csv'))
        .map((entry) => ({ name: entry.name, normalized: normalizeFilename(entry.name) }));

    for (const tokens of preferredTokens) {
        const normalizedTokens = tokens.map((t) => normalizeFilename(t)).filter(Boolean);
        const hit = files.find((file) => normalizedTokens.every((token) => file.normalized.includes(token)));
        if (hit) {
            return path.join(dirPath, hit.name);
        }
    }

    throw new Error(`No se encontro CSV requerido en ${dirPath}. Tokens buscados: ${preferredTokens.map((t) => t.join('+')).join(' | ')}`);
}

function toIsoDate(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
        const day = Number(m[1]);
        const month = Number(m[2]);
        const year = Number(m[3]);
        const hh = Number(m[4] || 0);
        const mm = Number(m[5] || 0);
        const ss = Number(m[6] || 0);
        const d = new Date(year, month - 1, day, hh, mm, ss, 0);
        return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    }
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function parseMapsCoordinates(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return { latitude: null, longitude: null };
    const qMatch = raw.match(/[?&]q=([-+]?\d+(?:\.\d+)?),\s*([-+]?\d+(?:\.\d+)?)/i);
    if (qMatch) {
        return {
            latitude: Number(qMatch[1]),
            longitude: Number(qMatch[2])
        };
    }
    const tuple = raw.match(/([-+]?\d+(?:\.\d+)?),\s*([-+]?\d+(?:\.\d+)?)/);
    if (tuple) {
        return {
            latitude: Number(tuple[1]),
            longitude: Number(tuple[2])
        };
    }
    return { latitude: null, longitude: null };
}

function runId() {
    return `run_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function createCustomerId(tenantId = DEFAULT_TENANT_ID, sourceId = '') {
    const hash = crypto
        .createHash('sha1')
        .update(`${tenantId}::${String(sourceId || '').trim().toUpperCase()}`)
        .digest('hex')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
    return `CUS-${hash.slice(0, 6).padEnd(6, '0')}`;
}

async function ensureSchema() {
    await queryPostgres(`
        CREATE TABLE IF NOT EXISTS tenant_customer_import_runs (
            tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
            run_id TEXT NOT NULL,
            source_name TEXT NULL,
            source_format TEXT NOT NULL DEFAULT 'csv',
            source_module_id TEXT NULL,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
            started_at TIMESTAMPTZ NULL,
            finished_at TIMESTAMPTZ NULL,
            total_rows INTEGER NOT NULL DEFAULT 0,
            inserted_rows INTEGER NOT NULL DEFAULT 0,
            updated_rows INTEGER NOT NULL DEFAULT 0,
            skipped_rows INTEGER NOT NULL DEFAULT 0,
            error_rows INTEGER NOT NULL DEFAULT 0,
            created_by TEXT NULL,
            summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (tenant_id, run_id)
        )
    `);

    await queryPostgres(`
        CREATE TABLE IF NOT EXISTS tenant_customer_import_errors (
            tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
            error_id TEXT NOT NULL,
            run_id TEXT NOT NULL,
            row_number INTEGER NULL,
            customer_id TEXT NULL,
            phone_e164 TEXT NULL,
            error_code TEXT NULL,
            error_message TEXT NOT NULL,
            raw_row_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (tenant_id, error_id)
        )
    `);
}

async function insertRun(tenantId, state = {}) {
    await queryPostgres(
        `INSERT INTO tenant_customer_import_runs (
            tenant_id, run_id, source_name, source_format, source_module_id, status,
            started_at, total_rows, inserted_rows, updated_rows, skipped_rows, error_rows,
            created_by, summary_json, created_at, updated_at
        ) VALUES (
            $1, $2, $3, 'csv', $4, $5,
            $6, $7, $8, $9, $10, $11,
            $12, $13::jsonb, NOW(), NOW()
        )
        ON CONFLICT (tenant_id, run_id)
        DO UPDATE SET
            source_name = EXCLUDED.source_name,
            source_module_id = EXCLUDED.source_module_id,
            status = EXCLUDED.status,
            started_at = EXCLUDED.started_at,
            total_rows = EXCLUDED.total_rows,
            inserted_rows = EXCLUDED.inserted_rows,
            updated_rows = EXCLUDED.updated_rows,
            skipped_rows = EXCLUDED.skipped_rows,
            error_rows = EXCLUDED.error_rows,
            created_by = EXCLUDED.created_by,
            summary_json = EXCLUDED.summary_json,
            updated_at = NOW()`,
        [
            tenantId,
            state.runId,
            state.sourceName || null,
            state.sourceModuleId || null,
            state.status || 'running',
            state.startedAt || null,
            Number(state.totalRows || 0),
            Number(state.insertedRows || 0),
            Number(state.updatedRows || 0),
            Number(state.skippedRows || 0),
            Number(state.errorRows || 0),
            state.createdBy || null,
            JSON.stringify(state.summary || {})
        ]
    );
}

async function updateRun(tenantId, state = {}) {
    await queryPostgres(
        `UPDATE tenant_customer_import_runs
            SET status = $3,
                finished_at = $4,
                total_rows = $5,
                inserted_rows = $6,
                updated_rows = $7,
                skipped_rows = $8,
                error_rows = $9,
                summary_json = $10::jsonb,
                updated_at = NOW()
          WHERE tenant_id = $1
            AND run_id = $2`,
        [
            tenantId,
            state.runId,
            state.status || 'completed',
            state.finishedAt || new Date().toISOString(),
            Number(state.totalRows || 0),
            Number(state.insertedRows || 0),
            Number(state.updatedRows || 0),
            Number(state.skippedRows || 0),
            Number(state.errorRows || 0),
            JSON.stringify(state.summary || {})
        ]
    );
}

async function insertRowError(tenantId, runIdValue, payload = {}) {
    const errorId = `err_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    await queryPostgres(
        `INSERT INTO tenant_customer_import_errors (
            tenant_id, error_id, run_id, row_number, customer_id, phone_e164,
            error_code, error_message, raw_row_json, context_json, created_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9::jsonb, $10::jsonb, NOW()
        )`,
        [
            tenantId,
            errorId,
            runIdValue,
            payload.rowNumber || null,
            payload.customerId || null,
            payload.phoneE164 || null,
            payload.errorCode || null,
            payload.errorMessage || 'Import error',
            JSON.stringify(payload.rawData || {}),
            JSON.stringify(payload.context || {})
        ]
    );
}

async function loadLookupSet(tableName = '') {
    const result = await queryPostgres(`SELECT id FROM ${tableName}`);
    return new Set((result?.rows || []).map((row) => String(row.id || '').trim()).filter(Boolean));
}

async function findCustomerByPhone(tenantId, phoneE164) {
    const result = await queryPostgres(
        `SELECT customer_id
         FROM tenant_customers
         WHERE tenant_id = $1
           AND phone_e164 = $2
         LIMIT 1`,
        [tenantId, phoneE164]
    );
    return String(result?.rows?.[0]?.customer_id || '').trim() || null;
}

async function findCustomerByErpId(tenantId, erpClientId = '') {
    const result = await queryPostgres(
        `SELECT customer_id
         FROM tenant_customers
         WHERE tenant_id = $1
           AND COALESCE(metadata -> 'erp' ->> 'idCliente', '') = $2
         LIMIT 1`,
        [tenantId, String(erpClientId || '').trim()]
    );
    return String(result?.rows?.[0]?.customer_id || '').trim() || null;
}

async function upsertCustomer(tenantId, row = {}, lookups = {}, options = {}) {
    const erpClientId = toText(row.idcliente);
    const phoneE164 = normalizePhone(row.telefono || '');
    if (!phoneE164) {
        return { status: 'skipped', reason: 'missing_phone', customerId: null, phoneE164: null };
    }

    const existingByPhone = await findCustomerByPhone(tenantId, phoneE164);
    const customerId = existingByPhone || createCustomerId(tenantId, erpClientId || phoneE164);

    const treatmentId = lookups.treatments.has(toText(row.idtratamientocliente)) ? toText(row.idtratamientocliente) : null;
    const customerTypeId = lookups.types.has(toText(row.idtipocliente)) ? toText(row.idtipocliente) : null;
    const acquisitionSourceId = lookups.sources.has(toText(row.idfuentecliente)) ? toText(row.idfuentecliente) : null;
    const documentTypeId = lookups.documents.has(toText(row.iddocumentoidentidad)) ? toText(row.iddocumentoidentidad) : null;

    const firstName = toText(row.nombres) || null;
    const lastNamePaternal = toText(row.apellidopaterno) || null;
    const lastNameMaternal = toText(row.apellidomaterno) || null;
    const contactName = toText(row.contacto) || [firstName, lastNamePaternal, lastNameMaternal].filter(Boolean).join(' ') || null;
    const phoneAlt = normalizePhone(row.telefono2 || '');
    const email = toLower(row.correoelectronico || '') || null;
    const documentNumber = toText(row.numerodocumentoidentidad) || null;
    const notes = toText(row.observacioncliente) || null;
    const registeredAt = toIsoDate(row.fecharegistro || row.fecharegistro0 || row['fecharegistro']);
    const moduleId = toText(options.moduleId || '') || null;

    const tags = [];
    const groupValue = toText(row.grupo);
    if (groupValue && toLower(groupValue) !== 'sin grupo') {
        tags.push(groupValue);
    }
    const contactType = toText(row.tipocontacto);
    if (contactType) {
        tags.push(contactType);
    }

    const now = new Date().toISOString();
    const metadata = {
        erp: {
            idCliente: erpClientId || null,
            idEmpleado: toText(row.idempleado) || null,
            usuario: toText(row.usuario) || null,
            idMarca: toText(row.idmarca) || null,
            idReferido: toText(row.idreferido) || null,
            idDistritoFiscal: toText(row.iddistritofiscal) || null,
            direccionFiscal: toText(row.direccionfiscal) || null,
            autorizacion: toBool(row.autorizacion, false)
        }
    };

    await queryPostgres(
        `INSERT INTO tenant_customers (
            tenant_id, customer_id, module_id, contact_name, phone_e164, phone_alt, email,
            tags, profile, metadata, is_active, last_interaction_at, created_at, updated_at,
            treatment_id, first_name, last_name_paternal, last_name_maternal,
            document_type_id, document_number, customer_type_id, acquisition_source_id, notes
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8::jsonb, $9::jsonb, $10::jsonb, TRUE, $11, $12, $13,
            $14, $15, $16, $17, $18, $19, $20, $21, $22
        )
        ON CONFLICT ON CONSTRAINT idx_tenant_customers_phone_unique
        DO UPDATE SET
            module_id = EXCLUDED.module_id,
            contact_name = EXCLUDED.contact_name,
            phone_alt = EXCLUDED.phone_alt,
            email = EXCLUDED.email,
            tags = EXCLUDED.tags,
            profile = EXCLUDED.profile,
            metadata = EXCLUDED.metadata,
            last_interaction_at = EXCLUDED.last_interaction_at,
            updated_at = EXCLUDED.updated_at,
            treatment_id = EXCLUDED.treatment_id,
            first_name = EXCLUDED.first_name,
            last_name_paternal = EXCLUDED.last_name_paternal,
            last_name_maternal = EXCLUDED.last_name_maternal,
            document_type_id = EXCLUDED.document_type_id,
            document_number = EXCLUDED.document_number,
            customer_type_id = EXCLUDED.customer_type_id,
            acquisition_source_id = EXCLUDED.acquisition_source_id,
            notes = EXCLUDED.notes
        RETURNING customer_id`,
        [
            tenantId,
            customerId,
            moduleId,
            contactName,
            phoneE164,
            phoneAlt,
            email,
            JSON.stringify(Array.from(new Set(tags))),
            JSON.stringify({
                treatmentId,
                documentTypeId,
                documentNumber,
                customerTypeId,
                sourceId: acquisitionSourceId
            }),
            JSON.stringify(metadata),
            registeredAt || now,
            registeredAt || now,
            now,
            treatmentId,
            firstName,
            lastNamePaternal,
            lastNameMaternal,
            documentTypeId,
            documentNumber,
            customerTypeId,
            acquisitionSourceId,
            notes
        ]
    );

    return {
        status: existingByPhone ? 'updated' : 'inserted',
        customerId,
        phoneE164,
        erpClientId
    };
}

async function upsertAddress(tenantId, row = {}, customerId = null) {
    const addressId = toText(row.iddireccion);
    if (!addressId || !customerId) {
        return { status: 'skipped', reason: 'missing_address_or_customer' };
    }

    const createdAt = toIsoDate(row.fecharegistro);
    const now = new Date().toISOString();
    const isPrimary = toBool(row.esprincipal, false);
    const mapsUrl = toText(row.ubicacionmaps) || null;
    const coords = parseMapsCoordinates(mapsUrl || '');

    if (isPrimary) {
        await queryPostgres(
            `UPDATE tenant_customer_addresses
                SET is_primary = FALSE, updated_at = NOW()
              WHERE tenant_id = $1
                AND customer_id = $2
                AND address_id <> $3`,
            [tenantId, customerId, addressId]
        );
    }

    await queryPostgres(
        `INSERT INTO tenant_customer_addresses (
            address_id, tenant_id, customer_id, address_type, street, reference, maps_url, wkt,
            latitude, longitude, is_primary, district_id, district_name, province_name, department_name,
            metadata, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15,
            $16::jsonb, $17, $18
        )
        ON CONFLICT (address_id)
        DO UPDATE SET
            customer_id = EXCLUDED.customer_id,
            address_type = EXCLUDED.address_type,
            street = EXCLUDED.street,
            reference = EXCLUDED.reference,
            maps_url = EXCLUDED.maps_url,
            wkt = EXCLUDED.wkt,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            is_primary = EXCLUDED.is_primary,
            district_id = EXCLUDED.district_id,
            district_name = EXCLUDED.district_name,
            province_name = EXCLUDED.province_name,
            department_name = EXCLUDED.department_name,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at`,
        [
            addressId,
            tenantId,
            customerId,
            'delivery',
            toText(row.direccion) || null,
            toText(row.referencia) || null,
            mapsUrl,
            toText(row.wkt) || null,
            Number.isFinite(coords.latitude) ? coords.latitude : null,
            Number.isFinite(coords.longitude) ? coords.longitude : null,
            isPrimary,
            toText(row.iddistrito) || null,
            null,
            null,
            null,
            JSON.stringify({
                erp: {
                    idCliente: toText(row.idcliente) || null,
                    tipoZona: toText(row.tipozona) || null,
                    tipoVia: toText(row.tipovia) || null,
                    idTipoZona: toText(row.idtipozona) || null,
                    idTipoVia: toText(row.idtipovia) || null,
                    idUsuario: toText(row.idusuario) || null
                }
            }),
            createdAt || now,
            now
        ]
    );

    return { status: 'upserted', addressId };
}

async function main() {
    process.stdout.write('[import] starting...\n');
    const args = parseArgs(process.argv.slice(2));
    let step = 'args_parsed';
    process.stdout.write('[import] step: ' + step + '\n');
    if (getStorageDriver() !== 'postgres') {
        throw new Error('import-erp-customers.js requiere SAAS_STORAGE_DRIVER=postgres.');
    }

    if (!fs.existsSync(args.dir)) {
        throw new Error(`Directorio ERP no encontrado: ${args.dir}`);
    }

    const csvPaths = {
        clients: mustFindFile(args.dir, [['erp', 'tbclientes'], ['tbclientes']]),
        addresses: mustFindFile(args.dir, [['erp', 'tbdirecciones'], ['tbdirecciones']]),
        treatments: mustFindFile(args.dir, [['erp', 'tbtratamientoscliente'], ['tbtratamientoscliente']]),
        types: mustFindFile(args.dir, [['erp', 'tbtipocliente'], ['tbtipocliente']]),
        sources: mustFindFile(args.dir, [['erp', 'tbfuentecliente'], ['tbfuentecliente']]),
        documents: mustFindFile(args.dir, [['erp', 'tbdocumentosidentidad'], ['tbdocumentosidentidad']])
    };

    const runState = {
        runId: runId(),
        sourceName: 'ERP_Contable_TbClientes_TbDirecciones',
        sourceModuleId: args.moduleId || null,
        status: 'running',
        startedAt: new Date().toISOString(),
        totalRows: 0,
        insertedRows: 0,
        updatedRows: 0,
        skippedRows: 0,
        errorRows: 0,
        createdBy: args.actor,
        summary: {
            files: csvPaths,
            importedCustomers: 0,
            importedAddresses: 0
        }
    };

    await ensureSchema();
    step = 'schema_ready';
    process.stdout.write('[import] step: ' + step + '\n');
    await insertRun(args.tenant, runState);
    step = 'run_started';
    process.stdout.write('[import] step: ' + step + '\n');

    try {
        const treatmentRows = csvToObjects(csvPaths.treatments);
        const typeRows = csvToObjects(csvPaths.types);
        const sourceRows = csvToObjects(csvPaths.sources);
        const documentRows = csvToObjects(csvPaths.documents);
        const clientRows = csvToObjects(csvPaths.clients);
        const addressRows = csvToObjects(csvPaths.addresses);

        const lookupSets = {
            treatments: new Set(treatmentRows.map((row) => toText(row.idtratamientocliente)).filter(Boolean)),
            types: new Set(typeRows.map((row) => toText(row.idtipocliente)).filter(Boolean)),
            sources: new Set(sourceRows.map((row) => toText(row.idfuentecliente)).filter(Boolean)),
            documents: new Set(documentRows.map((row) => toText(row.iddocumentoidentidad)).filter(Boolean))
        };

        const dbLookupSets = {
            treatments: await loadLookupSet('global_customer_treatments'),
            types: await loadLookupSet('global_customer_types'),
            sources: await loadLookupSet('global_acquisition_sources'),
            documents: await loadLookupSet('global_document_types')
        };

        runState.totalRows = clientRows.length + addressRows.length;
        await insertRun(args.tenant, runState);

        const erpCustomerMap = new Map();

        for (const row of clientRows) {
            const rowNumber = Number(row.__rowNumber || 0);
            try {
                const result = await upsertCustomer(args.tenant, row, {
                    treatments: new Set([...lookupSets.treatments].filter((id) => dbLookupSets.treatments.has(id))),
                    types: new Set([...lookupSets.types].filter((id) => dbLookupSets.types.has(id))),
                    sources: new Set([...lookupSets.sources].filter((id) => dbLookupSets.sources.has(id))),
                    documents: new Set([...lookupSets.documents].filter((id) => dbLookupSets.documents.has(id)))
                }, { moduleId: args.moduleId });

                if (result.status === 'inserted') runState.insertedRows += 1;
                else if (result.status === 'updated') runState.updatedRows += 1;
                else runState.skippedRows += 1;

                if (result.customerId && result.erpClientId) {
                    erpCustomerMap.set(result.erpClientId, result.customerId);
                }
            } catch (err) {
                runState.errorRows += 1;
                await insertRowError(args.tenant, runState.runId, {
                    rowNumber,
                    customerId: toText(row.idcliente) || null,
                    phoneE164: normalizePhone(row.telefono || ''),
                    errorCode: 'CLIENT_UPSERT_FAILED',
                    errorMessage: String(err?.message || err || 'Error en cliente'),
                    rawData: row,
                    context: { source: 'TbClientes' }
                });
            }
        }

        for (const row of addressRows) {
            const rowNumber = Number(row.__rowNumber || 0);
            try {
                const erpClientId = toText(row.idcliente);
                let customerId = erpCustomerMap.get(erpClientId) || null;
                if (!customerId && erpClientId) {
                    customerId = await findCustomerByErpId(args.tenant, erpClientId);
                }
                if (!customerId) {
                    runState.skippedRows += 1;
                    await insertRowError(args.tenant, runState.runId, {
                        rowNumber,
                        customerId: erpClientId || null,
                        phoneE164: null,
                        errorCode: 'ADDRESS_CUSTOMER_NOT_FOUND',
                        errorMessage: 'No se encontro customer_id para la direccion.',
                        rawData: row,
                        context: { source: 'TbDirecciones' }
                    });
                    continue;
                }

                const result = await upsertAddress(args.tenant, row, customerId);
                if (result.status === 'upserted') {
                    runState.summary.importedAddresses += 1;
                } else {
                    runState.skippedRows += 1;
                }
            } catch (error) {
                runState.errorRows += 1;
                await insertRowError(args.tenant, runState.runId, {
                    rowNumber,
                    customerId: toText(row.idcliente) || null,
                    phoneE164: null,
                    errorCode: 'ADDRESS_UPSERT_FAILED',
                    errorMessage: String(error?.message || error || 'Error en direccion'),
                    rawData: row,
                    context: { source: 'TbDirecciones' }
                });
            }
        }

        runState.summary.importedCustomers = runState.insertedRows + runState.updatedRows;
        runState.status = 'completed';
        runState.finishedAt = new Date().toISOString();
        await updateRun(args.tenant, runState);

        process.stdout.write(`${JSON.stringify({
            ok: true,
            tenantId: args.tenant,
            runId: runState.runId,
            total: runState.totalRows,
            imported: runState.insertedRows + runState.updatedRows,
            inserted: runState.insertedRows,
            updated: runState.updatedRows,
            skipped: runState.skippedRows,
            failed: runState.errorRows
        }, null, 2)}\n`);
    } catch (error) {
        runState.status = 'failed';
        runState.finishedAt = new Date().toISOString();
        runState.errorRows += 1;
        await insertRowError(args.tenant, runState.runId, {
            rowNumber: null,
            customerId: null,
            phoneE164: null,
            errorCode: 'IMPORT_FATAL',
            errorMessage: String(error?.message || error || 'Fatal import error'),
            rawData: {},
            context: { stage: 'main' }
        }).catch(() => {});
        await updateRun(args.tenant, runState).catch(() => {});
        throw error;
    }
}

main().catch((error) => {
    process.stderr.write(`[import-erp-customers] ${String(error?.stack || error?.message || error)}\n`);
    process.exitCode = 1;
});
