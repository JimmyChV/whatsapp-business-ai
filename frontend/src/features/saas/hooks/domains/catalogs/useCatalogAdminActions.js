import {
    buildCatalogProductFormFromItem,
    buildCatalogProductPayload,
    buildTenantCatalogFormFromItem,
    normalizeCatalogProductItem,
    normalizeTenantCatalogItem,
    uploadImageAsset
} from '../../../helpers';
import {
    createTenantCatalogProduct,
    deactivateTenantCatalogProduct,
    fetchTenantCatalogProducts,
    fetchTenantCatalogs,
    updateTenantCatalogProduct
} from '../../../services';

export default function useCatalogAdminActions({
    requestJson,
    settingsTenantId = '',
    canEditCatalog = false,
    selectedTenantCatalog = null,
    selectedCatalogProduct = null,
    selectedCatalogProductId = '',
    catalogProductForm = {},
    catalogProductPanelMode = 'view',
    emptyCatalogProductForm = {},
    emptyTenantCatalogForm = {},
    setTenantCatalogs,
    setSelectedCatalogId,
    setTenantCatalogForm,
    setTenantCatalogProducts,
    setSelectedCatalogProductId,
    setCatalogProductForm,
    setCatalogProductPanelMode,
    setCatalogProductImageError,
    setCatalogProductImageUploading,
    setLoadingTenantCatalogs,
    setLoadingCatalogProducts,
    setCatalogPanelMode
} = {}) {
    const loadTenantCatalogs = async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setTenantCatalogs([]);
            setSelectedCatalogId('');
            setTenantCatalogForm(emptyTenantCatalogForm);
            setTenantCatalogProducts([]);
            setSelectedCatalogProductId('');
            setCatalogProductForm({ ...emptyCatalogProductForm });
            setCatalogProductPanelMode('view');
            setCatalogProductImageError('');
            return;
        }
        setLoadingTenantCatalogs(true);
        try {
            const payload = await fetchTenantCatalogs(requestJson, cleanTenantId);
            const items = (Array.isArray(payload?.items) ? payload.items : [])
                .map((entry) => normalizeTenantCatalogItem(entry))
                .filter(Boolean);
            setTenantCatalogs(items);
            setSelectedCatalogId((prev) => {
                const cleanPrev = String(prev || '').trim().toUpperCase();
                if (cleanPrev && items.some((entry) => String(entry?.catalogId || '').trim().toUpperCase() === cleanPrev)) {
                    return cleanPrev;
                }
                return '';
            });
        } finally {
            setLoadingTenantCatalogs(false);
        }
    };

    const loadTenantCatalogProducts = async (tenantId, catalogId) => {
        const cleanTenantId = String(tenantId || '').trim();
        const cleanCatalogId = String(catalogId || '').trim().toUpperCase();
        if (!cleanTenantId || !cleanCatalogId) {
            setTenantCatalogProducts([]);
            setSelectedCatalogProductId('');
            setCatalogProductForm({ ...emptyCatalogProductForm });
            setCatalogProductPanelMode('view');
            setCatalogProductImageError('');
            return;
        }

        setLoadingCatalogProducts(true);
        try {
            const payload = await fetchTenantCatalogProducts(requestJson, cleanTenantId, cleanCatalogId);
            const items = (Array.isArray(payload?.items) ? payload.items : [])
                .map((entry) => normalizeCatalogProductItem(entry))
                .filter(Boolean)
                .sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || ''), 'es', { sensitivity: 'base' }));

            setTenantCatalogProducts(items);
            setSelectedCatalogProductId((prev) => {
                const cleanPrev = String(prev || '').trim();
                if (cleanPrev && items.some((item) => String(item?.productId || '').trim() === cleanPrev)) {
                    return cleanPrev;
                }
                return '';
            });
        } finally {
            setLoadingCatalogProducts(false);
        }
    };

    const openCatalogProductCreate = () => {
        if (!canEditCatalog || !selectedTenantCatalog || selectedTenantCatalog.sourceType !== 'local') return;
        setSelectedCatalogProductId('');
        setCatalogProductForm({ ...emptyCatalogProductForm });
        setCatalogProductPanelMode('create');
        setCatalogProductImageError('');
    };

    const openCatalogProductEdit = (product) => {
        if (!canEditCatalog || !product) return;
        setSelectedCatalogProductId(String(product.productId || '').trim());
        setCatalogProductForm(buildCatalogProductFormFromItem(product));
        setCatalogProductPanelMode('edit');
        setCatalogProductImageError('');
    };

    const cancelCatalogProductEdit = () => {
        if (selectedCatalogProduct) {
            setCatalogProductForm(buildCatalogProductFormFromItem(selectedCatalogProduct));
        } else {
            setCatalogProductForm({ ...emptyCatalogProductForm });
        }
        setCatalogProductPanelMode('view');
        setCatalogProductImageError('');
    };

    const saveCatalogProduct = async () => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        const cleanCatalogId = String(selectedTenantCatalog?.catalogId || '').trim().toUpperCase();
        if (!cleanTenantId || !cleanCatalogId) throw new Error('Selecciona tenant y catalogo antes de guardar.');

        const payload = buildCatalogProductPayload(catalogProductForm, {
            moduleId: '',
            catalogId: cleanCatalogId
        });

        if (!String(payload.title || '').trim()) throw new Error('Titulo de producto es obligatorio.');
        if (!String(payload.price || '').trim()) throw new Error('Precio de producto es obligatorio.');

        if (catalogProductPanelMode === 'create') {
            await createTenantCatalogProduct(requestJson, cleanTenantId, cleanCatalogId, payload);
        } else {
            const cleanProductId = String(catalogProductForm.productId || selectedCatalogProductId || '').trim();
            if (!cleanProductId) throw new Error('Producto invalido para actualizar.');
            await updateTenantCatalogProduct(requestJson, cleanTenantId, cleanCatalogId, cleanProductId, payload);
        }

        await loadTenantCatalogProducts(cleanTenantId, cleanCatalogId);
        setCatalogProductPanelMode('view');
        setCatalogProductForm({ ...emptyCatalogProductForm });
    };

    const deactivateCatalogProduct = async (productId) => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        const cleanCatalogId = String(selectedTenantCatalog?.catalogId || '').trim().toUpperCase();
        const cleanProductId = String(productId || '').trim();
        if (!cleanTenantId || !cleanCatalogId || !cleanProductId) return;

        await deactivateTenantCatalogProduct(requestJson, cleanTenantId, cleanCatalogId, cleanProductId);
        await loadTenantCatalogProducts(cleanTenantId, cleanCatalogId);
        setCatalogProductPanelMode('view');
    };

    const handleCatalogProductImageUpload = async (file) => {
        if (!file) return;
        const cleanTenantId = String(settingsTenantId || '').trim();
        const cleanCatalogId = String(selectedTenantCatalog?.catalogId || '').trim().toUpperCase();
        if (!cleanTenantId || !cleanCatalogId) {
            setCatalogProductImageError('Selecciona un catalogo local antes de subir imagen.');
            return;
        }

        try {
            setCatalogProductImageUploading(true);
            setCatalogProductImageError('');
            const uploadedUrl = await uploadImageAsset({
                file,
                tenantId: cleanTenantId,
                scope: `catalog-product-${cleanCatalogId.toLowerCase()}`,
                requestJson
            });
            if (!uploadedUrl) throw new Error('No se recibio URL de imagen.');
            setCatalogProductForm((prev) => ({ ...prev, imageUrl: uploadedUrl }));
        } catch (error) {
            setCatalogProductImageError(String(error?.message || 'No se pudo subir la imagen del producto.'));
        } finally {
            setCatalogProductImageUploading(false);
        }
    };

    const openCatalogView = (catalogId = '') => {
        const cleanCatalogId = String(catalogId || '').trim().toUpperCase();
        setSelectedCatalogId(cleanCatalogId);
        if (!cleanCatalogId) {
            setTenantCatalogForm(emptyTenantCatalogForm);
        }
        setCatalogPanelMode('view');
        setCatalogProductPanelMode('view');
    };

    const openCatalogCreate = () => {
        if (!canEditCatalog) return;
        setSelectedCatalogId('');
        setSelectedCatalogProductId('');
        setCatalogPanelMode('create');
        setTenantCatalogForm(emptyTenantCatalogForm);
    };

    const openCatalogEdit = () => {
        if (!canEditCatalog || !selectedTenantCatalog) return;
        setCatalogPanelMode('edit');
        setTenantCatalogForm(buildTenantCatalogFormFromItem(selectedTenantCatalog));
    };

    const cancelCatalogEdit = () => {
        if (selectedTenantCatalog) {
            setTenantCatalogForm(buildTenantCatalogFormFromItem(selectedTenantCatalog));
        } else {
            setTenantCatalogForm(emptyTenantCatalogForm);
        }
        setCatalogPanelMode('view');
    };

    return {
        loadTenantCatalogs,
        loadTenantCatalogProducts,
        openCatalogProductCreate,
        openCatalogProductEdit,
        cancelCatalogProductEdit,
        saveCatalogProduct,
        deactivateCatalogProduct,
        handleCatalogProductImageUpload,
        openCatalogView,
        openCatalogCreate,
        openCatalogEdit,
        cancelCatalogEdit
    };
}
