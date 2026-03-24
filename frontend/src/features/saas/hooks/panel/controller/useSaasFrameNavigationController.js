import useSaasPanelFrameProps from './useSaasPanelFrameProps';

export default function useSaasFrameNavigationController(input = {}) {
    const {
        panelNavigation,
        operationAccess,
        moduleSectionActions,
        lifecycleState,
        onLogout,
        onClose,
        setSettingsTenantId,
        setSelectedTenantId,
        embedded,
        showHeader,
        busy,
        currentUserAvatarUrl,
        currentUserDisplayName,
        currentUserRoleLabel,
        buildInitials,
        closeLabel,
        activeTenantLabel,
        error,
        showPanelLoading,
        requiresTenantSelection,
        settingsTenantId,
        tenantOptions,
        toTenantDisplayName,
        showNavigation,
        tenantScopeLocked
    } = input;

    const {
        adminNavItems,
        selectedSectionId
    } = panelNavigation;
    const {
        canOpenOperation
    } = operationAccess;
    const {
        handleSectionChange
    } = moduleSectionActions;
    const {
        handleOpenOperation
    } = lifecycleState;

    const handlePanelClose = () => {
        if (typeof onLogout === 'function') {
            onLogout();
            return;
        }
        onClose?.();
    };

    const handleTenantChange = (nextTenantId) => {
        setSettingsTenantId(nextTenantId);
        if (nextTenantId) setSelectedTenantId(nextTenantId);
    };

    const handleTenantClear = () => {
        setSettingsTenantId('');
        setSelectedTenantId('');
    };

    const { sharedHeaderProps, frameProps } = useSaasPanelFrameProps({
        embedded,
        showHeader,
        canOpenOperation,
        busy,
        handleOpenOperation,
        currentUserAvatarUrl,
        currentUserDisplayName,
        currentUserRoleLabel,
        buildInitials,
        closeLabel,
        handlePanelClose,
        activeTenantLabel,
        error,
        showPanelLoading,
        requiresTenantSelection,
        settingsTenantId,
        tenantOptions,
        toTenantDisplayName,
        handleTenantChange,
        handleTenantClear,
        showNavigation,
        adminNavItems,
        selectedSectionId,
        tenantScopeLocked,
        handleSectionChange
    });

    return {
        selectedSectionId,
        adminNavItems,
        canOpenOperation,
        handleSectionChange,
        handlePanelClose,
        handleTenantChange,
        handleTenantClear,
        sharedHeaderProps,
        frameProps
    };
}
