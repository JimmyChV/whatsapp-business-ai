export const loadStoredSaasSession = (storageKey = '') => {
  try {
    const key = String(storageKey || '').trim();
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const accessToken = String(parsed.accessToken || '').trim();
    const refreshToken = String(parsed.refreshToken || '').trim();
    if (!accessToken || !refreshToken) return null;
    return {
      accessToken,
      refreshToken,
      tokenType: String(parsed.tokenType || 'Bearer').trim() || 'Bearer',
      accessExpiresAtUnix: Number(parsed.accessExpiresAtUnix || 0) || 0,
      refreshExpiresAtUnix: Number(parsed.refreshExpiresAtUnix || 0) || 0,
      user: parsed.user && typeof parsed.user === 'object' ? parsed.user : null
    };
  } catch (error) {
    return null;
  }
};

export const persistSaasSession = (storageKey = '', session = null) => {
  try {
    const key = String(storageKey || '').trim();
    if (!key) return;
    if (!session) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(session));
  } catch (error) {
    // ignore storage errors
  }
};

export const normalizeCatalogItem = (item = {}, index = 0) => {
  const safeItem = item && typeof item === 'object' ? item : {};
  const rawTitle = safeItem.title || safeItem.name || safeItem.nombre || safeItem.productName || safeItem.sku || '';

  const parsePrice = (value, fallback = 0) => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
    return Number.isFinite(fallback) ? fallback : 0;
  };

  const priceNum = parsePrice(safeItem.price ?? safeItem.regular_price ?? safeItem.sale_price ?? safeItem.amount ?? safeItem.precio, 0);
  const regularNum = parsePrice(safeItem.regularPrice ?? safeItem.regular_price ?? safeItem.price ?? safeItem.amount ?? safeItem.precio, priceNum);
  const saleNum = parsePrice(safeItem.salePrice ?? safeItem.sale_price, priceNum);
  const baseFinal = saleNum > 0 && saleNum < regularNum ? saleNum : priceNum;
  const finalNum = baseFinal > 0 ? baseFinal : regularNum;
  const computedDiscount = regularNum > 0 && finalNum > 0 && finalNum < regularNum
    ? Number((((regularNum - finalNum) / regularNum) * 100).toFixed(1))
    : 0;
  const rawDiscount = Number.parseFloat(String(safeItem.discountPct ?? safeItem.discount_pct ?? computedDiscount).replace(',', '.'));
  const discountPct = Number.isFinite(rawDiscount) ? Math.max(0, rawDiscount) : 0;
  const rawCategories = Array.isArray(safeItem.categories)
    ? safeItem.categories
    : (typeof safeItem.categories === 'string'
      ? safeItem.categories.split(',')
      : (safeItem.category
        ? [safeItem.category]
        : (safeItem.categoryName
          ? [safeItem.categoryName]
          : (safeItem.category_slug ? [safeItem.category_slug] : []))));
  const categories = rawCategories
    .map((entry) => (typeof entry === 'string' ? entry : (entry?.name || entry?.slug || entry?.title || '')))
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);

  return {
    id: safeItem.id || safeItem.product_id || `catalog_${index}`,
    title: String(rawTitle || `Producto ${index + 1}`).trim(),
    price: Number.isFinite(finalNum) ? finalNum.toFixed(2) : '0.00',
    regularPrice: Number.isFinite(regularNum) ? regularNum.toFixed(2) : (Number.isFinite(finalNum) ? finalNum.toFixed(2) : '0.00'),
    salePrice: Number.isFinite(saleNum) && saleNum > 0 ? saleNum.toFixed(2) : null,
    discountPct,
    description: safeItem.description || safeItem.short_description || safeItem.descripcion || '',
    imageUrl: safeItem.imageUrl || safeItem.image || safeItem.image_url || safeItem.images?.[0]?.src || null,
    source: safeItem.source || 'unknown',
    sku: safeItem.sku || null,
    stockStatus: safeItem.stockStatus || safeItem.stock_status || null,
    moduleId: String(safeItem.moduleId || safeItem.module_id || '').trim().toLowerCase() || null,
    catalogId: String(safeItem.catalogId || safeItem.catalog_id || '').trim().toUpperCase() || null,
    catalogName: String(safeItem.catalogName || safeItem.catalog_name || safeItem.catalogId || safeItem.catalog_id || '').trim() || null,
    channelType: String(safeItem.channelType || safeItem.channel_type || '').trim().toLowerCase() || null,
    categories
  };
};

