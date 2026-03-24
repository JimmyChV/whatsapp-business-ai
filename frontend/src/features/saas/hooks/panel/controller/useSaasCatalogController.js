export default function useSaasCatalogController(input = {}) {
    const {
        panelCoreState = {},
        panelDerivedData = {},
        catalogAdminActions = null
    } = input;

    const catalogState = {
        tenantCatalogs: panelCoreState.tenantCatalogs,
        setTenantCatalogs: panelCoreState.setTenantCatalogs,
        selectedCatalogId: panelCoreState.selectedCatalogId,
        setSelectedCatalogId: panelCoreState.setSelectedCatalogId,
        tenantCatalogForm: panelCoreState.tenantCatalogForm,
        setTenantCatalogForm: panelCoreState.setTenantCatalogForm,
        loadingTenantCatalogs: panelCoreState.loadingTenantCatalogs,
        setLoadingTenantCatalogs: panelCoreState.setLoadingTenantCatalogs,
        catalogPanelMode: panelCoreState.catalogPanelMode,
        setCatalogPanelMode: panelCoreState.setCatalogPanelMode,
        tenantCatalogProducts: panelCoreState.tenantCatalogProducts,
        setTenantCatalogProducts: panelCoreState.setTenantCatalogProducts,
        selectedCatalogProductId: panelCoreState.selectedCatalogProductId,
        setSelectedCatalogProductId: panelCoreState.setSelectedCatalogProductId,
        catalogProductForm: panelCoreState.catalogProductForm,
        setCatalogProductForm: panelCoreState.setCatalogProductForm,
        catalogProductPanelMode: panelCoreState.catalogProductPanelMode,
        setCatalogProductPanelMode: panelCoreState.setCatalogProductPanelMode,
        loadingCatalogProducts: panelCoreState.loadingCatalogProducts,
        setLoadingCatalogProducts: panelCoreState.setLoadingCatalogProducts,
        catalogProductImageUploading: panelCoreState.catalogProductImageUploading,
        setCatalogProductImageUploading: panelCoreState.setCatalogProductImageUploading,
        catalogProductImageError: panelCoreState.catalogProductImageError,
        setCatalogProductImageError: panelCoreState.setCatalogProductImageError
    };

    const catalogDerived = {
        tenantCatalogItems: panelDerivedData.tenantCatalogItems,
        selectedTenantCatalog: panelDerivedData.selectedTenantCatalog,
        selectedCatalogProduct: panelDerivedData.selectedCatalogProduct,
        activeCatalogOptions: panelDerivedData.activeCatalogOptions,
        activeCatalogLabelMap: panelDerivedData.activeCatalogLabelMap
    };

    return {
        catalogState,
        catalogDerived,
        catalogActions: catalogAdminActions
    };
}
