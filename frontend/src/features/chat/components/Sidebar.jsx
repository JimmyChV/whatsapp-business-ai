import React from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Search, X, SlidersHorizontal, Tags, Tag, Users, UserRoundX, Archive, Pin, CheckCheck, UserCheck, ChevronDown, Moon, Sun, Clock3, CheckSquare, Square, Loader2 } from 'lucide-react';
import ChannelBrandIcon from './ChannelBrandIcon';
import AssignmentBadge from './assignment/AssignmentBadge';
import CommercialStatusBadge from './commercial/CommercialStatusBadge';
import useSidebarFiltersController from './hooks/useSidebarFiltersController';
import useSidebarChatPresentationModel from './hooks/useSidebarChatPresentationModel';
import useSidebarInfiniteScroll from './hooks/useSidebarInfiniteScroll';
import useSidebarUiToggles from './hooks/useSidebarUiToggles';
import useUiFeedback from '../../../app/ui-feedback/useUiFeedback';
import { API_URL } from '../../../config/runtime';
import { searchTenantCustomersForChat } from '../core/services/customerSearch.service';
import { getWindowStatus, WINDOW_FILTER_OPTIONS } from '../core/helpers/windowTimer.helpers';


const normalizePhoneDigits = (value = '') => String(value || '').replace(/\D/g, '');

const repairMojibake = (value = '') => {
    let text = String(value || '');
    if (!text) return '';

    try {
        const decoded = decodeURIComponent(escape(text));
        const cleanDecoded = decoded.replace(/\uFFFD/g, '');
        const cleanOriginal = text.replace(/\uFFFD/g, '');
        if (decoded && decoded !== text && cleanDecoded.length >= Math.floor(cleanOriginal.length * 0.8)) {
            text = decoded;
        }
    } catch (e) { }

    return text.replace(/\uFFFD/g, '');
};