export const normalizeProfilePhotoUrl = (rawUrl = '', apiUrl = '') => {
  const value = String(rawUrl || '').trim();
  const baseApiUrl = String(apiUrl || '').trim();
  if (!value) return null;
  if (value.startsWith('data:') || value.startsWith('blob:')) return value;

  if (value.includes('/api/profile-photo?url=')) {
    if (/^https?:\/\//i.test(value)) return value;
    if (!baseApiUrl) return value;
    if (value.startsWith('/')) return `${baseApiUrl}${value}`;
    return `${baseApiUrl}/${value}`;
  }

  if (!/^https?:\/\//i.test(value)) return value;
  if (!baseApiUrl) return value;
  return `${baseApiUrl}/api/profile-photo?url=${encodeURIComponent(value)}`;
};

export const normalizeModuleImageUrl = (rawUrl = '', apiUrl = '') => {
  const value = String(rawUrl || '').trim();
  const baseApiUrl = String(apiUrl || '').trim();
  if (!value) return null;
  if (value.startsWith('data:') || value.startsWith('blob:')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (!baseApiUrl) return value;
  if (value.startsWith('/')) return `${baseApiUrl}${value}`;
  return `${baseApiUrl}/${value}`;
};

export const normalizeProfilePayload = (profile = null, apiUrl = '') => {
  if (!profile || typeof profile !== 'object') return null;
  return {
    ...profile,
    profilePicUrl: normalizeProfilePhotoUrl(profile.profilePicUrl, apiUrl)
  };
};

export const normalizeBusinessDataPayload = (data = {}, apiUrl = '') => {
  const rawCatalog = Array.isArray(data.catalog) ? data.catalog : [];
  const catalog = rawCatalog.map((item, idx) => normalizeCatalogItem(item, idx));
  return {
    profile: normalizeProfilePayload(data.profile || null, apiUrl),
    labels: Array.isArray(data.labels) ? data.labels : [],
    catalog,
    catalogMeta: data.catalogMeta || { source: 'local', nativeAvailable: false }
  };
};

export const normalizeWaModuleItem = (item = {}, apiUrl = '') => {
  const source = item && typeof item === 'object' ? item : {};
  const moduleId = String(source.moduleId || source.module_id || source.id || '').trim().toLowerCase();
  if (!moduleId) return null;
  const transportMode = String(source.transportMode || source.transport || source.mode || '').trim().toLowerCase();
  const metadata = source.metadata && typeof source.metadata === 'object' ? source.metadata : {};
  const aiConfig = source.aiConfig && typeof source.aiConfig === 'object'
    ? source.aiConfig
    : (metadata.aiConfig && typeof metadata.aiConfig === 'object' ? metadata.aiConfig : {});
  const scheduleId = String(source.scheduleId || source.schedule_id || metadata.scheduleId || metadata.schedule_id || '').trim() || null;
  return {
    moduleId,
    name: String(source.name || source.module_name || moduleId).trim() || moduleId,
    phoneNumber: String(source.phoneNumber || source.phone_number || source.phone || '').trim() || null,
    transportMode: transportMode || 'cloud',
    isActive: source.isActive !== false,
    isDefault: source.isDefault === true,
    isSelected: source.isSelected === true,
    channelType: String(source.channelType || source.channel || '').trim().toLowerCase() || null,
    imageUrl: normalizeModuleImageUrl(source.imageUrl || source.logoUrl || source.avatarUrl || '', apiUrl) || null,
    logoUrl: normalizeModuleImageUrl(source.logoUrl || source.imageUrl || source.avatarUrl || '', apiUrl) || null,
    scheduleId,
    aiConfig,
    metadata: {
      ...metadata,
      scheduleId,
      aiConfig
    },
    assignedUserIds: Array.isArray(source.assignedUserIds)
      ? source.assignedUserIds.map((entry) => String(entry || '').trim()).filter(Boolean)
      : []
  };
};

export const normalizeWaModules = (items = [], apiUrl = '') => {
  const source = Array.isArray(items) ? items : [];
  const seen = new Set();
  return source
    .map((item) => normalizeWaModuleItem(item, apiUrl))
    .filter((module) => {
      if (!module?.moduleId) return false;
      if (seen.has(module.moduleId)) return false;
      seen.add(module.moduleId);
      return true;
    });
};

export const resolveSelectedWaModule = (items = [], preferred = null, apiUrl = '') => {
  const modules = normalizeWaModules(items, apiUrl);
  if (!modules.length) return null;
  const preferredId = String(preferred?.moduleId || preferred?.id || '').trim().toLowerCase();
  if (preferredId) {
    const byId = modules.find((module) => module.moduleId === preferredId);
    if (byId) return byId;
  }
  return modules.find((module) => module.isSelected) || modules.find((module) => module.isDefault) || modules[0];
};
