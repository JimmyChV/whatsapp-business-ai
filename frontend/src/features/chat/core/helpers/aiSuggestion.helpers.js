import { normalizeWaModules } from './appChat.helpers';

function normalizeModuleId(value = '') {
  return String(value || '').trim().toLowerCase();
}

function normalizeCatalogId(value = '') {
  return String(value || '').trim().toUpperCase();
}

export function requestAiSuggestionForChat({
  socket,
  activeChatId,
  activeChatDetails,
  clientContact,
  selectedWaModuleRef,
  selectedCatalogModuleIdRef,
  selectedCatalogIdRef,
  waModulesRef,
  businessData,
  messages,
  activeCartSnapshot,
  tenantScopeRef,
  saasRuntimeRef,
  aiPrompt,
  customPromptArg,
  setAiSuggestion,
  setIsAiLoading
} = {}) {
  if (!activeChatId) return;
  const customPrompt = typeof customPromptArg === 'string' ? customPromptArg : null;
  setAiSuggestion('');
  setIsAiLoading(true);

  const catalogScope = (businessData?.catalogMeta?.scope && typeof businessData.catalogMeta.scope === 'object')
    ? businessData.catalogMeta.scope
    : {};
  const aiModuleId = normalizeModuleId(activeChatDetails?.scopeModuleId || selectedWaModuleRef?.current?.moduleId || selectedCatalogModuleIdRef?.current || '');
  const moduleRows = normalizeWaModules(waModulesRef?.current || []);
  const moduleRow = moduleRows.find((entry) => normalizeModuleId(entry?.moduleId) === aiModuleId) || null;

  const selectedCatalog = normalizeCatalogId(selectedCatalogIdRef?.current || catalogScope.catalogId || '');
  const scopeCatalogIds = Array.isArray(catalogScope.catalogIds)
    ? catalogScope.catalogIds.map((entry) => normalizeCatalogId(entry)).filter(Boolean)
    : [];
  const catalogIds = Array.from(new Set([
    selectedCatalog,
    ...scopeCatalogIds
  ].filter(Boolean)));

  const e164Phone = (() => {
    const digits = String(activeChatDetails?.phone || clientContact?.phone || '').replace(/\D/g, '');
    if (!digits) return '';
    return '+' + digits;
  })();

  const recentMessagesRows = (Array.isArray(messages) ? messages : []).slice(-18).map((entry) => ({
    fromMe: entry?.fromMe === true,
    body: String(entry?.body || '').trim(),
    type: String(entry?.type || '').trim().toLowerCase() || 'chat',
    timestamp: Number(entry?.timestamp || 0) || null
  }));

  const runtimeContext = {
    tenant: {
      id: String(tenantScopeRef?.current || 'default').trim() || 'default',
      name: String(saasRuntimeRef?.current?.tenant?.name || businessData?.profile?.name || '').trim() || null,
      plan: String(saasRuntimeRef?.current?.tenant?.plan || '').trim() || null
    },
    module: {
      moduleId: aiModuleId || null,
      name: String(moduleRow?.name || activeChatDetails?.moduleName || '').trim() || null,
      channelType: String(moduleRow?.channelType || activeChatDetails?.channelType || 'whatsapp').trim().toLowerCase() || 'whatsapp',
      transportMode: 'cloud'
    },
    catalog: {
      catalogId: selectedCatalog || null,
      catalogIds,
      source: String(businessData?.catalogMeta?.source || '').trim().toLowerCase() || 'local',
      items: (Array.isArray(businessData?.catalog) ? businessData.catalog : []).slice(0, 70).map((item) => ({
        id: item?.id || null,
        title: item?.title || null,
        price: item?.price || null,
        regularPrice: item?.regularPrice || null,
        salePrice: item?.salePrice || null,
        discountPct: Number(item?.discountPct || 0) || 0,
        description: item?.description || '',
        category: item?.category || item?.categoryName || null,
        categories: Array.isArray(item?.categories) ? item.categories : [],
        catalogId: item?.catalogId || selectedCatalog || null,
        catalogName: item?.catalogName || null,
        source: item?.source || null,
        sku: item?.sku || null,
        stockStatus: item?.stockStatus || null,
        imageUrl: item?.imageUrl || null,
        presentation: item?.presentation || item?.metadata?.presentation || item?.metadata?.presentacion || null,
        aroma: item?.aroma || item?.metadata?.aroma || item?.metadata?.scent || null,
        hypoallergenic: typeof item?.metadata?.hypoallergenic === 'boolean' ? item.metadata.hypoallergenic : null,
        petFriendly: typeof item?.metadata?.petFriendly === 'boolean' ? item.metadata.petFriendly : (typeof item?.metadata?.pet_friendly === 'boolean' ? item.metadata.pet_friendly : null)
      }))
    },
    cart: (() => {
      const snapshot = activeCartSnapshot && typeof activeCartSnapshot === 'object' ? activeCartSnapshot : null;
      const sameChat = String(snapshot?.chatId || '').trim() === String(activeChatId || '').trim();
      if (!snapshot || !sameChat) {
        return {
          items: [],
          subtotal: 0,
          discount: 0,
          total: 0,
          delivery: 0,
          currency: 'PEN',
          notes: null
        };
      }
      return {
        items: Array.isArray(snapshot.items) ? snapshot.items : [],
        subtotal: Number(snapshot.subtotal || 0),
        discount: Number(snapshot.discount || 0),
        total: Number(snapshot.total || 0),
        delivery: Number(snapshot.delivery || 0),
        currency: String(snapshot.currency || 'PEN').trim() || 'PEN',
        notes: String(snapshot.notes || '').trim() || null
      };
    })(),
    chat: {
      chatId: String(activeChatId || '').trim(),
      phone: e164Phone || null,
      recentMessages: recentMessagesRows
    },
    customer: {
      customerId: String(clientContact?.customerId || activeChatDetails?.customerId || '').trim() || null,
      phoneE164: e164Phone || null,
      name: String(activeChatDetails?.name || clientContact?.name || activeChatDetails?.pushname || '').trim() || null
    },
    ui: {
      contextSource: 'chat_window'
    }
  };

  const businessContext = 'Contexto dinamico enviado en runtimeContext. Usa este bloque solo como fallback.';

  const recentMessages = recentMessagesRows
    .map((entry) => `${entry.fromMe ? 'VENDEDOR' : 'CLIENTE'}: ${entry.body || '[sin texto]'}`)
    .join('\n');

  socket.emit('request_ai_suggestion', {
    contextText: recentMessages,
    businessContext,
    customPrompt: customPrompt || aiPrompt,
    moduleId: aiModuleId || undefined,
    runtimeContext
  });
}
