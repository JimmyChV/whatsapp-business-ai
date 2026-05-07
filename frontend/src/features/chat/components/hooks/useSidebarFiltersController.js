import { useCallback, useMemo, useState } from 'react';

const WA_LABEL_COLORS = ['#25D366', '#34B7F1', '#FFB02E', '#FF5C5C', '#9C6BFF', '#00A884', '#7D8D95'];
const COMMERCIAL_STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'en_conversacion', label: 'En conversacion' },
  { value: 'cotizado', label: 'Cotizado' },
  { value: 'vendido', label: 'Vendido' },
  { value: 'perdido', label: 'Perdido' }
];
const COMMERCIAL_STATUS_LABEL_BY_VALUE = COMMERCIAL_STATUS_OPTIONS.reduce((acc, entry) => {
  acc[entry.value] = entry.label;
  return acc;
}, {});

const normalizePhoneDigits = (value = '') => String(value || '').replace(/\D/g, '');
const normalizeSearchText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();
const isSavedCustomerChat = (chat = {}) => (
  chat?.isMyContact === true
  || Boolean(String(chat?.customerId || '').trim())
  || Boolean(String(chat?.erpCustomerName || '').trim())
);
const normalizeFilterToken = (value = '') => String(value || '').trim().toLowerCase();
const normalizeCommercialStatus = (value = 'all') => {
  const clean = normalizeFilterToken(value || 'all');
  return COMMERCIAL_STATUS_LABEL_BY_VALUE[clean] ? clean : 'all';
};

const normalizeFilters = (filters = {}) => {
  const rawTokens = Array.isArray(filters?.labelTokens) ? filters.labelTokens : [];
  const seen = new Set();
  const labelTokens = [];
  for (const token of rawTokens) {
    const clean = normalizeFilterToken(token);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    labelTokens.push(clean);
  }

  const contactMode = ['all', 'my', 'unknown'].includes(String(filters?.contactMode || 'all'))
    ? String(filters?.contactMode || 'all')
    : 'all';
  const archivedMode = ['all', 'archived', 'active'].includes(String(filters?.archivedMode || 'all'))
    ? String(filters?.archivedMode || 'all')
    : 'all';
  const pinnedMode = ['all', 'pinned', 'unpinned'].includes(String(filters?.pinnedMode || 'all'))
    ? String(filters?.pinnedMode || 'all')
    : 'all';

  return {
    labelTokens,
    unreadOnly: Boolean(filters?.unreadOnly),
    unlabeledOnly: Boolean(filters?.unlabeledOnly),
    onlyAssignedToMe: Boolean(filters?.onlyAssignedToMe),
    assigneeUserId: normalizeFilterToken(filters?.assigneeUserId || ''),
    commercialStatus: normalizeCommercialStatus(filters?.commercialStatus || 'all'),
    contactMode,
    archivedMode,
    pinnedMode
  };
};

const getLabelToken = (label = {}) => {
  const id = normalizeFilterToken(label?.id);
  if (id) return `id:${id}`;
  const name = normalizeFilterToken(label?.name);
  if (name) return `name:${name}`;
  return '';
};

const getChatLabelTokenSet = (chat = {}) => {
  const set = new Set();
  const labels = Array.isArray(chat?.labels) ? chat.labels : [];
  labels.forEach((label) => {
    const token = getLabelToken(label);
    if (token) set.add(token);
  });
  return set;
};

const buildChatSearchHaystack = (chat = {}) => normalizeSearchText([
  chat?.name,
  chat?.subtitle,
  chat?.status,
  chat?.lastMessage,
  chat?.erpCustomerName,
  chat?.contactName,
  chat?.contact_name,
  chat?.firstName,
  chat?.first_name,
  chat?.lastNamePaternal,
  chat?.last_name_paternal,
  chat?.lastNameMaternal,
  chat?.last_name_maternal,
  chat?.fullName,
  chat?.documentNumber,
  chat?.document_number,
  chat?.phone,
  chat?.email,
  chat?.customerId
].filter(Boolean).join(' '));

const buildChatPhoneHaystack = (chat = {}) => [
  chat?.phone,
  chat?.id,
  chat?.subtitle,
  chat?.contactName,
  chat?.contact_name
].map((value) => normalizePhoneDigits(value)).filter(Boolean).join(' ');

