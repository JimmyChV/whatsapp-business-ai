const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

async function getAppliedMigrations(pool) {
    const result = await pool.query(`
        SELECT filename FROM schema_migrations
        ORDER BY filename ASC
    `);
    return new Set(result.rows.map((row) => row.filename));
}

async function hasExistingApplicationSchema(pool) {
    const result = await pool.query(`
        SELECT
            to_regclass('public.tenants') AS tenants_table,
            to_regclass('public.tenant_customers') AS customers_table,
            to_regclass('public.tenant_messages') AS messages_table
    `);
    const row = result.rows?.[0] || {};
    return Boolean(row.tenants_table || row.customers_table || row.messages_table);
}

function splitStatements(sql = '') {
    const statements = [];
    let current = '';
    let dollarTag = '';
    let inSingleQuote = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < sql.length; i += 1) {
        const ch = sql[i];
        const next = sql[i + 1] || '';

        if (inLineComment) {
            current += ch;
            if (ch === '\n') inLineComment = false;
            continue;
        }

        if (inBlockComment) {
            current += ch;
            if (ch === '*' && next === '/') {
                current += next;
                i += 1;
                inBlockComment = false;
            }
            continue;
        }

        if (!inSingleQuote && !dollarTag && ch === '-' && next === '-') {
            current += ch + next;
            i += 1;
            inLineComment = true;
            continue;
        }

        if (!inSingleQuote && !dollarTag && ch === '/' && next === '*') {
            current += ch + next;
            i += 1;
            inBlockComment = true;
            continue;
        }

        if (!inSingleQuote && ch === '$') {
            const rest = sql.slice(i);
            const match = rest.match(/^\$[A-Za-z0-9_]*\$/);
            if (match) {
                const tag = match[0];
                if (!dollarTag) {
                    dollarTag = tag;
                } else if (dollarTag === tag) {
                    dollarTag = '';
                }
                current += tag;
                i += tag.length - 1;
                continue;
            }
        }

        if (!dollarTag && ch === "'") {
            current += ch;
            if (inSingleQuote && next === "'") {
                current += next;
                i += 1;
                continue;
            }
            inSingleQuote = !inSingleQuote;
            continue;
        }

        if (ch === ';' && !dollarTag && !inSingleQuote) {
            const statement = current.trim();
            if (statement) statements.push(statement);
            current = '';
            continue;
        }

        current += ch;
    }

    const last = current.trim();
    if (last) statements.push(last);
    return statements;
}

function listMigrationFiles() {
    return fs.readdirSync(MIGRATIONS_DIR)
        .filter((file) => file.endsWith('.sql'))
        .sort();
}

async function markMigrationsApplied(pool, files = []) {
    for (const file of files) {
        await pool.query(
            `INSERT INTO schema_migrations (filename)
             VALUES ($1)
             ON CONFLICT DO NOTHING`,
            [file]
        );
    }
}

async function runMigrations(pool) {
    if (!pool || typeof pool.query !== 'function') {
        throw new Error('runMigrations requiere un pool postgres valido.');
    }

    await ensureMigrationsTable(pool);
    const applied = await getAppliedMigrations(pool);
    const files = listMigrationFiles();

    if (applied.size === 0 && files.length > 10 && await hasExistingApplicationSchema(pool)) {
        console.log('[migrations] existing db - marking all as applied');
        await markMigrationsApplied(pool, files);
        console.log(`[migrations] marked ${files.length} files as applied`);
        return 0;
    }

    let ran = 0;
    for (const file of files) {
        if (applied.has(file)) continue;

        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        const statements = splitStatements(sql).filter((statement) => statement.length > 0);

        for (const statement of statements) {
            await pool.query(statement);
        }

        await pool.query(
            `INSERT INTO schema_migrations (filename)
             VALUES ($1)
             ON CONFLICT DO NOTHING`,
            [file]
        );
        ran += 1;
        console.log(`[migrations] applied: ${file}`);
    }

    if (ran === 0) {
        console.log('[migrations] all up to date');
    }
    return ran;
}

module.exports = { runMigrations };
