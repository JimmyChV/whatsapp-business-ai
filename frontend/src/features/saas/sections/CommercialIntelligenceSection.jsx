import React from 'react';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';

const text = (value) => String(value ?? '').trim();
const toArray = (value) => (Array.isArray(value) ? value : []);
const ROLE_OPTIONS = [
    { value: 'core', label: 'Principal' },
    { value: 'complement', label: 'Complemento' },
    { value: 'economic', label: 'Economico' },
    { value: 'premium', label: 'Premium' },
    { value: 'kit', label: 'Kit' }
];
const MAP_TO_TYPE_OPTIONS = [
    { value: 'category', label: 'Categoria' },
    { value: 'product', label: 'Producto' },
    { value: 'need', label: 'Necesidad' }
];
const SALES_STYLE_OPTIONS = [
    { value: 'consultivo', label: 'Consultivo' },
    { value: 'directo', label: 'Directo' },
    { value: 'mixto', label: 'Mixto' }
];
const DEFAULT_CONFIG = {
    catalogIds: [],
    brandPositioning: {
        description: '',
        salesStyle: 'consultivo',
        avoid: []
    },
    categories: [],
    synonyms: [],
    productRoles: {},
    playbooks: [],
    offerRules: {
        threeOptions: true,
        economicMinTotal: 90,
        freeShippingThresholdAware: true,
        alwaysAskBeforeQuote: true,
        maxProductsPerProposal: 5
    },
    closingRules: {
        askQuantityIfMissing: true,
        defaultQuantity: 1,
        upsellBeforeQuote: true
    }
};
const EMPTY_PROFILE = {
    profileId: '',
    name: 'Perfil comercial',
    description: '',
    isDefault: false,
    isActive: true,
    config: DEFAULT_CONFIG
};

