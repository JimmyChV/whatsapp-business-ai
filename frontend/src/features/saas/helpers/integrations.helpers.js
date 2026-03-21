const CATALOG_MODE_OPTIONS = ['hybrid', 'meta_only', 'woo_only', 'local_only'];

export const EMPTY_INTEGRATIONS_FORM = {
    catalogMode: 'hybrid',
    metaEnabled: true,
    wooEnabled: true,
    wooBaseUrl: '',
    wooPerPage: 100,
    wooMaxPages: 10,
    wooIncludeOutOfStock: true,
    wooConsumerKey: '',
    wooConsumerSecret: '',
    wooConsumerKeyMasked: '',
    wooConsumerSecretMasked: '',
    localEnabled: true,
    aiProvider: 'openai',
    aiModel: 'gpt-4o-mini',
    openaiApiKey: '',
    openaiApiKeyMasked: ''
};

export function normalizeIntegrationsPayload(integrations = {}) {
    const source = integrations && typeof integrations === 'object' ? integrations : {};
    const catalog = source.catalog && typeof source.catalog === 'object' ? source.catalog : {};
    const providers = catalog.providers && typeof catalog.providers === 'object' ? catalog.providers : {};
    const woo = providers.woocommerce && typeof providers.woocommerce === 'object' ? providers.woocommerce : {};
    const ai = source.ai && typeof source.ai === 'object' ? source.ai : {};

    return {
        catalogMode: CATALOG_MODE_OPTIONS.includes(String(catalog.mode || '').trim())
            ? String(catalog.mode || '').trim()
            : 'hybrid',
        metaEnabled: providers?.meta?.enabled !== false,
        wooEnabled: woo.enabled !== false,
        wooBaseUrl: String(woo.baseUrl || '').trim(),
        wooPerPage: Number(woo.perPage || 100) || 100,
        wooMaxPages: Number(woo.maxPages || 10) || 10,
        wooIncludeOutOfStock: woo.includeOutOfStock !== false,
        wooConsumerKey: '',
        wooConsumerSecret: '',
        wooConsumerKeyMasked: String(woo.consumerKeyMasked || '').trim(),
        wooConsumerSecretMasked: String(woo.consumerSecretMasked || '').trim(),
        localEnabled: providers?.local?.enabled !== false,
        aiProvider: String(ai.provider || 'openai').trim() || 'openai',
        aiModel: String(ai.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
        openaiApiKey: '',
        openaiApiKeyMasked: String(ai.openAiApiKeyMasked || '').trim()
    };
}

export function buildIntegrationsUpdatePayload(form = {}) {
    const source = form && typeof form === 'object' ? form : {};
    const payload = {
        catalog: {
            mode: CATALOG_MODE_OPTIONS.includes(String(source.catalogMode || '').trim())
                ? String(source.catalogMode || '').trim()
                : 'hybrid',
            providers: {
                meta: {
                    enabled: source.metaEnabled !== false
                },
                woocommerce: {
                    enabled: source.wooEnabled !== false,
                    baseUrl: String(source.wooBaseUrl || '').trim() || null,
                    perPage: Math.max(10, Math.min(500, Number(source.wooPerPage || 100) || 100)),
                    maxPages: Math.max(1, Math.min(200, Number(source.wooMaxPages || 10) || 10)),
                    includeOutOfStock: source.wooIncludeOutOfStock !== false
                },
                local: {
                    enabled: source.localEnabled !== false
                }
            }
        },
        ai: {
            provider: String(source.aiProvider || 'openai').trim() || 'openai',
            model: String(source.aiModel || 'gpt-4o-mini').trim() || 'gpt-4o-mini'
        }
    };

    const wooConsumerKey = String(source.wooConsumerKey || '').trim();
    const wooConsumerSecret = String(source.wooConsumerSecret || '').trim();
    const openaiApiKey = String(source.openaiApiKey || '').trim();

    if (wooConsumerKey) payload.catalog.providers.woocommerce.consumerKey = wooConsumerKey;
    if (wooConsumerSecret) payload.catalog.providers.woocommerce.consumerSecret = wooConsumerSecret;
    if (openaiApiKey) payload.ai.openaiApiKey = openaiApiKey;

    return payload;
}