const useSidebarFiltersController = ({
  chats = [],
  activeFilters = {},
  labelDefinitions = [],
  waModules = [],
  chatAssignmentState = null,
  chatCommercialStatusState = null,
  onFiltersChange = null,
  searchQuery = ''
} = {}) => {
  void waModules;
  const assignmentsLoaded = Boolean(chatAssignmentState?.assignmentsLoaded);
  const isAssignedToMeResolver = typeof chatAssignmentState?.isAssignedToMe === 'function'
    ? chatAssignmentState.isAssignedToMe
    : (() => false);
  const getAssignmentResolver = typeof chatAssignmentState?.getAssignment === 'function'
    ? chatAssignmentState.getAssignment
    : (() => null);
  const statusesLoaded = Boolean(chatCommercialStatusState?.statusesLoaded);
  const getCommercialStatusResolver = typeof chatCommercialStatusState?.getCommercialStatus === 'function'
    ? chatCommercialStatusState.getCommercialStatus
    : (() => null);

  const resolveChatAssignment = useCallback((chat = {}) => {
    const scopedId = String(chat?.id || '').trim();
    if (scopedId) {
      const scopedAssignment = getAssignmentResolver(scopedId);
      if (scopedAssignment) return scopedAssignment;
    }
    const baseId = String(chat?.baseChatId || '').trim();
    if (baseId) {
      return getAssignmentResolver(baseId);
    }
    return null;
  }, [getAssignmentResolver]);
  const resolveChatCommercialStatus = useCallback((chat = {}) => {
    const scopedId = String(chat?.id || '').trim();
    if (scopedId) {
      const scopedStatus = getCommercialStatusResolver(scopedId);
      if (scopedStatus) return scopedStatus;
    }
    const baseId = String(chat?.baseChatId || '').trim();
    if (baseId) {
      return getCommercialStatusResolver(baseId);
    }
    return null;
  }, [getCommercialStatusResolver]);

  const [labelSearch, setLabelSearch] = useState('');

  const filters = useMemo(() => normalizeFilters(activeFilters), [activeFilters]);

  const updateFilters = (patch = {}) => {
    const next = normalizeFilters({ ...filters, ...patch });
    onFiltersChange?.(next);
  };

  const allLabels = useMemo(() => {
    const map = new Map();
    const counts = new Map();

    const register = (label, idx = 0) => {
      const token = getLabelToken(label);
      if (!token) return;
      if (!map.has(token)) {
        const id = label?.id ?? null;
        const fallbackName = id !== null && id !== undefined ? `Etiqueta ${id}` : 'Etiqueta';
        map.set(token, {
          token,
          id,
          name: String(label?.name || fallbackName).trim(),
          color: label?.color || WA_LABEL_COLORS[idx % WA_LABEL_COLORS.length]
        });
      }
    };

    (labelDefinitions || []).forEach((label, idx) => register(label, idx));
    chats.forEach((chat) => {
      const chatTokens = new Set();
      (chat?.labels || []).forEach((label, idx) => {
        register(label, idx);
        const token = getLabelToken(label);
        if (token) chatTokens.add(token);
      });
      chatTokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
    });

    return Array.from(map.values())
      .map((label) => ({ ...label, count: counts.get(label.token) || 0 }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      });
  }, [chats, labelDefinitions]);

  const normalizedLabelSearch = String(labelSearch || '').trim().toLowerCase();
  const visibleLabels = useMemo(() => (
    normalizedLabelSearch
      ? allLabels.filter((label) => `${label.name}`.toLowerCase().includes(normalizedLabelSearch))
      : allLabels
  ), [allLabels, normalizedLabelSearch]);

  const selectedLabelCount = filters.labelTokens.length;
  const hasActiveQuickFilters = filters.unreadOnly
    || filters.unlabeledOnly
    || filters.onlyAssignedToMe
    || Boolean(filters.assigneeUserId)
    || filters.commercialStatus !== 'all'
    || filters.contactMode !== 'all'
    || filters.archivedMode !== 'all'
    || filters.pinnedMode !== 'all';
  const hasAnyFilter = hasActiveQuickFilters || selectedLabelCount > 0;

  const assignmentUserOptions = useMemo(() => {
    const map = new Map();
    chats.forEach((chat) => {
      const assignment = resolveChatAssignment(chat);
      const rawUserId = String(assignment?.assigneeUserId || '').trim();
      if (!rawUserId) return;
      const value = normalizeFilterToken(rawUserId);
      if (!value || map.has(value)) return;
      const assigneeName = String(
        assignment?.assigneeName
        || assignment?.assigneeDisplayName
        || assignment?.metadata?.assigneeName
        || rawUserId
      ).trim() || rawUserId;
      map.set(value, { value, label: assigneeName });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
  }, [chats, resolveChatAssignment]);

  const assignmentUserLabelById = useMemo(() => {
    const map = new Map();
    assignmentUserOptions.forEach((entry) => {
      map.set(entry.value, entry.label);
    });
    return map;
  }, [assignmentUserOptions]);

  const quickStats = useMemo(() => {
    const unread = chats.filter((c) => Number(c?.unreadCount || 0) > 0).length;
    const unlabeled = chats.filter((c) => (Array.isArray(c?.labels) ? c.labels.length : 0) === 0).length;
    const myContacts = chats.filter((c) => isSavedCustomerChat(c)).length;
    const unknown = chats.filter((c) => !isSavedCustomerChat(c)).length;
    const archived = chats.filter((c) => Boolean(c?.archived)).length;
    const pinned = chats.filter((c) => Boolean(c?.pinned)).length;
    const assignedToMe = assignmentsLoaded
      ? chats.filter((chat) => isAssignedToMeResolver(chat?.id)).length
      : 0;
    return { unread, unlabeled, myContacts, unknown, archived, pinned, assignedToMe };
  }, [assignmentsLoaded, chats, isAssignedToMeResolver]);

  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (!hasAnyFilter) return chips;
    if (filters.unreadOnly) chips.push('No leidos');
    if (filters.unlabeledOnly) chips.push('Sin etiqueta');
    if (filters.onlyAssignedToMe) chips.push('Solo mis chats');
    if (filters.assigneeUserId === '__unassigned__') chips.push('Solo sin asignar');
    if (filters.assigneeUserId && filters.assigneeUserId !== '__unassigned__') {
      chips.push(`Asignada: ${assignmentUserLabelById.get(filters.assigneeUserId) || filters.assigneeUserId}`);
    }
    if (filters.commercialStatus !== 'all') {
      chips.push(`Estado: ${COMMERCIAL_STATUS_LABEL_BY_VALUE[filters.commercialStatus] || filters.commercialStatus}`);
    }
    if (filters.archivedMode === 'archived') chips.push('Archivados');
    if (filters.pinnedMode === 'pinned') chips.push('Fijados');
    if (filters.contactMode === 'my') chips.push('Guardados');
    if (filters.contactMode === 'unknown') chips.push('No guardados');
    if (filters.labelTokens.length > 0) chips.push(`Etiquetas (${filters.labelTokens.length})`);
    return chips;
  }, [assignmentUserLabelById, filters, hasAnyFilter]);

  const localQuery = String(searchQuery || '');
  const filteredChats = useMemo(() => chats.filter((chat) => {
    const labelTokenSet = getChatLabelTokenSet(chat);

    if (filters.unreadOnly && Number(chat?.unreadCount || 0) <= 0) return false;
    if (filters.onlyAssignedToMe && assignmentsLoaded && !isAssignedToMeResolver(chat?.id)) return false;
    if (filters.assigneeUserId && assignmentsLoaded) {
      const assignment = resolveChatAssignment(chat);
      const assigneeToken = normalizeFilterToken(assignment?.assigneeUserId || '');
      if (filters.assigneeUserId === '__unassigned__') {
        if (assigneeToken) return false;
      } else if (assigneeToken !== filters.assigneeUserId) {
        return false;
      }
    }
    if (filters.commercialStatus !== 'all' && statusesLoaded) {
      const chatCommercialStatus = resolveChatCommercialStatus(chat);
      const statusToken = normalizeFilterToken(chatCommercialStatus?.status || 'nuevo') || 'nuevo';
      if (statusToken !== filters.commercialStatus) return false;
    }
    if (filters.contactMode === 'my' && !isSavedCustomerChat(chat)) return false;
    if (filters.contactMode === 'unknown' && isSavedCustomerChat(chat)) return false;
    if (filters.archivedMode === 'archived' && !chat?.archived) return false;
    if (filters.archivedMode === 'active' && chat?.archived) return false;
    if (filters.pinnedMode === 'pinned' && !chat?.pinned) return false;
    if (filters.pinnedMode === 'unpinned' && chat?.pinned) return false;
    // TODO(bug): filtro "sin etiquetas" muestra resultados invertidos — chats con etiqueta aparecen como sin etiqueta
    if (filters.unlabeledOnly && labelTokenSet.size !== 0) return false;

    if (!filters.unlabeledOnly && filters.labelTokens.length > 0) {
      const hasLabel = filters.labelTokens.some((token) => labelTokenSet.has(normalizeFilterToken(token)));
      if (!hasLabel) return false;
    }

    const q = normalizeSearchText(localQuery || '');
    if (!q) return true;

    const qDigits = normalizePhoneDigits(q);
    const phoneHaystack = buildChatPhoneHaystack(chat);
    const textHaystack = buildChatSearchHaystack(chat);

    if (qDigits) {
      return phoneHaystack.includes(qDigits);
    }

    // TODO(bug): filtro sin resultados queda en estado "cargando" indefinidamente — falta estado de "sin resultados"
    return textHaystack.includes(q);
  }), [assignmentsLoaded, chats, filters, localQuery, isAssignedToMeResolver, resolveChatAssignment, resolveChatCommercialStatus, statusesLoaded]);

  const resetFilters = () => {
    onFiltersChange?.(normalizeFilters({
      labelTokens: [],
      unreadOnly: false,
      unlabeledOnly: false,
      onlyAssignedToMe: false,
      assigneeUserId: '',
      commercialStatus: 'all',
      contactMode: 'all',
      archivedMode: 'all',
      pinnedMode: 'all'
    }));
  };

  const toggleLabel = (token) => {
    const clean = normalizeFilterToken(token);
    if (!clean) return;
    const next = new Set(filters.labelTokens);
    if (next.has(clean)) next.delete(clean); else next.add(clean);
    updateFilters({ labelTokens: Array.from(next), unlabeledOnly: false });
  };

  return {
    filters,
    updateFilters,
    allLabels,
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
    commercialStatusOptions: COMMERCIAL_STATUS_OPTIONS
  };
};

export default useSidebarFiltersController;
