export default function useSaasPanelFrameProps(input = {}) {
    const {
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
    } = input;

    const sharedHeaderProps = {
        embedded,
        showHeader,
        canOpenOperation,
        isBusy: busy,
        onOpenOperation: handleOpenOperation,
        currentUserAvatarUrl,
        currentUserDisplayName,
        currentUserRoleLabel,
        buildInitials,
        closeLabel,
        onClose: handlePanelClose
    };

    const frameProps = {
        ...sharedHeaderProps,
        title: 'Control SaaS',
        subtitle: `Empresa activa: ${activeTenantLabel}`,
        error,
        showPanelLoading,
        requiresTenantSelection,
        settingsTenantId,
        tenantOptions,
        toTenantDisplayName,
        onChangeTenant: handleTenantChange,
        onClearTenant: handleTenantClear,
        showNavigation,
        adminNavItems,
        selectedSectionId,
        tenantScopeLocked,
        onSectionChange: handleSectionChange
    };

    return {
        sharedHeaderProps,
        frameProps
    };
}
