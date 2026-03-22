import React, { useState } from 'react';
import { Check, Minus, Package, Plus, PlusCircle, Search, Send, ShoppingCart, SlidersHorizontal } from 'lucide-react';
import {
    buildCatalogFormDataFromProduct,
    buildCatalogProductPayloadFromForm,
    createCatalogProductEmptyForm,
    extractCatalogCategoryLabels,
    formatMoney,
    normalizeCatalogCategoryKey,
    normalizeTextKey
} from '../helpers';

const CatalogTab = ({ catalog, socket, addToCart, onCatalogQtyDelta, catalogMeta, activeChatId, activeChatPhone = '', cartItems = [], waModules = [], selectedCatalogModuleId = '', selectedCatalogId = '', onSelectCatalogModule = null, onSelectCatalog = null, onUploadCatalogImage = null }) => {
    const [showForm, setShowForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [formData, setFormData] = useState(() => createCatalogProductEmptyForm());
    const [imageUploadBusy, setImageUploadBusy] = useState(false);
    const [imageUploadError, setImageUploadError] = useState('');
    const [catalogSearch, setCatalogSearch] = useState('');
    const [catalogCategoryFilter, setCatalogCategoryFilter] = useState('all');
    const [catalogTypeFilter, setCatalogTypeFilter] = useState('all');
    const [showCatalogFilters, setShowCatalogFilters] = useState(false);
    const moduleOptions = Array.isArray(waModules)
        ? waModules
            .filter((module) => module && String(module.moduleId || '').trim())
            .map((module) => ({
                moduleId: String(module.moduleId || '').trim(),
                name: String(module.name || module.moduleId || '').trim() || String(module.moduleId || '').trim()
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
        : [];
    const activeCatalogModuleId = String(selectedCatalogModuleId || '').trim();
    const activeCatalogId = String(selectedCatalogId || '').trim().toUpperCase();
    const catalogOptions = Array.isArray(catalogMeta?.scope?.catalogs)
        ? catalogMeta.scope.catalogs
            .map((entry) => ({
                catalogId: String(entry?.catalogId || '').trim().toUpperCase(),
                name: String(entry?.name || entry?.catalogId || '').trim() || String(entry?.catalogId || '').trim().toUpperCase(),
                sourceType: String(entry?.sourceType || entry?.source || '').trim().toLowerCase() || 'local'
            }))
            .filter((entry) => entry.catalogId)
        : [];
    const activeCatalogOption = catalogOptions.find((entry) => entry.catalogId === activeCatalogId) || null;
    const effectiveCatalogSource = String(activeCatalogOption?.sourceType || catalogMeta?.source || 'local').trim().toLowerCase() || 'local';
    const isExternalCatalog = ['native', 'woocommerce', 'meta'].includes(effectiveCatalogSource);
    const chatCatalogReadOnly = true;
    const showCatalogForm = !chatCatalogReadOnly && showForm;
    const handleAddClick = () => {
        setEditingProduct(null);
        setFormData(createCatalogProductEmptyForm());
        setImageUploadError('');
        setShowForm(true);
    };

    const handleEditClick = (product) => {
        setEditingProduct(product);
        setFormData(buildCatalogFormDataFromProduct(product));
        setImageUploadError('');
        setShowForm(true);
    };

    const handleCatalogImageFileChange = async (event) => {
        const file = event?.target?.files?.[0] || null;
        if (!file) return;

        const allowedMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        const maxBytes = 3 * 1024 * 1024;
        if (!allowedMime.includes(String(file.type || '').toLowerCase())) {
            setImageUploadError('Formato no permitido. Usa JPG, PNG o WEBP.');
            event.target.value = '';
            return;
        }
        if (Number(file.size || 0) > maxBytes) {
            setImageUploadError('La imagen supera 3 MB.');
            event.target.value = '';
            return;
        }
        if (typeof onUploadCatalogImage !== 'function') {
            setImageUploadError('No hay servicio de carga de imagen disponible.');
            event.target.value = '';
            return;
        }

        try {
            setImageUploadBusy(true);
            setImageUploadError('');
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
                reader.readAsDataURL(file);
            });
            const uploaded = await onUploadCatalogImage({
                dataUrl,
                fileName: file.name,
                scope: `catalog-${activeCatalogModuleId || 'general'}`
            });
            const uploadedUrl = String(uploaded?.url || '').trim();
            if (!uploadedUrl) throw new Error('No se recibio URL de imagen.');
            setFormData((prev) => ({ ...prev, imageUrl: uploadedUrl }));
        } catch (error) {
            setImageUploadError(String(error?.message || 'No se pudo subir la imagen.'));
        } finally {
            setImageUploadBusy(false);
            event.target.value = '';
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = buildCatalogProductPayloadFromForm(formData, { activeCatalogModuleId, activeCatalogId });
        if (!payload.title) {
            window.alert('El titulo del producto es obligatorio.');
            return;
        }
        if (!payload.price) {
            window.alert('El precio del producto es obligatorio.');
            return;
        }

        if (editingProduct) {
            socket.emit('update_product', {
                id: editingProduct.id,
                updates: payload,
                moduleId: activeCatalogModuleId || null,
                catalogId: activeCatalogId || null
            });
        } else {
            socket.emit('add_product', payload);
        }
        setImageUploadError('');
        setShowForm(false);
    };

    const handleDelete = (id) => {
        if (window.confirm('Eliminar este producto?')) {
            socket.emit('delete_product', { id, moduleId: activeCatalogModuleId || null, catalogId: activeCatalogId || null });
        }
    };

    const sendCatalogProduct = (item, i) => {
        if (!activeChatId) {
            window.alert('Selecciona un chat antes de enviar un producto.');
            return;
        }

        socket.emit('send_catalog_product', {
            to: activeChatId,
            toPhone: String(activeChatPhone || '').trim() || null,
            product: {
                id: item.id || `catalog_${i}`,
                title: item.title || `Producto ${i + 1}`,
                price: item.price || '',
                regularPrice: item.regularPrice || item.price || '',
                salePrice: item.salePrice || '',
                discountPct: item.discountPct || 0,
                description: item.description || '',
                imageUrl: item.imageUrl || '',
                url: item.url || item.permalink || item.productUrl || item.link || ''
            }
        });
    };

    const normalizedSearch = normalizeTextKey(catalogSearch);
    const normalizeCategoryKey = (value) => normalizeCatalogCategoryKey(value, normalizeTextKey);

    const metaCategories = Array.isArray(catalogMeta?.categories) ? catalogMeta.categories : [];
    const categoryMap = new Map();
    [...metaCategories, ...catalog.flatMap((item) => extractCatalogCategoryLabels(item))]
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .forEach((label) => {
            const key = normalizeCategoryKey(label);
            if (!key) return;
            if (!categoryMap.has(key)) categoryMap.set(key, label);
        });
    const categoryOptions = Array.from(categoryMap.entries())
        .map(([, label]) => ({ label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
    const selectedCategoryKey = catalogCategoryFilter === 'all'
        ? 'all'
        : normalizeCategoryKey(catalogCategoryFilter);
    const visibleCatalog = catalog.filter((item) => {
        const searchable = normalizeTextKey(String(item?.title || '') + ' ' + String(item?.sku || '') + ' ' + String(item?.description || ''));
        const searchMatch = !normalizedSearch || searchable.includes(normalizedSearch);

        const itemCategoryKeys = extractCatalogCategoryLabels(item)
            .map((entry) => normalizeCategoryKey(entry))
            .filter(Boolean);
        const categoryMatch = selectedCategoryKey === 'all'
            || itemCategoryKeys.some((key) => (
                key === selectedCategoryKey
                || key.includes(selectedCategoryKey)
                || selectedCategoryKey.includes(key)
            ))
            || (itemCategoryKeys.length === 0 && searchable.includes(selectedCategoryKey));

        const finalPrice = Number.parseFloat(item?.price || '0') || 0;
        const regularPrice = Number.parseFloat(item?.regularPrice || item?.price || '0') || finalPrice;
        const hasDiscount = regularPrice > 0 && finalPrice > 0 && finalPrice < regularPrice;
        const cartLine = cartItems.find((cartItem) => String(cartItem?.id || '') === String(item?.id || ''));
        const inCart = Number(cartLine?.qty || 0) > 0;

        const typeMatch = catalogTypeFilter === 'all'
            || (catalogTypeFilter === 'discount' && hasDiscount)
            || (catalogTypeFilter === 'regular' && !hasDiscount)
            || (catalogTypeFilter === 'in_cart' && inCart)
            || (catalogTypeFilter === 'out_cart' && !inCart);

        return searchMatch && categoryMatch && typeMatch;
    });
    const hasCatalogFilters = catalogCategoryFilter !== 'all' || catalogTypeFilter !== 'all';
    const hasAnyCatalogCriteria = Boolean(catalogSearch.trim() || hasCatalogFilters);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 8px 6px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px', background: '#111b21', borderBottom: '1px solid rgba(134,150,160,0.16)' }}>
                {catalogMeta?.source === 'local' && catalogMeta?.wooStatus && catalogMeta?.wooStatus !== 'ok' && (
                    <div style={{ background: '#2f2520', color: '#f7b267', border: '1px solid #7a4d2c', borderRadius: '9px', padding: '8px 10px', fontSize: '0.75rem' }}>
                        WooCommerce no devolvio productos ({catalogMeta?.wooSource || 'sin fuente'}).
                        {catalogMeta?.wooReason ? ` Detalle: ${catalogMeta.wooReason}` : ''}
                    </div>
                )}

                                {moduleOptions.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.68rem', color: '#9eb2bf', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Modulo</label>
                            <select
                                value={activeCatalogModuleId}
                                onChange={(event) => {
                                    const nextModuleId = String(event.target.value || '').trim();
                                    if (!nextModuleId || typeof onSelectCatalogModule !== 'function') return;
                                    onSelectCatalogModule(nextModuleId);
                                }}
                                style={{ width: '100%', background: '#101a21', border: '1px solid rgba(0,168,132,0.35)', color: '#e9f2f7', borderRadius: '10px', padding: '8px 10px', fontSize: '0.78rem', outline: 'none' }}
                            >
                                {moduleOptions.map((module) => (
                                    <option key={'catalog_module_' + module.moduleId} value={module.moduleId}>{module.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.68rem', color: '#9eb2bf', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Catalogo</label>
                            <select
                                value={activeCatalogId}
                                onChange={(event) => {
                                    const nextCatalogId = String(event.target.value || '').trim().toUpperCase();
                                    if (typeof onSelectCatalog !== 'function') return;
                                    onSelectCatalog(nextCatalogId);
                                }}
                                style={{ width: '100%', background: '#101a21', border: '1px solid rgba(0,168,132,0.35)', color: '#e9f2f7', borderRadius: '10px', padding: '8px 10px', fontSize: '0.78rem', outline: 'none' }}
                            >
                                {catalogOptions.length === 0 && <option value="">Sin catalogos</option>}
                                {catalogOptions.map((entry) => (
                                    <option key={'catalog_option_' + entry.catalogId} value={entry.catalogId}>{entry.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ fontSize: '0.68rem', color: '#8ca3b3', whiteSpace: 'nowrap', alignSelf: 'end' }}>
                            Scope: {activeCatalogModuleId || 'tenant'}
                        </div>
                    </div>
                )}
                {chatCatalogReadOnly && (
                    <div style={{ background: 'rgba(24, 47, 60, 0.88)', border: '1px solid rgba(124,200,255,0.35)', color: '#d6ecff', borderRadius: '10px', padding: '8px 10px', fontSize: '0.74rem', lineHeight: 1.45 }}>
                        Gestion de productos bloqueada en chat. Crea y edita productos solo desde Panel SaaS; aqui solo puedes visualizar y enviar.
                    </div>
                )}
                <div style={{ background: '#17242c', border: '1px solid rgba(0,168,132,0.24)', borderRadius: '11px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#111b21', border: '1px solid rgba(0,168,132,0.4)', borderRadius: '10px', padding: '0 10px', minWidth: 0 }}>
                            <Search size={15} color="#76e6d0" />
                            <input
                                type="text"
                                value={catalogSearch}
                                onChange={e => setCatalogSearch(e.target.value)}
                                placeholder="Buscar producto o SKU"
                                style={{ width: '100%', minWidth: 0, background: 'transparent', border: 'none', color: '#e9f2f7', borderRadius: '10px', padding: '8px 0', fontSize: '0.78rem', outline: 'none' }}
                            />
                            {catalogSearch.trim() && (
                                <button
                                    type="button"
                                    onClick={() => setCatalogSearch('')}
                                    style={{ background: 'transparent', border: 'none', color: '#8fb0c3', cursor: 'pointer', fontSize: '0.72rem', padding: 0, whiteSpace: 'nowrap' }}
                                >
                                    Limpiar
                                </button>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowCatalogFilters(prev => !prev)}
                            title="Filtros"
                            style={{
                                height: '36px',
                                minWidth: '40px',
                                borderRadius: '10px',
                                border: hasCatalogFilters || showCatalogFilters ? '1px solid rgba(0,168,132,0.6)' : '1px solid rgba(134,150,160,0.3)',
                                background: hasCatalogFilters || showCatalogFilters ? 'rgba(0,168,132,0.18)' : '#111b21',
                                color: hasCatalogFilters || showCatalogFilters ? '#baf6e8' : '#9eb2bf',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative'
                            }}
                        >
                            <SlidersHorizontal size={15} />
                            {hasCatalogFilters && (
                                <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', borderRadius: '50%', background: '#00d7ad', boxShadow: '0 0 0 2px #111b21' }} />
                            )}
                        </button>
                                </div>

                    {showCatalogFilters && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.7rem', color: '#9eb2bf' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><SlidersHorizontal size={12} /> Categoria</span>
                                <select
                                    value={catalogCategoryFilter}
                                    onChange={e => setCatalogCategoryFilter(e.target.value)}
                                    style={{ width: '100%', background: '#101a21', border: '1px solid var(--border-color)', color: '#e9f2f7', borderRadius: '8px', padding: '6px 8px', fontSize: '0.75rem', outline: 'none' }}
                                >
                                    <option value="all">Todas</option>
                                    {categoryOptions.map((category) => (
                                        <option key={category.label} value={category.label}>{category.label}</option>
                                    ))}
                                </select>
                            </label>

                            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.7rem', color: '#9eb2bf' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>Vista</span>
                                <select
                                    value={catalogTypeFilter}
                                    onChange={e => setCatalogTypeFilter(e.target.value)}
                                    style={{ width: '100%', background: '#101a21', border: '1px solid var(--border-color)', color: '#e9f2f7', borderRadius: '8px', padding: '6px 8px', fontSize: '0.75rem', outline: 'none' }}
                                >
                                    <option value="all">Todos</option>
                                    <option value="discount">Con descuento</option>
                                    <option value="regular">Precio regular</option>
                                    <option value="in_cart">En carrito</option>
                                    <option value="out_cart">Fuera del carrito</option>
                                </select>
                            </label>
                        </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {!chatCatalogReadOnly && !isExternalCatalog && (
                                <button
                                    type="button"
                                    onClick={handleAddClick}
                                    style={{ background: '#00a884', color: 'white', border: 'none', borderRadius: '999px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700 }}
                                >
                                    <PlusCircle size={13} /> Nuevo
                                </button>
                            )}
                            {hasAnyCatalogCriteria && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCatalogSearch('');
                                        setCatalogCategoryFilter('all');
                                        setCatalogTypeFilter('all');
                                    }}
                                    style={{ background: 'transparent', border: '1px solid rgba(124,200,255,0.35)', color: '#cdeaff', borderRadius: '999px', padding: '4px 10px', fontSize: '0.71rem', cursor: 'pointer' }}
                                >
                                    Limpiar
                                </button>
                            )}
                        </div>

                        <div style={{ fontSize: '0.7rem', color: '#8ca3b3' }}>
                            Mostrando {visibleCatalog.length} de {catalog.length} productos
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {showCatalogForm ? (
                    <form onSubmit={handleSubmit} style={{ background: '#202c33', borderRadius: '10px', padding: '14px', border: '1px solid #00a884', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <div style={{ fontSize: '0.85rem', color: '#00a884', fontWeight: 700 }}>
                                {editingProduct ? 'Editar producto local' : 'Nuevo producto local'}
                            </div>
                            <div style={{ fontSize: '0.67rem', color: '#8fb6c3' }}>
                                {activeCatalogId ? `Catalogo ${activeCatalogId}` : 'Catalogo general'}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 180px)', gap: '8px' }}>
                            <input
                                type="text"
                                placeholder="Titulo del producto"
                                required
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                style={{ background: '#2a3942', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', outline: 'none' }}
                            />
                            <input
                                type="text"
                                placeholder="SKU (opcional)"
                                value={formData.sku}
                                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                style={{ background: '#2a3942', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', outline: 'none' }}
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                            <input
                                type="text"
                                placeholder="Precio venta"
                                required
                                value={formData.price}
                                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                style={{ background: '#2a3942', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', outline: 'none' }}
                            />
                            <input
                                type="text"
                                placeholder="Precio regular"
                                value={formData.regularPrice}
                                onChange={(e) => setFormData({ ...formData, regularPrice: e.target.value })}
                                style={{ background: '#2a3942', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', outline: 'none' }}
                            />
                            <input
                                type="text"
                                placeholder="Precio oferta"
                                value={formData.salePrice}
                                onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
                                style={{ background: '#2a3942', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', outline: 'none' }}
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 160px) minmax(0, 150px)', gap: '8px' }}>
                            <input
                                type="text"
                                placeholder="Categorias (coma separada)"
                                value={formData.categories}
                                onChange={(e) => setFormData({ ...formData, categories: e.target.value })}
                                style={{ background: '#2a3942', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', outline: 'none' }}
                            />
                            <input
                                type="text"
                                placeholder="Marca"
                                value={formData.brand}
                                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                                style={{ background: '#2a3942', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', outline: 'none' }}
                            />
                            <input
                                type="number"
                                min="0"
                                step="1"
                                placeholder="Stock"
                                value={formData.stockQuantity}
                                onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                                style={{ background: '#2a3942', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', outline: 'none' }}
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 220px)', gap: '8px' }}>
                            <input
                                type="text"
                                placeholder="URL de producto (opcional)"
                                value={formData.url}
                                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                                style={{ background: '#2a3942', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', outline: 'none' }}
                            />
                            <select
                                value={String(formData.stockStatus || 'instock')}
                                onChange={(e) => setFormData({ ...formData, stockStatus: e.target.value })}
                                style={{ background: '#2a3942', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', outline: 'none' }}
                            >
                                <option value="instock">Stock: Disponible</option>
                                <option value="outofstock">Stock: Agotado</option>
                                <option value="onbackorder">Stock: Backorder</option>
                            </select>
                        </div>

                        <textarea
                            placeholder="Descripcion detallada"
                            rows="3"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            style={{ background: '#2a3942', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', outline: 'none', resize: 'vertical' }}
                        />

                        <div style={{ border: '1px solid rgba(0,168,132,0.35)', borderRadius: '10px', padding: '9px', background: '#1a252d', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                <div style={{ fontSize: '0.72rem', color: '#9edfcf', fontWeight: 700 }}>Imagen del producto</div>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#00a884', color: '#fff', borderRadius: '8px', padding: '5px 10px', cursor: imageUploadBusy ? 'not-allowed' : 'pointer', fontSize: '0.73rem', fontWeight: 700, opacity: imageUploadBusy ? 0.65 : 1 }}>
                                    {imageUploadBusy ? 'Subiendo...' : 'Subir imagen'}
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/jpg,image/png,image/webp"
                                        onChange={handleCatalogImageFileChange}
                                        disabled={imageUploadBusy}
                                        style={{ display: 'none' }}
                                    />
                                </label>
                            </div>

                            {imageUploadError && (
                                <div style={{ fontSize: '0.7rem', color: '#ffb4b4' }}>{imageUploadError}</div>
                            )}

                            <input
                                type="text"
                                placeholder="URL de imagen (opcional)"
                                value={formData.imageUrl}
                                onChange={(e) => {
                                    setImageUploadError('');
                                    setFormData({ ...formData, imageUrl: e.target.value });
                                }}
                                style={{ background: '#2a3942', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', outline: 'none' }}
                            />

                            {formData.imageUrl && (
                                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: '8px', alignItems: 'center' }}>
                                    <div style={{ width: '70px', height: '70px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.14)', background: '#10171c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <img src={formData.imageUrl} alt={formData.title || 'producto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#9ab2bf', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {formData.imageUrl}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setFormData((prev) => ({ ...prev, imageUrl: '' }))}
                                        style={{ background: 'transparent', border: '1px solid rgba(255,120,120,0.45)', color: '#ffb4b4', borderRadius: '8px', padding: '5px 9px', fontSize: '0.72rem', cursor: 'pointer' }}
                                    >
                                        Quitar
                                    </button>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '3px' }}>
                            <button type="submit" style={{ flex: 1, background: '#00a884', color: 'white', border: 'none', borderRadius: '8px', padding: '9px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                                {editingProduct ? 'Actualizar' : 'Guardar'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setImageUploadError('');
                                    setShowForm(false);
                                }}
                                style={{ flex: 1, background: 'transparent', border: '1px solid #da3633', color: '#ffb9b9', borderRadius: '8px', padding: '9px', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                                Cancelar
                            </button>
                                </div>
                    </form>
                ) : (
                    <>
                        {visibleCatalog.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '30px 15px', color: '#8696a0' }}>
                                <Package size={36} style={{ marginBottom: '12px', opacity: 0.25, marginLeft: 'auto', marginRight: 'auto' }} />
                                <div style={{ fontSize: '0.875rem', marginBottom: '6px' }}>Catalogo vacio</div>
                                <div style={{ fontSize: '0.78rem', opacity: 0.7, lineHeight: '1.5' }}>
                                    Si tu catalogo nativo no aparece, WhatsApp Web no lo esta exponiendo en esta sesion.
                                </div>
                            </div>
                        ) : (
                            visibleCatalog.map((item, i) => {
                                const finalPrice = Number.parseFloat(item.price || '0') || 0;
                                const regularPrice = Number.parseFloat(item.regularPrice || item.price || '0') || finalPrice;
                                const hasDiscount = regularPrice > 0 && finalPrice > 0 && finalPrice < regularPrice;
                                const rawDiscount = Number.parseFloat(String(item.discountPct || 0));
                                const effectiveDiscount = Number.isFinite(rawDiscount) && rawDiscount > 0
                                    ? rawDiscount
                                    : (hasDiscount ? Number((((regularPrice - finalPrice) / regularPrice) * 100).toFixed(1)) : 0);
                                const cartLine = cartItems.find((cartItem) => String(cartItem?.id || '') === String(item?.id || ''));
                                const cartQty = Math.max(0, Number(cartLine?.qty || 0));
                                const inCart = cartQty > 0;

                                return (
                                    <div key={item.id || i} style={{ background: '#1b2730', borderRadius: '11px', border: '1px solid #2a3a45', padding: '8px', display: 'grid', gridTemplateColumns: '74px 1fr', gap: '8px', alignItems: 'start' }}>
                                        <div style={{ width: '74px', height: '74px', borderRadius: '9px', background: '#2a3942', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
                                            {item.imageUrl
                                                ? <img src={item.imageUrl} alt={item.title || 'Producto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                : <Package size={24} color="#98adba" />}
                                        </div>

                                        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '5px', justifyContent: 'flex-start' }}>
                                            <div style={{ fontSize: '0.84rem', color: '#eef5f9', fontWeight: 700, lineHeight: 1.24, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                                {String(item.title || `Producto ${i + 1}`)}
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                                                {hasDiscount && (
                                                    <span style={{ fontSize: '0.72rem', color: '#8fa1ad', textDecoration: 'line-through' }}>S/ {formatMoney(regularPrice)}</span>
                                                )}
                                                {hasDiscount && (
                                                    <span style={{ fontSize: '0.7rem', color: '#d5fff4', background: 'rgba(0,168,132,0.26)', border: '1px solid rgba(0,168,132,0.44)', borderRadius: '999px', padding: '2px 7px', fontWeight: 700 }}>
                                                        -{effectiveDiscount.toFixed(effectiveDiscount % 1 === 0 ? 0 : 1)}%
                                                    </span>
                                                )}
                                            </div>

                                            <div style={{ fontSize: '1rem', color: '#00d7ad', fontWeight: 800 }}>
                                                {finalPrice > 0 ? `S/ ${formatMoney(finalPrice)}` : 'Precio: Consultar'}
                                            </div>

                                            {inCart && (
                                                <div style={{ width: 'fit-content', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.68rem', color: '#d9fff4', background: 'rgba(0,168,132,0.22)', border: '1px solid rgba(0,168,132,0.45)', borderRadius: '999px', padding: '3px 8px', fontWeight: 700 }}>
                                                    <Check size={11} />
                                                    En carrito: {cartQty}
                                                </div>
                                            )}

                                            <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '7px', alignItems: 'stretch' }}>
                                                <button
                                                    onClick={() => sendCatalogProduct(item, i)}
                                                    style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '7px 9px', background: '#17323f', border: '1px solid rgba(0,168,132,0.45)', borderRadius: '9px', color: '#d6f7ee', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                >
                                                    <Send size={12} /> Enviar
                                                </button>
                                                {inCart ? (
                                                    <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', background: '#0f322b', border: '1px solid rgba(0,168,132,0.45)', borderRadius: '9px', padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                                        <button
                                                            onClick={() => onCatalogQtyDelta && onCatalogQtyDelta(item.id, -1)}
                                                            style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#20423a', border: 'none', cursor: 'pointer', color: '#d6f7ee', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                                        >
                                                            <Minus size={11} />
                                                        </button>
                                                        <span style={{ minWidth: '20px', textAlign: 'center', color: '#d9fff4', fontSize: '0.78rem', fontWeight: 800 }}>{cartQty}</span>
                                                        <button
                                                            onClick={() => onCatalogQtyDelta && onCatalogQtyDelta(item.id, 1)}
                                                            style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#00a884', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                                        >
                                                            <Plus size={11} />
                                                        </button>
                                </div>
                                                ) : (
                                                    <button
                                                        onClick={() => addToCart(item, 1)}
                                                        style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '7px 9px', background: 'linear-gradient(90deg, #00a884 0%, #02c39a 100%)', border: 'none', borderRadius: '9px', color: 'white', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                    >
                                                        <ShoppingCart size={12} /> Carrito
                                                    </button>
                                                )}
                                            </div>

                                            {!chatCatalogReadOnly && !isExternalCatalog && (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', alignItems: 'stretch' }}>
                                                    <button onClick={() => handleEditClick(item)} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', background: '#23323c', border: '1px solid rgba(255,255,255,0.13)', borderRadius: '8px', color: '#d8e6ef', cursor: 'pointer', fontSize: '0.71rem', padding: '6px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        Editar
                                                    </button>
                                                    <button onClick={() => handleDelete(item.id)} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', background: '#2e1f26', border: '1px solid rgba(220,74,95,0.45)', borderRadius: '8px', color: '#ffb8c7', cursor: 'pointer', fontSize: '0.71rem', padding: '6px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        Eliminar
                                                    </button>
                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default CatalogTab;













