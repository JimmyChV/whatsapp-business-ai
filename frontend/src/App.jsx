import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';

import Sidebar from './components/Sidebar';
import BusinessSidebar, { ClientProfilePanel } from './components/BusinessSidebar';
import ChatWindow from './components/ChatWindow';

import './index.css';

export const socket = io('http://localhost:3001');

const normalizeCatalogItem = (item = {}, index = 0) => {
  const safeItem = item && typeof item === 'object' ? item : {};
  const rawTitle = safeItem.title || safeItem.name || safeItem.nombre || safeItem.productName || safeItem.sku || '';
  const rawPrice = safeItem.price ?? safeItem.regular_price ?? safeItem.sale_price ?? safeItem.amount ?? safeItem.precio ?? 0;
  const parsedPrice = Number.parseFloat(String(rawPrice).replace(',', '.'));

  return {
    id: safeItem.id || safeItem.product_id || `catalog_${index}`,
    title: String(rawTitle || `Producto ${index + 1}`).trim(),
    price: Number.isFinite(parsedPrice) ? parsedPrice.toFixed(2) : '0.00',
    description: safeItem.description || safeItem.short_description || safeItem.descripcion || '',
    imageUrl: safeItem.imageUrl || safeItem.image || safeItem.image_url || safeItem.images?.[0]?.src || null,
    source: safeItem.source || 'unknown',
    sku: safeItem.sku || null,
    stockStatus: safeItem.stockStatus || safeItem.stock_status || null
  };
};

const normalizeBusinessDataPayload = (data = {}) => {
  const rawCatalog = Array.isArray(data.catalog) ? data.catalog : [];
  const catalog = rawCatalog.map((item, idx) => normalizeCatalogItem(item, idx));
  return {
    profile: data.profile || null,
    labels: Array.isArray(data.labels) ? data.labels : [],
    catalog,
    catalogMeta: data.catalogMeta || { source: 'local', nativeAvailable: false }
  };
};

const normalizeChatLabels = (labels = []) => (Array.isArray(labels) ? labels.map((l) => ({ id: l?.id, name: l?.name || '', color: l?.color || null })) : []);

const upsertAndSortChat = (list = [], incoming = null) => {
  if (!incoming?.id) return list;
  const without = list.filter((c) => c.id !== incoming.id);
  const merged = [incoming, ...without];
  return merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
};

