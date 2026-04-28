import React from 'react';
import ImageDropInput from '../components/panel/ImageDropInput';
import { SaasEntityPage } from '../components/layout';

const text = (value) => String(value ?? '').trim();

function CatalogSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        isCatalogSection,
        busy,
        settingsTenantId,
        loadingTenantCatalogs,
        loadTenantCatalogs,
        canEditCatalog,
        openCatalogCreate,
        tenantCatalogItems = [],
        selectedTenantCatalog,
        openCatalogView,
        catalogPanelMode,
        setCatalogPanelMode,
        setTenantCatalogForm,
        EMPTY_TENANT_CATALOG_FORM,
        cancelCatalogEdit,
        formatDateTimeLabel = (value) => value || '-',
        openCatalogEdit,
        requestJson,
        runAction,
        buildTenantCatalogPayload,
        selectedCatalogProductId,
        setSelectedCatalogProductId,
        loadTenantCatalogProducts,
        tenantCatalogProducts = [],
        loadingCatalogProducts,
        setCatalogProductPanelMode,
        openCatalogProductCreate,
        selectedCatalogProduct,
        catalogProductPanelMode,
        openCatalogProductEdit,
        deactivateCatalogProduct,
        setCatalogProductForm,
        buildCatalogProductFormFromItem,
        catalogProductForm = {},
        setCatalogProductImageError,
        handleCatalogProductImageUpload,
        catalogProductImageUploading,
        catalogProductImageError,
        saveCatalogProduct,
        cancelCatalogProductEdit,
        setSelectedCatalogId,
        tenantCatalogForm = {}
    } = context;

    const isCatalogEditing = catalogPanelMode === 'create' || catalogPanelMode === 'edit';
    const isProductEditing = catalogProductPanelMode === 'create' || catalogProductPanelMode === 'edit';
    const selectedId = catalogPanelMode === 'create'
        ? '__create_catalog__'
        : text(selectedTenantCatalog?.catalogId);

    const rows = React.useMemo(() => tenantCatalogItems.map((item) => ({
        id: text(item?.catalogId),
        name: item?.name || item?.catalogId || '-',
        code: text(item?.catalogId) || '-',
        sourceType: item?.sourceType || '-',
        status: item?.isActive === false ? 'Inactivo' : 'Activo',
        defaultLabel: item?.isDefault ? 'Principal' : '-',
        updatedAt: formatDateTimeLabel(item?.updatedAt),
        raw: item
    })), [formatDateTimeLabel, tenantCatalogItems]);

    const columns = React.useMemo(() => [
        { key: 'name', label: 'Nombre', width: '30%', sortable: true },
        { key: 'sourceType', label: 'Origen', width: '20%', sortable: true },
        { key: 'defaultLabel', label: 'Principal', width: '16%', sortable: true },
        { key: 'status', label: 'Estado', width: '16%', sortable: true },
        { key: 'code', label: 'Código', width: '18%', sortable: true, hidden: true },
        { key: 'updatedAt', label: 'Actualizado', width: '18%', sortable: true, hidden: true }
    ], []);

    const filters = React.useMemo(() => [
        {
            key: 'sourceType',
            label: 'Origen',
            type: 'select',
            options: ['local', 'woocommerce', 'meta'].map((value) => ({ value, label: value }))
        },
        {
            key: 'status',
            label: 'Estado',
            type: 'select',
            options: [
                { value: 'Activo', label: 'Activo' },
                { value: 'Inactivo', label: 'Inactivo' }
            ]
        }
    ], []);

    const close = React.useCallback(() => {
        if (isProductEditing) {
            cancelCatalogProductEdit?.();
            return;
        }
        if (catalogPanelMode === 'create') {
            setCatalogPanelMode?.('view');
            setTenantCatalogForm?.(EMPTY_TENANT_CATALOG_FORM);
            return;
        }
        if (catalogPanelMode === 'edit') {
            cancelCatalogEdit?.();
            return;
        }
        setSelectedCatalogProductId?.('');
        setSelectedCatalogId?.('');
        setCatalogProductPanelMode?.('view');
        setCatalogPanelMode?.('view');
    }, [
        EMPTY_TENANT_CATALOG_FORM,
        cancelCatalogEdit,
        cancelCatalogProductEdit,
        catalogPanelMode,
        isProductEditing,
        setCatalogPanelMode,
        setCatalogProductPanelMode,
        setSelectedCatalogId,
        setSelectedCatalogProductId,
        setTenantCatalogForm
    ]);

    const saveCatalog = React.useCallback(() => runAction?.(
        catalogPanelMode === 'create' ? 'Catalogo creado' : 'Catalogo actualizado',
        async () => {
            const payload = buildTenantCatalogPayload(tenantCatalogForm);
            if (catalogPanelMode === 'create') {
                const created = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/catalogs`, {
                    method: 'POST',
                    body: payload
                });
                await loadTenantCatalogs(settingsTenantId);
                openCatalogView?.(text(created?.item?.catalogId).toUpperCase());
                return;
            }
            if (!selectedTenantCatalog?.catalogId) return;
            await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/catalogs/${encodeURIComponent(selectedTenantCatalog.catalogId)}`, {
                method: 'PUT',
                body: payload
            });
            await loadTenantCatalogs(settingsTenantId);
            openCatalogView?.(selectedTenantCatalog.catalogId);
        }
    ), [
        buildTenantCatalogPayload,
        catalogPanelMode,
        loadTenantCatalogs,
        openCatalogView,
        requestJson,
        runAction,
        selectedTenantCatalog,
        settingsTenantId,
        tenantCatalogForm
    ]);

    const renderCatalogForm = React.useCallback(() => (
        <>
            <div className="saas-admin-form-row">
                <div className="saas-admin-field">
                    <label>ID catálogo</label>
                    <input
                        value={tenantCatalogForm.catalogId || ''}
                        onChange={(event) => setTenantCatalogForm?.((prev) => ({ ...prev, catalogId: text(event.target.value).toUpperCase() }))}
                        placeholder="CAT-XXXXXX (auto si vacío)"
                        disabled={busy || catalogPanelMode === 'edit'}
                    />
                </div>
                <div className="saas-admin-field">
                    <label>Nombre</label>
                    <input
                        value={tenantCatalogForm.name || ''}
                        onChange={(event) => setTenantCatalogForm?.((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Nombre del catálogo"
                        disabled={busy}
                    />
                </div>
            </div>
            <div className="saas-admin-form-row">
                <div className="saas-admin-field">
                    <label>Origen</label>
                    <select
                        value={tenantCatalogForm.sourceType || 'local'}
                        onChange={(event) => setTenantCatalogForm?.((prev) => ({ ...prev, sourceType: event.target.value }))}
                        disabled={busy}
                    >
                        <option value="local">local</option>
                        <option value="woocommerce">woocommerce</option>
                        <option value="meta">meta</option>
                    </select>
                </div>
                <div className="saas-admin-field">
                    <label>Descripción</label>
                    <input
                        value={tenantCatalogForm.description || ''}
                        onChange={(event) => setTenantCatalogForm?.((prev) => ({ ...prev, description: event.target.value }))}
                        placeholder="descripción corta"
                        disabled={busy}
                    />
                </div>
            </div>
            <div className="saas-admin-modules">
                <label className="saas-admin-module-toggle">
                    <input
                        type="checkbox"
                        checked={tenantCatalogForm.isActive !== false}
                        onChange={(event) => setTenantCatalogForm?.((prev) => ({ ...prev, isActive: event.target.checked }))}
                        disabled={busy}
                    />
                    <span>Catálogo activo</span>
                </label>
                <label className="saas-admin-module-toggle">
                    <input
                        type="checkbox"
                        checked={tenantCatalogForm.isDefault === true}
                        onChange={(event) => setTenantCatalogForm?.((prev) => ({ ...prev, isDefault: event.target.checked }))}
                        disabled={busy}
                    />
                    <span>Catálogo principal</span>
                </label>
            </div>
            {tenantCatalogForm.sourceType === 'woocommerce' ? (
                <>
                    <div className="saas-admin-form-row">
                        <input value={tenantCatalogForm.wooBaseUrl || ''} onChange={(event) => setTenantCatalogForm?.((prev) => ({ ...prev, wooBaseUrl: event.target.value }))} placeholder="Woo base URL" disabled={busy} />
                        <input type="number" min={10} max={500} value={tenantCatalogForm.wooPerPage || ''} onChange={(event) => setTenantCatalogForm?.((prev) => ({ ...prev, wooPerPage: event.target.value }))} placeholder="Woo per page" disabled={busy} />
                    </div>
                    <div className="saas-admin-form-row">
                        <input type="number" min={1} max={200} value={tenantCatalogForm.wooMaxPages || ''} onChange={(event) => setTenantCatalogForm?.((prev) => ({ ...prev, wooMaxPages: event.target.value }))} placeholder="Woo max pages" disabled={busy} />
                        <label className="saas-admin-module-toggle">
                            <input type="checkbox" checked={tenantCatalogForm.wooIncludeOutOfStock !== false} onChange={(event) => setTenantCatalogForm?.((prev) => ({ ...prev, wooIncludeOutOfStock: event.target.checked }))} disabled={busy} />
                            <span>Incluye sin stock</span>
                        </label>
                    </div>
                    <div className="saas-admin-form-row">
                        <input value={tenantCatalogForm.wooConsumerKey || ''} onChange={(event) => setTenantCatalogForm?.((prev) => ({ ...prev, wooConsumerKey: event.target.value }))} placeholder={tenantCatalogForm.wooConsumerKeyMasked || 'Woo consumer key'} disabled={busy} />
                        <input type="password" value={tenantCatalogForm.wooConsumerSecret || ''} onChange={(event) => setTenantCatalogForm?.((prev) => ({ ...prev, wooConsumerSecret: event.target.value }))} placeholder={tenantCatalogForm.wooConsumerSecretMasked || 'Woo consumer secret'} disabled={busy} />
                    </div>
                </>
            ) : null}
            <div className="saas-admin-form-row saas-admin-form-row--actions">
                <button type="button" disabled={busy || !canEditCatalog || !text(tenantCatalogForm.name)} onClick={saveCatalog}>
                    {catalogPanelMode === 'create' ? 'Guardar catálogo' : 'Actualizar catálogo'}
                </button>
                <button type="button" className="saas-btn-cancel" disabled={busy} onClick={close}>CANCELAR</button>
            </div>
        </>
    ), [
        busy,
        canEditCatalog,
        catalogPanelMode,
        close,
        saveCatalog,
        setTenantCatalogForm,
        tenantCatalogForm
    ]);

    const renderProductForm = React.useCallback(() => (
        <div className="saas-admin-related-block">
            <h4>{catalogProductPanelMode === 'create' ? 'Nuevo producto' : 'Editar producto'}</h4>
            <div className="saas-admin-form-row">
                <input value={catalogProductForm.title || ''} onChange={(event) => setCatalogProductForm?.((prev) => ({ ...prev, title: event.target.value }))} placeholder="Titulo" disabled={busy || catalogProductImageUploading} />
                <input value={catalogProductForm.price || ''} onChange={(event) => setCatalogProductForm?.((prev) => ({ ...prev, price: event.target.value }))} placeholder="Precio" disabled={busy || catalogProductImageUploading} />
            </div>
            <div className="saas-admin-form-row">
                <input value={catalogProductForm.sku || ''} onChange={(event) => setCatalogProductForm?.((prev) => ({ ...prev, sku: event.target.value }))} placeholder="SKU" disabled={busy || catalogProductImageUploading} />
                <input value={catalogProductForm.imageUrl || ''} onChange={(event) => setCatalogProductForm?.((prev) => ({ ...prev, imageUrl: event.target.value }))} placeholder="URL de imagen" disabled={busy || catalogProductImageUploading} />
            </div>
            <textarea value={catalogProductForm.description || ''} onChange={(event) => setCatalogProductForm?.((prev) => ({ ...prev, description: event.target.value }))} placeholder="descripción" disabled={busy || catalogProductImageUploading} />
            <label className="saas-admin-module-toggle">
                <input type="checkbox" checked={catalogProductForm.isActive !== false} onChange={(event) => setCatalogProductForm?.((prev) => ({ ...prev, isActive: event.target.checked }))} disabled={busy} />
                <span>Producto activo</span>
            </label>
            {catalogProductForm.imageUrl ? (
                <div className="saas-admin-preview-strip">
                    <img src={catalogProductForm.imageUrl} alt={catalogProductForm.title || 'Producto'} className="saas-admin-hero-image" />
                </div>
            ) : null}
            <ImageDropInput
                label={catalogProductImageUploading ? 'Subiendo imagen...' : 'Subir imagen de producto'}
                disabled={busy || catalogProductImageUploading}
                onFile={(file) => handleCatalogProductImageUpload?.(file)}
                helpText="PNG/JPG/WEBP, max 4 MB. Se guarda en archivos del tenant."
            />
            {catalogProductImageError ? <div className="saas-admin-alert error">{catalogProductImageError}</div> : null}
            <div className="saas-admin-form-row saas-admin-form-row--actions">
                <button type="button" disabled={busy || !canEditCatalog || !text(catalogProductForm.title) || !text(catalogProductForm.price)} onClick={() => runAction?.(catalogProductPanelMode === 'create' ? 'Producto creado' : 'Producto actualizado', async () => saveCatalogProduct?.())}>
                    {catalogProductPanelMode === 'create' ? 'Guardar producto' : 'Actualizar producto'}
                </button>
                <button type="button" className="saas-btn-cancel" disabled={busy} onClick={cancelCatalogProductEdit}>CANCELAR</button>
            </div>
        </div>
    ), [
        busy,
        canEditCatalog,
        cancelCatalogProductEdit,
        catalogProductForm,
        catalogProductImageError,
        catalogProductImageUploading,
        catalogProductPanelMode,
        handleCatalogProductImageUpload,
        runAction,
        saveCatalogProduct,
        setCatalogProductForm
    ]);

    const renderDetail = React.useCallback(() => {
        if (!settingsTenantId) {
            return (
                <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                    <h4>CATÁLOGOS POR EMPRESA</h4>
                    <p>Selecciona una empresa para gestionar varios catálogos.</p>
                </div>
            );
        }
        if (isCatalogEditing) return renderCatalogForm();
        if (!selectedTenantCatalog) {
            return (
                <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                    <h4>Sin catálogo seleccionado</h4>
                    <p>Selecciona un catálogo de la lista o crea uno nuevo.</p>
                </div>
            );
        }
        return (
            <>
                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>ID CATÁLOGO</span><strong>{selectedTenantCatalog.catalogId}</strong></div>
                    <div className="saas-admin-detail-field"><span>Nombre</span><strong>{selectedTenantCatalog.name || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>Origen</span><strong>{selectedTenantCatalog.sourceType}</strong></div>
                    <div className="saas-admin-detail-field"><span>ESTADO</span><strong>{selectedTenantCatalog.isActive ? 'Activo' : 'Inactivo'}</strong></div>
                    <div className="saas-admin-detail-field"><span>PRINCIPAL</span><strong>{selectedTenantCatalog.isDefault ? 'Sí' : 'No'}</strong></div>
                    <div className="saas-admin-detail-field"><span>ACTUALIZADO</span><strong>{formatDateTimeLabel(selectedTenantCatalog.updatedAt)}</strong></div>
                </div>
                <div className="saas-admin-related-block">
                    <h4>Descripción</h4>
                    <div className="saas-admin-related-row" role="status"><span>{selectedTenantCatalog.description || 'Sin descripción'}</span></div>
                </div>
                {selectedTenantCatalog.sourceType === 'local' ? (
                    <div className="saas-admin-related-block saas-admin-catalog-products-block">
                        <div className="saas-admin-pane-header">
                            <div>
                                <h4>Productos locales</h4>
                                <small>Gestiona productos con imagen, precio y detalle para este catálogo.</small>
                            </div>
                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                <button type="button" disabled={busy || loadingCatalogProducts} onClick={() => loadTenantCatalogProducts?.(settingsTenantId, selectedTenantCatalog.catalogId)}>Recargar</button>
                                <button type="button" disabled={busy || !canEditCatalog} onClick={openCatalogProductCreate}>Nuevo producto</button>
                            </div>
                        </div>
                        {loadingCatalogProducts ? <div className="saas-admin-empty-inline">Cargando productos...</div> : null}
                        {!loadingCatalogProducts && tenantCatalogProducts.length === 0 ? <div className="saas-admin-empty-inline">Sin productos en este catálogo.</div> : null}
                        <div className="saas-admin-related-list">
                            {tenantCatalogProducts.map((product) => (
                                <button
                                    key={`catalog_product_${product.productId}`}
                                    type="button"
                                    className={`saas-admin-related-row ${selectedCatalogProductId === product.productId && catalogProductPanelMode !== 'create' ? 'active' : ''}`.trim()}
                                    onClick={() => {
                                        setSelectedCatalogProductId?.(product.productId);
                                        setCatalogProductPanelMode?.('view');
                                        setCatalogProductForm?.(buildCatalogProductFormFromItem?.(product) || product);
                                        setCatalogProductImageError?.('');
                                    }}
                                >
                                    <span>{product.title || product.name || product.productId}</span>
                                    <small>{product.price ? `S/ ${product.price}` : '-'} | {product.isActive === false ? 'Inactivo' : 'Activo'}</small>
                                </button>
                            ))}
                        </div>
                        {selectedCatalogProduct && catalogProductPanelMode === 'view' ? (
                            <div className="saas-admin-related-block">
                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                    <button type="button" disabled={busy || !canEditCatalog} onClick={openCatalogProductEdit}>Editar producto</button>
                                    <button type="button" disabled={busy || !canEditCatalog} onClick={() => deactivateCatalogProduct?.(selectedCatalogProduct.productId)}>Desactivar</button>
                                </div>
                                <div className="saas-admin-detail-grid">
                                    <div className="saas-admin-detail-field"><span>Producto</span><strong>{selectedCatalogProduct.title || '-'}</strong></div>
                                    <div className="saas-admin-detail-field"><span>Precio</span><strong>{selectedCatalogProduct.price || '-'}</strong></div>
                                    <div className="saas-admin-detail-field"><span>SKU</span><strong>{selectedCatalogProduct.sku || '-'}</strong></div>
                                    <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedCatalogProduct.isActive === false ? 'Inactivo' : 'Activo'}</strong></div>
                                </div>
                            </div>
                        ) : null}
                        {isProductEditing ? renderProductForm() : null}
                    </div>
                ) : null}
                {selectedTenantCatalog.sourceType === 'woocommerce' ? (
                    <div className="saas-admin-related-block">
                        <h4>WooCommerce</h4>
                        <div className="saas-admin-detail-grid">
                            <div className="saas-admin-detail-field"><span>Base URL</span><strong>{selectedTenantCatalog.wooBaseUrl || '-'}</strong></div>
                            <div className="saas-admin-detail-field"><span>Per page</span><strong>{selectedTenantCatalog.wooPerPage}</strong></div>
                            <div className="saas-admin-detail-field"><span>Max pages</span><strong>{selectedTenantCatalog.wooMaxPages}</strong></div>
                            <div className="saas-admin-detail-field"><span>Incluye sin stock</span><strong>{selectedTenantCatalog.wooIncludeOutOfStock ? 'Si' : 'No'}</strong></div>
                        </div>
                    </div>
                ) : null}
            </>
        );
    }, [
        busy,
        canEditCatalog,
        catalogProductPanelMode,
        close,
        deactivateCatalogProduct,
        formatDateTimeLabel,
        isCatalogEditing,
        isProductEditing,
        loadTenantCatalogProducts,
        loadTenantCatalogs,
        loadingCatalogProducts,
        openCatalogEdit,
        openCatalogProductCreate,
        openCatalogProductEdit,
        renderCatalogForm,
        renderProductForm,
        requestJson,
        runAction,
        selectedCatalogProduct,
        selectedCatalogProductId,
        selectedTenantCatalog,
        setCatalogProductForm,
        setCatalogProductImageError,
        setCatalogProductPanelMode,
        setSelectedCatalogProductId,
        settingsTenantId,
        tenantCatalogProducts,
        buildCatalogProductFormFromItem
    ]);

    const detailActions = React.useMemo(() => {
        if (!selectedTenantCatalog || isCatalogEditing) return null;
        return (
            <>
                <button type="button" disabled={busy || !canEditCatalog} onClick={openCatalogEdit}>EDITAR</button>
                <button type="button" disabled={busy || !canEditCatalog || selectedTenantCatalog.isDefault === true} onClick={() => runAction?.('Catalogo marcado como principal', async () => {
                    await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/catalogs/${encodeURIComponent(selectedTenantCatalog.catalogId)}`, {
                        method: 'PUT',
                        body: { isDefault: true }
                    });
                    await loadTenantCatalogs(settingsTenantId);
                })}>Marcar principal</button>
                <button type="button" disabled={busy || !canEditCatalog || selectedTenantCatalog.isActive === false} onClick={() => runAction?.('Catálogo desactivado', async () => {
                    await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/catalogs/${encodeURIComponent(selectedTenantCatalog.catalogId)}`, { method: 'DELETE' });
                    await loadTenantCatalogs(settingsTenantId);
                    close();
                })}>DESACTIVAR</button>
            </>
        );
    }, [
        busy,
        canEditCatalog,
        close,
        isCatalogEditing,
        loadTenantCatalogs,
        openCatalogEdit,
        requestJson,
        runAction,
        selectedTenantCatalog,
        settingsTenantId
    ]);

    if (!isCatalogSection) return null;

    return (
        <SaasEntityPage
            id="saas_catalogos"
            sectionKey="saas_catalogos"
            title="CATÁLOGOS"
            rows={rows}
            columns={columns}
            selectedId={selectedId}
            onSelect={(row) => openCatalogView?.(row?.id)}
            onClose={close}
            renderDetail={renderDetail}
            renderForm={renderDetail}
            mode={isCatalogEditing ? 'form' : 'detail'}
            dirty={isCatalogEditing || isProductEditing}
            requestJson={requestJson}
            loading={loadingTenantCatalogs}
            emptyText={settingsTenantId ? 'Sin catálogos configurados.' : 'Selecciona una empresa para gestionar catálogos.'}
            searchPlaceholder="Buscar catálogo por nombre, código, origen o estado..."
            filters={filters}
            actions={[
                { label: 'Recargar', onClick: () => settingsTenantId && loadTenantCatalogs?.(settingsTenantId), disabled: busy || !settingsTenantId || loadingTenantCatalogs },
                { label: 'Nuevo catálogo', onClick: openCatalogCreate, disabled: busy || !settingsTenantId || !canEditCatalog }
            ]}
            detailTitle={catalogPanelMode === 'create' ? 'Nuevo catálogo' : (selectedTenantCatalog?.name || 'Detalle de catálogo')}
            detailSubtitle={catalogPanelMode === 'create' ? 'Deja el ID vacío para generarlo automáticamente.' : (selectedTenantCatalog?.catalogId || '')}
            detailActions={detailActions}
        />
    );
}

export default React.memo(CatalogSection);
