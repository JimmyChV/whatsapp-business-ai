import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, ShoppingCart, Tag, BookOpen, Clock, Sparkles, Trash2, Percent, Plus, Minus, ChevronRight, Package, MessageSquare, PlusCircle, Edit2 } from 'lucide-react';
import moment from 'moment';
import { io } from 'socket.io-client';

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


const roundToOneDecimal = (value) => {
    const num = Number(value) || 0;
    return Math.round(num * 10) / 10;
};

const formatMoney = (value) => roundToOneDecimal(value).toFixed(1);

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

// =========================================================
// CLIENT PROFILE PANEL
// =========================================================
export const ClientProfilePanel = ({ contact, onClose, onQuickAiAction }) => {
    if (!contact) return null;
    const avatarColor = (name) => {
        const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
        if (!name) return colors[0];
        return colors[name.charCodeAt(0) % colors.length];
    };
    return (
        <div style={{
            position: 'absolute', top: 0, right: 0, width: '340px', height: '100%',
            background: '#111b21', zIndex: 500, display: 'flex', flexDirection: 'column',
            boxShadow: '-4px 0 20px rgba(0,0,0,0.5)', borderLeft: '1px solid var(--border-color)',
            animation: 'slideInRight 0.3s ease-out'
        }}>
            <div style={{ background: '#202c33', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-color)' }}>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8696a0', padding: '4px' }}><X size={20} /></button>
                <h3 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 400 }}>Perfil del contacto</h3>
            </div>
            <div style={{ background: '#202c33', padding: '28px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <div style={{
                    width: '100px', height: '100px', borderRadius: '50%',
                    background: contact.profilePicUrl ? `url(${contact.profilePicUrl}) center/cover` : avatarColor(contact.name),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '2.5rem', color: 'white', fontWeight: 500, overflow: 'hidden', flexShrink: 0
                }}>
                    {!contact.profilePicUrl && contact.name?.charAt(0)?.toUpperCase()}
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 400 }}>{contact.name}</div>
                    <div style={{ fontSize: '0.82rem', color: '#8696a0', marginTop: '3px' }}>{contact.phone || contact.id?.replace('@c.us', '').replace('@g.us', '')}</div>
                    {contact.isBusiness && (
                        <div style={{ marginTop: '8px', background: '#00a884', color: 'white', fontSize: '0.72rem', padding: '2px 10px', borderRadius: '20px', display: 'inline-block' }}>
                            Cuenta Business
                        </div>
                    )}
                </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                {contact.status && (
                    <div style={{ background: '#202c33', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
                        <div style={{ fontSize: '0.7rem', color: '#00a884', marginBottom: '6px' }}>INFO / ESTADO</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{contact.status}</div>
                    </div>
                )}
                {contact.labels?.length > 0 && (
                    <div style={{ background: '#202c33', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
                        <div style={{ fontSize: '0.7rem', color: '#00a884', marginBottom: '8px' }}>ETIQUETAS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {contact.labels.map((l, i) => (
                                <span key={i} style={{ background: l.color || '#3b4a54', color: 'white', padding: '3px 10px', borderRadius: '12px', fontSize: '0.78rem' }}>{l.name}</span>
                            ))}
                        </div>
                    </div>
                )}
                <div style={{ background: '#202c33', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#00a884', marginBottom: '8px' }}>DATOS DISPONIBLES</div>
                    <div style={{ fontSize: '0.78rem', color: '#c9d5db', lineHeight: '1.55' }}>
                        {contact.pushname && <div>- Pushname: {contact.pushname}</div>}
                        {contact.shortName && <div>- Nombre corto: {contact.shortName}</div>}
                        <div>- Business: {contact.isBusiness ? 'Si' : 'No'}</div>
                        <div>- En mis contactos: {contact.isMyContact ? 'Si' : 'No'}</div>
                        <div>- Contacto WA: {contact.isWAContact ? 'Si' : 'No'}</div>
                        <div>- Bloqueado: {contact.isBlocked ? 'Si' : 'No'}</div>
                    </div>
                </div>
                {contact.businessDetails && (
                    <div style={{ background: '#202c33', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
                        <div style={{ fontSize: '0.7rem', color: '#00a884', marginBottom: '8px' }}>PERFIL BUSINESS (WHATSAPP)</div>
                        <div style={{ fontSize: '0.78rem', color: '#c9d5db', lineHeight: '1.55' }}>
                            {contact.businessDetails.category && <div>- Categoria: {contact.businessDetails.category}</div>}
                            {contact.businessDetails.website && <div>- Web: {contact.businessDetails.website}</div>}
                            {contact.businessDetails.email && <div>- Email: {contact.businessDetails.email}</div>}
                            {contact.businessDetails.address && <div>- Direccion: {contact.businessDetails.address}</div>}
                            {contact.businessDetails.description && <div>- Descripcion: {contact.businessDetails.description}</div>}
                        </div>
                    </div>
                )}
                <div style={{ background: '#202c33', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#8a2be2', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Sparkles size={11} /> ACCIONES RAPIDAS IA
                    </div>
                    {[
                        { label: 'Redactar saludo', prompt: 'Redacta un saludo personalizado y profesional para este cliente.' },
                        { label: 'Crear propuesta de venta', prompt: 'Crea una propuesta de venta persuasiva para este cliente basada en la conversacion.' },
                        { label: 'Mensaje de seguimiento', prompt: 'Redacta un mensaje de seguimiento para este cliente que no ha respondido.' },
                    ].map((a, i) => (
                        <div key={i} onClick={() => onQuickAiAction && onQuickAiAction(a.prompt)}
                            style={{ padding: '9px 12px', marginBottom: '6px', background: '#1a2530', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', color: 'var(--text-primary)' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#243040'}
                            onMouseLeave={e => e.currentTarget.style.background = '#1a2530'}
                        >
                            {a.label} <ChevronRight size={13} color="#8696a0" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// =========================================================
            {/* CATALOG TAB */}
// =========================================================
const CatalogTab = ({ catalog, socket, setInputText, addToCart, catalogMeta }) => {
    const [showForm, setShowForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [formData, setFormData] = useState({ title: '', price: '', description: '', imageUrl: '' });
    const [catalogQty, setCatalogQty] = useState({});
    const [catalogSearch, setCatalogSearch] = useState('');
    const isNativeCatalog = catalogMeta?.source === 'native' && catalogMeta?.nativeAvailable;
    const isExternalCatalog = ['native', 'woocommerce'].includes(catalogMeta?.source);

    const handleAddClick = () => {
        setEditingProduct(null);
        setFormData({ title: '', price: '', description: '', imageUrl: '' });
        setShowForm(true);
    };

    const handleEditClick = (product) => {
        setEditingProduct(product);
        setFormData({ title: product.title, price: product.price, description: product.description, imageUrl: product.imageUrl || '' });
        setShowForm(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (editingProduct) {
            socket.emit('update_product', { id: editingProduct.id, updates: formData });
        } else {
            socket.emit('add_product', formData);
        }
        setShowForm(false);
    };

    const handleDelete = (id) => {
        if (window.confirm('Eliminar este producto?')) {
            socket.emit('delete_product', id);
        }
    };

    const getCatalogQty = (id) => Math.max(1, catalogQty[id] || 1);
    const updateCatalogQty = (id, delta) => setCatalogQty(prev => ({ ...prev, [id]: Math.max(1, (prev[id] || 1) + delta) }));
    const buildProductShareText = (item, i) => {
        const title = item.title || `Producto ${i + 1}`;
        const priceLine = item.price ? `Precio: S/ ${formatMoney(item.price)}` : 'Precio: Consultar';
        const productUrl = item.url || item.permalink || item.productUrl || item.link || '';
        const mediaRef = item.imageUrl || '';
        if (productUrl) return `*${title}*\n${priceLine}\n${productUrl}`;
        if (mediaRef) return `*${title}*\n${priceLine}\nImagen: ${mediaRef}`;
        return `*${title}*\n${priceLine}`;
    };
    const normalizedSearch = catalogSearch.trim().toLowerCase();
    const visibleCatalog = normalizedSearch
        ? catalog.filter((item) => `${item.title || ''} ${item.sku || ''}`.toLowerCase().includes(normalizedSearch))
        : catalog;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {isNativeCatalog ? 'Catalogo de WhatsApp (nativo)' : catalogMeta?.source === 'woocommerce' ? 'Catalogo de WooCommerce' : 'Gestion de Catalogo'}
                </div>
                {!isExternalCatalog && (
                    <button onClick={handleAddClick} style={{ background: '#00a884', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <PlusCircle size={14} /> Nuevo
                    </button>
                )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {isExternalCatalog && (
                    <div style={{ background: '#1f2c34', color: '#8696a0', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px', fontSize: '0.75rem' }}>
                        Este catalogo se sincroniza desde {catalogMeta?.source === 'woocommerce' ? 'WooCommerce' : 'WhatsApp Business'}. Para editar productos, hazlo en el origen.
                    </div>
                )}
                {catalogMeta?.source === 'local' && catalogMeta?.wooStatus && catalogMeta?.wooStatus !== 'ok' && (
                    <div style={{ background: '#2f2520', color: '#f7b267', border: '1px solid #7a4d2c', borderRadius: '8px', padding: '8px 10px', fontSize: '0.75rem' }}>
                        WooCommerce no devolvio productos ({catalogMeta?.wooSource || 'sin fuente'}).
                        {catalogMeta?.wooReason ? ` Detalle: ${catalogMeta.wooReason}` : ''}
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input
                        type="text"
                        value={catalogSearch}
                        onChange={e => setCatalogSearch(e.target.value)}
                        placeholder="Buscar por nombre o SKU"
                        style={{ width: '100%', background: '#111b21', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', padding: '8px 10px', fontSize: '0.78rem', outline: 'none' }}
                    />
                    <div style={{ fontSize: '0.7rem', color: '#8696a0' }}>
                        Mostrando {visibleCatalog.length} de {catalog.length} productos
                    </div>
                </div>

                {showForm ? (
                    <form onSubmit={handleSubmit} style={{ background: '#202c33', borderRadius: '10px', padding: '15px', border: '1px solid #00a884', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ fontSize: '0.85rem', color: '#00a884', fontWeight: 600, marginBottom: '5px' }}>{editingProduct ? 'Editar Producto' : 'Nuevo Producto'}</div>
                        <input
                            type="text" placeholder="Nombre del producto" required
                            value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })}
                            style={{ background: '#2a3942', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.82rem', outline: 'none' }}
                        />
                        <input
                            type="text" placeholder="Precio (ej: 25.00)" required
                            value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })}
                            style={{ background: '#2a3942', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.82rem', outline: 'none' }}
                        />
                        <textarea
                            placeholder="Descripcion" rows="3"
                            value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                            style={{ background: '#2a3942', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.82rem', outline: 'none', resize: 'none' }}
                        />
                        <input
                            type="text" placeholder="URL de imagen (opcional)"
                            value={formData.imageUrl} onChange={e => setFormData({ ...formData, imageUrl: e.target.value })}
                            style={{ background: '#2a3942', border: 'none', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.82rem', outline: 'none' }}
                        />
                        <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                            <button type="submit" style={{ flex: 1, background: '#00a884', color: 'white', border: 'none', borderRadius: '6px', padding: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Guardar</button>
                            <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, background: 'transparent', border: '1px solid #da3633', color: '#da3633', borderRadius: '6px', padding: '8px', cursor: 'pointer', fontSize: '0.8rem' }}>Cancelar</button>
                        </div>
                    </form>
                ) : (
                    <>
                        {visibleCatalog.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '30px 15px', color: '#8696a0' }}>
                                <Package size={36} style={{ marginBottom: '12px', opacity: 0.25, marginLeft: 'auto', marginRight: 'auto' }} />
                                <div style={{ fontSize: '0.875rem', marginBottom: '6px' }}>Catalogo vacio</div>
                                <div style={{ fontSize: '0.78rem', opacity: 0.7, lineHeight: '1.5' }}>
                                    Si tu catalogo nativo no aparece, WhatsApp Web no lo esta exponiendo en esta sesion.
                                </div>
                            </div>
                        ) : (
                            visibleCatalog.map((item, i) => (
                                <div key={item.id || i} style={{ background: '#202c33', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', minHeight: '184px', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '78px 1fr', gap: '10px', padding: '10px 10px 8px 10px', minHeight: '106px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                            <div style={{ width: '68px', height: '68px', borderRadius: '10px', background: '#3b4a54', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {item.imageUrl ? <img src={item.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={22} color="#8696a0" />}
                                            </div>
                                            <div style={{ fontSize: '0.86rem', color: '#00d4aa', fontWeight: 700, textAlign: 'center', lineHeight: 1.1 }}>
                                                {item.price ? `S/ ${formatMoney(item.price)}` : 'S/ -'}
                                            </div>
                                            {item.sku && <div style={{ fontSize: '0.64rem', color: '#9bb0ba', textAlign: 'center', lineHeight: 1.1 }}>SKU: {item.sku}</div>}
                                        </div>
                                        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'space-between' }}>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', minHeight: '2.5em' }}>
                                                {String(item.title || `Producto ${i + 1}`)}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                {item.regularPrice && Number(item.regularPrice) > Number(item.price || 0) && (
                                                    <div style={{ fontSize: '0.68rem', color: '#8696a0', textDecoration: 'line-through' }}>
                                                        S/ {formatMoney(item.regularPrice)}
                                                    </div>
                                                )}
                                                {Number(item.discountPct) > 0 && (
                                                    <div style={{ fontSize: '0.66rem', color: '#fff', background: '#0b875b', borderRadius: '999px', padding: '1px 6px' }}>
                                                        -{item.discountPct}%
                                                    </div>
                                                )}
                                                <div style={{ fontSize: '0.66rem', color: '#6f8390' }}>Origen: {item.source || 'catalogo'}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', background: '#111b21', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#22313b', borderRadius: '999px', padding: '3px 7px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                                <button onClick={() => updateCatalogQty(item.id, -1)} style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#2f3e48', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={11} /></button>
                                                <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', minWidth: '18px', textAlign: 'center' }}>{getCatalogQty(item.id)}</span>
                                                <button onClick={() => updateCatalogQty(item.id, 1)} style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#00a884', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={11} /></button>
                                            </div>
                                            <button
                                                onClick={() => { setInputText(buildProductShareText(item, i)); }}
                                                style={{ padding: '7px 10px', background: '#1f2c34', border: '1px solid var(--border-color)', borderRadius: '7px', color: '#d6e2e8', cursor: 'pointer', fontSize: '0.71rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', minWidth: '110px' }}
                                            >
                                                <Send size={12} /> Enviar prod.
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => addToCart(item, getCatalogQty(item.id))}
                                            style={{ width: '100%', minWidth: 0, padding: '8px 8px', background: '#00a884', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                        >
                                            <ShoppingCart size={13} /> + Carrito
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

// =========================================================
// BUSINESS SIDEBAR - Main right panel
// =========================================================
const BusinessSidebar = ({ setInputText, businessData = {}, messages = [], activeChatId, onSendToClient, socket, myProfile, onLogout }) => {
    const [activeTab, setActiveTab] = useState('ai');
    // AI Chat State
    const [aiMessages, setAiMessages] = useState([
        { role: 'assistant', content: 'Hola, soy tu asistente de ventas de Lavitat con IA OpenAI. Estoy viendo la conversacion y te ayudare a cerrar mejor.\n\nPrueba: "Dame 3 opciones de respuesta" o "Como manejo una objecion de precio".' }
    ]);
    const [aiInput, setAiInput] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const aiEndRef = useRef(null);

    // Cart State
    const [cart, setCart] = useState([]);
    const [discount, setDiscount] = useState(0);
    const [showDiscount, setShowDiscount] = useState(false);
    const [cartDraftsByChat, setCartDraftsByChat] = useState({});

    const catalog = (businessData.catalog || []).map((item, idx) => normalizeCatalogItem(item, idx));
    const labels = businessData.labels || [];
    const profile = businessData.profile;

    useEffect(() => {
        if (!activeChatId) return;
        const draft = cartDraftsByChat[activeChatId];
        if (draft) {
            setCart(draft.cart || []);
            setDiscount(draft.discount || 0);
        } else {
            setCart([]);
            setDiscount(0);
        }
    }, [activeChatId]);

    useEffect(() => {
        if (!activeChatId) return;
        setCartDraftsByChat(prev => ({ ...prev, [activeChatId]: { cart, discount } }));
    }, [activeChatId, cart, discount]);

    // Auto-scroll AI chat
    useEffect(() => { aiEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aiMessages]);

    // Listen to AI responses from socket
    useEffect(() => {
        if (!socket) return;
        let buffer = '';

        const onChunk = (chunk) => {
            buffer += repairMojibake(chunk);
            setAiMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && last?.streaming) {
                    return [...prev.slice(0, -1), { ...last, content: buffer }];
                }
                return [...prev, { role: 'assistant', content: buffer, streaming: true }];
            });
        };

        const onComplete = () => {
            buffer = '';
            setIsAiLoading(false);
            setAiMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.streaming) return [...prev.slice(0, -1), { ...last, streaming: false }];
                return prev;
            });
        };

        const onError = (msg) => {
            setIsAiLoading(false);
            setAiMessages(prev => [...prev, { role: 'assistant', content: repairMojibake(msg || 'Error IA: no se pudo generar respuesta.') }]);
        };

        socket.on('internal_ai_chunk', onChunk);
        socket.on('internal_ai_complete', onComplete);
        socket.on('internal_ai_error', onError);
        return () => {
            socket.off('internal_ai_chunk', onChunk);
            socket.off('internal_ai_complete', onComplete);
            socket.off('internal_ai_error', onError);
        };
    }, [socket]);

    const buildBusinessContext = () => {
        const catalogText = catalog.length > 0
            ? catalog.map((p, idx) => `${idx + 1}. ${p.title} | Precio: S/ ${p.price || 'consultar'}${p.sku ? ` | SKU: ${p.sku}` : ''}${p.description ? ' | ' + p.description : ''}`).join('\n')
            : '(sin productos en catalogo)';
        const convText = messages.slice(-15).map(m => `${m.fromMe ? 'VENDEDOR' : 'CLIENTE'}: ${m.body || '[media]'}`).join('\n');
        return `
Eres el copiloto comercial experto de Lavitat en Peru.
Habla con seguridad, sin justificar precio, resaltando formulacion, rendimiento y beneficio tecnico.

NEGOCIO: ${profile?.name || profile?.pushname || 'Lavitat'}
${profile?.description ? 'Descripcion: ' + profile.description : ''}

CATALOGO DISPONIBLE:
${catalogText}

CONVERSACION ACTUAL CON EL CLIENTE:
${convText || '(sin mensajes aun)'}

CARRITO ACTUAL (si ya agregaste productos):
${cart.length > 0 ? cart.map((item, idx) => `- ${idx + 1}) ${item.title} | qty ${item.qty} | precio S/ ${formatMoney(item.price)}${item.discountPct ? ` | desc ${item.discountPct}%` : ''}`).join('\n') : '(carrito vacio)'}

INSTRUCCIONES OBLIGATORIAS:
- Si te piden opciones/cotizacion, da minimo 2 alternativas: base y optimizada.
- NO inventes productos, presentaciones ni precios. Usa solo el catalogo listado.
- Si hay carrito con productos, propone al menos 2 cotizaciones (base y optimizada) usando ese carrito como base.
- Siempre que sea posible, incluye upsell complementario.
- En objecion de precio: responder por formulacion/rendimiento, no por descuento defensivo.
- Para mensajes listos para enviar al cliente, usa [MENSAJE: ...].
- Se claro, breve y vendedor (tono WhatsApp profesional).
        `.trim();
    };

    const sendAiMessage = () => {
        if (!aiInput.trim() || isAiLoading || !socket) return;
        const userMsg = { role: 'user', content: aiInput.trim() };
        setAiMessages(prev => [...prev, userMsg]);
        setAiInput('');
        setIsAiLoading(true);

        socket.emit('internal_ai_query', {
            query: aiInput.trim(),
            businessContext: buildBusinessContext()
        });
    };

    const sendToClient = (text) => {
        // Extract content inside [MENSAJE: ...] if present, otherwise use full text
        const match = text.match(/\[MENSAJE:\s*([\s\S]+?)\]/);
        const msg = match ? match[1].trim() : text;
        setInputText(msg);
        setActiveTab('ai');
    };

    // Parse AI message to detect [MENSAJE: ...] blocks for send buttons
    const renderAiMessage = (content) => {
        const parts = repairMojibake(content).split(/(\[MENSAJE:[\s\S]*?\])/g);
        return parts.map((part, i) => {
            const match = part.match(/\[MENSAJE:\s*([\s\S]+?)\]/);
            if (match) {
                return (
                    <div key={i} style={{ marginTop: '8px', background: 'rgba(0,168,132,0.12)', border: '1px solid rgba(0,168,132,0.3)', borderRadius: '8px', padding: '10px 12px' }}>
                        <div style={{ fontSize: '0.78rem', color: '#00a884', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MessageSquare size={11} /> MENSAJE LISTO PARA ENVIAR
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{match[1].trim()}</div>
                        <button
                            onClick={() => sendToClient(match[1].trim())}
                            style={{ marginTop: '8px', background: '#00a884', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Send size={13} /> Enviar al cliente
                        </button>
                    </div>
                );
            }
            return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>;
        });
    };

    // Cart functions
    const addToCart = (item, qtyToAdd = 1) => {
        const safeQty = Math.max(1, Number(qtyToAdd) || 1);
        setCart(prev => {
            const existing = prev.find(c => c.id === item.id);
            if (existing) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + safeQty } : c);
            return [...prev, { ...item, qty: safeQty, discountPct: 0 }];
        });
    };

    const removeFromCart = (id) => setCart(prev => prev.filter(c => c.id !== id));
    const updateQty = (id, delta) => setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c));
    const updateItemDiscount = (id, pct) => setCart(prev => prev.map(c => c.id === id ? { ...c, discountPct: Math.min(90, Math.max(0, pct)) } : c));

    const cartTotal = roundToOneDecimal(cart.reduce((sum, item) => {
        const price = parseFloat(item.price) || 0;
        const disc = item.discountPct || discount;
        const finalPrice = roundToOneDecimal(price * (1 - disc / 100));
        return sum + (finalPrice * item.qty);
    }, 0));

    const sendQuoteToChat = () => {
        if (cart.length === 0) return;
        const lines = cart.map(item => {
            const price = parseFloat(item.price) || 0;
            const disc = item.discountPct || discount;
            const finalPrice = roundToOneDecimal(price * (1 - disc / 100));
            return `*${item.title}*\n   Qty: ${item.qty} x S/ ${formatMoney(price)}${disc > 0 ? ` (-${disc}%)` : ''} = *S/ ${formatMoney(finalPrice * item.qty)}*`;
        });
        const msg = `*COTIZACION*\n${'-'.repeat(25)}\n${lines.join('\n\n')}\n${'-'.repeat(25)}\n*TOTAL: S/ ${formatMoney(cartTotal)}*${discount > 0 ? `\nDescuento global aplicado: ${discount}%` : ''}\n\nProcedemos con el pedido?`;
        setInputText(msg);
    };

    const tabs = [
        { id: 'ai', icon: <Bot size={15} />, label: 'IA Pro' },
        { id: 'catalog', icon: <Package size={15} />, label: `Catalogo${catalog.length > 0 ? ` (${catalog.length})` : ''}` },
        { id: 'cart', icon: <ShoppingCart size={15} />, label: `Carrito${cart.length > 0 ? ` (${cart.length})` : ''}` },
        { id: 'quick', icon: <Clock size={15} />, label: 'Rapidas' },
        { id: 'company', icon: <BookOpen size={15} />, label: 'Empresa' },
    ];

    return (
        <div className="business-sidebar business-sidebar-pro">
            {/* Business Profile Header */}
            <div className="business-sidebar-header">
                {profile ? (
                    <div className="business-header-row">
                        <div className="business-header-avatar" style={{ background: profile.profilePicUrl ? `url(${profile.profilePicUrl}) center/cover` : '#00a884' }}>
                            {!profile.profilePicUrl && 'B'}
                        </div>
                        <div className="business-header-meta">
                            <div className="business-header-name">
                                {profile.name || profile.pushname || 'Mi Negocio'}
                            </div>
                            {profile.description && (
                                <div className="business-header-description">
                                    {profile.description}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={onLogout}
                            className="business-logout-btn"
                        >
                            Cerrar sesion
                        </button>
                    </div>
                ) : (
                    <div style={{ fontSize: '0.83rem', color: '#8696a0' }}>Perfil de Negocio</div>
                )}
            </div>

            {/* Tabs */}
            <div className="business-tabs">
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)} className={`business-tab-btn ${activeTab === t.id ? 'active' : ''}`} style={{
                        flex: 1, padding: '9px 2px', border: 'none', cursor: 'pointer',
                        background: activeTab === t.id ? '#111b21' : 'transparent',
                        color: activeTab === t.id ? '#00a884' : '#8696a0',
                        fontSize: '0.68rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                        borderBottom: activeTab === t.id ? '2px solid #00a884' : '2px solid transparent',
                    }}>
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* AI PRO TAB */}
            {activeTab === 'ai' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {aiMessages.map((msg, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                <div style={{
                                    maxWidth: '92%', padding: '9px 12px', borderRadius: msg.role === 'user' ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                                    background: msg.role === 'user' ? '#005c4b' : '#202c33',
                                    fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: '1.45',
                                    position: 'relative'
                                }}>
                                    {msg.role === 'assistant' ? renderAiMessage(msg.content) : msg.content}
                                    {msg.streaming && (
                                        <span style={{ display: 'inline-block', width: '6px', height: '12px', background: 'var(--text-primary)', marginLeft: '3px', animation: 'blink 0.8s step-end infinite' }} />
                                    )}
                                    {msg.role === 'assistant' && !msg.streaming && msg.content.length > 30 && !msg.content.includes('[MENSAJE:') && (
                                        <button
                                            onClick={() => sendToClient(msg.content)}
                                            title="Enviar este mensaje al cliente"
                                            style={{ marginTop: '6px', background: 'transparent', border: '1px solid rgba(0,168,132,0.4)', color: '#00a884', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <Send size={10} /> Usar como respuesta
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isAiLoading && aiMessages[aiMessages.length - 1]?.role !== 'assistant' && (
                            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                <div style={{ background: '#202c33', borderRadius: '2px 12px 12px 12px', padding: '10px 14px' }}>
                                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8696a0', animation: 'bounce 1.4s ease-in-out infinite' }} />
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8696a0', animation: 'bounce 1.4s ease-in-out 0.2s infinite' }} />
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8696a0', animation: 'bounce 1.4s ease-in-out 0.4s infinite' }} />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={aiEndRef} />
                    </div>

                    {/* Quick action chips */}
                    <div className="ai-quick-prompts" style={{ padding: '6px 10px', borderTop: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '5px', flexShrink: 0 }}>
                        {[
                            'Dame 3 opciones de respuesta',
                            'Como cerrar esta venta',
                            'Maneja la objecion de precio',
                            'Recomienda un producto',
                        ].map((chip, i) => (
                            <button key={i} className="ai-prompt-chip"
                                onClick={() => { setAiInput(chip.replace(/^[^\s]+ /, '')); }}
                                style={{ background: '#202c33', border: '1px solid var(--border-color)', color: '#8696a0', padding: '4px 9px', borderRadius: '14px', fontSize: '0.72rem', cursor: 'pointer' }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = '#00a884'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                            >
                                {chip}
                            </button>
                        ))}
                    </div>

                    {/* AI Input */}
                    <div className="ai-assistant-input-row" style={{ padding: '8px 10px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, background: '#202c33' }}>
                        <input
                            type="text"
                            placeholder="Pregunta algo a la IA..."
                            value={aiInput}
                            onChange={e => setAiInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendAiMessage()}
                            className="ai-assistant-input" style={{ flex: 1, background: '#2a3942', border: 'none', outline: 'none', color: 'var(--text-primary)', borderRadius: '20px', padding: '8px 14px', fontSize: '0.82rem' }}
                        />
                        <button
                            onClick={sendAiMessage}
                            disabled={isAiLoading || !aiInput.trim()}
                            className="ai-assistant-send" style={{ background: isAiLoading ? '#3b4a54' : '#00a884', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isAiLoading ? 'wait' : 'pointer', flexShrink: 0 }}
                        >
                            <Send size={16} color="white" />
                        </button>
                    </div>
                </div>
            )}

            {/* CATALOG TAB */}
            {activeTab === 'catalog' && (
                <CatalogTab catalog={catalog} socket={socket} setInputText={setInputText} addToCart={addToCart} catalogMeta={businessData.catalogMeta} />
            )}

            {/* CART TAB */}
            {activeTab === 'cart' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {cart.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '30px 15px', color: '#8696a0' }}>
                                <ShoppingCart size={36} style={{ marginBottom: '12px', opacity: 0.25, marginLeft: 'auto', marginRight: 'auto' }} />
                                <div style={{ fontSize: '0.875rem' }}>Carrito vacio</div>
                                <div style={{ fontSize: '0.78rem', opacity: 0.7, marginTop: '6px' }}>Agrega productos desde el Catalogo</div>
                            </div>
                        ) : (
                            cart.map((item, i) => {
                                const price = parseFloat(item.price) || 0;
                                const disc = item.discountPct || 0;
                                const finalPrice = roundToOneDecimal(price * (1 - disc / 100));
                                return (
                                    <div key={item.id || i} style={{ background: '#202c33', borderRadius: '10px', border: '1px solid var(--border-color)', padding: '10px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                            <div style={{ flex: 1, overflow: 'hidden', marginRight: '8px' }}>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#00a884' }}>
                                                    S/ {formatMoney(finalPrice)} {disc > 0 && <span style={{ color: '#8696a0', textDecoration: 'line-through', fontSize: '0.72rem', marginLeft: '4px' }}>S/ {formatMoney(price)}</span>}
                                                </div>
                                            </div>
                                            <button onClick={() => removeFromCart(item.id)} style={{ background: '#2a3942', border: '1px solid var(--border-color)', cursor: 'pointer', color: '#da3633', padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Trash2 size={13} /> Eliminar
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <button onClick={() => updateQty(item.id, -1)} style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#3b4a54', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={10} /></button>
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', minWidth: '24px', textAlign: 'center' }}>{item.qty}</span>
                                                <button onClick={() => updateQty(item.id, 1)} style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#3b4a54', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={10} /></button>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Percent size={12} color="#8696a0" />
                                                <input
                                                    type="number" min="0" max="90" value={item.discountPct || 0}
                                                    onChange={e => updateItemDiscount(item.id, parseInt(e.target.value) || 0)}
                                                    style={{ width: '42px', background: '#3b4a54', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '5px', padding: '3px 5px', fontSize: '0.78rem', outline: 'none' }}
                                                />
                                                <span style={{ fontSize: '0.72rem', color: '#8696a0' }}>%</span>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                                S/ {formatMoney(finalPrice * item.qty)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                    {cart.length > 0 && (
                        <div style={{ padding: '10px', borderTop: '1px solid var(--border-color)', background: '#202c33', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '0.82rem', color: '#8696a0' }}>Descuento global:</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input type="number" min="0" max="90" value={discount}
                                        onChange={e => setDiscount(parseInt(e.target.value) || 0)}
                                        style={{ width: '48px', background: '#2a3942', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px', padding: '4px 6px', fontSize: '0.82rem', outline: 'none' }}
                                    />
                                    <span style={{ fontSize: '0.78rem', color: '#8696a0' }}>%</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <span style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-primary)' }}>TOTAL</span>
                                <span style={{ fontSize: '1.05rem', fontWeight: 600, color: '#00a884' }}>S/ {formatMoney(cartTotal)}</span>
                            </div>
                            <button
                                onClick={sendQuoteToChat}
                                style={{ width: '100%', padding: '10px', background: '#00a884', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                <Send size={15} /> Enviar cotizacion al cliente
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* QUICK REPLIES TAB */}
            {activeTab === 'quick' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {[
                        { label: 'Saludo', text: 'Hola. Bienvenido a nuestro negocio. En que puedo ayudarte hoy?' },
                        { label: 'Metodo de pago', text: 'Puedes pagar mediante:\n- Transferencia bancaria\n- Yape / Plin\n- Efectivo\n\nCual prefieres?' },
                        { label: 'Horario', text: 'Nuestro horario de atencion es:\nLunes a Sabado: 9:00 AM - 7:00 PM\nTambien puedes escribirnos por WhatsApp.' },
                        { label: 'En camino', text: 'Tu pedido esta en camino. Te avisamos en cuanto llegue. Gracias por tu paciencia.' },
                        { label: 'Confirmado', text: 'Perfecto. Tu pedido ha sido confirmado. Lo procesamos lo antes posible. Gracias.' },
                        { label: 'Mas info', text: 'Con gusto te doy mas informacion. Que producto o servicio te interesa?' },
                        { label: 'Comprobante', text: 'Para confirmar tu pago, por favor envianos una foto del comprobante de transferencia. Gracias.' },
                        { label: 'Gracias', text: 'Muchas gracias por tu compra. Ha sido un placer atenderte. Hasta pronto.' },
                        { label: 'Seguimiento', text: 'Hola, queria hacer seguimiento a tu consulta. Pudiste revisar la informacion que te comparti?' },
                        { label: 'Espera', text: 'Un momento por favor, estoy verificando la informacion para ti.' },
                    ].map((qr, i) => (
                        <button key={i} className="ai-prompt-chip" onClick={() => setInputText(qr.text)} style={{
                            width: '100%', padding: '10px 12px', borderRadius: '8px',
                            background: '#202c33', border: '1px solid var(--border-color)',
                            cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)', transition: 'all 0.12s'
                        }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = '#00a884'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                        >
                            <div style={{ fontSize: '0.84rem', fontWeight: 500, marginBottom: '3px' }}>{qr.label}</div>
                            <div style={{ fontSize: '0.72rem', color: '#8696a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{qr.text.split('\n')[0]}</div>
                        </button>
                    ))}
                </div>
            )}

            {activeTab === 'company' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ background: '#202c33', borderRadius: '10px', border: '1px solid var(--border-color)', padding: '12px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#00a884', marginBottom: '8px' }}>MI EMPRESA (WHATSAPP)</div>
                        <div style={{ fontSize: '0.8rem', color: '#d6e2e8', lineHeight: '1.6' }}>
                            <div><b>Nombre:</b> {profile?.name || profile?.pushname || myProfile?.pushname || '--'}</div>
                            <div><b>Telefono:</b> {profile?.phone || myProfile?.phone || '--'}</div>
                            <div><b>ID:</b> {profile?.id || myProfile?.id || '--'}</div>
                            <div><b>Plataforma:</b> {profile?.platform || myProfile?.platform || '--'}</div>
                            {profile?.category && <div><b>Categoria:</b> {profile.category}</div>}
                            {profile?.website && <div><b>Web:</b> {profile.website}</div>}
                            {profile?.email && <div><b>Email:</b> {profile.email}</div>}
                            {profile?.address && <div><b>Direccion:</b> {profile.address}</div>}
                            {profile?.description && <div><b>Descripcion:</b> {profile.description}</div>}
                        </div>
                    </div>
                    <button
                        onClick={onLogout}
                        style={{ width: '100%', padding: '10px', background: '#392526', border: '1px solid rgba(218,54,51,0.45)', borderRadius: '8px', color: '#ffb3b3', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                    >
                        Cerrar sesion de WhatsApp
                    </button>
                </div>
            )}
        </div>
    );
};

export default BusinessSidebar;


