export default function BusinessCatalogProductForm({
    editingProduct,
    formData,
    setFormData,
    activeCatalogId,
    imageUploadBusy,
    imageUploadError,
    onImageFileChange,
    onSubmit,
    onCancel
}) {
    const formSurface = 'var(--chat-card-surface)';
    const formSurfaceAlt = 'var(--chat-card-surface-alt)';
    const controlSurface = 'var(--chat-control-surface)';
    const controlStrongSurface = 'var(--chat-control-surface-strong)';
    const controlBorder = 'var(--chat-control-border)';
    const primaryText = 'var(--text-primary)';
    const secondaryText = 'var(--chat-control-text-soft)';
    const successBorder = 'var(--chat-success-border)';
    const successText = 'var(--chat-success-text)';
    const dangerSurface = 'var(--chat-danger-soft)';
    const dangerBorder = 'var(--chat-danger-border)';
    const dangerText = 'var(--chat-danger-text)';
    const baseFieldStyle = {
        background: controlStrongSurface,
        border: `1px solid ${controlBorder}`,
        color: primaryText,
        padding: '8px 12px',
        borderRadius: '8px',
        fontSize: '0.82rem',
        outline: 'none'
    };

    return (
        <form
            onSubmit={onSubmit}
            style={{
                background: formSurface,
                borderRadius: '12px',
                padding: '14px',
                border: `1px solid ${successBorder}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                boxShadow: 'var(--chat-panel-shadow)'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ fontSize: '0.85rem', color: successText, fontWeight: 700 }}>
                    {editingProduct ? 'Editar producto local' : 'Nuevo producto local'}
                </div>
                <div style={{ fontSize: '0.67rem', color: secondaryText }}>
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
                    style={baseFieldStyle}
                />
                <input
                    type="text"
                    placeholder="SKU (opcional)"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    style={baseFieldStyle}
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                <input
                    type="text"
                    placeholder="Precio venta"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    style={baseFieldStyle}
                />
                <input
                    type="text"
                    placeholder="Precio regular"
                    value={formData.regularPrice}
                    onChange={(e) => setFormData({ ...formData, regularPrice: e.target.value })}
                    style={baseFieldStyle}
                />
                <input
                    type="text"
                    placeholder="Precio oferta"
                    value={formData.salePrice}
                    onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
                    style={baseFieldStyle}
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 160px) minmax(0, 150px)', gap: '8px' }}>
                <input
                    type="text"
                    placeholder="Categorias (coma separada)"
                    value={formData.categories}
                    onChange={(e) => setFormData({ ...formData, categories: e.target.value })}
                    style={baseFieldStyle}
                />
                <input
                    type="text"
                    placeholder="Marca"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    style={baseFieldStyle}
                />
                <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Stock"
                    value={formData.stockQuantity}
                    onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                    style={baseFieldStyle}
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 220px)', gap: '8px' }}>
                <input
                    type="text"
                    placeholder="URL de producto (opcional)"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    style={baseFieldStyle}
                />
                <select
                    value={String(formData.stockStatus || 'instock')}
                    onChange={(e) => setFormData({ ...formData, stockStatus: e.target.value })}
                    style={baseFieldStyle}
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
                style={{ ...baseFieldStyle, resize: 'vertical' }}
            />

            <div style={{ border: `1px solid ${successBorder}`, borderRadius: '10px', padding: '9px', background: formSurfaceAlt, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '0.72rem', color: successText, fontWeight: 700 }}>Imagen del producto</div>
                    <label
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'var(--saas-accent-primary)',
                            color: 'var(--saas-accent-primary-text)',
                            border: '1px solid color-mix(in srgb, var(--saas-accent-primary) 70%, transparent)',
                            borderRadius: '8px',
                            padding: '5px 10px',
                            cursor: imageUploadBusy ? 'not-allowed' : 'pointer',
                            fontSize: '0.73rem',
                            fontWeight: 700,
                            opacity: imageUploadBusy ? 0.65 : 1
                        }}
                    >
                        {imageUploadBusy ? 'Subiendo...' : 'Subir imagen'}
                        <input
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/webp"
                            onChange={onImageFileChange}
                            disabled={imageUploadBusy}
                            style={{ display: 'none' }}
                        />
                    </label>
                </div>

                {imageUploadError && (
                    <div style={{ fontSize: '0.7rem', color: dangerText }}>{imageUploadError}</div>
                )}

                <input
                    type="text"
                    placeholder="URL de imagen (opcional)"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    style={baseFieldStyle}
                />

                {formData.imageUrl && (
                    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: '8px', alignItems: 'center' }}>
                        <div style={{ width: '70px', height: '70px', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${controlBorder}`, background: formSurfaceAlt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img src={formData.imageUrl} alt={formData.title || 'producto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ fontSize: '0.7rem', color: secondaryText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {formData.imageUrl}
                        </div>
                        <button
                            type="button"
                            onClick={() => setFormData((prev) => ({ ...prev, imageUrl: '' }))}
                            style={{ background: dangerSurface, border: `1px solid ${dangerBorder}`, color: dangerText, borderRadius: '8px', padding: '5px 9px', fontSize: '0.72rem', cursor: 'pointer' }}
                        >
                            Quitar
                        </button>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '3px' }}>
                <button type="submit" style={{ flex: 1, background: 'var(--saas-accent-primary)', color: 'var(--saas-accent-primary-text)', border: '1px solid color-mix(in srgb, var(--saas-accent-primary) 70%, transparent)', borderRadius: '8px', padding: '9px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                    {editingProduct ? 'Actualizar' : 'Guardar'}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    style={{ flex: 1, background: controlSurface, border: `1px solid ${controlBorder}`, color: primaryText, borderRadius: '8px', padding: '9px', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                    Cancelar
                </button>
            </div>
        </form>
    );
}