function App() {
  // ─── Connection State ────────────────────────────────────────
  const [isConnected, setIsConnected] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [isClientReady, setIsClientReady] = useState(false);

  // ─── Chat State ──────────────────────────────────────────────
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');

  // ─── My Profile (the logged-in WA Business Account) ─────────
  const [myProfile, setMyProfile] = useState(null);

  // ─── Client Profile Panel ───────────────────────────────────
  const [showClientProfile, setShowClientProfile] = useState(false);
  const [clientContact, setClientContact] = useState(null);

  // ─── Media State ─────────────────────────────────────────────
  const [attachment, setAttachment] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const fileInputRef = useRef(null);

  // ─── AI State ────────────────────────────────────────────────
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isCopilotMode, setIsCopilotMode] = useState(false);


  // ─── Business Data (Real from WA) ────────────────────────────
  const [businessData, setBusinessData] = useState({ profile: null, labels: [], catalog: [], catalogMeta: { source: 'local', nativeAvailable: false } });
  const [labelDefinitions, setLabelDefinitions] = useState([]);
  const [toasts, setToasts] = useState([]);

  // ─── Other ───────────────────────────────────────────────────
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef(null);

  // ──────────────────────────────────────────────────────────────
  // Notifications
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    try {
      const savedDefs = JSON.parse(localStorage.getItem('wa_custom_label_defs') || '[]');
      const savedMap = JSON.parse(localStorage.getItem('wa_custom_chat_labels') || '{}');
      if (Array.isArray(savedDefs)) setLabelDefinitions(savedDefs);
      if (savedMap && typeof savedMap === 'object') setChatLabelMap(savedMap);
    } catch (e) {
      console.warn('No se pudieron leer etiquetas locales', e.message);
    }
  }, []);

  // ──────────────────────────────────────────────────────────────
  // Auto-scroll
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ──────────────────────────────────────────────────────────────
  // Socket Events
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('qr', (qr) => { setQrCode(qr); setIsClientReady(false); });

    socket.on('ready', () => {
      setIsClientReady(true);
      setQrCode('');
      socket.emit('get_chats');
      socket.emit('get_business_data');
      socket.emit('get_my_profile');
    });

    socket.on('my_profile', (profile) => {
      setMyProfile(profile);
    });

    socket.on('chats', (chatList) => {
      const hydrated = (Array.isArray(chatList) ? chatList : []).map((chat) => ({ ...chat, labels: normalizeChatLabels(chat.labels) }));
      setChats(hydrated);
    });

    socket.on('chat_opened', ({ chatId }) => {
      if (chatId) handleChatSelect(chatId);
      socket.emit('get_chats');
    });

    socket.on('start_new_chat_error', (msg) => {
      if (msg) alert(msg);
    });

    socket.on('chat_labels_updated', ({ chatId, labels }) => {
      setChats((prev) => prev.map((chat) => chat.id === chatId ? { ...chat, labels: normalizeChatLabels(labels) } : chat));
      if (chatId === activeChatId) socket.emit('get_contact_info', chatId);
    });

    socket.on('chat_labels_error', (msg) => {
      if (msg) alert(msg);
    });

    socket.on('chat_labels_saved', ({ chatId }) => {
      socket.emit('get_chats');
      if (chatId === activeChatId) socket.emit('get_contact_info', chatId);
    });

    socket.on('chat_history', (data) => {
      if (data.chatId === activeChatId) setMessages(data.messages);
    });

    socket.on('contact_info', (contact) => {
      setClientContact(contact);
    });

    socket.on('message', (msg) => {
      const relatedChatId = msg.fromMe ? msg.to : msg.from;
      if (!msg.fromMe && Notification.permission === 'granted') {
        new Notification(msg.notifyName || 'Nuevo mensaje', { body: msg.body || 'Nuevo mensaje', icon: '/favicon.ico' });
      }

      if (!msg.fromMe && relatedChatId !== activeChatId) {
        const toastId = `${msg.id || Date.now()}`;
        setToasts((prev) => [...prev, { id: toastId, chatId: relatedChatId, title: msg.notifyName || msg.from, body: msg.body || 'Nuevo mensaje' }].slice(-3));
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toastId));
        }, 5000);
      }

      setChats((prev) => {
        const existing = prev.find((c) => c.id === relatedChatId);
        const nextChat = {
          ...(existing || { id: relatedChatId, name: msg.notifyName || relatedChatId, labels: [] }),
          timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
          lastMessage: msg.body || (msg.type === 'image' ? '📷 Imagen' : 'Mensaje'),
          lastMessageFromMe: !!msg.fromMe,
          ack: msg.ack || 0,
          unreadCount: msg.fromMe ? (existing?.unreadCount || 0) : (relatedChatId === activeChatId ? 0 : (existing?.unreadCount || 0) + 1),
        };
        return upsertAndSortChat(prev, nextChat);
      });

      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        const shouldAdd = (msg.fromMe && msg.to === activeChatId) || (!msg.fromMe && msg.from === activeChatId);
        return shouldAdd ? [...prev, msg] : prev;
      });
    });

    socket.on('business_data', (data) => {
      const normalized = normalizeBusinessDataPayload(data);
      setBusinessData(normalized);
      setLabelDefinitions(normalizeChatLabels(normalized.labels));
    });

    socket.on('business_data_catalog', (catalog) => {
      const normalizedCatalog = Array.isArray(catalog) ? catalog.map((item, idx) => normalizeCatalogItem(item, idx)) : [];
      setBusinessData(prev => ({ ...prev, catalog: normalizedCatalog }));
    });

    socket.on('ai_suggestion_chunk', (chunk) => {
      setAiSuggestion(prev => prev + chunk);
    });

    socket.on('ai_suggestion_complete', () => {
      setIsAiLoading(false);
    });

    socket.on('ai_error', (msg) => {
      setIsAiLoading(false);
      if (msg) alert(msg);
    });

    socket.on('message_ack', ({ id, ack }) => {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, ack } : m));
      setChats(prev => prev.map(c => c.lastMessageFromMe && c.id === activeChatId ? { ...c, ack } : c));
    });

    socket.on('authenticated', () => {
      console.log('WhatsApp authenticated ✅');
    });

    socket.on('auth_failure', (msg) => {
      alert('Error de autenticación. Por favor recarga la página y escanea de nuevo.\n\nDetalle: ' + msg);
    });

    socket.on('disconnected', (reason) => {
      if (reason !== 'NAVIGATION') {
        setIsClientReady(false);
        setQrCode('');
      }
    });

    socket.on('logout_done', () => {
      setIsClientReady(false);
      setQrCode('');
      setChats([]);
      setMessages([]);
      setActiveChatId(null);
      alert('Sesión de WhatsApp cerrada. Escanea nuevamente el QR.');
    });

    return () => {
      ['connect', 'disconnect', 'qr', 'ready', 'my_profile', 'chats', 'chat_history',
        'chat_opened', 'start_new_chat_error', 'chat_labels_updated', 'chat_labels_error', 'chat_labels_saved',
        'contact_info', 'message', 'business_data', 'business_data_catalog', 'ai_suggestion_chunk',
        'ai_suggestion_complete', 'ai_error', 'message_ack', 'authenticated', 'auth_failure', 'disconnected', 'logout_done'
      ].forEach(ev => socket.off(ev));
    };
  }, [activeChatId, labelDefinitions]);

  // ──────────────────────────────────────────────────────────────
  // Apply AI suggestion to input
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (aiSuggestion && !isAiLoading) {
      setInputText(aiSuggestion);
      setAiSuggestion('');
    }
  }, [isAiLoading, aiSuggestion]);

  // ──────────────────────────────────────────────────────────────
  // Handlers
  // ──────────────────────────────────────────────────────────────
  const handleChatSelect = (chatId) => {
    setActiveChatId(chatId);
    setMessages([]);
    setShowClientProfile(false);
    setClientContact(null);
    socket.emit('get_chat_history', chatId);
    socket.emit('mark_chat_read', chatId);
    socket.emit('get_contact_info', chatId);
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, unreadCount: 0 } : c));
  };

  const handleSendMessage = (e) => {
    e?.preventDefault();
    if (!inputText.trim() && !attachment) return;

    const text = inputText.trim();

    // Command: /ayudar
    if (text === '/ayudar') {
      requestAiSuggestion();
      setInputText('');
      return;
    }

    if (attachment) {
      socket.emit('send_media_message', {
        to: activeChatId,
        body: inputText,
        mediaData: attachment.data,
        mimetype: attachment.mimetype,
        filename: attachment.filename,
      });
      removeAttachment();
    } else {
      socket.emit('send_message', { to: activeChatId, body: inputText });
    }
    setInputText('');
  };

  const handleLogoutWhatsapp = () => {
    if (!window.confirm('¿Cerrar sesión de WhatsApp en este equipo?')) return;
    socket.emit('logout_whatsapp');
  };

  const handleRefreshChats = () => {
    socket.emit('get_chats');
  };

  const handleCreateLabel = () => {
    const name = window.prompt('Nombre de etiqueta para WhatsApp Business:');
    if (!name?.trim()) return;
    socket.emit('create_label', { name: name.trim() });
  };

  const handleToggleChatLabel = (chatId, labelId) => {
    if (!chatId || labelId === undefined || labelId === null || labelId === '') return;
    const chat = chats.find((c) => c.id === chatId);
    const current = Array.isArray(chat?.labels) ? chat.labels : [];

    const idStr = String(labelId);
    const has = current.some((l) => String(l.id) === idStr);
    const nextIds = has
      ? current.filter((l) => String(l.id) !== idStr).map((l) => l.id).filter(Boolean)
      : [...current.map((l) => l.id).filter(Boolean), labelId];

    socket.emit('set_chat_labels', { chatId, labelIds: nextIds });
  };

  const handleStartNewChat = (phoneArg, firstMessageArg = '') => {
    const phone = phoneArg || window.prompt('Número del cliente (con código de país, sin +):');
    if (!phone) return;
    const firstMessage = typeof firstMessageArg === 'string' ? firstMessageArg : (window.prompt('Mensaje inicial (opcional):') || '');
    socket.emit('start_new_chat', { phone, firstMessage });
  };

  const requestAiSuggestion = (customPromptArg) => {
    if (!activeChatId) return;
    const customPrompt = typeof customPromptArg === 'string' ? customPromptArg : null;
    setAiSuggestion('');
    setIsAiLoading(true);

    const businessContext = `
Eres un asistente de ventas experto en Lávitat Perú. Ayuda al vendedor a responder con precisión técnica, enfoque comercial y cierres claros.

PERFIL DEL NEGOCIO:
${businessData.profile?.name || 'Negocio'}
${businessData.profile?.description || ''}
${businessData.profile?.address ? 'Dirección: ' + businessData.profile.address : ''}

CATÁLOGO DE PRODUCTOS:
${businessData.catalog.length > 0
        ? businessData.catalog.map((p, idx) => `${idx + 1}. ${p.title} | Precio: S/ ${p.price || 'consultar'}${p.sku ? ` | SKU: ${p.sku}` : ''}${p.description ? ` | ${p.description}` : ''}`).join('\n')
        : '(sin productos registrados)'
      }

INSTRUCCIÓN: ${customPrompt || 'Basándote en la conversación reciente, genera la respuesta más adecuada, profesional y persuasiva que el vendedor debería enviar.'}

REGLA CRÍTICA:
- NO INVENTES PRODUCTOS, tamaños o precios.
- Usa solamente productos presentes en el catálogo listado arriba.
- Si no existe el dato exacto, responde: "Te confirmo ese detalle en un momento".
    `.trim();

    const recentMessages = messages.slice(-12)
      .map(m => `${m.fromMe ? 'VENDEDOR' : 'CLIENTE'}: ${m.body}`)
      .join('\n');

    socket.emit('request_ai_suggestion', {
      contextText: recentMessages,
      businessContext,
      customPrompt: customPrompt || aiPrompt,
    });
  };

  const processFile = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target.result.split(',')[1];
      setAttachment({ data: base64Data, mimetype: file.type, filename: file.name });
      setAttachmentPreview(file.type.startsWith('image/') ? event.target.result : 'document');
    };
    reader.readAsDataURL(file);
  };

  const removeAttachment = () => { setAttachment(null); setAttachmentPreview(null); };

  const handleFileChange = (e) => {
    if (e.target.files[0]) processFile(e.target.files[0]);
    e.target.value = null;
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    Array.from(e.dataTransfer.files).forEach(processFile);
  };

  // ──────────────────────────────────────────────────────────────
  // Render: Reconnecting
  // ──────────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#111b21', gap: '20px' }}>
        <div className="loader" />
        <p style={{ color: '#8696a0', fontSize: '0.9rem' }}>Conectando con el servidor...</p>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Render: QR Screen
  // ──────────────────────────────────────────────────────────────
  if (!isClientReady) {
    return (
      <div className="login-screen">
        <div style={{ textAlign: 'center', maxWidth: '500px' }}>
          <div style={{ marginBottom: '30px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 300, color: '#e9edef', marginBottom: '10px' }}>WhatsApp Business Pro</div>
            <p style={{ color: '#8696a0', fontSize: '0.9rem' }}>Escanea el código QR con tu teléfono para comenzar</p>
          </div>
          <div style={{ background: 'white', padding: '24px', borderRadius: '16px', display: 'inline-block', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
            {qrCode
              ? <QRCodeSVG value={qrCode} size={260} level="H" includeMargin={true} className="fade-in" />
              : <div style={{ width: '260px', height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loader" /></div>
            }
          </div>
          <div style={{ marginTop: '30px', padding: '20px', background: '#202c33', borderRadius: '12px', textAlign: 'left' }}>
            <p style={{ color: '#8696a0', fontSize: '0.85rem', lineHeight: '1.8' }}>
              1. Abre <strong style={{ color: '#e9edef' }}>WhatsApp</strong> en tu teléfono<br />
              2. Toca <strong style={{ color: '#e9edef' }}>Menú (⋮)</strong> o <strong style={{ color: '#e9edef' }}>Configuración</strong><br />
              3. Selecciona <strong style={{ color: '#e9edef' }}>Dispositivos vinculados</strong><br />
              4. Toca <strong style={{ color: '#e9edef' }}>Vincular un dispositivo</strong> y escanea
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Render: Main App
  // ──────────────────────────────────────────────────────────────
  const activeChatDetails = chats.find(c => c.id === activeChatId) || null;

  return (
    <div className="app-container">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
      />

      {/* Sidebar — Chat List */}
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onChatSelect={handleChatSelect}
        myProfile={myProfile}
        onLogout={handleLogoutWhatsapp}
        onRefreshChats={handleRefreshChats}
        onStartNewChat={handleStartNewChat}
        labelDefinitions={labelDefinitions}
        onCreateLabel={handleCreateLabel}
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', background: '#0b141a', position: 'relative', overflow: 'hidden' }}>
        {activeChatId ? (
          <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
            {/* Chat Window */}
            <ChatWindow
              activeChatDetails={{ ...activeChatDetails, ...clientContact }}
              messages={messages}
              messagesEndRef={messagesEndRef}
              isDragOver={isDragOver}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              showClientProfile={showClientProfile}
              setShowClientProfile={setShowClientProfile}
              /* ChatInput props */
              inputText={inputText}
              setInputText={setInputText}
              onSendMessage={handleSendMessage}
              onFileClick={() => fileInputRef.current?.click()}
              attachment={attachment}
              attachmentPreview={attachmentPreview}
              removeAttachment={removeAttachment}
              isAiLoading={isAiLoading}
              onRequestAiSuggestion={requestAiSuggestion}
              aiPrompt={aiPrompt}
              setAiPrompt={setAiPrompt}
              isCopilotMode={isCopilotMode}
              setIsCopilotMode={setIsCopilotMode}
              labelDefinitions={labelDefinitions}
              onToggleChatLabel={handleToggleChatLabel}
            />

            {/* Client Profile Panel (slides in from right) */}
            {showClientProfile && (
              <ClientProfilePanel
                contact={{ ...activeChatDetails, ...clientContact }}
                onClose={() => setShowClientProfile(false)}
                onQuickAiAction={requestAiSuggestion}
              />
            )}
          </div>
        ) : (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#222e35',
          }}>
            <div style={{ textAlign: 'center', padding: '40px', maxWidth: '450px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '20px' }}>💬</div>
              <h1 style={{ fontSize: '2rem', fontWeight: 300, color: '#e9edef', marginBottom: '15px' }}>
                WhatsApp Business Pro
              </h1>
              <p style={{ color: '#8696a0', fontSize: '0.9rem', lineHeight: '1.6' }}>
                Selecciona un chat para comenzar a vender.<br />
                Usa los botones de IA para cerrar más ventas con OpenAI.
              </p>
              <div style={{ marginTop: '30px', padding: '16px 20px', background: '#2a3942', borderRadius: '12px', textAlign: 'left', fontSize: '0.85rem', color: '#8696a0', lineHeight: '1.8' }}>
                <strong style={{ color: '#00a884' }}>Funciones IA disponibles:</strong><br />
                ✨ Sugerencia de respuesta automática<br />
                📦 Recomendación de producto<br />
                💰 Técnicas de cierre de venta<br />
                🔄 Manejo de objeciones
              </div>
            </div>
          </div>
        )}

        {toasts.length > 0 && (
          <div className="in-app-toast-stack">
            {toasts.map((toast) => (
              <button key={toast.id} className="in-app-toast" onClick={() => { handleChatSelect(toast.chatId); setToasts((prev) => prev.filter((t) => t.id !== toast.id)); }}>
                <strong>{toast.title || 'Nuevo mensaje'}</strong>
                <span>{toast.body}</span>
              </button>
            ))}
          </div>
        )}

        {/* Business Sidebar — AI & Catalog (always visible) */}
        <BusinessSidebar
          setInputText={setInputText}
          businessData={businessData}
          messages={messages}
          activeChatId={activeChatId}
          socket={socket}
          myProfile={myProfile}
          onLogout={handleLogoutWhatsapp}
        />
      </div>
    </div>
  );
}

export default App;
