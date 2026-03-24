import useSaasPanelBootstrap from './useSaasPanelBootstrap';
import useSaasPanelSelectionState from './useSaasPanelSelectionState';
import useSaasPanelSelectionHotkeys from './useSaasPanelSelectionHotkeys';
import useSaasPanelTenantScopeEffects from './useSaasPanelTenantScopeEffects';
import useSaasPanelSectionSyncEffects from './useSaasPanelSectionSyncEffects';
import useSaasPanelFormSyncEffects from './useSaasPanelFormSyncEffects';
import useSaasPanelCrossNavigation from './useSaasPanelCrossNavigation';

export default function useSaasPanelLifecycle({
    bootstrap,
    selection,
    hotkeys,
    tenantScopeEffects,
    sectionSyncEffects,
    formSyncEffects,
    crossNavigation
} = {}) {
    const {
        runAction,
        handleOpenOperation,
        handleFormImageUpload
    } = useSaasPanelBootstrap(bootstrap);

    const {
        clearPanelSelection,
        panelHasSelection
    } = useSaasPanelSelectionState(selection);

    useSaasPanelSelectionHotkeys({
        ...hotkeys,
        hasSelection: panelHasSelection,
        clearPanelSelection
    });

    useSaasPanelTenantScopeEffects(tenantScopeEffects);
    useSaasPanelSectionSyncEffects(sectionSyncEffects);
    useSaasPanelFormSyncEffects(formSyncEffects);

    const {
        openTenantFromUserMembership,
        openUserFromTenant
    } = useSaasPanelCrossNavigation(crossNavigation);

    return {
        runAction,
        handleOpenOperation,
        handleFormImageUpload,
        clearPanelSelection,
        panelHasSelection,
        openTenantFromUserMembership,
        openUserFromTenant
    };
}