function clone(value) {
    return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeCatalogIds(value = []) {
    return [...new Set(toArray(value)
        .map((entry) => text(entry).toUpperCase())
        .filter((entry) => /^CAT-[A-Z0-9]{4,}$/.test(entry)))];
}

function normalizeConfig(config = {}) {
    const source = config && typeof config === 'object' ? config : {};
    return {
        catalogIds: normalizeCatalogIds(source.catalogIds || source.catalog_ids),
        brandPositioning: {
            ...DEFAULT_CONFIG.brandPositioning,
            ...(source.brandPositioning || {})
        },
        categories: toArray(source.categories),
        synonyms: toArray(source.synonyms),
        productRoles: source.productRoles && typeof source.productRoles === 'object' ? source.productRoles : {},
        playbooks: toArray(source.playbooks),
        offerRules: {
            ...DEFAULT_CONFIG.offerRules,
            ...(source.offerRules || {})
        },
        closingRules: {
            ...DEFAULT_CONFIG.closingRules,
            ...(source.closingRules || {})
        }
    };
}

function normalizeProfile(profile = {}) {
    const source = profile && typeof profile === 'object' ? profile : {};
    return {
        ...EMPTY_PROFILE,
        ...source,
        profileId: text(source.profileId || source.profile_id),
        name: text(source.name) || 'Perfil comercial',
        description: text(source.description),
        isDefault: source.isDefault === true || source.is_default === true,
        isActive: source.isActive !== false && source.is_active !== false,
        config: normalizeConfig(source.config)
    };
}

function makeCategoryId(name = '') {
    return text(name)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
}

function normalizeWooCategoryForProfile(entry = null) {
    const source = entry && typeof entry === 'object' ? entry : null;
    const name = source
        ? text(source.name || source.label || source.slug || source.id)
        : text(entry);
    if (!name) return null;
    return {
        id: makeCategoryId(source?.slug || source?.id || name),
        name,
        description: '',
        benefits: [],
        discoveryQuestions: []
    };
}

function deriveWooCategoriesFromCatalog(items = []) {
    const categories = new Map();
    toArray(items).forEach((item) => {
        toArray(item?.wooCategories).forEach((entry) => {
            const category = normalizeWooCategoryForProfile(entry);
            if (!category || categories.has(category.id)) return;
            categories.set(category.id, category);
        });
    });
    return Array.from(categories.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function uniqueList(items = []) {
    return [...new Set(toArray(items).map((item) => text(item)).filter(Boolean))];
}

function numberValue(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function optionLabel(options = [], value = '', fallback = '') {
    const clean = text(value);
    return options.find((option) => option.value === clean)?.label || fallback || clean;
}

function categoryKey(category = {}, index = 0) {
    return text(category.id || category.name || `category_${index}`);
}

function ChipsEditor({ values = [], placeholder = 'Agregar item', disabled = false, onChange }) {
    const [draft, setDraft] = React.useState('');
    const addDraft = React.useCallback(() => {
        const clean = text(draft);
        if (!clean) return;
        onChange?.(uniqueList([...values, clean]));
        setDraft('');
    }, [draft, onChange, values]);
    return (
        <div className="saas-campaigns-filter-chips">
            {toArray(values).map((value) => (
                <button
                    key={`chip_${value}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange?.(toArray(values).filter((entry) => entry !== value))}
                    title="Quitar"
                >
                    <strong>{value}</strong>
                    <span>x</span>
                </button>
            ))}
            <input
                className="saas-input"
                value={draft}
                placeholder={placeholder}
                disabled={disabled}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    addDraft();
                }}
            />
        </div>
    );
}

function Toggle({ checked = false, label = '', disabled = false, onChange }) {
    return (
        <label className="saas-admin-module-toggle">
            <input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={(event) => onChange?.(event.target.checked)} />
            <span>{label}</span>
        </label>
    );
}

function CommercialIntelligenceSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        isCommercialIntelligenceSection,
        settingsTenantId,
        busy,
        requestJson,
        runAction,
        activeCatalogOptions = []
    } = context;
    const { notify } = useUiFeedback();
    const [profiles, setProfiles] = React.useState([]);
    const [selectedProfileId, setSelectedProfileId] = React.useState('');
    const [profileDraft, setProfileDraft] = React.useState(() => clone(EMPTY_PROFILE));
    const [catalogItems, setCatalogItems] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [activeTab, setActiveTab] = React.useState('profile');
    const [catalogSearch, setCatalogSearch] = React.useState('');
    const [synonymSearch, setSynonymSearch] = React.useState('');
    const [catalogPage, setCatalogPage] = React.useState(1);
    const [suggestionSku, setSuggestionSku] = React.useState('');
    const [expandedCategories, setExpandedCategories] = React.useState(() => new Set());
    const [expandedCatalogItems, setExpandedCatalogItems] = React.useState(() => new Set());
    const seededCategoryProfileRef = React.useRef('');
    const canEdit = Boolean(settingsTenantId && requestJson);

    const selectedProfile = React.useMemo(
        () => profiles.find((profile) => profile.profileId === selectedProfileId) || null,
        [profiles, selectedProfileId]
    );

    const wooCategorySuggestions = React.useMemo(
        () => deriveWooCategoriesFromCatalog(catalogItems),
        [catalogItems]
    );

    const categories = React.useMemo(
        () => toArray(profileDraft?.config?.categories),
        [profileDraft]
    );

    const selectedCatalogIds = React.useMemo(
        () => normalizeCatalogIds(profileDraft?.config?.catalogIds),
        [profileDraft]
    );

    const commercialCatalogOptions = React.useMemo(
        () => toArray(activeCatalogOptions)
            .map((catalog) => ({
                catalogId: text(catalog?.catalogId || catalog?.id).toUpperCase(),
                name: text(catalog?.name || catalog?.label || catalog?.catalogId || catalog?.id)
            }))
            .filter((catalog) => /^CAT-[A-Z0-9]{4,}$/.test(catalog.catalogId)),
        [activeCatalogOptions]
    );

    const productRoles = React.useMemo(
        () => profileDraft?.config?.productRoles && typeof profileDraft.config.productRoles === 'object'
            ? profileDraft.config.productRoles
            : {},
        [profileDraft]
    );

    const categoryNamesById = React.useMemo(() => {
        const map = new Map();
        categories.forEach((category, index) => {
            const id = category.id || makeCategoryId(category.name) || categoryKey(category, index);
            map.set(id, category.name || id);
        });
        return map;
    }, [categories]);

    const loadProfiles = React.useCallback(async () => {
        if (!settingsTenantId || !requestJson) {
            setProfiles([]);
            setSelectedProfileId('');
            setProfileDraft(clone(EMPTY_PROFILE));
            return;
        }
        setLoading(true);
        try {
            const payload = await requestJson('/api/tenant/commercial-intelligence/profiles', {
                tenantIdOverride: settingsTenantId
            });
            const items = toArray(payload?.profiles).map(normalizeProfile);
            setProfiles(items);
            setSelectedProfileId((prev) => {
                if (prev && items.some((profile) => profile.profileId === prev)) return prev;
                return items[0]?.profileId || '';
            });
        } catch (error) {
            notify({ type: 'error', message: String(error?.message || 'No se pudieron cargar perfiles comerciales.') });
        } finally {
            setLoading(false);
        }
    }, [notify, requestJson, settingsTenantId]);

    const loadCatalog = React.useCallback(async (profileId = selectedProfileId) => {
        if (!settingsTenantId || !requestJson) {
            setCatalogItems([]);
            return;
        }
        try {
            const query = profileId ? `?profileId=${encodeURIComponent(profileId)}` : '';
            const payload = await requestJson(`/api/tenant/commercial-intelligence/catalog-enrichment${query}`, {
                tenantIdOverride: settingsTenantId
            });
            setCatalogItems(toArray(payload?.items));
        } catch (error) {
            notify({ type: 'error', message: String(error?.message || 'No se pudo cargar el catalogo comercial.') });
        }
    }, [notify, requestJson, selectedProfileId, settingsTenantId]);

    React.useEffect(() => {
        if (!isCommercialIntelligenceSection) return;
        void loadProfiles();
    }, [isCommercialIntelligenceSection, loadProfiles]);

    React.useEffect(() => {
        setProfileDraft(selectedProfile ? clone(selectedProfile) : clone(EMPTY_PROFILE));
    }, [selectedProfile]);

    React.useEffect(() => {
        if (!isCommercialIntelligenceSection || !selectedProfileId) return;
        void loadCatalog(selectedProfileId);
    }, [isCommercialIntelligenceSection, loadCatalog, selectedProfileId]);

    React.useEffect(() => {
        if (!selectedProfileId || wooCategorySuggestions.length === 0) return;
        const seedKey = `${selectedProfileId}:${wooCategorySuggestions.map((category) => category.id).join('|')}`;
        if (seededCategoryProfileRef.current === seedKey) return;
        setProfileDraft((prev) => {
            const current = normalizeProfile(prev);
            if (toArray(current.config.categories).length > 0) return prev;
            seededCategoryProfileRef.current = seedKey;
            return {
                ...current,
                config: {
                    ...current.config,
                    categories: wooCategorySuggestions
                }
            };
        });
    }, [selectedProfileId, wooCategorySuggestions]);

    React.useEffect(() => {
        setCatalogPage(1);
    }, [catalogSearch, selectedProfileId]);

    React.useEffect(() => {
        setExpandedCatalogItems(new Set());
    }, [catalogPage, catalogSearch, selectedProfileId]);

    const updateConfigSection = React.useCallback((section, updater) => {
        setProfileDraft((prev) => {
            const current = normalizeProfile(prev);
            const nextValue = typeof updater === 'function'
                ? updater(current.config?.[section])
                : updater;
            return {
                ...current,
                config: {
                    ...current.config,
                    [section]: nextValue
                }
            };
        });
    }, []);

    const toggleCategoryExpanded = React.useCallback((key) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const toggleCatalogExpanded = React.useCallback((sku) => {
        setExpandedCatalogItems((prev) => {
            const next = new Set(prev);
            if (next.has(sku)) next.delete(sku);
            else next.add(sku);
            return next;
        });
    }, []);

    const saveWholeProfile = React.useCallback((message = 'Perfil comercial guardado.') => {
        if (!canEdit) return undefined;
        return runAction?.(message, async () => {
            const payload = normalizeProfile(profileDraft);
            const result = await requestJson(`/api/tenant/commercial-intelligence/profiles/${encodeURIComponent(payload.profileId)}`, {
                method: 'PUT',
                body: payload,
                tenantIdOverride: settingsTenantId
            });
            const saved = normalizeProfile(result?.profile);
            setProfiles((prev) => {
                const next = toArray(prev).filter((profile) => profile.profileId !== saved.profileId);
                return [...next, saved].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
            });
            setSelectedProfileId(saved.profileId);
            await loadCatalog(saved.profileId);
            notify({ type: 'info', message });
        });
    }, [canEdit, loadCatalog, notify, profileDraft, requestJson, runAction, settingsTenantId]);

    const saveSection = React.useCallback((section, data, message = 'Cambios guardados.') => {
        if (!canEdit || !selectedProfileId) return undefined;
        return runAction?.(message, async () => {
            const result = await requestJson(`/api/tenant/commercial-intelligence/profiles/${encodeURIComponent(selectedProfileId)}/section`, {
                method: 'PATCH',
                body: { section, data },
                tenantIdOverride: settingsTenantId
            });
            const saved = normalizeProfile(result?.profile);
            setProfiles((prev) => toArray(prev).map((profile) => (profile.profileId === saved.profileId ? saved : profile)));
            setProfileDraft(saved);
            if (section === 'productRoles' || section === 'catalogIds') await loadCatalog(saved.profileId);
            notify({ type: 'info', message });
        });
    }, [canEdit, loadCatalog, notify, requestJson, runAction, selectedProfileId, settingsTenantId]);

    const saveRules = React.useCallback(() => {
        if (!canEdit || !selectedProfileId) return undefined;
        const offerRules = profileDraft.config?.offerRules || DEFAULT_CONFIG.offerRules;
        const closingRules = profileDraft.config?.closingRules || DEFAULT_CONFIG.closingRules;
        return runAction?.('Reglas comerciales guardadas.', async () => {
            const offerResult = await requestJson(`/api/tenant/commercial-intelligence/profiles/${encodeURIComponent(selectedProfileId)}/section`, {
                method: 'PATCH',
                body: { section: 'offerRules', data: offerRules },
                tenantIdOverride: settingsTenantId
            });
            const closingResult = await requestJson(`/api/tenant/commercial-intelligence/profiles/${encodeURIComponent(selectedProfileId)}/section`, {
                method: 'PATCH',
                body: { section: 'closingRules', data: closingRules },
                tenantIdOverride: settingsTenantId
            });
            const saved = normalizeProfile(closingResult?.profile || offerResult?.profile);
            setProfiles((prev) => toArray(prev).map((profile) => (profile.profileId === saved.profileId ? saved : profile)));
            setProfileDraft(saved);
            notify({ type: 'info', message: 'Reglas comerciales guardadas.' });
        });
    }, [canEdit, notify, profileDraft, requestJson, runAction, selectedProfileId, settingsTenantId]);

    const createProfile = React.useCallback(() => {
        if (!canEdit) return undefined;
        return runAction?.('Perfil comercial creado.', async () => {
            const result = await requestJson('/api/tenant/commercial-intelligence/profiles', {
                method: 'POST',
                tenantIdOverride: settingsTenantId,
                body: {
                    name: 'Nuevo perfil comercial',
                    description: '',
                    isDefault: profiles.length === 0,
                    isActive: true,
                    config: {
                        ...clone(DEFAULT_CONFIG),
                        catalogIds: commercialCatalogOptions.length === 1
                            ? [commercialCatalogOptions[0].catalogId]
                            : []
                    }
                }
            });
            const saved = normalizeProfile(result?.profile);
            setProfiles((prev) => [...toArray(prev), saved]);
            setSelectedProfileId(saved.profileId);
            setActiveTab('profile');
            notify({ type: 'info', message: 'Perfil comercial creado.' });
        });
    }, [canEdit, commercialCatalogOptions, notify, profiles.length, requestJson, runAction, settingsTenantId]);

    const duplicateProfile = React.useCallback(() => {
        if (!canEdit || !selectedProfile) return undefined;
        return runAction?.('Perfil duplicado.', async () => {
            const result = await requestJson('/api/tenant/commercial-intelligence/profiles', {
                method: 'POST',
                tenantIdOverride: settingsTenantId,
                body: {
                    name: `${selectedProfile.name} copia`,
                    description: selectedProfile.description,
                    isDefault: false,
                    isActive: true,
                    config: clone(selectedProfile.config)
                }
            });
            const saved = normalizeProfile(result?.profile);
            setProfiles((prev) => [...toArray(prev), saved]);
            setSelectedProfileId(saved.profileId);
            notify({ type: 'info', message: 'Perfil duplicado.' });
        });
    }, [canEdit, notify, requestJson, runAction, selectedProfile, settingsTenantId]);

    const deleteProfile = React.useCallback(() => {
        if (!canEdit || !selectedProfileId) return undefined;
        return runAction?.('Perfil eliminado.', async () => {
            await requestJson(`/api/tenant/commercial-intelligence/profiles/${encodeURIComponent(selectedProfileId)}`, {
                method: 'DELETE',
                tenantIdOverride: settingsTenantId
            });
            await loadProfiles();
            notify({ type: 'warn', message: 'Perfil comercial eliminado.' });
        });
    }, [canEdit, loadProfiles, notify, requestJson, runAction, selectedProfileId, settingsTenantId]);

    const setProductRole = React.useCallback((sku, patch = {}) => {
        const cleanSku = text(sku).toUpperCase();
        if (!cleanSku) return;
        updateConfigSection('productRoles', (current) => ({
            ...(current && typeof current === 'object' ? current : {}),
            [cleanSku]: {
                category: '',
                role: 'core',
                priority: 50,
                rotationRank: null,
                tags: [],
                complements: [],
                substituteSkus: [],
                ...((current && typeof current === 'object' ? current[cleanSku] : null) || {}),
                ...patch
            }
        }));
    }, [updateConfigSection]);

    const filteredCatalog = React.useMemo(() => {
        const query = text(catalogSearch).toLowerCase();
        if (!query) return catalogItems;
        return catalogItems.filter((item) => [
            item.itemId,
            item.title,
            ...(toArray(item.wooTags)),
            ...(toArray(item.wooCategories).map((entry) => entry?.name || entry?.slug || ''))
        ].some((value) => text(value).toLowerCase().includes(query)));
    }, [catalogItems, catalogSearch]);

    const totalCatalogPages = Math.max(1, Math.ceil(filteredCatalog.length / 20));
    const catalogPageItems = filteredCatalog.slice((catalogPage - 1) * 20, catalogPage * 20);
    const suggestionItem = catalogItems.find((item) => item.itemId === suggestionSku) || null;
    const allCategoriesExpanded = categories.length > 0 && categories.every((category, index) => expandedCategories.has(categoryKey(category, index)));
    const allCatalogPageExpanded = catalogPageItems.length > 0 && catalogPageItems.every((item) => expandedCatalogItems.has(text(item.itemId).toUpperCase()));

    const renderProfileTab = () => {
        const brand = profileDraft.config?.brandPositioning || DEFAULT_CONFIG.brandPositioning;
        return (
            <div className="saas-admin-related-block">
                <h4>Perfil</h4>
                <div className="saas-admin-form-row">
                    <input className="saas-input" value={profileDraft.name || ''} disabled={!canEdit || busy} placeholder="Nombre del perfil" onChange={(event) => setProfileDraft((prev) => ({ ...prev, name: event.target.value }))} />
                    <select className="saas-input" value={brand.salesStyle || 'consultivo'} disabled={!canEdit || busy} onChange={(event) => updateConfigSection('brandPositioning', { ...brand, salesStyle: event.target.value })}>
                        {SALES_STYLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                </div>
                <div className="saas-admin-form-row">
                    <textarea className="saas-input" rows={2} value={profileDraft.description || ''} disabled={!canEdit || busy} placeholder="Descripcion interna del perfil" onChange={(event) => setProfileDraft((prev) => ({ ...prev, description: event.target.value }))} />
                </div>
                <div className="saas-admin-form-row">
                    <textarea className="saas-input" rows={4} value={brand.description || ''} disabled={!canEdit || busy} placeholder="Posicionamiento de marca" onChange={(event) => updateConfigSection('brandPositioning', { ...brand, description: event.target.value })} />
                </div>
                <div className="saas-admin-related-block">
                    <h4>Frases a evitar</h4>
                    <ChipsEditor values={brand.avoid || []} disabled={!canEdit || busy} placeholder="Agregar frase y Enter" onChange={(values) => updateConfigSection('brandPositioning', { ...brand, avoid: values })} />
                </div>
                <div className="saas-admin-related-block">
                    <h4>Catalogos que usa este perfil</h4>
                    <small>Estos catalogos alimentan las categorias, productos, reglas comerciales y respuestas de Patty cuando un modulo usa este perfil.</small>
                    {commercialCatalogOptions.length === 0 ? (
                        <div className="saas-admin-empty-inline">No hay catalogos activos disponibles. Crea o activa uno en Catalogos.</div>
                    ) : (
                        <div className="saas-admin-modules">
                            {commercialCatalogOptions.map((catalog) => {
                                const checked = selectedCatalogIds.includes(catalog.catalogId);
                                return (
                                    <label key={`commercial_profile_catalog_${catalog.catalogId}`} className="saas-admin-module-toggle">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={!canEdit || busy}
                                            onChange={() => updateConfigSection('catalogIds', (current) => {
                                                const set = new Set(normalizeCatalogIds(current));
                                                if (set.has(catalog.catalogId)) set.delete(catalog.catalogId);
                                                else set.add(catalog.catalogId);
                                                return Array.from(set).sort((left, right) => left.localeCompare(right, 'es'));
                                            })}
                                        />
                                        <span>{catalog.name || catalog.catalogId}</span>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                    {selectedCatalogIds.length === 0 ? (
                        <div className="saas-admin-empty-inline">Sin catalogos seleccionados: se mantiene compatibilidad con todos los productos hasta que guardes una seleccion.</div>
                    ) : (
                        <div className="saas-admin-empty-inline">{selectedCatalogIds.length} catalogo(s) seleccionados. Guarda el perfil para aplicar el filtro al catalogo comercial.</div>
                    )}
                </div>
                <div className="saas-admin-modules">
                    <Toggle checked={profileDraft.isDefault} disabled={!canEdit || busy} label="Perfil por defecto" onChange={(checked) => setProfileDraft((prev) => ({ ...prev, isDefault: checked }))} />
                    <Toggle checked={profileDraft.isActive !== false} disabled={!canEdit || busy} label="Activo" onChange={(checked) => setProfileDraft((prev) => ({ ...prev, isActive: checked }))} />
                </div>
                <div className="saas-admin-form-row saas-admin-form-row--actions">
                    <button type="button" disabled={!canEdit || busy || !text(profileDraft.name) || !selectedProfileId} onClick={() => saveWholeProfile('Perfil comercial guardado.')}>Guardar</button>
                    <button type="button" className="danger" disabled={!canEdit || busy || !selectedProfileId} onClick={deleteProfile}>Eliminar</button>
                </div>
            </div>
        );
    };

    const renderCategoriesTab = () => (
        <div className="saas-admin-related-block">
            <div className="saas-commercial-section-head">
                <div>
                    <h4>Categorias comerciales</h4>
                    <small>{categories.length} categorias configurables</small>
                </div>
                <button
                    type="button"
                    disabled={categories.length === 0 || busy}
                    onClick={() => setExpandedCategories(allCategoriesExpanded ? new Set() : new Set(categories.map(categoryKey)))}
                >
                    {allCategoriesExpanded ? 'Contraer todo' : 'Expandir todo'}
                </button>
            </div>
            {wooCategorySuggestions.length > 0 ? (
                <div className="saas-admin-empty-inline">
                    Detectamos {wooCategorySuggestions.length} categorias desde WooCommerce. Puedes ajustarlas aqui y guardar para convertirlas en categorias comerciales.
                </div>
            ) : null}
            {categories.length === 0 ? <div className="saas-admin-empty-inline">Aun no hay categorias comerciales. Si WooCommerce tiene categorias, recarga el catalogo comercial para traerlas.</div> : null}
            {categories.map((category, index) => {
                const key = categoryKey(category, index);
                const expanded = expandedCategories.has(key);
                const benefits = toArray(category.benefits);
                const discoveryQuestions = toArray(category.discoveryQuestions);
                return (
                    <div key={`category_${key}_${index}`} className="saas-admin-related-block saas-commercial-accordion-card">
                        <button
                            type="button"
                            className="saas-commercial-accordion-toggle"
                            aria-expanded={expanded}
                            onClick={() => toggleCategoryExpanded(key)}
                        >
                            <span>
                                <strong>{category.name || 'Categoria sin nombre'}</strong>
                                <small>{category.id || 'Sin ID'} - {benefits.length} beneficios - {discoveryQuestions.length} preguntas</small>
                            </span>
                            <em>{expanded ? 'Ocultar' : 'Editar'}</em>
                        </button>
                        {expanded ? (
                            <div className="saas-commercial-accordion-body">
                                <div className="saas-admin-form-row">
                                    <input className="saas-input" value={category.name || ''} disabled={!canEdit || busy} placeholder="Nombre" onChange={(event) => updateConfigSection('categories', (items) => toArray(items).map((entry, itemIndex) => (itemIndex === index ? { ...entry, name: event.target.value, id: entry.id || makeCategoryId(event.target.value) } : entry)))} />
                                    <input className="saas-input" value={category.id || ''} disabled={!canEdit || busy} placeholder="ID" onChange={(event) => updateConfigSection('categories', (items) => toArray(items).map((entry, itemIndex) => (itemIndex === index ? { ...entry, id: makeCategoryId(event.target.value) } : entry)))} />
                                </div>
                                <div className="saas-admin-form-row">
                                    <textarea className="saas-input" rows={2} value={category.description || ''} disabled={!canEdit || busy} placeholder="Descripcion" onChange={(event) => updateConfigSection('categories', (items) => toArray(items).map((entry, itemIndex) => (itemIndex === index ? { ...entry, description: event.target.value } : entry)))} />
                                </div>
                                <h4>Beneficios</h4>
                                <ChipsEditor values={benefits} disabled={!canEdit || busy} placeholder="Beneficio y Enter" onChange={(values) => updateConfigSection('categories', (items) => toArray(items).map((entry, itemIndex) => (itemIndex === index ? { ...entry, benefits: values } : entry)))} />
                                <h4>Preguntas de descubrimiento</h4>
                                <ChipsEditor values={discoveryQuestions} disabled={!canEdit || busy} placeholder="Pregunta y Enter" onChange={(values) => updateConfigSection('categories', (items) => toArray(items).map((entry, itemIndex) => (itemIndex === index ? { ...entry, discoveryQuestions: values } : entry)))} />
                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                    <button type="button" className="danger" disabled={!canEdit || busy} onClick={() => updateConfigSection('categories', (items) => toArray(items).filter((_, itemIndex) => itemIndex !== index))}>Eliminar categoria</button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                );
            })}
            <div className="saas-admin-form-row saas-admin-form-row--actions">
                <button type="button" disabled={!canEdit || busy} onClick={() => updateConfigSection('categories', (items) => [...toArray(items), { id: '', name: '', description: '', benefits: [], discoveryQuestions: [] }])}>+ Agregar categoria</button>
                <button type="button" disabled={!canEdit || busy || wooCategorySuggestions.length === 0} onClick={() => updateConfigSection('categories', wooCategorySuggestions)}>Usar categorias Woo</button>
                <button type="button" disabled={!canEdit || busy || !selectedProfileId} onClick={() => saveSection('categories', categories, 'Categorias guardadas.')}>Guardar</button>
            </div>
        </div>
    );

    const renderSynonymsTab = () => {
        const synonyms = toArray(profileDraft.config?.synonyms);
        const query = text(synonymSearch).toLowerCase();
        const visibleSynonyms = synonyms
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => {
                if (!query) return true;
                return [entry.term, entry.mapsTo, entry.mapsToType].some((value) => text(value).toLowerCase().includes(query));
            });
        return (
            <div className="saas-admin-related-block">
                <h4>Sinonimos y marcas</h4>
                <div className="saas-admin-form-row">
                    <input className="saas-input" value={synonymSearch} disabled={busy} placeholder="Buscar por termino, destino o tipo..." onChange={(event) => setSynonymSearch(event.target.value)} />
                </div>
                {synonyms.length === 0 ? <div className="saas-admin-empty-inline">Agrega terminos como suavitel, ayudin o ace para mapearlos a categorias reales.</div> : null}
                {synonyms.length > 0 && visibleSynonyms.length === 0 ? <div className="saas-admin-empty-inline">Sin coincidencias para la busqueda.</div> : null}
                {visibleSynonyms.map(({ entry, index }) => (
                    <div key={`synonym_${index}`} className="saas-admin-form-row">
                        <input className="saas-input" value={entry.term || ''} disabled={!canEdit || busy} placeholder="Termino del cliente" onChange={(event) => updateConfigSection('synonyms', (items) => toArray(items).map((item, itemIndex) => (itemIndex === index ? { ...item, term: event.target.value } : item)))} />
                        <input className="saas-input" value={entry.mapsTo || ''} disabled={!canEdit || busy} placeholder="Mapea a" onChange={(event) => updateConfigSection('synonyms', (items) => toArray(items).map((item, itemIndex) => (itemIndex === index ? { ...item, mapsTo: event.target.value } : item)))} />
                        <select className="saas-input" value={entry.mapsToType || 'category'} disabled={!canEdit || busy} onChange={(event) => updateConfigSection('synonyms', (items) => toArray(items).map((item, itemIndex) => (itemIndex === index ? { ...item, mapsToType: event.target.value } : item)))}>
                            {MAP_TO_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                        <button type="button" className="danger" disabled={!canEdit || busy} onClick={() => updateConfigSection('synonyms', (items) => toArray(items).filter((_, itemIndex) => itemIndex !== index))}>Eliminar</button>
                    </div>
                ))}
                <div className="saas-admin-form-row saas-admin-form-row--actions">
                    <button type="button" disabled={!canEdit || busy} onClick={() => updateConfigSection('synonyms', (items) => [...toArray(items), { term: '', mapsTo: '', mapsToType: 'category' }])}>+ Agregar sinonimo</button>
                    <button type="button" disabled={!canEdit || busy || !selectedProfileId} onClick={() => saveSection('synonyms', synonyms, 'Sinonimos guardados.')}>Guardar</button>
                </div>
            </div>
        );
    };

    const renderCatalogTab = () => (
        <div className="saas-admin-related-block">
            <div className="saas-commercial-section-head">
                <div>
                    <h4>Catalogo comercial</h4>
                    <small>{filteredCatalog.length} productos encontrados - pagina {catalogPage} de {totalCatalogPages}</small>
                </div>
                <button
                    type="button"
                    disabled={catalogPageItems.length === 0 || busy}
                    onClick={() => {
                        const pageSkus = catalogPageItems.map((item) => text(item.itemId).toUpperCase()).filter(Boolean);
                        setExpandedCatalogItems(allCatalogPageExpanded ? new Set() : new Set(pageSkus));
                    }}
                >
                    {allCatalogPageExpanded ? 'Contraer pagina' : 'Expandir pagina'}
                </button>
            </div>
            <div className="saas-admin-form-row">
                <input className="saas-input" value={catalogSearch} disabled={busy} placeholder="Buscar por nombre, SKU, tag o categoria..." onChange={(event) => setCatalogSearch(event.target.value)} />
                <button type="button" disabled={busy || !selectedProfileId} onClick={() => loadCatalog(selectedProfileId)}>Recargar</button>
            </div>
            {catalogPageItems.map((item) => {
                const sku = text(item.itemId).toUpperCase();
                const role = productRoles[sku] || {};
                const suggestions = uniqueList([...toArray(item.relatedSkus), ...toArray(item.upsellSkus), ...toArray(item.crossSellSkus)]);
                const expanded = expandedCatalogItems.has(sku);
                const categoryLabel = categoryNamesById.get(role.category) || 'Sin categoria comercial';
                const roleLabel = optionLabel(ROLE_OPTIONS, role.role || 'core', 'Principal');
                return (
                    <div key={sku} className="saas-admin-related-block saas-commercial-accordion-card">
                        <div className="saas-commercial-product-summary">
                        <div className="saas-admin-hero saas-admin-hero--compact">
                            <div className="saas-admin-hero-media">
                                {item.imageUrl ? <img className="saas-admin-hero-image" src={item.imageUrl} alt={item.title || sku} /> : <div className="saas-admin-hero-placeholder">{sku.slice(0, 2)}</div>}
                            </div>
                            <div className="saas-admin-hero-content">
                                <h4>{item.title || sku}</h4>
                                <p>{sku} - S/ {item.price || '-'}</p>
                            </div>
                        </div>
                        <div className="saas-commercial-summary-meta">
                            <span>{categoryLabel}</span>
                            <span>{roleLabel}</span>
                            <span>Prioridad {role.priority ?? 50}</span>
                            {Number(role.rotationRank || 0) === 1 ? <span>Alta rotacion</span> : null}
                        </div>
                        <button type="button" disabled={busy} onClick={() => toggleCatalogExpanded(sku)}>{expanded ? 'Ocultar' : 'Editar'}</button>
                        </div>
                        {expanded ? (
                        <div className="saas-commercial-accordion-body">
                        <div className="saas-admin-form-row">
                            <select className="saas-input" value={role.category || ''} disabled={!canEdit || busy} onChange={(event) => setProductRole(sku, { category: event.target.value })}>
                                <option value="">Categoria comercial</option>
                                {categories.map((category) => <option key={category.id || category.name} value={category.id || makeCategoryId(category.name)}>{category.name || category.id}</option>)}
                            </select>
                            <select className="saas-input" value={role.role || 'core'} disabled={!canEdit || busy} onChange={(event) => setProductRole(sku, { role: event.target.value })}>
                                {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                            <input className="saas-input" type="number" min="1" max="100" value={role.priority ?? 50} disabled={!canEdit || busy} placeholder="Prioridad" onChange={(event) => setProductRole(sku, { priority: numberValue(event.target.value, 50) })} />
                            <label className="saas-admin-module-toggle">
                                <input type="checkbox" checked={Number(role.rotationRank || 0) === 1} disabled={!canEdit || busy} onChange={(event) => setProductRole(sku, { rotationRank: event.target.checked ? 1 : null })} />
                                <span>Alta rotacion</span>
                            </label>
                        </div>
                        <div className="saas-admin-form-row">
                            <select className="saas-input" value="" disabled={!canEdit || busy} onChange={(event) => {
                                const value = text(event.target.value).toUpperCase();
                                if (!value) return;
                                setProductRole(sku, { complements: uniqueList([...(role.complements || []), value]) });
                            }}>
                                <option value="">Agregar complemento</option>
                                {catalogItems.filter((candidate) => candidate.itemId !== sku).map((candidate) => <option key={`${sku}_comp_${candidate.itemId}`} value={candidate.itemId}>{candidate.itemId} - {candidate.title}</option>)}
                            </select>
                            {suggestions.length ? (
                                <button type="button" disabled={busy} onClick={() => setSuggestionSku((prev) => (prev === sku ? '' : sku))}>Sugerencias Woo</button>
                            ) : null}
                        </div>
                        <ChipsEditor values={role.complements || []} disabled={!canEdit || busy} placeholder="Complemento SKU y Enter" onChange={(values) => setProductRole(sku, { complements: values.map((entry) => text(entry).toUpperCase()) })} />
                        <ChipsEditor values={role.tags || []} disabled={!canEdit || busy} placeholder="Tag comercial y Enter" onChange={(values) => setProductRole(sku, { tags: values })} />
                        </div>
                        ) : null}
                    </div>
                );
            })}
            {suggestionItem ? (
                <div className="saas-admin-related-block">
                    <h4>Sugerencias Woo para {suggestionItem.itemId}</h4>
                    <p>{uniqueList([...toArray(suggestionItem.relatedSkus), ...toArray(suggestionItem.upsellSkus), ...toArray(suggestionItem.crossSellSkus)]).join(', ') || 'Sin sugerencias disponibles.'}</p>
                    <div className="saas-admin-form-row saas-admin-form-row--actions">
                        <button type="button" disabled={!canEdit || busy} onClick={() => {
                            const sku = text(suggestionItem.itemId).toUpperCase();
                            const role = productRoles[sku] || {};
                            const suggestions = uniqueList([...toArray(suggestionItem.relatedSkus), ...toArray(suggestionItem.upsellSkus), ...toArray(suggestionItem.crossSellSkus)]);
                            setProductRole(sku, { complements: uniqueList([...(role.complements || []), ...suggestions]) });
                            setSuggestionSku('');
                        }}>Aplicar</button>
                        <button type="button" className="saas-btn-cancel" onClick={() => setSuggestionSku('')}>Cerrar</button>
                    </div>
                </div>
            ) : null}
            <div className="saas-admin-form-row saas-admin-form-row--actions">
                <button type="button" disabled={catalogPage <= 1 || busy} onClick={() => setCatalogPage((prev) => Math.max(1, prev - 1))}>Anterior</button>
                <span>Pagina {catalogPage} de {totalCatalogPages}</span>
                <button type="button" disabled={catalogPage >= totalCatalogPages || busy} onClick={() => setCatalogPage((prev) => Math.min(totalCatalogPages, prev + 1))}>Siguiente</button>
                <button type="button" disabled={!canEdit || busy || !selectedProfileId} onClick={() => saveSection('productRoles', productRoles, 'Catalogo comercial guardado.')}>Guardar cambios</button>
            </div>
        </div>
    );

    const renderRulesTab = () => {
        const offer = profileDraft.config?.offerRules || DEFAULT_CONFIG.offerRules;
        const closing = profileDraft.config?.closingRules || DEFAULT_CONFIG.closingRules;
        return (
            <>
                <div className="saas-admin-related-block">
                    <h4>Opciones de venta</h4>
                    <div className="saas-admin-modules">
                        <Toggle checked={offer.threeOptions} disabled={!canEdit || busy} label="Ofrecer 3 opciones al recomendar" onChange={(checked) => updateConfigSection('offerRules', { ...offer, threeOptions: checked })} />
                        <Toggle checked={offer.freeShippingThresholdAware} disabled={!canEdit || busy} label="Considerar umbral de envio gratis" onChange={(checked) => updateConfigSection('offerRules', { ...offer, freeShippingThresholdAware: checked })} />
                        <Toggle checked={offer.alwaysAskBeforeQuote} disabled={!canEdit || busy} label="Siempre preguntar antes de cotizar" onChange={(checked) => updateConfigSection('offerRules', { ...offer, alwaysAskBeforeQuote: checked })} />
                    </div>
                    <div className="saas-admin-form-row">
                        <input className="saas-input" type="number" min="0" value={offer.economicMinTotal ?? 90} disabled={!canEdit || busy} placeholder="Ticket minimo economico" onChange={(event) => updateConfigSection('offerRules', { ...offer, economicMinTotal: numberValue(event.target.value, 90) })} />
                        <input className="saas-input" type="number" min="1" max="10" value={offer.maxProductsPerProposal ?? 5} disabled={!canEdit || busy} placeholder="Max. productos por propuesta" onChange={(event) => updateConfigSection('offerRules', { ...offer, maxProductsPerProposal: numberValue(event.target.value, 5) })} />
                    </div>
                </div>
                <div className="saas-admin-related-block">
                    <h4>Cierre y cotizacion</h4>
                    <div className="saas-admin-modules">
                        <Toggle checked={closing.askQuantityIfMissing} disabled={!canEdit || busy} label="Preguntar cantidad si no especifico" onChange={(checked) => updateConfigSection('closingRules', { ...closing, askQuantityIfMissing: checked })} />
                        <Toggle checked={closing.upsellBeforeQuote} disabled={!canEdit || busy} label="Hacer upsell antes de cotizar" onChange={(checked) => updateConfigSection('closingRules', { ...closing, upsellBeforeQuote: checked })} />
                    </div>
                    <div className="saas-admin-form-row">
                        <input className="saas-input" type="number" min="1" value={closing.defaultQuantity ?? 1} disabled={!canEdit || busy} placeholder="Cantidad por defecto" onChange={(event) => updateConfigSection('closingRules', { ...closing, defaultQuantity: numberValue(event.target.value, 1) })} />
                    </div>
                </div>
                <div className="saas-admin-form-row saas-admin-form-row--actions">
                    <button type="button" disabled={!canEdit || busy || !selectedProfileId} onClick={saveRules}>Guardar reglas</button>
                </div>
            </>
        );
    };

    if (!isCommercialIntelligenceSection) return null;

    const tabs = [
        { id: 'profile', label: 'Perfil' },
        { id: 'categories', label: 'Categorias' },
        { id: 'synonyms', label: 'Sinonimos y Marcas' },
        { id: 'catalog', label: 'Catalogo Comercial' },
        { id: 'rules', label: 'Reglas Comerciales' }
    ];

    return (
        <section id="saas_commercial_intelligence" className="saas-admin-card saas-admin-card--full saas-commercial-intelligence">
            <div className="saas-admin-flow-card">
                <div>
                    <h3>Estrategia de venta para Patty</h3>
                    <p>Define categorias, sinonimos, roles de producto y reglas comerciales por marca.</p>
                </div>
                <div className="saas-admin-form-row saas-admin-form-row--actions">
                    <button type="button" disabled={busy || loading || !settingsTenantId} onClick={loadProfiles}>Recargar</button>
                    <button type="button" disabled={busy || !canEdit} onClick={createProfile}>Nuevo perfil</button>
                    <button type="button" disabled={busy || !canEdit || !selectedProfile} onClick={duplicateProfile}>Duplicar perfil</button>
                </div>
            </div>

            <div className="saas-commercial-intelligence__body">
                {!settingsTenantId ? (
                    <div className="saas-admin-empty-state">
                        <h4>Selecciona una empresa</h4>
                        <p>La inteligencia comercial es multi-tenant y se configura por marca.</p>
                    </div>
                ) : null}

                {settingsTenantId ? (
                    <>
                    <div className="saas-admin-form-row">
                        <select className="saas-input" value={selectedProfileId} disabled={busy || loading} onChange={(event) => setSelectedProfileId(event.target.value)}>
                            {profiles.length === 0 ? <option value="">Sin perfiles comerciales</option> : null}
                            {profiles.map((profile) => (
                                <option key={profile.profileId} value={profile.profileId}>
                                    {profile.name}{profile.isDefault ? ' - Por defecto' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="saas-campaigns-chip-group">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                className={`saas-campaigns-chip ${activeTab === tab.id ? 'active' : ''}`.trim()}
                                disabled={busy}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    {!selectedProfileId ? (
                        <div className="saas-admin-empty-state">
                            <h4>Crea tu primer perfil comercial</h4>
                            <p>Desde aqui definiremos como Patty recomienda, vende y cierra sin depender solo del prompt.</p>
                        </div>
                    ) : null}
                    {selectedProfileId && activeTab === 'profile' ? renderProfileTab() : null}
                    {selectedProfileId && activeTab === 'categories' ? renderCategoriesTab() : null}
                    {selectedProfileId && activeTab === 'synonyms' ? renderSynonymsTab() : null}
                    {selectedProfileId && activeTab === 'catalog' ? renderCatalogTab() : null}
                    {selectedProfileId && activeTab === 'rules' ? renderRulesTab() : null}
                    </>
                ) : null}
            </div>
        </section>
    );
}

export default React.memo(CommercialIntelligenceSection);
