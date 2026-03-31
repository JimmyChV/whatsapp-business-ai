import React, { useState } from 'react';
import { Package, PlusCircle, Search, SlidersHorizontal } from 'lucide-react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';
import {
    buildCatalogFormDataFromProduct,
    buildCatalogProductPayloadFromForm,
    createCatalogProductEmptyForm,
    extractCatalogCategoryLabels,
    formatMoney,
    normalizeCatalogCategoryKey,
    normalizeTextKey
} from '../helpers';
import { BusinessCatalogProductCard, BusinessCatalogProductForm } from './catalog';

const CatalogTab = ({ catalog, socket, addToCart, onCatalogQtyDelta, catalogMeta, activeChatId, activeChatPhone = '', cartItems = [], waModules = [], selectedCatalogModuleId = '', selectedCatalogId = '', onSelectCatalogModule = null, onSelectCatalog = null, onUploadCatalogImage = null, canWriteByAssignment = false }) => {
    const { confirm, notify } = useUiFeedback();
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
            notify({ type: 'warn', message: 'El titulo del producto es obligatorio.' });
            return;
        }
        if (!payload.price) {
            notify({ type: 'warn', message: 'El precio del producto es obligatorio.' });
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

    const handleDelete = async (id) => {
        const confirmed = await confirm({
            title: 'Eliminar producto',
            message: 'Eliminar este producto del catalogo?',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            tone: 'danger'
        });
        if (!confirmed) return;
        socket.emit('delete_product', { id, moduleId: activeCatalogModuleId || null, catalogId: activeCatalogId || null });
    };

    const sendCatalogProduct = (item, i) => {
        if (!canWriteByAssignment) {
            notify({ type: 'warn', message: 'Toma este chat para responder.' });
            return;
        }
        if (!activeChatId) {
            notify({ type: 'info', message: 'Selecciona un chat antes de enviar un producto.' });
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
                    <BusinessCatalogProductForm
                        editingProduct={editingProduct}
                        formData={formData}
                        setFormData={setFormData}
                        activeCatalogId={activeCatalogId}
                        imageUploadBusy={imageUploadBusy}
                        imageUploadError={imageUploadError}
                        onImageFileChange={handleCatalogImageFileChange}
                        onSubmit={handleSubmit}
                        onCancel={() => {
                            setImageUploadError('');
                            setShowForm(false);
                        }}
                    />
                ) : (
                    <>
                        {visibleCatalog.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '30px 15px', color: '#8696a0' }}>
                                <Package size={36} style={{ marginBottom: '12px', opacity: 0.25, marginLeft: 'auto', marginRight: 'auto' }} />
                                <div style={{ fontSize: '0.875rem', marginBottom: '6px' }}>Catalogo vacio</div>
                                <div style={{ fontSize: '0.78rem', opacity: 0.7, lineHeight: '1.5' }}>
                                    Si tu catalogo nativo no aparece, Cloud API no lo esta exponiendo en esta sesion.
                                </div>
                            </div>
                        ) : (
                            visibleCatalog.map((item, i) => (
                                <BusinessCatalogProductCard
                                    key={item.id || i}
                                    item={item}
                                    index={i}
                                    cartItems={cartItems}
                                    onCatalogQtyDelta={onCatalogQtyDelta}
                                    addToCart={addToCart}
                                    sendCatalogProduct={sendCatalogProduct}
                                    canWriteByAssignment={canWriteByAssignment}
                                    chatCatalogReadOnly={chatCatalogReadOnly}
                                    isExternalCatalog={isExternalCatalog}
                                    handleEditClick={handleEditClick}
                                    handleDelete={handleDelete}
                                    formatMoney={formatMoney}
                                />
                            ))
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default CatalogTab;