const sanitizeDisplayText = (value = '') => repairMojibake(value)
    .replace(/[\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toDisplayTitleCase = (value = '') => {
    const clean = sanitizeDisplayText(value);
    if (!clean) return '';
    return clean
        .toLocaleLowerCase('es-PE')
        .replace(/(^|[\s/.-])(\S)/g, (_, prefix, char) => `${prefix}${char.toLocaleUpperCase('es-PE')}`);
};

const normalizeSearchText = (value = '') => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const normalizePattyMode = (value = '') => {
    const mode = String(value || '').trim().toLowerCase();
    return ['autonomous', 'review', 'off'].includes(mode) ? mode : '';
};

const resolveModulePattyMode = (moduleConfig = null) => {
    const aiConfig = moduleConfig?.metadata?.aiConfig || moduleConfig?.aiConfig || {};
    const explicitMode = normalizePattyMode(aiConfig.effectiveMode || aiConfig.currentMode || aiConfig.mode);
    if (explicitMode) return explicitMode;
    const withinMode = normalizePattyMode(aiConfig.withinHoursMode || aiConfig.within_hours_mode);
    const outsideMode = normalizePattyMode(aiConfig.outsideHoursMode || aiConfig.outside_hours_mode);
    if (withinMode && withinMode === outsideMode) return withinMode;
    return outsideMode || withinMode || 'off';
};

const Sidebar = ({
    chats,
    chatsLoaded = false,
    activeChatId,
    onChatSelect,
    myProfile,
    onLogout,
    onRefreshChats,
    onStartNewChat,
    labelDefinitions,
    onCreateLabel,
    onLoadMoreChats,
    chatsHasMore = false,
    chatsLoadingMore = false,
    chatsTotal = 0,
    searchQuery = '',
    onSearchQueryChange,
    activeFilters = {},
    onFiltersChange,
    onOpenCompanyProfile,
    buildApiHeaders = null,
    saasAuthEnabled = false,
    tenantOptions = [],
    activeTenantId = '',
    tenantSwitchError = '',
    onSaasLogout,
    canManageSaas = false,
    onOpenSaasAdmin,
    waModules = [],
    chatAssignmentState = null,
    chatCommercialStatusState = null,
    showBackToPanel = false,
    onBackToPanel = null,
    themeMode = 'dark',
    onThemeChange = null,
}) => {
    const { notify } = useUiFeedback();
    const {
        showMenu,
        setShowMenu,
        showLabelPanel,
        setShowLabelPanel
    } = useSidebarUiToggles();
    const [windowTick, setWindowTick] = React.useState(() => Date.now());
    const [globalCommercialStatusOptions, setGlobalCommercialStatusOptions] = React.useState([{ value: 'all', label: 'Todos' }]);
    const [showAdvancedFilters, setShowAdvancedFilters] = React.useState(false);
    const [mobileFilterMode, setMobileFilterMode] = React.useState(null);
    const {
        filters,
        updateFilters,
        visibleLabels,
        quickStats,
        activeFilterChips,
        filteredChats,
        resetFilters,
        toggleLabel,
        labelSearch,
        setLabelSearch,
        selectedLabelCount,
        hasAnyFilter,
        assignmentUserOptions,
        commercialStatusOptions
    } = useSidebarFiltersController({
        chats,
        activeFilters,
        labelDefinitions,
        waModules,
        chatAssignmentState,
        chatCommercialStatusState,
        commercialStatusOptions: globalCommercialStatusOptions,
        onFiltersChange,
        searchQuery,
        windowTick
    });
    const {
        formatTime,
        renderStatus,
        getDisplayName,
        getContactMeta,
        getContactHint,
        getChannelBadge,
        getChannelMarker,
        avatarLetter,
        avatarColor
    } = useSidebarChatPresentationModel();
    const { handleChatListScroll } = useSidebarInfiniteScroll({
        onLoadMoreChats,
        chatsHasMore,
        isLoadingMoreChats: chatsLoadingMore
    });

    const localQuery = String(searchQuery || '');
    const normalizedPhone = normalizePhoneDigits(localQuery);
    const queryHasLetters = /[a-zA-Z]/.test(localQuery);
    const searchIsPhone = !queryHasLetters && normalizedPhone.length >= 6 && normalizedPhone.length <= 15;
    const hasPanelAccess = Boolean(saasAuthEnabled && canManageSaas);
    const getAssignment = typeof chatAssignmentState?.getAssignment === 'function'
        ? chatAssignmentState.getAssignment
        : (() => null);
    const isAssignedToMeResolver = typeof chatAssignmentState?.isAssignedToMe === 'function'
        ? chatAssignmentState.isAssignedToMe
        : (() => false);
    const getCommercialStatus = typeof chatCommercialStatusState?.getCommercialStatus === 'function'
        ? chatCommercialStatusState.getCommercialStatus
        : (() => null);
    const assignmentsLoaded = Boolean(chatAssignmentState?.assignmentsLoaded);
    const statusesLoaded = Boolean(chatCommercialStatusState?.statusesLoaded);
    const [showAssigneeFilterMenu, setShowAssigneeFilterMenu] = React.useState(false);
    const [showCommercialFilterMenu, setShowCommercialFilterMenu] = React.useState(false);
    const [showWindowFilterMenu, setShowWindowFilterMenu] = React.useState(false);
    const [customerSearchResults, setCustomerSearchResults] = React.useState([]);
    const [customerSearchLoading, setCustomerSearchLoading] = React.useState(false);
    const closeMobileAdvancedFilters = React.useCallback(() => {
        if (typeof window === 'undefined') return;
        if (!window.matchMedia?.('(max-width: 768px)')?.matches) return;
        setShowAdvancedFilters(false);
        setMobileFilterMode(null);
    }, []);
    const assigneeMenuRef = React.useRef(null);
    const commercialMenuRef = React.useRef(null);
    const windowMenuRef = React.useRef(null);
    const labelPanelRef = React.useRef(null);
    const bulkLabelMenuRef = React.useRef(null);
    const bulkLabelPortalRef = React.useRef(null);
    const customerSearchRequestRef = React.useRef(0);
    const [selectionMode, setSelectionMode] = React.useState(false);
    const [selectedChatIds, setSelectedChatIds] = React.useState(() => new Set());
    const [bulkActionBusy, setBulkActionBusy] = React.useState('');
    const [bulkLabelMenu, setBulkLabelMenu] = React.useState(null);
    const [bulkLabelQuery, setBulkLabelQuery] = React.useState('');
    const [bulkLabelMenuPosition, setBulkLabelMenuPosition] = React.useState(null);
    const [bulkSelectedLabelIds, setBulkSelectedLabelIds] = React.useState(() => new Set());
    const visibleChats = React.useMemo(() => {
        const items = Array.isArray(filteredChats) ? [...filteredChats] : [];
        return items.sort((a, b) => {
            const aNeedsAdvisor = Boolean(getCommercialStatus(a?.id)?.needsAdvisor);
            const bNeedsAdvisor = Boolean(getCommercialStatus(b?.id)?.needsAdvisor);
            if (aNeedsAdvisor !== bNeedsAdvisor) return aNeedsAdvisor ? -1 : 1;
            return 0;
        });
    }, [filteredChats, getCommercialStatus]);
    const visibleChatIds = React.useMemo(() => (
        visibleChats.map((chat) => String(chat?.id || '').trim()).filter(Boolean)
    ), [visibleChats]);
    const selectedChatIdList = React.useMemo(() => (
        Array.from(selectedChatIds).filter((chatId) => visibleChatIds.includes(chatId))
    ), [selectedChatIds, visibleChatIds]);
    const selectedChatCount = selectedChatIdList.length;
    const labelsInSelectedChats = React.useMemo(() => {
        const selectedSet = new Set(selectedChatIdList);
        const labelIds = new Set();
        (Array.isArray(chats) ? chats : []).forEach((chat) => {
            const chatId = String(chat?.id || '').trim();
            if (!chatId || !selectedSet.has(chatId)) return;
            (Array.isArray(chat?.labels) ? chat.labels : []).forEach((label) => {
                const labelId = String(label?.id || label?.labelId || '').trim();
                if (labelId) labelIds.add(labelId);
            });
        });

        return (Array.isArray(labelDefinitions) ? labelDefinitions : [])
            .filter((label) => {
                const labelId = String(label?.id || label?.labelId || '').trim();
                return labelId && labelIds.has(labelId);
            });
    }, [chats, labelDefinitions, selectedChatIdList]);
    const bulkLabelOptions = React.useMemo(() => {
        const query = normalizeSearchText(bulkLabelQuery);
        const source = bulkLabelMenu === 'remove' ? labelsInSelectedChats : labelDefinitions;
        return (Array.isArray(source) ? source : [])
            .filter((label) => {
                const labelId = String(label?.id || label?.labelId || '').trim();
                const name = String(label?.name || label?.label || labelId || '').trim();
                if (!labelId || !name) return false;
                if (!query) return true;
                return normalizeSearchText(`${name} ${labelId}`).includes(query);
            });
    }, [bulkLabelMenu, bulkLabelQuery, labelDefinitions, labelsInSelectedChats]);

    React.useEffect(() => {
        const handlePointerDown = (event) => {
            const target = event.target;
            const insideBulkToolbar = bulkLabelMenuRef.current && bulkLabelMenuRef.current.contains(target);
            const insideBulkPortal = bulkLabelPortalRef.current && bulkLabelPortalRef.current.contains(target);
            if (!insideBulkToolbar && !insideBulkPortal) {
                setBulkLabelMenu(null);
                setBulkLabelMenuPosition(null);
                setBulkSelectedLabelIds(new Set());
            }
            if (assigneeMenuRef.current && !assigneeMenuRef.current.contains(target)) {
                setShowAssigneeFilterMenu(false);
            }
            if (commercialMenuRef.current && !commercialMenuRef.current.contains(target)) {
                setShowCommercialFilterMenu(false);
            }
            if (windowMenuRef.current && !windowMenuRef.current.contains(target)) {
                setShowWindowFilterMenu(false);
                if (mobileFilterMode === 'window') closeMobileAdvancedFilters();
            }
            if (labelPanelRef.current && !labelPanelRef.current.contains(target) && !target.closest('.sidebar-ribbon-btn[data-label="Etiquetas"]')) {
                setShowLabelPanel(false);
                if (mobileFilterMode === 'label') closeMobileAdvancedFilters();
            }
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [closeMobileAdvancedFilters, mobileFilterMode, setShowLabelPanel]);

    React.useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            setShowLabelPanel(false);
            setShowAssigneeFilterMenu(false);
            setShowCommercialFilterMenu(false);
            setShowWindowFilterMenu(false);
            setShowMenu(false);
            setShowAdvancedFilters(false);
            setMobileFilterMode(null);
            setBulkLabelMenu(null);
            if (selectionMode) {
                setSelectionMode(false);
                setSelectedChatIds(new Set());
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [selectionMode, setShowLabelPanel, setShowMenu]);

    React.useEffect(() => {
        setSelectedChatIds((prev) => {
            if (!prev.size) return prev;
            const visibleSet = new Set(visibleChatIds);
            const next = new Set(Array.from(prev).filter((chatId) => visibleSet.has(chatId)));
            return next.size === prev.size ? prev : next;
        });
    }, [visibleChatIds]);

    React.useEffect(() => {
        const timerId = window.setInterval(() => {
            setWindowTick(Date.now());
        }, 60_000);
        return () => window.clearInterval(timerId);
    }, []);

    const selectedAssigneeLabel = React.useMemo(() => {
        if (filters.assigneeUserId === '__unassigned__') return 'Sin asignar';
        if (!filters.assigneeUserId) return 'Todos los usuarios';
        const match = assignmentUserOptions.find((entry) => String(entry?.value || '') === String(filters.assigneeUserId || ''));
        return match?.label || filters.assigneeUserId;
    }, [assignmentUserOptions, filters.assigneeUserId]);

    const selectedCommercialStatusLabel = React.useMemo(() => {
        const selected = commercialStatusOptions.find((entry) => String(entry?.value || '') === String(filters.commercialStatus || 'all'));
        return selected?.label || 'Todos';
    }, [commercialStatusOptions, filters.commercialStatus]);
    const selectedWindowFilterLabel = React.useMemo(() => {
        const selected = WINDOW_FILTER_OPTIONS.find((entry) => String(entry?.value || '') === String(filters.windowFilter || 'all'));
        return selected?.label || 'Todas';
    }, [filters.windowFilter]);
    const mobileFilterPopoverClass = mobileFilterMode
        ? ` sidebar-filter-content--${mobileFilterMode}-popover`
        : '';

    const currentTenantId = String(activeTenantId || '').trim();
    const sortedTenantOptions = Array.isArray(tenantOptions)
        ? [...tenantOptions].sort((a, b) => String(a?.name || a?.id || '').localeCompare(String(b?.name || b?.id || '')))
        : [];
    const activeTenantOption = sortedTenantOptions.find((tenant) => String(tenant?.id || '').trim() === currentTenantId) || sortedTenantOptions[0] || null;
    const activeTenantLabel = activeTenantOption?.name || activeTenantOption?.id || currentTenantId || 'default';
    const moduleConfigById = React.useMemo(() => new Map(
        (Array.isArray(waModules) ? waModules : []).map((module) => [
            String(module?.moduleId || module?.id || '').trim().toLowerCase(),
            module || {}
        ])
    ), [waModules]);

    React.useEffect(() => {
        if (typeof buildApiHeaders !== 'function') return undefined;
        let cancelled = false;
        const headers = { ...(buildApiHeaders() || {}) };
        if (currentTenantId) headers['x-tenant-id'] = currentTenantId;

        fetch(`${String(API_URL || '').replace(/\/$/, '')}/api/ops/global-labels?includeInactive=false`, {
            method: 'GET',
            headers
        })
            .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
            .then((payload) => {
                if (cancelled) return;
                const items = Array.isArray(payload?.items) ? payload.items : [];
                const options = items
                    .map((item) => ({
                        value: String(item?.commercialStatusKey || item?.commercial_status_key || '').trim().toLowerCase(),
                        label: toDisplayTitleCase(item?.name || item?.commercialStatusKey || item?.commercial_status_key || ''),
                        color: item?.color || null,
                        sortOrder: Number(item?.sortOrder ?? item?.sort_order ?? 100) || 100
                    }))
                    .filter((item) => item.value)
                    .sort((a, b) => {
                        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
                        return a.label.localeCompare(b.label, 'es', { sensitivity: 'base' });
                    });
                setGlobalCommercialStatusOptions([{ value: 'all', label: 'Todos' }, ...options]);
            })
            .catch(() => {
                if (!cancelled) setGlobalCommercialStatusOptions([{ value: 'all', label: 'Todos' }]);
            });

        return () => {
            cancelled = true;
        };
    }, [buildApiHeaders, currentTenantId]);

    React.useEffect(() => {
        const query = String(searchQuery || '').trim();
        if (!query || query.length < 2 || !currentTenantId || typeof buildApiHeaders !== 'function') {
            setCustomerSearchResults([]);
            setCustomerSearchLoading(false);
            return undefined;
        }
        const requestId = customerSearchRequestRef.current + 1;
        customerSearchRequestRef.current = requestId;
        const timerId = window.setTimeout(() => {
            setCustomerSearchLoading(true);
            searchTenantCustomersForChat({
                apiUrl: API_URL,
                buildApiHeaders,
                tenantId: currentTenantId,
                query,
                waModules
            }).then((results) => {
                if (customerSearchRequestRef.current !== requestId) return;
                setCustomerSearchResults(Array.isArray(results) ? results : []);
            }).catch(() => {
                if (customerSearchRequestRef.current !== requestId) return;
                setCustomerSearchResults([]);
            }).finally(() => {
                if (customerSearchRequestRef.current !== requestId) return;
                setCustomerSearchLoading(false);
            });
        }, 180);
        return () => window.clearTimeout(timerId);
    }, [buildApiHeaders, currentTenantId, searchQuery, waModules]);

    const hasActiveSearch = String(localQuery || '').trim().length >= 2;
    const dedupedCustomerSearchResults = React.useMemo(() => {
        if (!hasActiveSearch || customerSearchResults.length === 0) return [];
        const existingChatKeys = new Set(
            filteredChats.map((chat) => {
                const phoneDigits = normalizePhoneDigits(chat?.phone || chat?.id || chat?.subtitle || '');
                const moduleId = String(chat?.scopeModuleId || chat?.moduleId || '').trim().toLowerCase();
                return `${phoneDigits}::${moduleId}`;
            })
        );
        return customerSearchResults.filter((result) => {
            const phoneDigits = normalizePhoneDigits(result?.phone || result?.phoneAlt || '');
            const moduleId = String(result?.moduleId || '').trim().toLowerCase();
            return !existingChatKeys.has(`${phoneDigits}::${moduleId}`);
        });
    }, [customerSearchResults, filteredChats, hasActiveSearch]);

    const customerSearchTitle = React.useMemo(() => {
        const normalized = normalizeSearchText(localQuery);
        if (!normalized) return '';
        const prioritizedMatches = dedupedCustomerSearchResults.filter((result) => {
            const name = normalizeSearchText(result?.displayName || '');
            return name === normalized || name.startsWith(normalized);
        });
        return `Clientes CRM (${prioritizedMatches.length || dedupedCustomerSearchResults.length})`;
    }, [dedupedCustomerSearchResults, localQuery]);

    const exitSelectionMode = React.useCallback(() => {
        setSelectionMode(false);
        setSelectedChatIds(new Set());
        setBulkLabelMenu(null);
        setBulkLabelMenuPosition(null);
        setBulkLabelQuery('');
        setBulkSelectedLabelIds(new Set());
    }, []);

    const toggleSelectionMode = React.useCallback(() => {
        setSelectionMode((current) => {
            const next = !current;
            if (current) {
                setSelectedChatIds(new Set());
                setBulkLabelMenu(null);
                setBulkLabelMenuPosition(null);
                setBulkSelectedLabelIds(new Set());
            } else {
                setShowAdvancedFilters(false);
                setMobileFilterMode(null);
                setShowLabelPanel(false);
                setShowWindowFilterMenu(false);
                setShowAssigneeFilterMenu(false);
                setShowCommercialFilterMenu(false);
            }
            return next;
        });
    }, [setShowLabelPanel]);

    const toggleSelectedChat = React.useCallback((chatId = '') => {
        const cleanChatId = String(chatId || '').trim();
        if (!cleanChatId) return;
        setSelectedChatIds((prev) => {
            const next = new Set(prev);
            if (next.has(cleanChatId)) next.delete(cleanChatId);
            else next.add(cleanChatId);
            return next;
        });
    }, []);

    const selectAllVisibleChats = React.useCallback(() => {
        setSelectedChatIds(new Set(visibleChatIds));
    }, [visibleChatIds]);

    const clearSelectedChats = React.useCallback(() => {
        setSelectedChatIds(new Set());
        setBulkLabelMenu(null);
        setBulkLabelMenuPosition(null);
        setBulkSelectedLabelIds(new Set());
    }, []);

    const toggleBulkLabelMenu = React.useCallback((menuType = '', event = null) => {
        const nextMenu = String(menuType || '').trim();
        if (!nextMenu) return;
        if (bulkLabelMenu === nextMenu) {
            setBulkLabelMenu(null);
            setBulkLabelMenuPosition(null);
            setBulkSelectedLabelIds(new Set());
            return;
        }

        const rect = event?.currentTarget?.getBoundingClientRect?.();
        if (rect && typeof window !== 'undefined') {
            const width = Math.min(300, Math.max(248, window.innerWidth - 24));
            const left = Math.min(
                Math.max(12, rect.left),
                Math.max(12, window.innerWidth - width - 12)
            );
            const top = Math.min(
                rect.bottom + 8,
                Math.max(12, window.innerHeight - 300)
            );
            setBulkLabelMenuPosition({ top, left, width });
        } else {
            setBulkLabelMenuPosition(null);
        }
        setBulkLabelQuery('');
        setBulkSelectedLabelIds(new Set());
        setBulkLabelMenu(nextMenu);
    }, [bulkLabelMenu]);

    const postBulkAction = React.useCallback(async (endpoint, body = {}) => {
        if (typeof buildApiHeaders !== 'function') {
            throw new Error('Sesion no disponible para ejecutar acciones masivas.');
        }
        const headers = { ...(buildApiHeaders({ includeJson: true }) || {}) };
        if (currentTenantId) headers['x-tenant-id'] = currentTenantId;
        const response = await fetch(`${String(API_URL || '').replace(/\/$/, '')}${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
            throw new Error(String(payload?.error || 'Error al ejecutar la accion.'));
        }
        return payload;
    }, [buildApiHeaders, currentTenantId]);

    const handleBulkMarkUnread = React.useCallback(async () => {
        if (!selectedChatCount) {
            notify({ type: 'warn', message: 'Selecciona al menos un chat.' });
            return;
        }
        setBulkActionBusy('mark-unread');
        try {
            const payload = await postBulkAction('/api/tenant/chats/bulk/mark-unread', {
                chatIds: selectedChatIdList
            });
            const updated = Number(payload?.updated || 0) || 0;
            notify({ type: 'success', message: `${updated} chats marcados como no leidos.` });
            exitSelectionMode();
        } catch (error) {
            notify({ type: 'error', message: String(error?.message || 'Error al ejecutar la accion.') });
        } finally {
            setBulkActionBusy('');
        }
    }, [exitSelectionMode, notify, postBulkAction, selectedChatCount, selectedChatIdList]);

    const toggleBulkLabelSelection = React.useCallback((label = null) => {
        const labelId = String(label?.id || label?.labelId || '').trim();
        if (!labelId) return;
        setBulkSelectedLabelIds((prev) => {
            const next = new Set(prev);
            if (next.has(labelId)) next.delete(labelId);
            else next.add(labelId);
            return next;
        });
    }, []);

    const cancelBulkLabelMenu = React.useCallback(() => {
        setBulkLabelMenu(null);
        setBulkLabelMenuPosition(null);
        setBulkLabelQuery('');
        setBulkSelectedLabelIds(new Set());
    }, []);

    const handleApplyBulkLabelAction = React.useCallback(async () => {
        const labelIds = Array.from(bulkSelectedLabelIds).map((value) => String(value || '').trim()).filter(Boolean);
        if (!selectedChatCount || !labelIds.length || !bulkLabelMenu) return;
        setBulkActionBusy(`label-${bulkLabelMenu}`);
        try {
            let updated = 0;
            for (const labelId of labelIds) {
                const payload = await postBulkAction('/api/tenant/chats/bulk/label', {
                    chatIds: selectedChatIdList,
                    labelId,
                    action: bulkLabelMenu
                });
                updated = Math.max(updated, Number(payload?.updated || 0) || 0);
            }
            const verb = bulkLabelMenu === 'remove' ? 'quitadas' : 'aplicadas';
            notify({ type: 'success', message: `${labelIds.length} etiquetas ${verb} a ${updated} chats.` });
            exitSelectionMode();
        } catch (error) {
            notify({ type: 'error', message: String(error?.message || 'Error al ejecutar la accion.') });
        } finally {
            setBulkActionBusy('');
        }
    }, [bulkLabelMenu, bulkSelectedLabelIds, exitSelectionMode, notify, postBulkAction, selectedChatCount, selectedChatIdList]);

    const bulkLabelMenuPortal = bulkLabelMenu && typeof document !== 'undefined'
        ? createPortal((
            <div
                ref={bulkLabelPortalRef}
                className="sidebar-bulk-label-menu sidebar-bulk-label-menu--portal"
                style={bulkLabelMenuPosition || undefined}
            >
                <div className="sidebar-bulk-label-title">
                    {bulkLabelMenu === 'remove' ? 'Quitar etiquetas' : 'Seleccionar etiquetas'}
                </div>
                <input
                    type="search"
                    value={bulkLabelQuery}
                    onChange={(event) => setBulkLabelQuery(event.target.value)}
                    placeholder="Buscar etiqueta..."
                    autoFocus
                />
                <div className="sidebar-bulk-label-options">
                    {bulkLabelOptions.length === 0 ? (
                        <div className="sidebar-bulk-label-empty">No hay etiquetas para mostrar</div>
                    ) : bulkLabelOptions.map((label) => {
                        const labelId = String(label?.id || label?.labelId || '').trim();
                        const labelName = String(label?.name || label?.label || labelId).trim();
                        const isSelected = bulkSelectedLabelIds.has(labelId);
                        return (
                            <label
                                key={labelId || labelName}
                                className={`sidebar-bulk-label-option ${isSelected ? 'selected' : ''}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleBulkLabelSelection(label)}
                                />
                                <span className="sidebar-label-color" style={{ background: label?.color || 'var(--chat-control-text-soft)' }} />
                                <span>{labelName}</span>
                            </label>
                        );
                    })}
                </div>
                <div className="sidebar-bulk-label-footer">
                    <button type="button" className="sidebar-bulk-label-cancel" onClick={cancelBulkLabelMenu}>
                        Cancelar
                    </button>
                    <button
                        type="button"
                        className="sidebar-bulk-label-apply"
                        onClick={handleApplyBulkLabelAction}
                        disabled={bulkSelectedLabelIds.size === 0 || Boolean(bulkActionBusy)}
                    >
                        {bulkActionBusy ? <Loader2 size={13} className="spin" /> : null}
                        <span>Aplicar ({bulkSelectedLabelIds.size})</span>
                    </button>
                </div>
            </div>
        ), document.body)
        : null;

    return (
        <>
        <div className="sidebar sidebar-pro">
            <div className="sidebar-header sidebar-header-pro">
                <button
                    type="button"
                    className="sidebar-account-block sidebar-account-trigger"
                    onClick={() => { onOpenCompanyProfile?.(); setShowMenu(false); }}
                    title="Ver perfil de la empresa"
                >
                    <div
                        className="sidebar-account-avatar"
                        style={{ background: 'var(--chat-control-surface-strong)' }}
                    >
                        {myProfile?.pushname?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    {myProfile?.pushname && (
                        <span className="sidebar-account-name">{myProfile.pushname}</span>
                    )}
                </button>

                <div className="sidebar-header-actions">
                    {visibleChats.length > 0 && (
                        <button
                            type="button"
                            className={`ui-icon-btn sidebar-select-mode-btn ${selectionMode ? 'active' : ''}`.trim()}
                            onClick={toggleSelectionMode}
                            title={selectionMode ? 'Cancelar seleccion' : 'Seleccionar chats'}
                            aria-pressed={selectionMode}
                        >
                            {selectionMode ? <CheckSquare size={18} /> : <Square size={18} />}
                        </button>
                    )}
                    <button
                        type="button"
                        className="ui-icon-btn"
                        onClick={() => setShowMenu((v) => !v)}
                        title="Mas opciones"
                    >
                        <MoreVertical size={18} />
                    </button>

                    {showMenu && (
                        <div className="sidebar-dropdown-menu">
                            {saasAuthEnabled && (
                                <div className="sidebar-menu-section">
                                    <div className="sidebar-menu-section-title">Empresa activa</div>
                                    <div className="sidebar-menu-tenant-label" title={activeTenantLabel}>
                                        {activeTenantLabel}
                                    </div>
                                    {tenantSwitchError && (
                                        <div className="sidebar-menu-error">{tenantSwitchError}</div>
                                    )}
                                </div>
                            )}
                            {hasPanelAccess && (
                                <button
                                    type="button"
                                    className="sidebar-menu-item"
                                    onClick={() => {
                                        if (showBackToPanel && typeof onBackToPanel === 'function') {
                                            onBackToPanel();
                                        } else {
                                            onOpenSaasAdmin?.();
                                        }
                                        setShowMenu(false);
                                    }}
                                >
                                    {showBackToPanel ? 'Volver al panel SaaS' : 'Panel SaaS (empresas/usuarios)'}
                                </button>
                            )}
                            <div className="sidebar-menu-section">
                                <div className="sidebar-menu-section-title">Tema</div>
                                <div className="sidebar-theme-toggle" role="group" aria-label="Cambiar tema">
                                    <button
                                        type="button"
                                        className="sidebar-theme-toggle__switch"
                                        onClick={() => onThemeChange?.(themeMode === 'dark' ? 'light' : 'dark')}
                                        title={themeMode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                                        aria-label={themeMode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                                    >
                                        <span className={`sidebar-theme-toggle__icon ${themeMode === 'dark' ? 'is-active' : ''}`.trim()}>
                                            <Moon size={14} strokeWidth={2} />
                                        </span>
                                        <span className={`sidebar-theme-toggle__icon ${themeMode === 'light' ? 'is-active' : ''}`.trim()}>
                                            <Sun size={14} strokeWidth={2} />
                                        </span>
                                    </button>
                                </div>
                            </div>
                            <button type="button" className="sidebar-menu-item" onClick={() => { onStartNewChat?.(); setShowMenu(false); }}>
                                Nuevo chat (numero)
                            </button>
                            <button type="button" className="sidebar-menu-item" onClick={() => { onRefreshChats?.(); setShowMenu(false); }}>
                                Recargar chats
                            </button>
                            {canManageSaas && (
                                <button type="button" className="sidebar-menu-item" onClick={() => { onCreateLabel?.(); setShowMenu(false); }}>
                                    Gestionar etiquetas
                                </button>
                            )}
                            <button type="button" className="sidebar-menu-item sidebar-menu-item-danger" onClick={() => { onLogout?.(); setShowMenu(false); }}>
                                Cerrar sesion WhatsApp
                            </button>
                            {saasAuthEnabled && (
                                <button type="button" className="sidebar-menu-item sidebar-menu-item-danger" onClick={() => { onSaasLogout?.(); setShowMenu(false); }}>
                                    Cerrar sesion SaaS
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="sidebar-search-zone">
                <div className="sidebar-search-box">
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder="Busca chat o escribe numero"
                        className="sidebar-search-input"
                        value={localQuery}
                        onChange={(e) => onSearchQueryChange?.(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && searchIsPhone) {
                                e.preventDefault();
                                onStartNewChat?.(normalizedPhone, '');
                                onSearchQueryChange?.('');
                            }
                        }}
                    />
                    {localQuery && (
                        <button type="button" className="ui-icon-btn ui-icon-btn-sm" onClick={() => onSearchQueryChange?.('')}>
                            <X size={14} />
                        </button>
                    )}
                </div>

                {searchIsPhone && (
                    <button
                        type="button"
                        className="ui-btn ui-btn--primary ui-btn--block"
                        onClick={() => {
                            onStartNewChat?.(normalizedPhone, '');
                            onSearchQueryChange?.('');
                        }}
                    >
                        Abrir chat con +{normalizedPhone}
                    </button>
                )}
            </div>

            <div className="sidebar-main-content">
                    <div className="sidebar-left-ribbon" aria-label="Filtros de chat">
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${showAdvancedFilters || hasAnyFilter ? 'active' : ''}`}
                            onClick={() => {
                                const shouldClose = showAdvancedFilters && mobileFilterMode === 'advanced';
                                setShowAdvancedFilters(!shouldClose);
                                setMobileFilterMode(shouldClose ? null : 'advanced');
                                setShowLabelPanel(false);
                                setShowWindowFilterMenu(false);
                                setShowAssigneeFilterMenu(false);
                                setShowCommercialFilterMenu(false);
                            }}
                            title="Todos"
                            data-label="Filtros"
                        >
                            <SlidersHorizontal size={18} />
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${filters.unreadOnly ? 'active' : ''}`}
                            onClick={() => updateFilters({ unreadOnly: !filters.unreadOnly })}
                            title="No leidos"
                            data-label="No leidos"
                        >
                            <CheckCheck size={18} />
                            {quickStats.unread > 0 && <span className="sidebar-ribbon-badge">{quickStats.unread > 99 ? '99+' : quickStats.unread}</span>}
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${filters.unlabeledOnly ? 'active' : ''}`}
                            onClick={() => updateFilters({ unlabeledOnly: !filters.unlabeledOnly, labelTokens: [] })}
                            title="Sin etiqueta"
                            data-label="Sin etiqueta"
                        >
                            <Tags size={18} />
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${filters.archivedMode === 'archived' ? 'active' : ''}`}
                            onClick={() => updateFilters({ archivedMode: filters.archivedMode === 'archived' ? 'all' : 'archived' })}
                            title="Archivados"
                            data-label="Archivados"
                        >
                            <Archive size={18} />
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${filters.pinnedMode === 'pinned' ? 'active' : ''}`}
                            onClick={() => updateFilters({ pinnedMode: filters.pinnedMode === 'pinned' ? 'all' : 'pinned' })}
                            title="Fijados"
                            data-label="Fijados"
                        >
                            <Pin size={18} />
                            {quickStats.pinned > 0 && <span className="sidebar-ribbon-badge">{quickStats.pinned > 99 ? '99+' : quickStats.pinned}</span>}
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${filters.contactMode === 'my' ? 'active' : ''}`}
                            onClick={() => updateFilters({ contactMode: filters.contactMode === 'my' ? 'all' : 'my' })}
                            title="Guardados"
                            data-label="Guardados"
                        >
                            <Users size={18} />
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${filters.contactMode === 'unknown' ? 'active' : ''}`}
                            onClick={() => updateFilters({ contactMode: filters.contactMode === 'unknown' ? 'all' : 'unknown' })}
                            title="No guardados"
                            data-label="No guardados"
                        >
                            <UserRoundX size={18} />
                            {quickStats.unknown > 0 && <span className="sidebar-ribbon-badge">{quickStats.unknown > 99 ? '99+' : quickStats.unknown}</span>}
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${filters.onlyAssignedToMe ? 'active' : ''}`}
                            onClick={() => updateFilters({ onlyAssignedToMe: !filters.onlyAssignedToMe })}
                            title="Solo mis chats"
                            data-label="Solo mios"
                        >
                            <UserCheck size={18} />
                            {quickStats.assignedToMe > 0 && <span className="sidebar-ribbon-badge">{quickStats.assignedToMe > 99 ? '99+' : quickStats.assignedToMe}</span>}
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${showLabelPanel || selectedLabelCount > 0 ? 'active' : ''}`}
                            onClick={() => {
                                setShowLabelPanel((prev) => {
                                    const next = !prev;
                                    setShowAdvancedFilters(next);
                                    setMobileFilterMode(next ? 'label' : null);
                                    return next;
                                });
                                setShowWindowFilterMenu(false);
                                setShowAssigneeFilterMenu(false);
                                setShowCommercialFilterMenu(false);
                            }}
                            title="Etiquetas"
                            data-label="Etiquetas"
                        >
                            <Tag size={18} />
                            {selectedLabelCount > 0 && <span className="sidebar-ribbon-badge">{selectedLabelCount > 99 ? '99+' : selectedLabelCount}</span>}
                        </button>
                        <button
                            type="button"
                            className={`sidebar-ribbon-btn ${String(filters.windowFilter || 'all') !== 'all' ? 'active' : ''}`}
                            onClick={() => {
                                setShowWindowFilterMenu((prev) => {
                                    const next = !prev;
                                    setShowAdvancedFilters(next);
                                    setMobileFilterMode(next ? 'window' : null);
                                    return next;
                                });
                                setShowAssigneeFilterMenu(false);
                                setShowCommercialFilterMenu(false);
                                setShowLabelPanel(false);
                            }}
                            title="Ventana 24h"
                            data-label="Ventana 24h"
                        >
                            <Clock3 size={18} />
                        </button>
                    </div>
                    <div className="sidebar-main-column">
                        {selectionMode && (
                            <div className="sidebar-bulk-actions" onClick={(event) => event.stopPropagation()}>
                                <div className="sidebar-bulk-actions-top">
                                    <button type="button" onClick={selectAllVisibleChats} disabled={visibleChatIds.length === 0 || Boolean(bulkActionBusy)}>
                                        Todo
                                    </button>
                                    <button type="button" onClick={clearSelectedChats} disabled={selectedChatCount === 0 || Boolean(bulkActionBusy)}>
                                        Ninguno
                                    </button>
                                    <span>{selectedChatCount} seleccionados</span>
                                </div>
                                <div className="sidebar-bulk-actions-row">
                                    <button
                                        type="button"
                                        className="sidebar-bulk-action-btn"
                                        onClick={handleBulkMarkUnread}
                                        disabled={selectedChatCount === 0 || Boolean(bulkActionBusy)}
                                    >
                                        {bulkActionBusy === 'mark-unread' ? <Loader2 size={14} className="spin" /> : <span aria-hidden="true">🔵</span>}
                                        <span>No leido</span>
                                    </button>
                                    <div className="sidebar-bulk-label-wrap" ref={bulkLabelMenuRef}>
                                        <button
                                            type="button"
                                            className="sidebar-bulk-action-btn"
                                            onClick={(event) => toggleBulkLabelMenu('add', event)}
                                            disabled={selectedChatCount === 0 || Boolean(bulkActionBusy)}
                                        >
                                            <Tag size={14} />
                                            <span>Etiquetar</span>
                                            <ChevronDown size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            className="sidebar-bulk-action-btn"
                                            onClick={(event) => toggleBulkLabelMenu('remove', event)}
                                            disabled={selectedChatCount === 0 || Boolean(bulkActionBusy)}
                                        >
                                            <X size={14} />
                                            <span>Quitar</span>
                                            <ChevronDown size={13} />
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        className="sidebar-bulk-cancel-btn"
                                        onClick={exitSelectionMode}
                                        disabled={Boolean(bulkActionBusy)}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}
                        {!selectionMode && (
                        <div className={`sidebar-filter-content ${showAdvancedFilters ? 'is-open' : ''}${mobileFilterPopoverClass}`}>
                        <div className="sidebar-filter-header-row">
                            <span className="sidebar-filter-title">Filtros avanzados</span>
                            {hasAnyFilter && (
                                <button
                                    type="button"
                                    className="sidebar-filter-clear"
                                    onClick={() => {
                                        resetFilters();
                                        closeMobileAdvancedFilters();
                                    }}
                                >
                                    Limpiar
                                </button>
                            )}
                        </div>
                            <div className="sidebar-filter-pill-toolbar">
                                {assignmentsLoaded && (
                                    <div className="sidebar-filter-pill-dropdown sidebar-filter-pill-dropdown--assignee" ref={assigneeMenuRef}>
                                        <button
                                            type="button"
                                            className={`sidebar-filter-pill-trigger ${filters.assigneeUserId ? 'active' : ''}`}
                                            onClick={() => {
                                                setShowAssigneeFilterMenu((prev) => !prev);
                                                setShowCommercialFilterMenu(false);
                                                setShowWindowFilterMenu(false);
                                                setShowLabelPanel(false);
                                            }}
                                            title="Filtrar por usuario"
                                        >
                                            <span className="sidebar-filter-pill-label">Usuarios</span>
                                            <span className="sidebar-filter-pill-value">{selectedAssigneeLabel}</span>
                                            <ChevronDown size={14} className={`sidebar-filter-pill-caret ${showAssigneeFilterMenu ? 'open' : ''}`} />
                                        </button>
                                        {showAssigneeFilterMenu && (
                                            <div className="sidebar-filter-pill-menu">
                                                <button
                                                    type="button"
                                                    className={`sidebar-filter-pill-item ${!filters.assigneeUserId ? 'active' : ''}`}
                                                    onClick={() => {
                                                        updateFilters({ assigneeUserId: '' });
                                                        setShowAssigneeFilterMenu(false);
                                                        closeMobileAdvancedFilters();
                                                    }}
                                                >
                                                    Todos los usuarios
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`sidebar-filter-pill-item ${filters.assigneeUserId === '__unassigned__' ? 'active' : ''}`}
                                                    onClick={() => {
                                                        updateFilters({ assigneeUserId: '__unassigned__' });
                                                        setShowAssigneeFilterMenu(false);
                                                        closeMobileAdvancedFilters();
                                                    }}
                                                >
                                                    Sin asignar
                                                </button>
                                                {assignmentUserOptions.map((entry) => (
                                                    <button
                                                        key={entry.value}
                                                        type="button"
                                                        className={`sidebar-filter-pill-item ${filters.assigneeUserId === entry.value ? 'active' : ''}`}
                                                        onClick={() => {
                                                            updateFilters({ assigneeUserId: String(entry.value || '').trim() });
                                                            setShowAssigneeFilterMenu(false);
                                                            closeMobileAdvancedFilters();
                                                        }}
                                                    >
                                                        {entry.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {statusesLoaded && (
                                    <div className="sidebar-filter-pill-dropdown sidebar-filter-pill-dropdown--commercial" ref={commercialMenuRef}>
                                        <button
                                            type="button"
                                            className={`sidebar-filter-pill-trigger ${String(filters.commercialStatus || 'all') !== 'all' ? 'active' : ''}`}
                                            onClick={() => {
                                                setShowCommercialFilterMenu((prev) => !prev);
                                                setShowAssigneeFilterMenu(false);
                                                setShowWindowFilterMenu(false);
                                                setShowLabelPanel(false);
                                            }}
                                            title="Filtrar por estado comercial"
                                        >
                                            <span className="sidebar-filter-pill-label">Estado</span>
                                            <span className="sidebar-filter-pill-value">{selectedCommercialStatusLabel}</span>
                                            <ChevronDown size={14} className={`sidebar-filter-pill-caret ${showCommercialFilterMenu ? 'open' : ''}`} />
                                        </button>
                                        {showCommercialFilterMenu && (
                                            <div className="sidebar-filter-pill-menu">
                                                {commercialStatusOptions.map((entry) => (
                                                    <button
                                                        key={entry.value}
                                                        type="button"
                                                        className={`sidebar-filter-pill-item ${String(filters.commercialStatus || 'all') === String(entry.value) ? 'active' : ''}`}
                                                        onClick={() => {
                                                            updateFilters({ commercialStatus: String(entry.value || 'all').trim().toLowerCase() });
                                                            setShowCommercialFilterMenu(false);
                                                            closeMobileAdvancedFilters();
                                                        }}
                                                    >
                                                        {entry.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="sidebar-filter-pill-dropdown sidebar-filter-pill-dropdown--window" ref={windowMenuRef}>
                                    <button
                                        type="button"
                                        className={`sidebar-filter-pill-trigger ${String(filters.windowFilter || 'all') !== 'all' ? 'active' : ''}`}
                                        onClick={() => {
                                            setShowWindowFilterMenu((prev) => !prev);
                                            setShowAssigneeFilterMenu(false);
                                            setShowCommercialFilterMenu(false);
                                            setShowLabelPanel(false);
                                        }}
                                        title="Filtrar por ventana 24h"
                                    >
                                        <span className="sidebar-filter-pill-label">Ventana</span>
                                        <span className="sidebar-filter-pill-value">{selectedWindowFilterLabel}</span>
                                        <ChevronDown size={14} className={`sidebar-filter-pill-caret ${showWindowFilterMenu ? 'open' : ''}`} />
                                    </button>
                                    {showWindowFilterMenu && (
                                        <div className="sidebar-filter-pill-menu" role="menu" aria-label="Filtrar por ventana 24h">
                                            {WINDOW_FILTER_OPTIONS.map((entry) => (
                                                <button
                                                    key={entry.value}
                                                    type="button"
                                                    className={`sidebar-filter-pill-item ${String(filters.windowFilter || 'all') === String(entry.value) ? 'active' : ''}`}
                                                    onClick={() => {
                                                        updateFilters({ windowFilter: entry.value });
                                                        setShowWindowFilterMenu(false);
                                                        closeMobileAdvancedFilters();
                                                    }}
                                                >
                                                    {String(filters.windowFilter || 'all') === String(entry.value) ? '● ' : '○ '}
                                                    {entry.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="sidebar-active-filters-row">
                                {!hasAnyFilter ? (
                                    <span className="sidebar-active-filter-empty">Sin filtros activos</span>
                                ) : (
                                    <span className="sidebar-active-filter-summary">
                                        {activeFilterChips.length === 1
                                            ? activeFilterChips[0]
                                            : `${activeFilterChips.length} filtros activos`}
                                    </span>
                                )}
                            </div>

                        {showLabelPanel && (
                            <div className="sidebar-label-dropdown" ref={labelPanelRef} role="dialog" aria-label="Filtrar por etiquetas">
                                <div className="sidebar-label-dropdown-header">Filtro de etiquetas (seleccion multiple)</div>
                                <div className="sidebar-label-search-row">
                                    <Search size={14} />
                                    <input
                                        type="text"
                                        value={labelSearch}
                                        onChange={(e) => setLabelSearch(e.target.value)}
                                        placeholder="Buscar etiqueta"
                                        className="sidebar-label-search-input"
                                    />
                                </div>
                                <div className="sidebar-label-list">
                                    {visibleLabels.length === 0 ? (
                                        <div className="sidebar-label-empty">No hay etiquetas para mostrar</div>
                                    ) : (
                                        visibleLabels.map((label) => {
                                            const isSelected = filters.labelTokens.includes(label.token);
                                            return (
                                                <button
                                                    key={label.token}
                                                    type="button"
                                                    className={`sidebar-label-item ${isSelected ? 'active' : ''}`}
                                                    onClick={() => toggleLabel(label.token)}
                                                >
                                                    <span className="sidebar-label-color" style={{ background: label.color || 'var(--chat-control-text-soft)' }} />
                                                    <span className="sidebar-label-name">{label.name}</span>
                                                    <span className="sidebar-label-count">{label.count}</span>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                        )}
                    {!selectionMode && (
                    <div className={`sidebar-mobile-filter-strip ${hasAnyFilter ? 'is-visible' : ''}`}>
                        <span className="sidebar-mobile-filter-summary">
                            {activeFilterChips.length === 1
                                ? activeFilterChips[0]
                                : `${activeFilterChips.length} filtros activos`}
                        </span>
                        <button
                            type="button"
                            className="sidebar-mobile-filter-clear"
                            onClick={() => {
                                resetFilters();
                                setShowAdvancedFilters(false);
                                setMobileFilterMode(null);
                                setShowLabelPanel(false);
                                setShowWindowFilterMenu(false);
                            }}
                        >
                            Limpiar
                        </button>
                    </div>
                    )}
            <div className="chat-list" onClick={() => { if (showMenu) setShowMenu(false); if (showLabelPanel) setShowLabelPanel(false); if (showAssigneeFilterMenu) setShowAssigneeFilterMenu(false); if (showCommercialFilterMenu) setShowCommercialFilterMenu(false); if (showWindowFilterMenu) setShowWindowFilterMenu(false); if (showAdvancedFilters) setShowAdvancedFilters(false); if (mobileFilterMode) setMobileFilterMode(null); }} onScroll={handleChatListScroll}>
                {filteredChats.length === 0 && chats.length === 0 && !chatsLoaded ? (
                    [1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="chat-item chat-item-modern">
                            <div className="chat-avatar skeleton" style={{ width: '49px', height: '49px', borderRadius: '50%', flexShrink: 0 }}></div>
                            <div className="chat-info" style={{ marginLeft: '15px', flex: 1 }}>
                                <div className="skeleton" style={{ height: '14px', width: '60%', marginBottom: '10px' }}></div>
                                <div className="skeleton" style={{ height: '10px', width: '40%' }}></div>
                            </div>
                        </div>
                    ))
                ) : filteredChats.length === 0 && !hasActiveSearch ? (
                    <div className="sidebar-empty-search">
                        Sin resultados para "{localQuery || 'los filtros actuales'}"
                    </div>
                ) : (
                    <>
                    {visibleChats.map((chat) => {
                        const displayName = getDisplayName(chat);
                        const contactHint = getContactHint(chat, displayName);
                        const contactMeta = getContactMeta(chat, displayName);
                        const moduleBadge = getChannelBadge(chat, waModules);
                        const channelMarker = getChannelMarker(moduleBadge?.channelType || '');
                        const chatAssignment = getAssignment(chat.id);
                        const isAssignedToMe = isAssignedToMeResolver(chat.id);
                        const chatCommercialStatus = getCommercialStatus(chat.id);
                        const chatWindowStatus = getWindowStatus(chat, windowTick);
                        const moduleConfig = moduleConfigById.get(String(moduleBadge?.moduleId || chat?.scopeModuleId || '').trim().toLowerCase()) || null;
                        const hasAssignee = Boolean(String(chatAssignment?.assigneeUserId || '').trim()) && String(chatAssignment?.status || '').trim().toLowerCase() !== 'released';
                        const showPattyAssignee = !hasAssignee && !chatCommercialStatus?.needsAdvisor && resolveModulePattyMode(moduleConfig) === 'autonomous';
                        const moduleAvatarImage = moduleBadge?.imageUrl || null;
                        const avatarFallback = moduleBadge?.moduleName
                            ? avatarLetter(moduleBadge.moduleName)
                            : avatarLetter(displayName);
                        const safeLastMessage = sanitizeDisplayText(chat.lastMessage || '');
                        const hasInteraction = Number(chat?.timestamp || 0) > 0;
                        const lastMessage = safeLastMessage || (hasInteraction ? 'Adjunto o evento sin vista previa' : 'Haz clic para chatear');
                        const labels = Array.isArray(chat?.labels) ? chat.labels : [];
                        const adOrigin = null;
                        const adOriginName = String(adOrigin?.adName || '').trim();
                        const isSelected = selectedChatIds.has(String(chat.id || ''));
                        const unreadCount = Number(chat?.unreadCount || 0) || 0;
                        const manuallyMarkedUnread = chat?.manuallyMarkedUnread === true && unreadCount <= 0;
                        return (
                            <div
                                key={chat.id}
                                className={`chat-item chat-item-modern ${activeChatId === chat.id ? 'active' : ''}${chatCommercialStatus?.needsAdvisor ? ' chat-item-modern--needs-advisor' : ''}${selectionMode ? ' chat-item-modern--selecting' : ''}${isSelected ? ' chat-item-modern--selected' : ''}`}
                                onClick={() => {
                                    if (selectionMode) {
                                        toggleSelectedChat(chat.id);
                                        return;
                                    }
                                    onChatSelect(chat.id, { clearSearch: true });
                                }}
                            >
                                <button
                                    type="button"
                                    className={`chat-select-checkbox ${selectionMode || isSelected ? 'visible' : ''}${isSelected ? ' selected' : ''}`}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        if (!selectionMode) setSelectionMode(true);
                                        toggleSelectedChat(chat.id);
                                    }}
                                    aria-label={isSelected ? 'Deseleccionar chat' : 'Seleccionar chat'}
                                    aria-pressed={isSelected}
                                >
                                    {isSelected ? <CheckSquare size={17} /> : <Square size={17} />}
                                </button>
                                <div
                                    className="chat-avatar-modern chat-avatar-modern--module"
                                    style={{ background: moduleAvatarImage ? `url(${moduleAvatarImage}) center/cover` : avatarColor(moduleBadge?.moduleName || displayName) }}
                                >
                                    {!moduleAvatarImage && avatarFallback}
                                    <span
                                        className={`chat-avatar-channel-tag chat-avatar-channel-tag--${channelMarker.key}`}
                                        title={channelMarker.label}
                                    >
                                        <ChannelBrandIcon
                                            channelType={channelMarker.key}
                                            className="chat-avatar-channel-icon"
                                            size={11}
                                            title={channelMarker.label}
                                        />
                                    </span>
                                </div>

                                <div className="chat-info chat-info-modern">
                                    <div className="chat-row-top">
                                        <div className="chat-name-stack">
                                            <span className="chat-display-name" title={displayName}>{displayName}</span>
                                            {contactMeta.location && (
                                                <span className="chat-contact-hint" title={contactMeta.location}>
                                                    <span className="chat-contact-location-chip">{contactMeta.location}</span>
                                                </span>
                                            )}
                                            {!contactMeta.location && contactHint && (
                                                <span className="chat-contact-hint" title={contactHint}>
                                                    <span className="chat-contact-hint-text">{contactHint}</span>
                                                </span>
                                            )}
                                        </div>
                                        <span className={`chat-time ${unreadCount > 0 ? 'chat-time-unread' : ''}`}>
                                            {formatTime(chat.timestamp)}
                                        </span>
                                    </div>

                                    <div className="chat-row-meta chat-row-meta--compact">
                                        <div className="chat-row-tags">
                                            {labels.length > 0 && (
                                                <div
                                                    className="chat-row-labels chat-inline-labels chat-inline-labels--dots"
                                                    title={labels.map((label) => String(label?.name || '').trim()).filter(Boolean).join(', ')}
                                                >
                                                    {labels.slice(0, 4).map((label, idx) => (
                                                        <span
                                                            key={`${label?.id || label?.name || 'l'}_${idx}`}
                                                            className="chat-inline-label-dot"
                                                            style={{ '--label-color': label?.color || 'var(--chat-control-text-soft)' }}
                                                        />
                                                    ))}
                                                    {labels.length > 4 && <span className="chat-inline-label-more">+{labels.length - 4}</span>}
                                                </div>
                                            )}
                                            {chatWindowStatus && (
                                                <span
                                                    className={`chat-window-badge chat-window-badge--${chatWindowStatus.status}`.trim()}
                                                    title={chatWindowStatus.title || `Ventana 24h: ${chatWindowStatus.label} laborales restantes`}
                                                >
                                                    <Clock3 size={11} />
                                                    <span>{chatWindowStatus.label}</span>
                                                </span>
                                            )}
                                            {adOrigin && (
                                                <span
                                                    className="chat-ad-origin-badge chat-ad-origin-badge--sidebar"
                                                    title={`Anuncio: ${adOriginName || 'Anuncio Meta'}`}
                                                >
                                                    <span aria-hidden="true">📢</span>
                                                    <span>Anuncio: {adOriginName || 'Anuncio Meta'}</span>
                                                </span>
                                            )}
                                        </div>
                                        <div className="chat-row-statuses">
                                            <CommercialStatusBadge
                                                commercialStatus={chatCommercialStatus}
                                                compact
                                            />
                                            <AssignmentBadge
                                                assignment={chatAssignment}
                                                isAssignedToMe={isAssignedToMe}
                                                needsAdvisor={Boolean(chatCommercialStatus?.needsAdvisor)}
                                                needsAdvisorReason={chatCommercialStatus?.needsAdvisorReason || ''}
                                                virtualAssigneeLabel={showPattyAssignee ? 'Patty IA' : ''}
                                                compact
                                            />
                                        </div>
                                    </div>

                                    <div className="chat-row-bottom">
                                        <p className="chat-last-message">
                                            {renderStatus(chat)}
                                            <span title={lastMessage}>{lastMessage}</span>
                                        </p>
                                        {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
                                        {manuallyMarkedUnread && <span className="chat-unread-dot" title="Marcado como no leído" />}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {hasActiveSearch && customerSearchLoading && (
                        <div className="sidebar-empty-search">Buscando clientes...</div>
                    )}
                    {hasActiveSearch && !customerSearchLoading && dedupedCustomerSearchResults.length > 0 && (
                        <>
                            {filteredChats.length > 0 && (
                                <div className="sidebar-empty-search" style={{ paddingTop: 8, paddingBottom: 6 }}>
                                    {customerSearchTitle}
                                </div>
                            )}
                            {dedupedCustomerSearchResults.map((result) => {
                                const resultModuleConfig = moduleConfigById.get(String(result?.moduleId || '').trim().toLowerCase()) || null;
                                const resultChannelMarker = getChannelMarker(result?.channelType || resultModuleConfig?.channelType || 'whatsapp');
                                const resultAvatarLabel = result.moduleName || result.displayName;
                                const resultSecondaryLine = result.sublabel || result.phone || result.phoneAlt || 'Sin telefono';
                                return (
                                    <button
                                        key={`crm_${result.key}`}
                                        type="button"
                                        className="chat-item chat-item-modern chat-item-modern--crm"
                                        onClick={() => {
                                            onStartNewChat?.(result.phone || result.phoneAlt || '', '', {
                                                moduleId: result.moduleId || '',
                                                autoConfirm: true
                                            });
                                            onSearchQueryChange?.('');
                                        }}
                                    >
                                        <div
                                            className="chat-avatar-modern chat-avatar-modern--module"
                                            style={{ background: avatarColor(resultAvatarLabel) }}
                                        >
                                            {avatarLetter(resultAvatarLabel)}
                                            <span
                                                className={`chat-avatar-channel-tag chat-avatar-channel-tag--${resultChannelMarker.key}`}
                                                title={resultChannelMarker.label}
                                            >
                                                <ChannelBrandIcon
                                                    channelType={resultChannelMarker.key}
                                                    className="chat-avatar-channel-icon"
                                                    size={11}
                                                    title={resultChannelMarker.label}
                                                />
                                            </span>
                                        </div>
                                        <div className="chat-info chat-info-modern">
                                            <div className="chat-row-top">
                                                <div className="chat-name-stack">
                                                    <span className="chat-display-name" title={result.displayName}>{result.displayName}</span>
                                                    {result.locationLabel ? (
                                                        <span className="chat-contact-hint" title={result.locationLabel}>
                                                            <span className="chat-contact-location-chip">{result.locationLabel}</span>
                                                        </span>
                                                    ) : (
                                                        <span className="chat-contact-hint" title={result.moduleName || 'Sin modulo'}>
                                                            <span className="chat-contact-location-chip">{result.moduleName || 'Sin modulo'}</span>
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="chat-time chat-time-muted">CRM</span>
                                            </div>
                                            <div className="chat-row-bottom">
                                                <p className="chat-last-message">
                                                    <span title={resultSecondaryLine}>{resultSecondaryLine}</span>
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </>
                    )}
                    {hasActiveSearch && !customerSearchLoading && filteredChats.length === 0 && dedupedCustomerSearchResults.length === 0 && (
                        <div className="sidebar-empty-search">
                            Sin resultados para "{localQuery}"
                        </div>
                    )}
                    </>
                )}

                {chats.length > 0 && (
                    <div className="sidebar-list-footer">
                        {chatsLoadingMore
                            ? 'Cargando mas chats...'
                            : (chatsHasMore
                                ? `Mostrando ${chats.length} de ${chatsTotal || '...'} chats`
                                : `Mostrando todos los chats (${chats.length})`)}
                    </div>
                )}
            </div>
                </div>
            </div>
        </div>
        {bulkLabelMenuPortal}
        </>
    );
};

export default React.memo(Sidebar);


























