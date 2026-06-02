import useSaasPanelFrameProps from './useSaasPanelFrameProps';

export default function useSaasFrameNavigationController(input = {}) {
    const {
        panelNavigation,
        operationAccess,
        handleSectionChange,
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
        themeMode,
        onThemeChange,
        savingActions,
        panelActivity,
        onRetryActivity,
        activeTenantLabel,
        error,
        showPanelLoading,
        requiresTenantSelection,
        settingsTenantId,
        tenantOptions,
        sessionTenantId,
        handleSwitchTenant,
        setError,
        setBusy,
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
        handleOpenOperation
    } = lifecycleState;

    const handlePanelClose = () => {
        if (typeof onLogout === 'function') {
            onLogout();
            return;
        }
        onClose?.();
    };

    const operationalTenantOptions = (Array.isArray(tenantOptions) ? tenantOptions : [])
        .filter((tenant) => String(tenant?.id || '').trim() !== 'default');

    const handleTenantChange = async (nextTenantId) => {
        const cleanTenantId = String(nextTenantId || '').trim();
        if (!cleanTenantId) {
            handleTenantClear();
            return;
        }
        if (cleanTenantId === 'default') {
            setError?.('Default no es un tenant operativo. Selecciona una empresa real.');
            return;
        }

        const currentTenantId = String(sessionTenantId || '').trim();
        if (cleanTenantId === currentTenantId) {
            setSettingsTenantId(cleanTenantId);
            setSelectedTenantId(cleanTenantId);
            return;
        }

        if (typeof handleSwitchTenant !== 'function') {
            setError?.('No se pudo cambiar de empresa en esta sesion.');
            return;
        }

        setError?.('');
        setBusy?.(true);
        try {
            await handleSwitchTenant(cleanTenantId);
            setSettingsTenantId(cleanTenantId);
            setSelectedTenantId(cleanTenantId);
        } catch (err) {
            setError?.(String(err?.message || err || 'No tienes acceso a esa empresa.'));
        } finally {
            setBusy?.(false);
        }
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
        themeMode,
        onThemeChange,
        handlePanelClose,
        savingActions,
        panelActivity,
        onRetryActivity,
        activeTenantLabel,
        error,
        showPanelLoading,
        requiresTenantSelection,
        settingsTenantId,
        tenantOptions: operationalTenantOptions,
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
