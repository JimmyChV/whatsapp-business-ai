import React from 'react';
import ImageDropInput from '../components/panel/ImageDropInput';

function CatalogSection({
    isCatalogSection,
    busy,
    settingsTenantId,
    loadingTenantCatalogs,
    loadTenantCatalogs,
    canEditCatalog,
    openCatalogCreate,
    tenantCatalogItems,
    selectedTenantCatalog,
    openCatalogView,
    catalogPanelMode,
    setCatalogPanelMode,
    setTenantCatalogForm,
    EMPTY_TENANT_CATALOG_FORM,
    cancelCatalogEdit,
    formatDateTimeLabel,
    openCatalogEdit,
    requestJson,
    runAction,
    buildTenantCatalogPayload,
    selectedCatalogProductId,
    setSelectedCatalogProductId,
    loadTenantCatalogProducts,
    tenantCatalogProducts,
    loadingCatalogProducts,
    setCatalogProductPanelMode,
    openCatalogProductCreate,
    selectedCatalogProduct,
    catalogProductPanelMode,
    openCatalogProductEdit,
    deactivateCatalogProduct,
    setCatalogProductForm,
    buildCatalogProductFormFromItem,
    catalogProductForm,
    setCatalogProductImageError,
    handleCatalogProductImageUpload,
    catalogProductImageUploading,
    catalogProductImageError,
    saveCatalogProduct,
    cancelCatalogProductEdit,
    setSelectedCatalogId,
    tenantCatalogForm
}) {
    if (!isCatalogSection) {
        return null;
    }

    return (
                    <section id="saas_catalogos" className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <div>
                                        <h3>Catalogos por empresa</h3>
                                        <small>Define multiples catalogos y su origen por tenant.</small>
                                    </div>
                                    <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                        <button
                                            type="button"
                                            disabled={busy || !settingsTenantId || loadingTenantCatalogs}
                                            onClick={() => settingsTenantId && loadTenantCatalogs(settingsTenantId)}
                                        >
                                            Recargar
                                        </button>
                                        <button type="button" disabled={busy || !settingsTenantId || !canEditCatalog} onClick={openCatalogCreate}>
                                            Nuevo catalogo
                                        </button>
                                    </div>
                                </div>

                                <div className="saas-admin-list saas-admin-list--compact">
                                    {!settingsTenantId && (
                                        <div className="saas-admin-empty-state">
                                            <h4>Selecciona una empresa</h4>
                                            <p>Primero elige el tenant para gestionar sus catalogos.</p>
                                        </div>
                                    )}

                                    {settingsTenantId && tenantCatalogItems.length === 0 && (
                                        <div className="saas-admin-empty-state">
                                            <p>Sin catalogos configurados.</p>
                                            {canEditCatalog && (
                                                <button type="button" disabled={busy} onClick={openCatalogCreate}>Crear primer catalogo</button>
                                            )}
                                        </div>
                                    )}

                                    {settingsTenantId && tenantCatalogItems.map((item) => (
                                        <button
                                            key={`catalog_item_${item.catalogId}`}
                                            type="button"
                                            className={`saas-admin-list-item saas-admin-list-item--button ${selectedTenantCatalog?.catalogId === item.catalogId ? 'active' : ''}`.trim()}
                                            onClick={() => openCatalogView(item.catalogId)}
                                        >
                                            <strong>{item.name || item.catalogId}</strong>
                                            <small>{item.catalogId}</small>
                                            <small>{item.sourceType} | {item.isActive ? 'activo' : 'inactivo'}</small>
                                        </button>
                                    ))}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!settingsTenantId && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Catalogos por tenant</h4>
                                        <p>Selecciona una empresa para gestionar varios catalogos.</p>
                                    </div>
                                )}

                                {settingsTenantId && catalogPanelMode === 'view' && !selectedTenantCatalog && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Sin catalogo seleccionado</h4>
                                        <p>Selecciona un catalogo de la lista o crea uno nuevo.</p>
                                    </div>
                                )}

                                {settingsTenantId && catalogPanelMode === 'view' && selectedTenantCatalog && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>{selectedTenantCatalog.name || selectedTenantCatalog.catalogId}</h3>
                                                <small>{selectedTenantCatalog.catalogId}</small>
                                            </div>
                                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                <button type="button" disabled={busy || !canEditCatalog} onClick={openCatalogEdit}>Editar</button>
                                                <button
                                                    type="button"
                                                    disabled={busy || !canEditCatalog || selectedTenantCatalog.isDefault === true}
                                                    onClick={() => runAction('Catalogo marcado como principal', async () => {
                                                        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/catalogs/${encodeURIComponent(selectedTenantCatalog.catalogId)}`, {
                                                            method: 'PUT',
                                                            body: { isDefault: true }
                                                        });
                                                        await loadTenantCatalogs(settingsTenantId);
                                                    })}
                                                >
                                                    Marcar principal
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy || !canEditCatalog || selectedTenantCatalog.isActive === false}
                                                    onClick={() => runAction('Catalogo desactivado', async () => {
                                                        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/catalogs/${encodeURIComponent(selectedTenantCatalog.catalogId)}`, {
                                                            method: 'DELETE'
                                                        });
                                                        await loadTenantCatalogs(settingsTenantId);
                                                        setSelectedCatalogId('');
                                                        setCatalogPanelMode('view');
                                                    })}
                                                >
                                                    Desactivar
                                                </button>
                                            </div>
                                        </div>

                                        <div className="saas-admin-detail-grid">
                                            <div className="saas-admin-detail-field"><span>ID catalogo</span><strong>{selectedTenantCatalog.catalogId}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Nombre</span><strong>{selectedTenantCatalog.name || '-'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Origen</span><strong>{selectedTenantCatalog.sourceType}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedTenantCatalog.isActive ? 'Activo' : 'Inactivo'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Principal</span><strong>{selectedTenantCatalog.isDefault ? 'Si' : 'No'}</strong></div>
                                            <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(selectedTenantCatalog.updatedAt)}</strong></div>
                                        </div>

                                        <div className="saas-admin-related-block">
                                            <h4>Descripcion</h4>
                                            <div className="saas-admin-related-list">
                                                <div className="saas-admin-related-row" role="status">
                                                    <span>{selectedTenantCatalog.description || 'Sin descripcion'}</span>
                                                </div>
                                            </div>
                                        </div>


                                        {selectedTenantCatalog.sourceType === 'local' && (
                                            <div className="saas-admin-related-block saas-admin-catalog-products-block">
                                                <div className="saas-admin-pane-header">
                                                    <div>
                                                        <h4>Productos locales</h4>
                                                        <small>Gestiona productos con imagen, precio y detalle para este catalogo.</small>
                                                    </div>
                                                    <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                        <button
                                                            type="button"
                                                            disabled={busy || loadingCatalogProducts}
                                                            onClick={() => loadTenantCatalogProducts(settingsTenantId, selectedTenantCatalog.catalogId)}
                                                        >
                                                            Recargar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={busy || !canEditCatalog}
                                                            onClick={openCatalogProductCreate}
                                                        >
                                                            Nuevo producto
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="saas-admin-catalog-products-layout">
                                                    <aside className="saas-admin-catalog-products-list">
                                                        {loadingCatalogProducts && (
                                                            <div className="saas-admin-empty-state">
                                                                <p>Cargando productos...</p>
                                                            </div>
                                                        )}

                                                        {!loadingCatalogProducts && tenantCatalogProducts.length === 0 && (
                                                            <div className="saas-admin-empty-state">
                                                                <p>Sin productos en este catalogo.</p>
                                                                {canEditCatalog && (
                                                                    <button type="button" disabled={busy} onClick={openCatalogProductCreate}>
                                                                        Crear primer producto
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}

                                                        {!loadingCatalogProducts && tenantCatalogProducts.map((productItem) => (
                                                            <button
                                                                key={`catalog_product_${productItem.productId}`}
                                                                type="button"
                                                                className={`saas-admin-list-item saas-admin-list-item--button ${selectedCatalogProductId === productItem.productId && catalogProductPanelMode !== 'create' ? 'active' : ''}`.trim()}
                                                                onClick={() => {
                                                                    setSelectedCatalogProductId(productItem.productId);
                                                                    setCatalogProductPanelMode('view');
                                                                    setCatalogProductForm(buildCatalogProductFormFromItem(productItem));
                                                                    setCatalogProductImageError('');
                                                                }}
                                                            >
                                                                <strong>{productItem.title || productItem.productId}</strong>
                                                                <small>{productItem.productId}</small>
                                                                <small>{productItem.price ? `Precio: ${productItem.price}` : 'Sin precio'} | {productItem.isActive ? 'activo' : 'inactivo'}</small>
                                                            </button>
                                                        ))}
                                                    </aside>

                                                    <div className="saas-admin-catalog-product-detail">
                                                        {catalogProductPanelMode === 'view' && !selectedCatalogProduct && (
                                                            <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                                                <h4>Sin producto seleccionado</h4>
                                                                <p>Selecciona un producto para ver su detalle o crea uno nuevo.</p>
                                                            </div>
                                                        )}

                                                        {catalogProductPanelMode === 'view' && selectedCatalogProduct && (
                                                            <>
                                                                <div className="saas-admin-pane-header">
                                                                    <div>
                                                                        <h3>{selectedCatalogProduct.title || selectedCatalogProduct.productId}</h3>
                                                                        <small>{selectedCatalogProduct.productId}</small>
                                                                    </div>
                                                                    <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                                        <button type="button" disabled={busy || !canEditCatalog} onClick={() => openCatalogProductEdit(selectedCatalogProduct)}>
                                                                            Editar
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            disabled={busy || !canEditCatalog || selectedCatalogProduct.isActive === false}
                                                                            onClick={() => runAction('Producto desactivado', async () => {
                                                                                await deactivateCatalogProduct(selectedCatalogProduct.productId);
                                                                            })}
                                                                        >
                                                                            Desactivar
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                {selectedCatalogProduct.imageUrl && (
                                                                    <img src={selectedCatalogProduct.imageUrl} alt={selectedCatalogProduct.title || selectedCatalogProduct.productId} className="saas-admin-catalog-product-image" />
                                                                )}

                                                                <div className="saas-admin-detail-grid">
                                                                    <div className="saas-admin-detail-field"><span>ID producto</span><strong>{selectedCatalogProduct.productId}</strong></div>
                                                                    <div className="saas-admin-detail-field"><span>Precio</span><strong>{selectedCatalogProduct.price || '-'}</strong></div>
                                                                    <div className="saas-admin-detail-field"><span>SKU</span><strong>{selectedCatalogProduct.sku || '-'}</strong></div>
                                                                    <div className="saas-admin-detail-field"><span>Estado</span><strong>{selectedCatalogProduct.isActive ? 'Activo' : 'Inactivo'}</strong></div>
                                                                    <div className="saas-admin-detail-field"><span>Stock</span><strong>{selectedCatalogProduct.stockQuantity || '-'}</strong></div>
                                                                    <div className="saas-admin-detail-field"><span>Categoria(s)</span><strong>{selectedCatalogProduct.categoriesText || '-'}</strong></div>
                                                                    <div className="saas-admin-detail-field"><span>Marca</span><strong>{selectedCatalogProduct.brand || '-'}</strong></div>
                                                                    <div className="saas-admin-detail-field"><span>URL</span><strong>{selectedCatalogProduct.url || '-'}</strong></div>
                                                                </div>

                                                                <div className="saas-admin-related-block">
                                                                    <h4>Descripcion</h4>
                                                                    <div className="saas-admin-related-list">
                                                                        <div className="saas-admin-related-row" role="status">
                                                                            <span>{selectedCatalogProduct.description || 'Sin descripcion'}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </>
                                                        )}

                                                        {(catalogProductPanelMode === 'create' || catalogProductPanelMode === 'edit') && (
                                                            <>
                                                                <div className="saas-admin-pane-header">
                                                                    <div>
                                                                        <h3>{catalogProductPanelMode === 'create' ? 'Nuevo producto' : 'Editar producto'}</h3>
                                                                        <small>{catalogProductPanelMode === 'create' ? 'Completa los datos principales y guarda.' : 'Actualiza los campos necesarios y guarda.'}</small>
                                                                    </div>
                                                                </div>

                                                                {catalogProductPanelMode === 'edit' && (
                                                                    <div className="saas-admin-detail-field">
                                                                        <span>ID producto</span>
                                                                        <strong>{catalogProductForm.productId || '-'}</strong>
                                                                    </div>
                                                                )}

                                                                <div className="saas-admin-form-row">
                                                                    <div className="saas-admin-field">
                                                                        <label>Titulo</label>
                                                                        <input
                                                                            value={catalogProductForm.title}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, title: event.target.value }))}
                                                                            placeholder="Nombre del producto"
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                    <div className="saas-admin-field">
                                                                        <label>Precio</label>
                                                                        <input
                                                                            value={catalogProductForm.price}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, price: event.target.value }))}
                                                                            placeholder="Ej: 29.90"
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="saas-admin-form-row">
                                                                    <div className="saas-admin-field">
                                                                        <label>Precio regular</label>
                                                                        <input
                                                                            value={catalogProductForm.regularPrice}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, regularPrice: event.target.value }))}
                                                                            placeholder="Precio regular"
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                    <div className="saas-admin-field">
                                                                        <label>Precio oferta</label>
                                                                        <input
                                                                            value={catalogProductForm.salePrice}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, salePrice: event.target.value }))}
                                                                            placeholder="Precio de oferta"
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="saas-admin-form-row">
                                                                    <div className="saas-admin-field">
                                                                        <label>SKU</label>
                                                                        <input
                                                                            value={catalogProductForm.sku}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, sku: event.target.value }))}
                                                                            placeholder="SKU"
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                    <div className="saas-admin-field">
                                                                        <label>Stock (cantidad)</label>
                                                                        <input
                                                                            type="number"
                                                                            min={0}
                                                                            value={catalogProductForm.stockQuantity}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, stockQuantity: event.target.value }))}
                                                                            placeholder="Cantidad"
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="saas-admin-form-row">
                                                                    <div className="saas-admin-field">
                                                                        <label>Estado de stock</label>
                                                                        <select
                                                                            value={catalogProductForm.stockStatus}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, stockStatus: event.target.value }))}
                                                                            disabled={busy}
                                                                        >
                                                                            <option value="instock">En stock</option>
                                                                            <option value="outofstock">Sin stock</option>
                                                                            <option value="onbackorder">Backorder</option>
                                                                        </select>
                                                                    </div>
                                                                    <div className="saas-admin-field">
                                                                        <label>Marca</label>
                                                                        <input
                                                                            value={catalogProductForm.brand}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, brand: event.target.value }))}
                                                                            placeholder="Marca"
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="saas-admin-form-row">
                                                                    <div className="saas-admin-field">
                                                                        <label>Categorias (coma separadas)</label>
                                                                        <input
                                                                            value={catalogProductForm.categoriesText}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, categoriesText: event.target.value }))}
                                                                            placeholder="Ej: Limpieza, Hogar"
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                    <div className="saas-admin-field">
                                                                        <label>URL del producto</label>
                                                                        <input
                                                                            value={catalogProductForm.url}
                                                                            onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, url: event.target.value }))}
                                                                            placeholder="https://..."
                                                                            disabled={busy}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="saas-admin-field">
                                                                    <label>Descripcion</label>
                                                                    <textarea
                                                                        value={catalogProductForm.description}
                                                                        onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, description: event.target.value }))}
                                                                        placeholder="Descripcion del producto"
                                                                        rows={4}
                                                                        disabled={busy}
                                                                    />
                                                                </div>

                                                                <label className="saas-admin-module-toggle">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={catalogProductForm.isActive !== false}
                                                                        onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                                                        disabled={busy}
                                                                    />
                                                                    <span>Producto activo</span>
                                                                </label>

                                                                {catalogProductForm.imageUrl && (
                                                                    <div className="saas-admin-preview-strip">
                                                                        <img src={catalogProductForm.imageUrl} alt={catalogProductForm.title || 'Producto'} className="saas-admin-hero-image" />
                                                                    </div>
                                                                )}

                                                                <div className="saas-admin-field">
                                                                    <label>URL de imagen</label>
                                                                    <input
                                                                        value={catalogProductForm.imageUrl}
                                                                        onChange={(event) => setCatalogProductForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
                                                                        placeholder="https://.../imagen.jpg"
                                                                        disabled={busy || catalogProductImageUploading}
                                                                    />
                                                                </div>

                                                                <ImageDropInput
                                                                    label={catalogProductImageUploading ? 'Subiendo imagen...' : 'Subir imagen de producto'}
                                                                    disabled={busy || catalogProductImageUploading}
                                                                    onFile={(file) => handleCatalogProductImageUpload(file)}
                                                                    helpText="PNG/JPG/WEBP, max 4 MB. Se guarda en archivos del tenant."
                                                                />

                                                                {catalogProductImageError && <div className="saas-admin-alert error">{catalogProductImageError}</div>}

                                                                <div className="saas-admin-form-row saas-admin-form-row--actions">
                                                                    <button
                                                                        type="button"
                                                                        disabled={busy || !canEditCatalog || !String(catalogProductForm.title || '').trim() || !String(catalogProductForm.price || '').trim()}
                                                                        onClick={() => runAction(catalogProductPanelMode === 'create' ? 'Producto creado' : 'Producto actualizado', async () => {
                                                                            await saveCatalogProduct();
                                                                        })}
                                                                    >
                                                                        {catalogProductPanelMode === 'create' ? 'Guardar producto' : 'Actualizar producto'}
                                                                    </button>
                                                                    <button type="button" disabled={busy} onClick={cancelCatalogProductEdit}>Cancelar</button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {selectedTenantCatalog.sourceType === 'woocommerce' && (
                                            <div className="saas-admin-related-block">
                                                <h4>WooCommerce</h4>
                                                <div className="saas-admin-detail-grid">
                                                    <div className="saas-admin-detail-field"><span>Base URL</span><strong>{selectedTenantCatalog.wooBaseUrl || '-'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Per page</span><strong>{selectedTenantCatalog.wooPerPage}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Max pages</span><strong>{selectedTenantCatalog.wooMaxPages}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Incluye sin stock</span><strong>{selectedTenantCatalog.wooIncludeOutOfStock ? 'Si' : 'No'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Consumer key</span><strong>{selectedTenantCatalog.wooConsumerKeyMasked || 'No configurada'}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Consumer secret</span><strong>{selectedTenantCatalog.wooConsumerSecretMasked || 'No configurada'}</strong></div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}

                                {settingsTenantId && (catalogPanelMode === 'create' || catalogPanelMode === 'edit') && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>{catalogPanelMode === 'create' ? 'Nuevo catalogo' : 'Editar catalogo'}</h3>
                                                <small>{catalogPanelMode === 'create' ? 'Deja ID vacio para generarlo automaticamente.' : 'Actualiza los campos necesarios y guarda.'}</small>
                                            </div>
                                        </div>

                                        <div className="saas-admin-form-row">
                                            <div className="saas-admin-field">
                                                <label>ID catalogo</label>
                                                <input
                                                    value={tenantCatalogForm.catalogId}
                                                    onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, catalogId: String(event.target.value || '').toUpperCase() }))}
                                                    placeholder="CAT-XXXXXX (auto si vacio)"
                                                    disabled={busy || catalogPanelMode === 'edit'}
                                                />
                                            </div>
                                            <div className="saas-admin-field">
                                                <label>Nombre</label>
                                                <input
                                                    value={tenantCatalogForm.name}
                                                    onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, name: event.target.value }))}
                                                    placeholder="Nombre del catalogo"
                                                    disabled={busy}
                                                />
                                            </div>
                                        </div>

                                        <div className="saas-admin-form-row">
                                            <div className="saas-admin-field">
                                                <label>Origen</label>
                                                <select
                                                    value={tenantCatalogForm.sourceType}
                                                    onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, sourceType: event.target.value }))}
                                                    disabled={busy}
                                                >
                                                    <option value="local">local</option>
                                                    <option value="woocommerce">woocommerce</option>
                                                    <option value="meta">meta</option>
                                                </select>
                                            </div>
                                            <div className="saas-admin-field">
                                                <label>Descripcion</label>
                                                <input
                                                    value={tenantCatalogForm.description}
                                                    onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, description: event.target.value }))}
                                                    placeholder="Descripcion corta"
                                                    disabled={busy}
                                                />
                                            </div>
                                        </div>

                                        <div className="saas-admin-modules">
                                            <label className="saas-admin-module-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={tenantCatalogForm.isActive !== false}
                                                    onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                                    disabled={busy}
                                                />
                                                <span>Catalogo activo</span>
                                            </label>
                                            <label className="saas-admin-module-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={tenantCatalogForm.isDefault === true}
                                                    onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, isDefault: event.target.checked }))}
                                                    disabled={busy}
                                                />
                                                <span>Catalogo principal</span>
                                            </label>
                                        </div>

                                        {tenantCatalogForm.sourceType === 'woocommerce' && (
                                            <>
                                                <div className="saas-admin-form-row">
                                                    <input value={tenantCatalogForm.wooBaseUrl} onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, wooBaseUrl: event.target.value }))} placeholder="Woo base URL (https://tu-tienda.com)" disabled={busy} />
                                                    <input type="number" min={10} max={500} value={tenantCatalogForm.wooPerPage} onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, wooPerPage: event.target.value }))} placeholder="Woo per page" disabled={busy} />
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input type="number" min={1} max={200} value={tenantCatalogForm.wooMaxPages} onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, wooMaxPages: event.target.value }))} placeholder="Woo max pages" disabled={busy} />
                                                    <label className="saas-admin-module-toggle">
                                                        <input type="checkbox" checked={tenantCatalogForm.wooIncludeOutOfStock !== false} onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, wooIncludeOutOfStock: event.target.checked }))} disabled={busy} />
                                                        <span>Woo incluye sin stock</span>
                                                    </label>
                                                </div>
                                                <div className="saas-admin-form-row">
                                                    <input value={tenantCatalogForm.wooConsumerKey} onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, wooConsumerKey: event.target.value }))} placeholder={tenantCatalogForm.wooConsumerKeyMasked || 'Woo consumer key (opcional para actualizar)'} disabled={busy} />
                                                    <input type="password" value={tenantCatalogForm.wooConsumerSecret} onChange={(event) => setTenantCatalogForm((prev) => ({ ...prev, wooConsumerSecret: event.target.value }))} placeholder={tenantCatalogForm.wooConsumerSecretMasked || 'Woo consumer secret (opcional para actualizar)'} disabled={busy} />
                                                </div>
                                            </>
                                        )}

                                        <div className="saas-admin-form-row saas-admin-form-row--actions">
                                            <button
                                                type="button"
                                                disabled={busy || !canEditCatalog || !String(tenantCatalogForm.name || '').trim()}
                                                onClick={() => runAction(catalogPanelMode === 'create' ? 'Catalogo creado' : 'Catalogo actualizado', async () => {
                                                    const payload = buildTenantCatalogPayload(tenantCatalogForm);
                                                    if (catalogPanelMode === 'create') {
                                                        const created = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/catalogs`, {
                                                            method: 'POST',
                                                            body: payload
                                                        });
                                                        await loadTenantCatalogs(settingsTenantId);
                                                        openCatalogView(String(created?.item?.catalogId || '').trim().toUpperCase());
                                                        return;
                                                    }
                                                    if (!selectedTenantCatalog?.catalogId) return;
                                                    await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/catalogs/${encodeURIComponent(selectedTenantCatalog.catalogId)}`, {
                                                        method: 'PUT',
                                                        body: payload
                                                    });
                                                    await loadTenantCatalogs(settingsTenantId);
                                                    openCatalogView(selectedTenantCatalog.catalogId);
                                                })}
                                            >
                                                {catalogPanelMode === 'create' ? 'Guardar catalogo' : 'Actualizar catalogo'}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => {
                                                    if (catalogPanelMode === 'create') {
                                                        setCatalogPanelMode('view');
                                                        setTenantCatalogForm(EMPTY_TENANT_CATALOG_FORM);
                                                        return;
                                                    }
                                                    cancelCatalogEdit();
                                                }}
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </section>
    );
}

export default React.memo(CatalogSection);

