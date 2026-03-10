import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, ShoppingCart, Clock, Sparkles, Trash2, Plus, Minus, ChevronRight, ChevronDown, ChevronUp, Package, MessageSquare, PlusCircle, Edit2, Check, Search, SlidersHorizontal } from 'lucide-react';
import moment from 'moment';

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


const formatMoney = (value) => Number(value || 0).toFixed(2);
const formatMoneyCompact = (value) => {
    const fixed = Number(value || 0).toFixed(2);
    return fixed.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};
const parseMoney = (value, fallback = 0) => {
    const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
    return Number.isFinite(fallback) ? fallback : 0;
};
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const clampNumber = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const normalizeSkuKey = (value = '') => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const normalizeTextKey = (value = '') => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:litros?|lts?|lt|l)\b/g, '$1l')
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:mililitros?|ml|cc|cm3)\b/g, '$1ml')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const toSentenceCase = (value = '') => {
    const clean = String(value || '').trim().replace(/\s+/g, ' ');
    if (!clean) return '';
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
};
const formatQuoteProductTitle = (value = '') => {
    const sentence = toSentenceCase(value);
    return sentence
        .replace(/(\d+(?:[.,]\d+)?)\s*l\b/gi, (_, qty) => `${String(qty).replace(',', '.')} Litros`)
        .replace(/(\d+(?:[.,]\d+)?)\s*ml\b/gi, (_, qty) => `${String(qty).replace(',', '.')} mL`) || 'Producto';
};


const parseOrderTitleItems = (value = '') => {
    const text = String(value || '').trim();
    if (!text) return [];

    return text
        .replace(/[\r\n]+/g, ',')
        .replace(/[|;]/g, ',')
        .split(',')
        .map((chunk) => String(chunk || '').trim())
        .filter(Boolean)
        .map((chunk, idx) => {
            let name = chunk.replace(/^[-\u2022*]+\s*/, '').trim();
            if (!name) return null;

            let quantity = 1;
            const qtyMatch = name.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|X)\s+(.+)$/);
            if (qtyMatch) {
                const parsedQty = parseMoney(qtyMatch[1], 1);
                quantity = Math.max(1, Math.round((Number.isFinite(parsedQty) ? parsedQty : 1) * 1000) / 1000);
                name = String(qtyMatch[2] || '').trim();
            }

            name = name.replace(/^["'`]+|["'`]+$/g, '').trim();
            if (!name) return null;

            return {
                name,
                quantity,
                price: null,
                lineTotal: null,
                sku: null,
                source: 'order_title',
                index: idx + 1
            };
        })
        .filter(Boolean);
};
const normalizeCatalogItem = (item = {}, index = 0) => {
    const safeItem = item && typeof item === 'object' ? item : {};
    const rawTitle = safeItem.title || safeItem.name || safeItem.nombre || safeItem.productName || safeItem.sku || '';

    const parsePrice = (value, fallback = 0) => {
        const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
        if (Number.isFinite(parsed)) return parsed;
        return Number.isFinite(fallback) ? fallback : 0;
    };

    const priceNum = parsePrice(safeItem.price ?? safeItem.regular_price ?? safeItem.sale_price ?? safeItem.amount ?? safeItem.precio, 0);
    const regularNum = parsePrice(safeItem.regularPrice ?? safeItem.regular_price ?? safeItem.price ?? safeItem.amount ?? safeItem.precio, priceNum);
    const saleNum = parsePrice(safeItem.salePrice ?? safeItem.sale_price, priceNum);
    const baseFinal = saleNum > 0 && saleNum < regularNum ? saleNum : priceNum;
    const finalNum = baseFinal > 0 ? baseFinal : regularNum;
    const computedDiscount = regularNum > 0 && finalNum > 0 && finalNum < regularNum
        ? Number((((regularNum - finalNum) / regularNum) * 100).toFixed(1))
        : 0;
    const rawDiscount = Number.parseFloat(String(safeItem.discountPct ?? safeItem.discount_pct ?? computedDiscount).replace(',', '.'));
    const discountPct = Number.isFinite(rawDiscount) ? Math.max(0, rawDiscount) : 0;
    const rawCategories = Array.isArray(safeItem.categories)
        ? safeItem.categories
        : (typeof safeItem.categories === 'string'
            ? safeItem.categories.split(',')
            : (safeItem.category
                ? [safeItem.category]
                : (safeItem.categoryName
                    ? [safeItem.categoryName]
                    : (safeItem.category_slug ? [safeItem.category_slug] : []))));
    const categories = rawCategories
        .map((entry) => (typeof entry === 'string' ? entry : (entry?.name || entry?.slug || entry?.title || '')))
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);

    return {
        id: safeItem.id || safeItem.product_id || `catalog_${index}`,
        title: String(rawTitle || `Producto ${index + 1}`).trim(),
        price: Number.isFinite(finalNum) ? finalNum.toFixed(2) : '0.00',
        regularPrice: Number.isFinite(regularNum) ? regularNum.toFixed(2) : (Number.isFinite(finalNum) ? finalNum.toFixed(2) : '0.00'),
        salePrice: Number.isFinite(saleNum) && saleNum > 0 ? saleNum.toFixed(2) : null,
        discountPct,
        description: safeItem.description || safeItem.short_description || safeItem.descripcion || '',
        imageUrl: safeItem.imageUrl || safeItem.image || safeItem.image_url || safeItem.images?.[0]?.src || null,
        source: safeItem.source || 'unknown',
        sku: safeItem.sku || null,
        stockStatus: safeItem.stockStatus || safeItem.stock_status || null,
        categories
    };
};
const sanitizeProfileText = (value = '') => repairMojibake(String(value || ''))
    .replace(/[\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const firstValue = (...values) => {
    for (const value of values) {
        if (value === null || value === undefined) continue;
        if (typeof value === 'string') {
            const clean = sanitizeProfileText(value);
            if (clean) return clean;
            continue;
        }
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (Array.isArray(value) && value.length > 0) return value;
        if (typeof value === 'object' && Object.keys(value).length > 0) return value;
    }
    return '';
};

const formatPhoneForDisplay = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) return 'Sin numero visible';
    const normalized = raw.replace(/[^\d+]/g, '');
    if (!normalized) return 'Sin numero visible';
    return normalized.startsWith('+') ? normalized : `+${normalized}`;
};

const normalizeDigits = (value = '') => String(value || '').replace(/\D/g, '');
const isLikelyPhoneDigits = (value = '') => {
    const digits = normalizeDigits(value);
    return digits.length >= 8 && digits.length <= 15;
};
const looksLikeInternalId = (value = '') => {
    const text = String(value || '').trim();
    if (!text) return false;
    return text.includes('@') || /^\d{14,}$/.test(text);
};

const formatBoolValue = (value) => (value ? 'Si' : 'No');

const formatTimestampValue = (value) => {
    const unixValue = Number(value || 0);
    if (!Number.isFinite(unixValue) || unixValue <= 0) return '--';
    const m = moment.unix(unixValue);
    return m.isValid() ? m.format('YYYY-MM-DD HH:mm:ss') : '--';
};


const avatarColorForName = (name) => {
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
    if (!name) return colors[0];
    return colors[name.charCodeAt(0) % colors.length];
};
// =========================================================
// CLIENT PROFILE PANEL
// =========================================================
export const ClientProfilePanel = ({ contact, chats = [], onClose, onQuickAiAction, panelRef }) => {
    if (!contact) return null;

    const displayName = firstValue(contact.name, contact.pushname, contact.shortName, 'Contacto');
    const fallbackPhone = String(contact.id || '').replace('@c.us', '').replace('@g.us', '');
    const rawPhone = firstValue(contact.phone, contact.number, contact.user, fallbackPhone);
    const displayPhone = formatPhoneForDisplay(rawPhone);
    const accountType = contact.isBusiness ? 'Business' : 'Personal';
    const participantNameMap = new Map();
    if (Array.isArray(chats)) {
        chats.forEach((chat) => {
            const rawName = firstValue(chat?.name, chat?.pushname, chat?.shortName, '');
            const safeName = sanitizeProfileText(rawName);
            if (!safeName || looksLikeInternalId(safeName)) return;

            const candidates = [
                chat?.phone,
                chat?.number,
                chat?.user,
                String(chat?.id || '').split('@')[0]
            ];

            candidates.forEach((candidate) => {
                const digits = normalizeDigits(candidate);
                if (!isLikelyPhoneDigits(digits)) return;
                if (!participantNameMap.has(digits)) participantNameMap.set(digits, safeName);
            });
        });
    }

    const isDisplayPhoneLike = (value = '') => /^\+?\d{8,}$/.test(String(value || '').trim());

    const participantsList = (Array.isArray(contact.participantsList)
        ? contact.participantsList.filter((participant) => participant && participant.id)
        : []).map((participant) => {
            const phoneDigits = normalizeDigits(participant.phone || String(participant.id || '').split('@')[0] || '');
            const mappedName = sanitizeProfileText(participantNameMap.get(phoneDigits) || '');
            const waName = sanitizeProfileText(participant.name || '');
            const waDisplayName = sanitizeProfileText(participant.displayName || '');
            const waPushname = sanitizeProfileText(participant.pushname || '');
            const waShortName = sanitizeProfileText(participant.shortName || '');
            const preferredMappedName = (!mappedName || looksLikeInternalId(mappedName) || isDisplayPhoneLike(mappedName)) ? '' : mappedName;
            const displayName = firstValue(
                waDisplayName && !looksLikeInternalId(waDisplayName) ? waDisplayName : '',
                waName && !looksLikeInternalId(waName) ? waName : '',
                waPushname && !looksLikeInternalId(waPushname) ? waPushname : '',
                waShortName && !looksLikeInternalId(waShortName) ? waShortName : '',
                preferredMappedName,
                phoneDigits ? `+${phoneDigits}` : '',
                participant.id
            );

            return {
                ...participant,
                phone: phoneDigits || null,
                displayName: displayName || 'Participante'
            };
        });
    const participantsCount = Number(
        contact.participants
        || contact.chatState?.participantsCount
        || participantsList.length
        || 0
    ) || 0;

    const infoRows = [
        ['Nombre', displayName],
        ['Telefono', displayPhone],
        ['Nombre de perfil', firstValue(contact.pushname, contact.shortName, '--')],
        ['Cuenta', accountType],
        ['Guardado', formatBoolValue(contact.isMyContact)],
    ];

    const chatStateRows = [
        ['Archivado', formatBoolValue(contact.chatState?.archived)],
        ['Fijado', formatBoolValue(contact.chatState?.pinned)],
        ['Silenciado', formatBoolValue(contact.chatState?.isMuted)],
        ['No leidos', String(contact.chatState?.unreadCount ?? 0)],
        ['Ultima actividad', formatTimestampValue(contact.chatState?.timestamp)],
    ];
    if (contact.isGroup) {
        chatStateRows.push(['Participantes', String(participantsCount)]);
    }

    const businessRows = [
        ['Categoria', firstValue(contact.businessDetails?.category, '--')],
        ['Web', firstValue(contact.businessDetails?.website, '--')],
        ['Webs', (contact.businessDetails?.websites || []).join(', ') || '--'],
        ['Email', firstValue(contact.businessDetails?.email, '--')],
        ['Direccion', firstValue(contact.businessDetails?.address, '--')],
        ['Descripcion', firstValue(contact.businessDetails?.description, '--')],
    ].filter(([, value]) => Boolean(String(value || '').trim()));

    const quickActions = [
        { label: 'Redactar saludo', prompt: 'Redacta un saludo personalizado y profesional para este cliente.' },
        { label: 'Crear propuesta de venta', prompt: 'Crea una propuesta de venta persuasiva para este cliente basada en la conversacion.' },
        { label: 'Mensaje de seguimiento', prompt: 'Redacta un mensaje de seguimiento para este cliente que no ha respondido.' },
    ];

    return (
        <aside className="client-profile-panel" ref={panelRef}>
            <div className="client-profile-header">
                <button className="client-profile-close" onClick={onClose} aria-label="Cerrar perfil">
                    <X size={20} />
                </button>
                <div className="client-profile-header-copy">
                    <span className="client-profile-kicker">Ficha del cliente</span>
                    <h3>Perfil del contacto</h3>
                </div>
            </div>

            <div className="client-profile-hero">
                <div className="client-profile-avatar" style={{ background: contact.profilePicUrl ? `url(${contact.profilePicUrl}) center/cover` : avatarColorForName(displayName) }}>
                    {!contact.profilePicUrl && displayName.charAt(0).toUpperCase()}
                </div>
                <div className="client-profile-name">{displayName}</div>
                <div className="client-profile-phone">{displayPhone}</div>
                <div className="client-profile-badges">
                    {contact.isBusiness && <span className="client-profile-badge business">Cuenta Business</span>}
                    {contact.isMyContact && <span className="client-profile-badge">Contacto guardado</span>}
                </div>
            </div>

            <div className="client-profile-scroll">
                {contact.status && (
                    <div className="client-profile-card">
                        <div className="client-profile-card-title">Info / Estado</div>
                        <div className="client-profile-status">{contact.status}</div>
                    </div>
                )}

                {contact.labels?.length > 0 && (
                    <div className="client-profile-card">
                        <div className="client-profile-card-title">Etiquetas</div>
                        <div className="client-profile-labels">
                            {contact.labels.map((label, idx) => (
                                <span key={idx} className="client-profile-label-chip" style={{ '--label-color': label.color || '#5f7380' }}>
                                    {label.name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <div className="client-profile-card">
                    <div className="client-profile-card-title">Cuenta y contacto</div>
                    <div className="client-profile-grid">
                        {infoRows.map(([label, value]) => (
                            <React.Fragment key={label}>
                                <span className="client-profile-key">{label}</span>
                                <span className="client-profile-value">{value}</span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="client-profile-card">
                    <div className="client-profile-card-title">Estado del chat</div>
                    <div className="client-profile-grid">
                        {chatStateRows.map(([label, value]) => (
                            <React.Fragment key={label}>
                                <span className="client-profile-key">{label}</span>
                                <span className="client-profile-value">{value}</span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {contact.isGroup && (
                    <div className="client-profile-card">
                        <div className="client-profile-card-title">Participantes del grupo</div>
                        {participantsList.length > 0 ? (
                            <div className="client-profile-participants-list">
                                {participantsList.map((participant) => {
                                    const participantName = firstValue(participant.displayName, participant.name, participant.phone ? `+${participant.phone}` : '', participant.id);
                                    const participantPhone = participant.phone ? `+${participant.phone}` : '';
                                    return (
                                        <div key={participant.id} className="client-profile-participant-item">
                                            <div className="client-profile-participant-main">
                                                <span className="client-profile-participant-name">{participantName}</span>
                                                {participantPhone && (
                                                    <span className="client-profile-participant-phone">{participantPhone}</span>
                                                )}
                                            </div>
                                            <div className="client-profile-participant-tags">
                                                {participant.isMe && <span className="client-profile-participant-tag me">Tu</span>}
                                                {participant.isSuperAdmin && <span className="client-profile-participant-tag admin">Superadmin</span>}
                                                {!participant.isSuperAdmin && participant.isAdmin && <span className="client-profile-participant-tag admin">Admin</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="client-profile-participant-empty">No se pudieron cargar participantes de este grupo.</div>
                        )}
                    </div>
                )}
                {businessRows.length > 0 && (
                    <div className="client-profile-card">
                        <div className="client-profile-card-title">Perfil Business (WhatsApp)</div>
                        <div className="client-profile-grid">
                            {businessRows.map(([label, value]) => (
                                <React.Fragment key={label}>
                                    <span className="client-profile-key">{label}</span>
                                    <span className="client-profile-value">{value}</span>
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                )}

                <div className="client-profile-card">
                    <div className="client-profile-actions-title">
                        <Sparkles size={12} /> Acciones rapidas IA
                    </div>
                    <div className="client-profile-actions-list">
                        {quickActions.map((action, idx) => (
                            <button
                                key={idx}
                                className="client-profile-action-btn"
                                onClick={() => onQuickAiAction && onQuickAiAction(action.prompt)}
                                type="button"
                            >
                                <span>{action.label}</span>
                                <ChevronRight size={14} />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </aside>
    );
};

export const CompanyProfilePanel = ({ profile, labels = [], onClose, onLogout, panelRef }) => {
    if (!profile) return null;

    const displayName = firstValue(profile.name, profile.pushname, profile.shortName, 'Mi negocio');
    const displayPhone = formatPhoneForDisplay(firstValue(profile.phone, profile.id));
    const accountType = profile.isBusiness ? 'Business' : 'Personal';

    const companyRows = [
        ['Nombre comercial', displayName],
        ['Telefono', displayPhone],
        ['Estado', firstValue(profile.status, '--')],
        ['Cuenta', accountType],
    ];

    const accountStateRows = [
        ['Etiquetas activas', String(profile.labelsCount ?? labels.length ?? 0)],
        ['Canal', firstValue(profile.platform, 'WhatsApp Web')],
    ];

    const businessRows = [
        ['Categoria', firstValue(profile.category, profile.businessDetails?.category, '--')],
        ['Web', firstValue(profile.website, profile.businessDetails?.website, '--')],
        ['Webs', firstValue((profile.websites || profile.businessDetails?.websites || []).join(', '), '--')],
        ['Email', firstValue(profile.email, profile.businessDetails?.email, '--')],
        ['Direccion', firstValue(profile.address, profile.businessDetails?.address, '--')],
        ['Descripcion', firstValue(profile.description, profile.businessDetails?.description, '--')],
    ];

    return (
        <aside className="client-profile-panel company-profile-panel" ref={panelRef}>
            <div className="client-profile-header">
                <button className="client-profile-close" onClick={onClose} aria-label="Cerrar perfil de empresa">
                    <X size={20} />
                </button>
                <div className="client-profile-header-copy">
                    <span className="client-profile-kicker">Cuenta de negocio</span>
                    <h3>Perfil de la empresa</h3>
                </div>
            </div>

            <div className="client-profile-hero company-profile-hero">
                <div className="client-profile-avatar" style={{ background: profile.profilePicUrl ? `url(${profile.profilePicUrl}) center/cover` : avatarColorForName(displayName) }}>
                    {!profile.profilePicUrl && displayName.charAt(0).toUpperCase()}
                </div>
                <div className="client-profile-name">{displayName}</div>
                <div className="client-profile-phone">{displayPhone}</div>
            </div>

            <div className="client-profile-scroll">
                {labels.length > 0 && (
                    <div className="client-profile-card">
                        <div className="client-profile-card-title">Etiquetas del negocio</div>
                        <div className="client-profile-labels">
                            {labels.map((label) => (
                                <span key={String(label?.id || label?.name)} className="client-profile-label-chip" style={{ '--label-color': label?.color || '#5f7380' }}>
                                    {label?.name || `Etiqueta ${label?.id || ''}`}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <div className="client-profile-card">
                    <div className="client-profile-card-title">Datos de cuenta</div>
                    <div className="client-profile-grid">
                        {companyRows.map(([label, value]) => (
                            <React.Fragment key={label}>
                                <span className="client-profile-key">{label}</span>
                                <span className="client-profile-value">{value}</span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="client-profile-card">
                    <div className="client-profile-card-title">Estado de la cuenta</div>
                    <div className="client-profile-grid">
                        {accountStateRows.map(([label, value]) => (
                            <React.Fragment key={label}>
                                <span className="client-profile-key">{label}</span>
                                <span className="client-profile-value">{value}</span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="client-profile-card">
                    <div className="client-profile-card-title">Perfil Business</div>
                    <div className="client-profile-grid">
                        {businessRows.map(([label, value]) => (
                            <React.Fragment key={label}>
                                <span className="client-profile-key">{label}</span>
                                <span className="client-profile-value">{value}</span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="client-profile-card">
                    <button type="button" className="client-profile-action-btn company-logout-btn" onClick={() => onLogout && onLogout()}>
                        <span>Cerrar sesion de WhatsApp</span>
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>
        </aside>
    );
};
// =========================================================
// CATALOG TAB
// =========================================================
const CatalogTab = ({ catalog, socket, addToCart, onCatalogQtyDelta, catalogMeta, activeChatId, activeChatPhone = '', cartItems = [] }) => {
    const [showForm, setShowForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [formData, setFormData] = useState({ title: '', price: '', description: '', imageUrl: '' });
    const [catalogSearch, setCatalogSearch] = useState('');
    const [catalogCategoryFilter, setCatalogCategoryFilter] = useState('all');
    const [catalogTypeFilter, setCatalogTypeFilter] = useState('all');
    const [showCatalogFilters, setShowCatalogFilters] = useState(false);
    const isExternalCatalog = ['native', 'woocommerce'].includes(catalogMeta?.source);

    const handleAddClick = () => {
        setEditingProduct(null);
        setFormData({ title: '', price: '', description: '', imageUrl: '' });
        setShowForm(true);
    };

    const handleEditClick = (product) => {
        setEditingProduct(product);
        setFormData({
            title: product.title,
            price: product.price,
            description: product.description,
            imageUrl: product.imageUrl || ''
        });
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

    const sendCatalogProduct = (item, i) => {
        if (!activeChatId) {
            window.alert('Selecciona un chat antes de enviar un producto.');
            return;
        }

        socket.emit('send_catalog_product', {
            to: activeChatId,
            toPhone: String(activeChatPhone || '').trim() || null,
            product: {
                id: item.id || `catalog_${i}`,
                title: item.title || `Producto ${i + 1}`,
                price: item.price || '',
                regularPrice: item.regularPrice || item.price || '',
                salePrice: item.salePrice || '',
                discountPct: item.discountPct || 0,
                description: item.description || '',
                imageUrl: item.imageUrl || '',
                url: item.url || item.permalink || item.productUrl || item.link || ''
            }
        });
    };

    const normalizedSearch = normalizeTextKey(catalogSearch);
    const normalizeCategoryKey = (value) => normalizeTextKey(String(value || '').trim());
    const extractCategoryLabels = (itemOrValue) => {
        if (!itemOrValue) return [];
        const source = itemOrValue && typeof itemOrValue === 'object' && !Array.isArray(itemOrValue)
            ? itemOrValue
            : { categories: itemOrValue };

        const raw = [];
        if (Array.isArray(source.categories)) raw.push(...source.categories);
        else if (typeof source.categories === 'string') raw.push(...source.categories.split(','));

        ['category', 'categoryName', 'category_slug', 'categorySlug'].forEach((key) => {
            if (source[key]) raw.push(source[key]);
        });

        const unique = new Set();
        raw.forEach((entry) => {
            const label = typeof entry === 'string'
                ? entry
                : (entry?.name || entry?.slug || entry?.title || entry?.label || '');
            const clean = String(label || '').trim();
            if (clean) unique.add(clean);
        });
        return Array.from(unique);
    };

    const metaCategories = Array.isArray(catalogMeta?.categories) ? catalogMeta.categories : [];
    const categoryMap = new Map();
    [...metaCategories, ...catalog.flatMap((item) => extractCategoryLabels(item))]
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .forEach((label) => {
            const key = normalizeCategoryKey(label);
            if (!key) return;
            if (!categoryMap.has(key)) categoryMap.set(key, label);
        });
    const categoryOptions = Array.from(categoryMap.entries())
        .map(([, label]) => ({ label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
    const selectedCategoryKey = catalogCategoryFilter === 'all'
        ? 'all'
        : normalizeCategoryKey(catalogCategoryFilter);
    const visibleCatalog = catalog.filter((item) => {
        const searchable = normalizeTextKey(String(item?.title || '') + ' ' + String(item?.sku || '') + ' ' + String(item?.description || ''));
        const searchMatch = !normalizedSearch || searchable.includes(normalizedSearch);

        const itemCategoryKeys = extractCategoryLabels(item)
            .map((entry) => normalizeCategoryKey(entry))
            .filter(Boolean);
        const categoryMatch = selectedCategoryKey === 'all'
            || itemCategoryKeys.some((key) => (
                key === selectedCategoryKey
                || key.includes(selectedCategoryKey)
                || selectedCategoryKey.includes(key)
            ))
            || (itemCategoryKeys.length === 0 && searchable.includes(selectedCategoryKey));

        const finalPrice = Number.parseFloat(item?.price || '0') || 0;
        const regularPrice = Number.parseFloat(item?.regularPrice || item?.price || '0') || finalPrice;
        const hasDiscount = regularPrice > 0 && finalPrice > 0 && finalPrice < regularPrice;
        const cartLine = cartItems.find((cartItem) => String(cartItem?.id || '') === String(item?.id || ''));
        const inCart = Number(cartLine?.qty || 0) > 0;

        const typeMatch = catalogTypeFilter === 'all'
            || (catalogTypeFilter === 'discount' && hasDiscount)
            || (catalogTypeFilter === 'regular' && !hasDiscount)
            || (catalogTypeFilter === 'in_cart' && inCart)
            || (catalogTypeFilter === 'out_cart' && !inCart);

        return searchMatch && categoryMatch && typeMatch;
    });
    const hasCatalogFilters = catalogCategoryFilter !== 'all' || catalogTypeFilter !== 'all';
    const hasAnyCatalogCriteria = Boolean(catalogSearch.trim() || hasCatalogFilters);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 8px 6px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px', background: '#111b21', borderBottom: '1px solid rgba(134,150,160,0.16)' }}>
                {catalogMeta?.source === 'local' && catalogMeta?.wooStatus && catalogMeta?.wooStatus !== 'ok' && (
                    <div style={{ background: '#2f2520', color: '#f7b267', border: '1px solid #7a4d2c', borderRadius: '9px', padding: '8px 10px', fontSize: '0.75rem' }}>
                        WooCommerce no devolvio productos ({catalogMeta?.wooSource || 'sin fuente'}).
                        {catalogMeta?.wooReason ? ` Detalle: ${catalogMeta.wooReason}` : ''}
                    </div>
                )}

                <div style={{ background: '#17242c', border: '1px solid rgba(0,168,132,0.24)', borderRadius: '11px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#111b21', border: '1px solid rgba(0,168,132,0.4)', borderRadius: '10px', padding: '0 10px', minWidth: 0 }}>
                            <Search size={15} color="#76e6d0" />
                            <input
                                type="text"
                                value={catalogSearch}
                                onChange={e => setCatalogSearch(e.target.value)}
                                placeholder="Buscar producto o SKU"
                                style={{ width: '100%', minWidth: 0, background: 'transparent', border: 'none', color: '#e9f2f7', borderRadius: '10px', padding: '8px 0', fontSize: '0.78rem', outline: 'none' }}
                            />
                            {catalogSearch.trim() && (
                                <button
                                    type="button"
                                    onClick={() => setCatalogSearch('')}
                                    style={{ background: 'transparent', border: 'none', color: '#8fb0c3', cursor: 'pointer', fontSize: '0.72rem', padding: 0, whiteSpace: 'nowrap' }}
                                >
                                    Limpiar
                                </button>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowCatalogFilters(prev => !prev)}
                            title="Filtros"
                            style={{
                                height: '36px',
                                minWidth: '40px',
                                borderRadius: '10px',
                                border: hasCatalogFilters || showCatalogFilters ? '1px solid rgba(0,168,132,0.6)' : '1px solid rgba(134,150,160,0.3)',
                                background: hasCatalogFilters || showCatalogFilters ? 'rgba(0,168,132,0.18)' : '#111b21',
                                color: hasCatalogFilters || showCatalogFilters ? '#baf6e8' : '#9eb2bf',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative'
                            }}
                        >
                            <SlidersHorizontal size={15} />
                            {hasCatalogFilters && (
                                <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', borderRadius: '50%', background: '#00d7ad', boxShadow: '0 0 0 2px #111b21' }} />
                            )}
                        </button>
                    </div>

                    {showCatalogFilters && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.7rem', color: '#9eb2bf' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><SlidersHorizontal size={12} /> Categoria</span>
                                <select
                                    value={catalogCategoryFilter}
                                    onChange={e => setCatalogCategoryFilter(e.target.value)}
                                    style={{ width: '100%', background: '#101a21', border: '1px solid var(--border-color)', color: '#e9f2f7', borderRadius: '8px', padding: '6px 8px', fontSize: '0.75rem', outline: 'none' }}
                                >
                                    <option value="all">Todas</option>
                                    {categoryOptions.map((category) => (
                                        <option key={category.label} value={category.label}>{category.label}</option>
                                    ))}
                                </select>
                            </label>

                            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.7rem', color: '#9eb2bf' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>Vista</span>
                                <select
                                    value={catalogTypeFilter}
                                    onChange={e => setCatalogTypeFilter(e.target.value)}
                                    style={{ width: '100%', background: '#101a21', border: '1px solid var(--border-color)', color: '#e9f2f7', borderRadius: '8px', padding: '6px 8px', fontSize: '0.75rem', outline: 'none' }}
                                >
                                    <option value="all">Todos</option>
                                    <option value="discount">Con descuento</option>
                                    <option value="regular">Precio regular</option>
                                    <option value="in_cart">En carrito</option>
                                    <option value="out_cart">Fuera del carrito</option>
                                </select>
                            </label>
                        </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {!isExternalCatalog && (
                                <button
                                    type="button"
                                    onClick={handleAddClick}
                                    style={{ background: '#00a884', color: 'white', border: 'none', borderRadius: '999px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700 }}
                                >
                                    <PlusCircle size={13} /> Nuevo
                                </button>
                            )}
                            {hasAnyCatalogCriteria && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCatalogSearch('');
                                        setCatalogCategoryFilter('all');
                                        setCatalogTypeFilter('all');
                                    }}
                                    style={{ background: 'transparent', border: '1px solid rgba(124,200,255,0.35)', color: '#cdeaff', borderRadius: '999px', padding: '4px 10px', fontSize: '0.71rem', cursor: 'pointer' }}
                                >
                                    Limpiar
                                </button>
                            )}
                        </div>

                        <div style={{ fontSize: '0.7rem', color: '#8ca3b3' }}>
                            Mostrando {visibleCatalog.length} de {catalog.length} productos
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                            visibleCatalog.map((item, i) => {
                                const finalPrice = Number.parseFloat(item.price || '0') || 0;
                                const regularPrice = Number.parseFloat(item.regularPrice || item.price || '0') || finalPrice;
                                const hasDiscount = regularPrice > 0 && finalPrice > 0 && finalPrice < regularPrice;
                                const rawDiscount = Number.parseFloat(String(item.discountPct || 0));
                                const effectiveDiscount = Number.isFinite(rawDiscount) && rawDiscount > 0
                                    ? rawDiscount
                                    : (hasDiscount ? Number((((regularPrice - finalPrice) / regularPrice) * 100).toFixed(1)) : 0);
                                const cartLine = cartItems.find((cartItem) => String(cartItem?.id || '') === String(item?.id || ''));
                                const cartQty = Math.max(0, Number(cartLine?.qty || 0));
                                const inCart = cartQty > 0;

                                return (
                                    <div key={item.id || i} style={{ background: '#1b2730', borderRadius: '11px', border: '1px solid #2a3a45', padding: '8px', display: 'grid', gridTemplateColumns: '74px 1fr', gap: '8px', alignItems: 'start' }}>
                                        <div style={{ width: '74px', height: '74px', borderRadius: '9px', background: '#2a3942', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
                                            {item.imageUrl
                                                ? <img src={item.imageUrl} alt={item.title || 'Producto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                : <Package size={24} color="#98adba" />}
                                        </div>

                                        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '5px', justifyContent: 'flex-start' }}>
                                            <div style={{ fontSize: '0.84rem', color: '#eef5f9', fontWeight: 700, lineHeight: 1.24, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                                {String(item.title || `Producto ${i + 1}`)}
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                                                {hasDiscount && (
                                                    <span style={{ fontSize: '0.72rem', color: '#8fa1ad', textDecoration: 'line-through' }}>S/ {formatMoney(regularPrice)}</span>
                                                )}
                                                {hasDiscount && (
                                                    <span style={{ fontSize: '0.7rem', color: '#d5fff4', background: 'rgba(0,168,132,0.26)', border: '1px solid rgba(0,168,132,0.44)', borderRadius: '999px', padding: '2px 7px', fontWeight: 700 }}>
                                                        -{effectiveDiscount.toFixed(effectiveDiscount % 1 === 0 ? 0 : 1)}%
                                                    </span>
                                                )}
                                            </div>

                                            <div style={{ fontSize: '1rem', color: '#00d7ad', fontWeight: 800 }}>
                                                {finalPrice > 0 ? `S/ ${formatMoney(finalPrice)}` : 'Precio: Consultar'}
                                            </div>

                                            {inCart && (
                                                <div style={{ width: 'fit-content', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.68rem', color: '#d9fff4', background: 'rgba(0,168,132,0.22)', border: '1px solid rgba(0,168,132,0.45)', borderRadius: '999px', padding: '3px 8px', fontWeight: 700 }}>
                                                    <Check size={11} />
                                                    En carrito: {cartQty}
                                                </div>
                                            )}

                                            <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '7px', alignItems: 'stretch' }}>
                                                <button
                                                    onClick={() => sendCatalogProduct(item, i)}
                                                    style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '7px 9px', background: '#17323f', border: '1px solid rgba(0,168,132,0.45)', borderRadius: '9px', color: '#d6f7ee', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                >
                                                    <Send size={12} /> Enviar
                                                </button>
                                                {inCart ? (
                                                    <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', background: '#0f322b', border: '1px solid rgba(0,168,132,0.45)', borderRadius: '9px', padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                                        <button
                                                            onClick={() => onCatalogQtyDelta && onCatalogQtyDelta(item.id, -1)}
                                                            style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#20423a', border: 'none', cursor: 'pointer', color: '#d6f7ee', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                                        >
                                                            <Minus size={11} />
                                                        </button>
                                                        <span style={{ minWidth: '20px', textAlign: 'center', color: '#d9fff4', fontSize: '0.78rem', fontWeight: 800 }}>{cartQty}</span>
                                                        <button
                                                            onClick={() => onCatalogQtyDelta && onCatalogQtyDelta(item.id, 1)}
                                                            style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#00a884', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                                        >
                                                            <Plus size={11} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => addToCart(item, 1)}
                                                        style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '7px 9px', background: 'linear-gradient(90deg, #00a884 0%, #02c39a 100%)', border: 'none', borderRadius: '9px', color: 'white', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                    >
                                                        <ShoppingCart size={12} /> Carrito
                                                    </button>
                                                )}
                                            </div>

                                            {!isExternalCatalog && (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', alignItems: 'stretch' }}>
                                                    <button onClick={() => handleEditClick(item)} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', background: '#23323c', border: '1px solid rgba(255,255,255,0.13)', borderRadius: '8px', color: '#d8e6ef', cursor: 'pointer', fontSize: '0.71rem', padding: '6px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        Editar
                                                    </button>
                                                    <button onClick={() => handleDelete(item.id)} style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', background: '#2e1f26', border: '1px solid rgba(220,74,95,0.45)', borderRadius: '8px', color: '#ffb8c7', cursor: 'pointer', fontSize: '0.71rem', padding: '6px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        Eliminar
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
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

const BusinessSidebar = ({ tenantScopeKey = 'default', setInputText, businessData = {}, messages = [], activeChatId, activeChatPhone = '', onSendToClient, socket, myProfile, onLogout, quickReplies = [], onCreateQuickReply, onUpdateQuickReply, onDeleteQuickReply, waCapabilities = {}, pendingOrderCartLoad = null, openCompanyProfileToken = 0 }) => {
    const [activeTab, setActiveTab] = useState('ai');
    const [showCompanyProfile, setShowCompanyProfile] = useState(false);
    const companyProfileRef = useRef(null);
    // AI Chat State
    const [aiMessages, setAiMessages] = useState([
        { role: 'assistant', content: 'Hola, soy tu asistente de ventas de Lavitat con IA OpenAI. Estoy viendo la conversacion y te ayudare a cerrar mejor.\n\nPrueba: "Dame 3 opciones de respuesta" o "Como manejo una objecion de precio".' }
    ]);
    const [aiInput, setAiInput] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const aiEndRef = useRef(null);

        // Cart State
    const [cart, setCart] = useState([]);
    const [showOrderAdjustments, setShowOrderAdjustments] = useState(false);
    const [globalDiscountEnabled, setGlobalDiscountEnabled] = useState(false);
    const [globalDiscountType, setGlobalDiscountType] = useState('percent');
    const [globalDiscountValue, setGlobalDiscountValue] = useState(0);
    const [deliveryType, setDeliveryType] = useState('free');
    const [deliveryAmount, setDeliveryAmount] = useState(0);
    const [showCartTotalsBreakdown, setShowCartTotalsBreakdown] = useState(true);
    const [cartDraftsByChat, setCartDraftsByChat] = useState({});
    const [quickForm, setQuickForm] = useState({ label: '', text: '' });
    const [quickEditId, setQuickEditId] = useState('');
    const [quickSearch, setQuickSearch] = useState('');
    const [orderImportStatus, setOrderImportStatus] = useState(null);
    const lastImportedOrderRef = useRef('');
    const tenantScopeRef = useRef(String(tenantScopeKey || 'default').trim() || 'default');

    const catalog = (businessData.catalog || []).map((item, idx) => normalizeCatalogItem(item, idx));
    const labels = businessData.labels || [];
    const profile = businessData.profile || myProfile || null;
    const quickRepliesEnabled = Boolean(waCapabilities?.quickReplies || waCapabilities?.quickRepliesRead || waCapabilities?.quickRepliesWrite);
    const quickRepliesWriteEnabled = Boolean(waCapabilities?.quickRepliesWrite);

    useEffect(() => {
        const nextScope = String(tenantScopeKey || 'default').trim() || 'default';
        if (tenantScopeRef.current === nextScope) return;
        tenantScopeRef.current = nextScope;

        setActiveTab('ai');
        setShowCompanyProfile(false);
        setAiMessages([
            { role: 'assistant', content: 'Hola, soy tu asistente de ventas de Lavitat con IA OpenAI. Estoy viendo la conversacion y te ayudare a cerrar mejor.\n\nPrueba: "Dame 3 opciones de respuesta" o "Como manejo una objecion de precio".' }
        ]);
        setAiInput('');
        setCart([]);
        setShowOrderAdjustments(false);
        setGlobalDiscountEnabled(false);
        setGlobalDiscountType('percent');
        setGlobalDiscountValue(0);
        setDeliveryType('free');
        setDeliveryAmount(0);
        setShowCartTotalsBreakdown(true);
        setCartDraftsByChat({});
        setQuickForm({ label: '', text: '' });
        setQuickEditId('');
        setQuickSearch('');
        setOrderImportStatus(null);
        lastImportedOrderRef.current = '';
    }, [tenantScopeKey]);

    useEffect(() => {
        setOrderImportStatus(null);
        if (!activeChatId) return;
        const draft = cartDraftsByChat[activeChatId];
        if (draft) {
            const legacyPct = parseMoney(draft.globalDiscountPct ?? draft.discount ?? 0, 0);
            const legacyAmount = parseMoney(draft.globalDiscountAmount ?? 0, 0);
            const hasLegacyDiscount = legacyPct > 0 || legacyAmount > 0;
            const resolvedDiscountType = draft.globalDiscountType || (legacyAmount > 0 ? 'amount' : 'percent');
            const resolvedDiscountValue = parseMoney(
                draft.globalDiscountValue ?? (resolvedDiscountType === 'amount' ? legacyAmount : legacyPct),
                0
            );

            let resolvedDeliveryType = draft.deliveryType;
            if (!resolvedDeliveryType) {
                const legacyDeliveryEnabled = Boolean(draft.deliveryEnabled ?? false);
                const legacyDeliveryAmount = parseMoney(draft.deliveryAmount ?? 0, 0);
                resolvedDeliveryType = legacyDeliveryEnabled && legacyDeliveryAmount > 0 ? 'amount' : 'free';
            }

            setCart(draft.cart || []);
            setShowOrderAdjustments(Boolean(draft.showOrderAdjustments ?? false));
            setGlobalDiscountEnabled(Boolean(draft.globalDiscountEnabled ?? hasLegacyDiscount));
            setGlobalDiscountType(resolvedDiscountType === 'amount' ? 'amount' : 'percent');
            setGlobalDiscountValue(Math.max(0, resolvedDiscountValue));
            setDeliveryType(resolvedDeliveryType === 'amount' ? 'amount' : 'free');
            setDeliveryAmount(Math.max(0, parseMoney(draft.deliveryAmount ?? 0, 0)));
            setShowCartTotalsBreakdown(Boolean(draft.showCartTotalsBreakdown ?? true));
        } else {
            setCart([]);
            setShowOrderAdjustments(false);
            setGlobalDiscountEnabled(false);
            setGlobalDiscountType('percent');
            setGlobalDiscountValue(0);
            setDeliveryType('free');
            setDeliveryAmount(0);
            setShowCartTotalsBreakdown(true);
        }
    }, [activeChatId]);

    useEffect(() => {
        if (!activeChatId) return;
        setCartDraftsByChat(prev => ({
            ...prev,
            [activeChatId]: {
                cart,
                showOrderAdjustments,
                globalDiscountEnabled,
                globalDiscountType,
                globalDiscountValue,
                deliveryType,
                deliveryAmount,
                showCartTotalsBreakdown
            }
        }));
    }, [activeChatId, cart, showOrderAdjustments, globalDiscountEnabled, globalDiscountType, globalDiscountValue, deliveryType, deliveryAmount, showCartTotalsBreakdown]);

    useEffect(() => {
        if (!pendingOrderCartLoad || !activeChatId) return;
        if (String(pendingOrderCartLoad.chatId || '') !== String(activeChatId)) return;

        const token = String(pendingOrderCartLoad.token || pendingOrderCartLoad.order?.orderId || '');
        const dedupeKey = `${activeChatId}:${token}`;
        if (token && lastImportedOrderRef.current === dedupeKey) return;
        if (token) lastImportedOrderRef.current = dedupeKey;

        const order = pendingOrderCartLoad.order && typeof pendingOrderCartLoad.order === 'object'
            ? pendingOrderCartLoad.order
            : {};
        const orderType = String(order?.rawPreview?.type || '').toLowerCase();
        const isProductImport = orderType.includes('product') && !String(order?.orderId || '').trim();
        const isQuoteImport = orderType.includes('quote');
        const quoteSummary = order?.rawPreview?.quoteSummary && typeof order.rawPreview.quoteSummary === 'object'
            ? order.rawPreview.quoteSummary
            : null;
        const sourceItems = Array.isArray(order.products) ? order.products : [];
        const titleFallbackItems = sourceItems.length === 0
            ? parseOrderTitleItems(order?.rawPreview?.title || order?.rawPreview?.orderTitle || '')
            : [];
        const itemsToImport = sourceItems.length > 0 ? sourceItems : titleFallbackItems;
        const usedTitleFallback = sourceItems.length === 0 && titleFallbackItems.length > 0;

        if (itemsToImport.length === 0) {
            const reportedCountRaw = parseMoney(order?.rawPreview?.itemCount ?? 1, 1);
            const reportedCount = Math.max(1, Math.round(Number.isFinite(reportedCountRaw) ? reportedCountRaw : 1));
            const subtotalValue = Math.max(0, parseMoney(order?.subtotal ?? 0, 0));
            const unitValue = reportedCount > 0 ? (subtotalValue / reportedCount) : subtotalValue;

            const fallbackCart = [{
                id: `meta_order_unknown_${String(order?.orderId || token || Date.now())}`,
                title: 'Pedido WhatsApp (detalle no disponible)',
                price: Math.max(0, unitValue).toFixed(2),
                regularPrice: Math.max(0, unitValue).toFixed(2),
                salePrice: null,
                discountPct: 0,
                description: 'Meta/WhatsApp no devolvio lineas del pedido en esta sesion. Puedes aplicar descuento y delivery.',
                imageUrl: null,
                source: 'meta_order',
                sku: null,
                stockStatus: null,
                qty: reportedCount,
                lineDiscountEnabled: false,
                lineDiscountType: 'percent',
                lineDiscountValue: 0
            }];

            setCart(fallbackCart);
            setShowOrderAdjustments(true);
            setActiveTab('cart');
            setOrderImportStatus({
                level: 'warn',
                text: `Pedido cargado sin detalle de productos (items reportados: ${reportedCount}). Usa subtotal S/ ${formatMoney(subtotalValue)} y aplica ajustes.`
            });
            return;
        }

        const catalogBySku = new Map();
        const catalogByName = new Map();
        const catalogList = [];
        catalog.forEach((item, idx) => {
            const normalized = normalizeCatalogItem(item, idx);
            catalogList.push(normalized);
            const skuKey = normalizeSkuKey(normalized.sku);
            if (skuKey && !catalogBySku.has(skuKey)) catalogBySku.set(skuKey, normalized);
            const nameKey = normalizeTextKey(normalized.title);
            if (nameKey && !catalogByName.has(nameKey)) catalogByName.set(nameKey, normalized);
        });

        const merged = new Map();
        let matchedBySku = 0;
        let matchedByName = 0;
        let fallbackLines = 0;

        itemsToImport.forEach((line, idx) => {
            if (!line || typeof line !== 'object') return;

            const rawSku = String(line.sku || line.retailer_id || line.product_retailer_id || '').trim();
            const skuKey = normalizeSkuKey(rawSku);
            const rawName = String(line.name || line.title || '').trim();
            const nameKey = normalizeTextKey(rawName);

            let matched = null;
            if (skuKey && catalogBySku.has(skuKey)) {
                matched = catalogBySku.get(skuKey);
                matchedBySku += 1;
            } else if (nameKey && catalogByName.has(nameKey)) {
                matched = catalogByName.get(nameKey);
                matchedByName += 1;
            } else if (nameKey) {
                matched = catalogList.find((candidate) => {
                    const candidateKey = normalizeTextKey(candidate.title);
                    if (!candidateKey) return false;
                    return candidateKey.includes(nameKey) || nameKey.includes(candidateKey);
                }) || null;
                if (matched) matchedByName += 1;
            }

            const qtyRaw = parseMoney(line.quantity ?? line.qty ?? 1, 1);
            const qty = isProductImport
                ? 1
                : Math.max(1, Math.round(Number.isFinite(qtyRaw) ? qtyRaw : 1));
            const linePrice = parseMoney(line.price ?? line.unitPrice ?? 0, 0);
            const lineTotal = parseMoney(line.lineTotal ?? line.total ?? 0, 0);
            const derivedUnitPrice = lineTotal > 0 && qty > 0 ? (lineTotal / qty) : linePrice;

            const baseLine = matched
                ? {
                    ...matched,
                    price: parseMoney(matched.price, derivedUnitPrice > 0 ? derivedUnitPrice : 0).toFixed(2),
                    regularPrice: parseMoney(matched.regularPrice ?? matched.price, parseMoney(matched.price, 0)).toFixed(2),
                    sku: matched.sku || rawSku || null,
                    qty,
                    lineDiscountEnabled: false,
                    lineDiscountType: 'percent',
                    lineDiscountValue: 0
                }
                : {
                    id: `meta_order_${skuKey || nameKey || idx + 1}`,
                    title: rawName || (rawSku ? `SKU ${rawSku}` : `Producto pedido ${idx + 1}`),
                    price: Math.max(0, derivedUnitPrice || 0).toFixed(2),
                    regularPrice: Math.max(0, derivedUnitPrice || 0).toFixed(2),
                    salePrice: null,
                    discountPct: 0,
                    description: 'Producto importado desde pedido de WhatsApp.',
                    imageUrl: null,
                    source: 'meta_order',
                    sku: rawSku || null,
                    stockStatus: null,
                    qty,
                    lineDiscountEnabled: false,
                    lineDiscountType: 'percent',
                    lineDiscountValue: 0
                };

            if (!matched) fallbackLines += 1;

            const lineKey = String(baseLine.id || `line_${idx}`);
            if (merged.has(lineKey)) {
                const prev = merged.get(lineKey);
                merged.set(lineKey, {
                    ...prev,
                    qty: Math.max(1, Number(prev.qty || 1) + qty)
                });
                return;
            }
            merged.set(lineKey, baseLine);
        });

        const importedCart = Array.from(merged.values());
        if (importedCart.length === 0) {
            setOrderImportStatus({
                level: 'warn',
                text: 'Pedido recibido, pero no se pudo convertir a items del carrito.'
            });
            return;
        }

        if (isProductImport) {
            setCart((prev) => {
                const safePrev = Array.isArray(prev) ? prev : [];
                const map = new Map();
                const buildMergeKey = (item, idx) => {
                    const sku = normalizeSkuKey(item?.sku);
                    if (sku) return `sku:${sku}`;
                    const id = String(item?.id || '').trim();
                    if (id) return `id:${id}`;
                    const name = normalizeTextKey(item?.title || item?.name || '');
                    return name ? `name:${name}` : `line:${idx}`;
                };

                safePrev.forEach((item, idx) => {
                    const key = buildMergeKey(item, idx);
                    map.set(key, {
                        ...item,
                        qty: Math.max(1, Number(item?.qty || 1))
                    });
                });

                importedCart.forEach((item, idx) => {
                    const key = buildMergeKey(item, idx);
                    if (map.has(key)) {
                        const prevItem = map.get(key);
                        map.set(key, {
                            ...prevItem,
                            qty: Math.max(1, Number(prevItem?.qty || 1) + 1)
                        });
                        return;
                    }
                    map.set(key, {
                        ...item,
                        qty: 1
                    });
                });

                return Array.from(map.values());
            });
        } else {
            setCart(importedCart);
        }
        setShowOrderAdjustments(true);
        setActiveTab('cart');

        let quoteDiscountAmount = 0;
        let includedDiscountFromCatalog = 0;
        let reconstructedGlobalDiscount = 0;

        if (isQuoteImport && quoteSummary) {
            const parseMaybe = (value) => {
                const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
                return Number.isFinite(parsed) ? parsed : null;
            };

            const summaryDiscount = parseMaybe(quoteSummary?.discount);
            const summarySubtotal = parseMaybe(quoteSummary?.subtotal);
            const summaryTotalAfterDiscount = parseMaybe(quoteSummary?.totalAfterDiscount);
            quoteDiscountAmount = Number.isFinite(summaryDiscount)
                ? Math.max(0, summaryDiscount)
                : (Number.isFinite(summarySubtotal) && Number.isFinite(summaryTotalAfterDiscount)
                    ? Math.max(0, roundMoney(summarySubtotal - summaryTotalAfterDiscount))
                    : 0);

            includedDiscountFromCatalog = roundMoney(importedCart.reduce((sum, item) => {
                const qty = Math.max(1, Math.round(parseMoney(item?.qty, 1) || 1));
                const unitPrice = Math.max(0, parseMoney(item?.price, 0));
                const regularPrice = Math.max(unitPrice, parseMoney(item?.regularPrice ?? item?.price, unitPrice));
                const lineIncluded = Math.max(0, roundMoney((regularPrice - unitPrice) * qty));
                return sum + lineIncluded;
            }, 0));

            reconstructedGlobalDiscount = roundMoney(Math.max(0, quoteDiscountAmount - includedDiscountFromCatalog));

            const quoteDeliveryAmount = Math.max(0, parseMoney(quoteSummary?.deliveryAmount ?? 0, 0));
            const quoteDeliveryFree = Boolean(quoteSummary?.deliveryFree) || quoteDeliveryAmount <= 0;

            setGlobalDiscountEnabled(reconstructedGlobalDiscount > 0);
            setGlobalDiscountType('amount');
            setGlobalDiscountValue(reconstructedGlobalDiscount > 0 ? reconstructedGlobalDiscount : 0);
            setDeliveryType(quoteDeliveryFree ? 'free' : 'amount');
            setDeliveryAmount(quoteDeliveryFree ? 0 : quoteDeliveryAmount);
        }

        const reportedItems = Number(order?.rawPreview?.itemCount || itemsToImport.length || importedCart.length);
        const hasSubtotal = order?.subtotal !== null && order?.subtotal !== undefined && String(order.subtotal).trim() !== '';
        const subtotalLabel = hasSubtotal ? ` | subtotal ${formatMoney(parseMoney(order.subtotal, 0))}` : '';
        const statusBits = [
            isProductImport ? 'Producto agregado al carrito (+1)' : `Pedido cargado al carrito: ${importedCart.length} productos`,
            isProductImport ? null : `(items reportados: ${reportedItems})`,
            usedTitleFallback ? 'origen: titulo del pedido' : null,
            isQuoteImport && quoteSummary ? `descuento detectado: S/ ${formatMoney(quoteDiscountAmount)}` : null,
            isQuoteImport && includedDiscountFromCatalog > 0 ? `descuento kit/base: S/ ${formatMoney(includedDiscountFromCatalog)}` : null,
            isQuoteImport ? `descuento global aplicado: S/ ${formatMoney(reconstructedGlobalDiscount)}` : null,
            matchedBySku > 0 ? `SKU: ${matchedBySku}` : null,
            matchedByName > 0 ? `nombre: ${matchedByName}` : null,
            fallbackLines > 0 ? `sin match: ${fallbackLines}` : null,
        ].filter(Boolean);

        setOrderImportStatus({
            level: fallbackLines > 0 ? 'warn' : 'ok',
            text: `${statusBits.join(' | ')}${subtotalLabel}`
        });
    }, [pendingOrderCartLoad, activeChatId, catalog]);

    // Auto-scroll AI chat
    useEffect(() => { aiEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aiMessages]);

    useEffect(() => {
        if (activeTab === 'quick' && !quickRepliesEnabled) {
            setActiveTab('ai');
        }
    }, [activeTab, quickRepliesEnabled]);

    useEffect(() => {
        if (activeTab === 'cart' && cart.length === 0) {
            setActiveTab('catalog');
        }
    }, [activeTab, cart.length]);

    useEffect(() => {
        if (openCompanyProfileToken > 0) {
            setShowCompanyProfile(true);
        }
    }, [openCompanyProfileToken]);

    useEffect(() => {
        if (!showCompanyProfile) return;
        const handleOutsideClick = (event) => {
            const target = event.target;
            if (companyProfileRef.current?.contains(target)) return;
            setShowCompanyProfile(false);
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [showCompanyProfile]);

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
            ? catalog.map((p, idx) => `${idx + 1}. ${p.title} | Precio: S/ ${p.price || 'consultar'}${p.description ? ' | ' + p.description : ''}`).join('\n')
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
${cart.length > 0 ? cart.map((item, idx) => `- ${idx + 1}) ${item.title} | qty ${item.qty} | precio base S/ ${formatMoney(item.price)}${item.lineDiscountEnabled ? ` | desc ${item.lineDiscountType === 'amount' ? 'monto' : '%'} ${formatMoney(item.lineDiscountValue)}` : ''}`).join('\n') : '(carrito vacio)'}

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
    const getLineBreakdown = (item = {}) => {
        const qty = Math.max(1, Math.trunc(parseMoney(item.qty, 1)) || 1);
        const unitPrice = Math.max(0, parseMoney(item.price, 0));
        const regularUnitCandidate = Math.max(0, parseMoney(item.regularPrice, unitPrice));
        const regularUnit = regularUnitCandidate > 0 ? regularUnitCandidate : unitPrice;

        const regularSubtotal = roundMoney(regularUnit * qty);
        const baseSubtotal = roundMoney(unitPrice * qty);
        const includedDiscount = roundMoney(Math.max(regularSubtotal - baseSubtotal, 0));

        const lineDiscountEnabled = Boolean(item.lineDiscountEnabled);
        const lineDiscountType = item.lineDiscountType === 'amount' ? 'amount' : 'percent';
        const rawLineDiscountValue = Math.max(0, parseMoney(item.lineDiscountValue, 0));
        const lineDiscountValue = lineDiscountType === 'percent'
            ? clampNumber(rawLineDiscountValue, 0, 100)
            : rawLineDiscountValue;

        let additionalDiscountApplied = 0;
        if (lineDiscountEnabled) {
            if (lineDiscountType === 'percent') {
                additionalDiscountApplied = roundMoney(baseSubtotal * (lineDiscountValue / 100));
            } else {
                additionalDiscountApplied = roundMoney(Math.min(baseSubtotal, lineDiscountValue));
            }
        }

        const lineFinal = roundMoney(baseSubtotal - additionalDiscountApplied);

        return {
            qty,
            unitPrice,
            regularUnit,
            regularSubtotal,
            baseSubtotal,
            includedDiscount,
            lineDiscountEnabled,
            lineDiscountType,
            lineDiscountValue,
            additionalDiscountApplied,
            lineFinal,
            totalDiscount: roundMoney(includedDiscount + additionalDiscountApplied)
        };
    };

    const addToCart = (item, qtyToAdd = 1) => {
        const safeQty = Math.max(1, Number(qtyToAdd) || 1);
        setCart(prev => {
            const existing = prev.find(c => c.id === item.id);
            if (existing) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + safeQty } : c);
            return [...prev, { ...item, qty: safeQty, lineDiscountEnabled: false, lineDiscountType: 'percent', lineDiscountValue: 0 }];
        });
    };

    const removeFromCart = (id) => setCart(prev => prev.filter(c => c.id !== id));
    const updateQty = (id, delta) => setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c));

    const updateCatalogQty = (id, delta) => {
        const safeDelta = Number(delta) || 0;
        if (!id || !safeDelta) return;
        const targetId = String(id);
        setCart(prev => prev.flatMap((item) => {
            if (String(item.id) !== targetId) return [item];
            const nextQty = (Number(item.qty) || 1) + safeDelta;
            if (nextQty <= 0) return [];
            return [{ ...item, qty: nextQty }];
        }));
    };

    const updateItemDiscountEnabled = (id, enabled) => {
        const isEnabled = Boolean(enabled);
        setCart(prev => prev.map(c => c.id === id
            ? {
                ...c,
                lineDiscountEnabled: isEnabled,
                lineDiscountValue: isEnabled ? Math.max(0, parseMoney(c.lineDiscountValue, 0)) : 0
            }
            : c));
    };

    const updateItemDiscountType = (id, type) => {
        const safeType = type === 'amount' ? 'amount' : 'percent';
        setCart(prev => prev.map(c => c.id === id
            ? {
                ...c,
                lineDiscountType: safeType,
                lineDiscountValue: 0
            }
            : c));
    };

    const updateItemDiscountValue = (id, value) => {
        setCart(prev => prev.map(c => {
            if (c.id !== id) return c;
            const safeType = c.lineDiscountType === 'amount' ? 'amount' : 'percent';
            const rawValue = Math.max(0, parseMoney(value, 0));
            const safeValue = safeType === 'percent' ? clampNumber(rawValue, 0, 100) : rawValue;
            return { ...c, lineDiscountValue: safeValue };
        }));
    };

    const lineBreakdowns = cart.map((item) => ({ item, ...getLineBreakdown(item) }));
    const regularSubtotalTotal = roundMoney(lineBreakdowns.reduce((sum, line) => sum + line.regularSubtotal, 0));
    const subtotalProducts = roundMoney(lineBreakdowns.reduce((sum, line) => sum + line.lineFinal, 0));

    const rawGlobalDiscountValue = Math.max(0, parseMoney(globalDiscountValue, 0));
    const normalizedGlobalDiscountValue = globalDiscountType === 'amount'
        ? rawGlobalDiscountValue
        : clampNumber(rawGlobalDiscountValue, 0, 100);

    const globalDiscountApplied = globalDiscountEnabled
        ? roundMoney(Math.min(
            subtotalProducts,
            globalDiscountType === 'amount'
                ? normalizedGlobalDiscountValue
                : subtotalProducts * (normalizedGlobalDiscountValue / 100)
        ))
        : 0;

    const subtotalAfterGlobal = roundMoney(subtotalProducts - globalDiscountApplied);
    const totalDiscountForQuote = roundMoney(Math.max(0, regularSubtotalTotal - subtotalAfterGlobal));

    const safeDeliveryAmount = Math.max(0, parseMoney(deliveryAmount, 0));
    const deliveryFee = deliveryType === 'amount' ? safeDeliveryAmount : 0;
    const cartTotal = roundMoney(subtotalAfterGlobal + deliveryFee);

    const sendQuoteToChat = () => {
        if (cart.length === 0) return;

        const separator = '---------------------------------------------';

        const productRows = cart.map((item) => {
            const line = getLineBreakdown(item);
            return `\u2796 *${line.qty}* ${formatQuoteProductTitle(item.title)}`;
        });

        const paymentRows = [
            `\u2796 Subtotal: S/ ${formatMoneyCompact(regularSubtotalTotal)}`,
        ];

        if (totalDiscountForQuote > 0) {
            paymentRows.push(`\u2796 *DESCUENTO: S/ ${formatMoneyCompact(totalDiscountForQuote)}*`);
            paymentRows.push(`\u2796 Total con Descuento: S/ ${formatMoneyCompact(subtotalAfterGlobal)}`);
        }

        paymentRows.push(`\u2796 Delivery: ${deliveryFee > 0 ? `S/ ${formatMoneyCompact(deliveryFee)}` : 'Gratuito'}`);
        paymentRows.push(`\u2796 *TOTAL A PAGAR: S/ ${formatMoneyCompact(cartTotal)}*`);

        const msg = [
            `*\u2705 COTIZACION \u2705*`,
            separator,
            '*_DETALLE DE PRODUCTOS:_*',
            separator,
            ...productRows,
            separator,
            '*_DETALLE DE PAGO:_*',
            separator,
            ...paymentRows,
            separator,
        ].join('\n');

        setInputText(msg);
    };

    const filteredQuickReplies = (Array.isArray(quickReplies) ? quickReplies : []).filter((item) => {
        const q = String(quickSearch || '').trim().toLowerCase();
        if (!q) return true;
        const haystack = `${item?.label || ''} ${item?.text || ''}`.toLowerCase();
        return haystack.includes(q);
    });

    const beginEditQuickReply = (item) => {
        setQuickEditId(String(item?.id || ''));
        setQuickForm({
            label: String(item?.label || ''),
            text: String(item?.text || '')
        });
    };

    const resetQuickForm = () => {
        setQuickEditId('');
        setQuickForm({ label: '', text: '' });
    };

    const submitQuickReply = () => {

        if (!quickRepliesWriteEnabled) return;
        const label = String(quickForm.label || '').trim();
        const text = String(quickForm.text || '').trim();
        if (!label || !text) return;

        if (quickEditId) {
            onUpdateQuickReply && onUpdateQuickReply({ id: quickEditId, label, text });
        } else {
            onCreateQuickReply && onCreateQuickReply({ label, text });
        }
        resetQuickForm();
    };

    const tabs = [
        { id: 'ai', icon: <Bot size={15} />, label: 'IA Pro' },
        { id: 'catalog', icon: <Package size={15} />, label: `Catalogo${catalog.length > 0 ? ` (${catalog.length})` : ''}` },
        ...(cart.length > 0 ? [{ id: 'cart', icon: <ShoppingCart size={15} />, label: `Carrito (${cart.length})` }] : []),
        ...(quickRepliesEnabled ? [{ id: 'quick', icon: <Clock size={15} />, label: 'Rapidas' }] : []),
    ];


    return (
        <div className="business-sidebar business-sidebar-pro">
            {/* Tabs */}
            <div className="business-tabs">
                {tabs.map(t => (
                    <button key={t.id} onClick={() => { setActiveTab(t.id); setShowCompanyProfile(false); }} className={`business-tab-btn ${activeTab === t.id ? 'active' : ''}`} style={{
                        flex: 1, padding: '9px 2px', border: 'none', cursor: 'pointer',
                        background: activeTab === t.id ? '#111b21' : 'transparent',
                        color: activeTab === t.id ? '#00a884' : '#8696a0',
                        fontSize: '0.68rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                        borderBottom: activeTab === t.id ? '2px solid #00a884' : '2px solid transparent',
                    }}>
                        <span className="business-tab-icon">{t.icon}</span>
                        <span className="business-tab-label">{t.label}</span>
                    </button>
                ))}
            </div>

            {!quickRepliesEnabled && activeTab === 'ai' && (
                <div style={{ padding: '2px 10px 0', fontSize: '0.66rem', color: '#6f8796', textAlign: 'right' }}>
                    Modo compatibilidad activo (respuestas rapidas nativas no disponibles).
                </div>
            )}




            {showCompanyProfile && (
                <CompanyProfilePanel
                    profile={profile}
                    labels={labels}
                    onClose={() => setShowCompanyProfile(false)}
                    onLogout={onLogout}
                    panelRef={companyProfileRef}
                />
            )}

            {/* AI PRO TAB */}
            {activeTab === 'ai' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div className="ai-thread-pro" style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {aiMessages.map((msg, idx) => (
                            <div key={idx} className={`ai-row-pro ${msg.role === 'user' ? 'user' : 'assistant'}`} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                <div className={`ai-bubble-pro ${msg.role === 'user' ? 'user' : 'assistant'}`} style={{
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
                                            className="ai-use-reply-btn"
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
                    <div className="ai-quick-prompts ai-quick-prompts-pro" style={{ padding: '8px 10px', borderTop: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '6px', flexShrink: 0 }}>
                        <div className="ai-quick-prompts-title">
                            <Sparkles size={12} />
                            Atajos IA
                        </div>
                        {[
                            'Dame 3 opciones de respuesta',
                            'Como cerrar esta venta',
                            'Maneja la objecion de precio',
                            'Recomienda un producto',
                        ].map((chip, i) => (
                            <button key={i} className="ai-prompt-chip ai-prompt-chip-pro"
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
                    <div className="ai-assistant-input-row ai-input-row-pro" style={{ padding: '8px 10px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, background: '#202c33' }}>
                        <input
                            type="text"
                            placeholder="Pregunta algo a la IA..."
                            value={aiInput}
                            onChange={e => setAiInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendAiMessage()}
                            className="ai-assistant-input ai-assistant-input-pro" style={{ flex: 1, background: '#2a3942', border: 'none', outline: 'none', color: 'var(--text-primary)', borderRadius: '20px', padding: '8px 14px', fontSize: '0.82rem' }}
                        />
                        <button
                            onClick={sendAiMessage}
                            disabled={isAiLoading || !aiInput.trim()}
                            className="ai-assistant-send ai-assistant-send-pro" style={{ background: isAiLoading ? '#3b4a54' : '#00a884', border: 'none', borderRadius: '50%', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isAiLoading ? 'wait' : 'pointer', flexShrink: 0 }}
                        >
                            <Send size={16} color="white" />
                        </button>
                    </div>
                </div>
            )}

            {/* CATALOG TAB */}
            {activeTab === 'catalog' && (
                <CatalogTab catalog={catalog} socket={socket} addToCart={addToCart} onCatalogQtyDelta={updateCatalogQty} catalogMeta={businessData.catalogMeta} activeChatId={activeChatId} activeChatPhone={activeChatPhone} cartItems={cart} />
            )}

                        {/* CART TAB */}
            {activeTab === 'cart' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {orderImportStatus?.text && (
                            <div style={{ background: orderImportStatus.level === 'warn' ? '#2d251a' : '#17362f', border: orderImportStatus.level === 'warn' ? '1px solid #7a5a27' : '1px solid rgba(0,168,132,0.42)', color: orderImportStatus.level === 'warn' ? '#ffd58f' : '#bdf7e7', borderRadius: '8px', padding: '8px 10px', fontSize: '0.74rem', lineHeight: 1.4 }}>
                                {orderImportStatus.text}
                            </div>
                        )}

                        {cart.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '30px 15px', color: '#8696a0' }}>
                                <ShoppingCart size={36} style={{ marginBottom: '12px', opacity: 0.25, marginLeft: 'auto', marginRight: 'auto' }} />
                                <div style={{ fontSize: '0.875rem' }}>Carrito vacio</div>
                                <div style={{ fontSize: '0.78rem', opacity: 0.7, marginTop: '6px' }}>Agrega productos desde el Catalogo</div>
                            </div>
                        ) : (
                            cart.map((item, i) => {
                                const line = getLineBreakdown(item);
                                const lineDiscountMode = line.lineDiscountEnabled ? (line.lineDiscountType === 'amount' ? 'amount' : 'percent') : 'none';
                                return (
                                    <div key={item.id || i} style={{ background: '#1f2e37', borderRadius: '9px', border: '1px solid rgba(134,150,160,0.26)', padding: '7px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start' }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                                                {(line.regularSubtotal > line.lineFinal || line.includedDiscount > 0 || line.additionalDiscountApplied > 0) && (
                                                    <div style={{ marginTop: '2px', fontSize: '0.68rem', color: '#97adba', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                        {line.regularSubtotal > line.lineFinal && <span>Regular: S/ {formatMoney(line.regularSubtotal)}</span>}
                                                        {line.includedDiscount > 0 && <span style={{ color: '#63d1b7' }}>Kit: -S/ {formatMoney(line.includedDiscount)}</span>}
                                                        {line.additionalDiscountApplied > 0 && <span style={{ color: '#63d1b7' }}>Linea: -S/ {formatMoney(line.additionalDiscountApplied)}</span>}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ textAlign: 'right', minWidth: '98px' }}>
                                                <div style={{ fontSize: '0.66rem', color: '#91a8b5', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Precio final</div>
                                                <div style={{ fontSize: '0.96rem', color: '#00d7ad', fontWeight: 800, lineHeight: 1.1 }}>S/ {formatMoney(line.lineFinal)}</div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', gap: '6px', background: '#17242c', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '5px 6px' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                <button onClick={() => (line.qty <= 1 ? removeFromCart(item.id) : updateQty(item.id, -1))} style={{ width: '21px', height: '21px', borderRadius: '50%', background: '#3b4a54', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={9} /></button>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 700, minWidth: '18px', textAlign: 'center' }}>{line.qty}</span>
                                                <button onClick={() => updateQty(item.id, 1)} style={{ width: '21px', height: '21px', borderRadius: '50%', background: '#3b4a54', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={9} /></button>
                                                <button onClick={() => removeFromCart(item.id)} title="Eliminar" style={{ width: '21px', height: '21px', borderRadius: '50%', background: '#2a3942', border: '1px solid rgba(218,54,51,0.4)', cursor: 'pointer', color: '#da3633', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px', minWidth: 0 }}>
                                                <select
                                                    value={lineDiscountMode}
                                                    onChange={(e) => {
                                                        const mode = e.target.value;
                                                        if (mode === 'none') {
                                                            updateItemDiscountEnabled(item.id, false);
                                                            updateItemDiscountValue(item.id, 0);
                                                            return;
                                                        }
                                                        updateItemDiscountEnabled(item.id, true);
                                                        updateItemDiscountType(item.id, mode);
                                                    }}
                                                    style={{ background: '#2a3942', border: '1px solid var(--border-color)', color: '#d9e8f0', borderRadius: '6px', padding: '4px 6px', fontSize: '0.74rem', outline: 'none', minWidth: '98px' }}
                                                >
                                                    <option value="none">Sin desc.</option>
                                                    <option value="percent">Desc. %</option>
                                                    <option value="amount">Desc. S/</option>
                                                </select>
                                                {lineDiscountMode !== 'none' && (
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max={lineDiscountMode === 'percent' ? 100 : undefined}
                                                        step={lineDiscountMode === 'percent' ? '1' : '0.01'}
                                                        value={line.lineDiscountValue}
                                                        onChange={e => updateItemDiscountValue(item.id, e.target.value)}
                                                        placeholder="0"
                                                        style={{ width: '70px', background: '#2a3942', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px', padding: '4px 6px', fontSize: '0.74rem', outline: 'none' }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {cart.length > 0 && (
                        <div style={{ padding: '10px 9px', borderTop: '1px solid var(--border-color)', background: '#1a2b35', display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}>
                            <button
                                type="button"
                                onClick={() => setShowOrderAdjustments(prev => !prev)}
                                style={{ width: '100%', background: 'linear-gradient(90deg, rgba(0,168,132,0.22), rgba(11,56,69,0.7))', border: '1px solid rgba(0,168,132,0.6)', color: '#e6fff8', borderRadius: '9px', padding: '9px 10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'inset 0 0 0 1px rgba(0,168,132,0.16)' }}
                            >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Sparkles size={13} /> Ajustes de pago y envio</span>
                                {showOrderAdjustments ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            </button>

                            {showOrderAdjustments && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ background: '#17242c', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#d5e3ec', fontSize: '0.78rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={globalDiscountEnabled} onChange={e => setGlobalDiscountEnabled(e.target.checked)} />
                                            Aplicar descuento global
                                        </label>

                                        {globalDiscountEnabled && (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                <select
                                                    value={globalDiscountType}
                                                    onChange={e => setGlobalDiscountType(e.target.value === 'amount' ? 'amount' : 'percent')}
                                                    style={{ background: '#2a3942', border: '1px solid var(--border-color)', color: '#d9e8f0', borderRadius: '6px', padding: '5px 7px', fontSize: '0.8rem', outline: 'none' }}
                                                >
                                                    <option value="percent">Porcentaje (%)</option>
                                                    <option value="amount">Monto (S/)</option>
                                                </select>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={globalDiscountType === 'percent' ? 100 : undefined}
                                                    step={globalDiscountType === 'percent' ? '1' : '0.01'}
                                                    value={normalizedGlobalDiscountValue}
                                                    onChange={e => setGlobalDiscountValue(Math.max(0, parseMoney(e.target.value, 0)))}
                                                    style={{ background: '#2a3942', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px', padding: '5px 7px', fontSize: '0.8rem', outline: 'none' }}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ background: '#17242c', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#95abba' }}>Delivery / envio</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <select
                                                value={deliveryType}
                                                onChange={e => setDeliveryType(e.target.value === 'amount' ? 'amount' : 'free')}
                                                style={{ background: '#2a3942', border: '1px solid var(--border-color)', color: '#d9e8f0', borderRadius: '6px', padding: '5px 7px', fontSize: '0.8rem', outline: 'none' }}
                                            >
                                                <option value="free">Gratuito</option>
                                                <option value="amount">Con monto</option>
                                            </select>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={deliveryType === 'amount' ? safeDeliveryAmount : 0}
                                                onChange={e => setDeliveryAmount(Math.max(0, parseMoney(e.target.value, 0)))}
                                                disabled={deliveryType !== 'amount'}
                                                style={{ background: deliveryType === 'amount' ? '#2a3942' : '#26343d', border: '1px solid var(--border-color)', color: deliveryType === 'amount' ? 'var(--text-primary)' : '#6f8796', borderRadius: '6px', padding: '5px 7px', fontSize: '0.8rem', outline: 'none' }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div style={{ background: '#17242c', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowCartTotalsBreakdown((prev) => !prev)}
                                    style={{ width: '100%', background: 'transparent', border: '1px dashed rgba(134,150,160,0.4)', color: '#d8e6ef', borderRadius: '7px', padding: '6px 8px', cursor: 'pointer', fontSize: '0.74rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                >
                                    <span>Resumen de total</span>
                                    {showCartTotalsBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>

                                {showCartTotalsBreakdown && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#d8e6ef', fontWeight: 700 }}>
                                            <span>Subtotal</span>
                                            <span>S/ {formatMoney(regularSubtotalTotal)}</span>
                                        </div>
                                        {totalDiscountForQuote > 0 && (
                                            <>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: '#95abba' }}>
                                                    <span>Descuento</span>
                                                    <span>- S/ {formatMoney(totalDiscountForQuote)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: '#95abba' }}>
                                                    <span>Total con descuento</span>
                                                    <span>S/ {formatMoney(subtotalAfterGlobal)}</span>
                                                </div>
                                            </>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: '#95abba' }}>
                                            <span>Delivery</span>
                                            <span>{deliveryFee > 0 ? `S/ ${formatMoney(deliveryFee)}` : 'Gratuito'}</span>
                                        </div>
                                    </>
                                )}

                                <div style={{ marginTop: '2px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 800, color: '#00d7ad' }}>
                                    <span>TOTAL A PAGAR</span>
                                    <span>S/ {formatMoney(cartTotal)}</span>
                                </div>
                            </div>

                            <button
                                onClick={sendQuoteToChat}
                                style={{ width: '100%', padding: '9px', background: '#00a884', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                <Send size={15} /> Enviar cotizacion al cliente
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* QUICK REPLIES TAB */}


            {activeTab === 'quick' && quickRepliesEnabled && (
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ background: '#1f2c34', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px' }}>
                        <input
                            type="text"
                            value={quickSearch}
                            onChange={e => setQuickSearch(e.target.value)}
                            placeholder="Buscar respuesta rapida"
                            style={{ width: '100%', background: '#111b21', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', padding: '8px 10px', fontSize: '0.78rem', outline: 'none' }}
                        />
                    </div>


                    {quickRepliesWriteEnabled ? (
                        <div style={{ background: '#202c33', borderRadius: '10px', border: '1px solid var(--border-color)', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ fontSize: '0.75rem', color: '#9db0ba' }}>
                                {quickEditId ? 'Editar respuesta rapida' : 'Nueva respuesta rapida'}
                            </div>
                            <input
                                type="text"
                                value={quickForm.label}
                                onChange={e => setQuickForm((prev) => ({ ...prev, label: e.target.value }))}
                                placeholder="Titulo"
                                style={{ width: '100%', background: '#111b21', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', padding: '8px 10px', fontSize: '0.78rem', outline: 'none' }}
                            />
                            <textarea
                                rows={3}
                                value={quickForm.text}
                                onChange={e => setQuickForm((prev) => ({ ...prev, text: e.target.value }))}
                                placeholder="Texto de respuesta"
                                style={{ width: '100%', background: '#111b21', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', padding: '8px 10px', fontSize: '0.78rem', outline: 'none', resize: 'vertical' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                {quickEditId && (
                                    <button
                                        type="button"
                                        onClick={resetQuickForm}
                                        style={{ background: 'transparent', border: '1px solid var(--border-color)', color: '#9db0ba', borderRadius: '7px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}
                                    >
                                        Cancelar
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={submitQuickReply}
                                    style={{ background: '#00a884', border: 'none', color: 'white', borderRadius: '7px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                >
                                    <PlusCircle size={13} /> {quickEditId ? 'Guardar cambios' : 'Agregar respuesta'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ background: '#202c33', borderRadius: '10px', border: '1px solid var(--border-color)', padding: '10px', color: '#8696a0', fontSize: '0.78rem' }}>
                            Esta cuenta permite ver respuestas rapidas sincronizadas, pero no editarlas desde esta API.
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                        {filteredQuickReplies.length === 0 ? (
                            <div style={{ background: '#1f2c34', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', color: '#8696a0', fontSize: '0.78rem' }}>
                                No hay respuestas rapidas para mostrar.
                            </div>
                        ) : (
                            filteredQuickReplies.map((qr) => (
                                <div key={qr.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                                    <button
                                        className="ai-prompt-chip"
                                        onClick={() => setInputText(qr.text)}
                                        style={{
                                            width: '100%', padding: '10px 12px', borderRadius: '8px',
                                            background: '#202c33', border: '1px solid var(--border-color)',
                                            cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)', transition: 'all 0.12s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.borderColor = '#00a884'}
                                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                    >
                                        <div style={{ fontSize: '0.84rem', fontWeight: 500, marginBottom: '3px' }}>{qr.label}</div>
                                        <div style={{ fontSize: '0.72rem', color: '#8696a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(qr.text || '').split('\n')[0]}</div>
                                    </button>
                                    <div style={{ display: 'flex', gap: '6px' }}>

                                        {quickRepliesWriteEnabled && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => beginEditQuickReply(qr)}
                                                    style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#202c33', color: '#9db0ba', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Editar"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onDeleteQuickReply && onDeleteQuickReply(qr.id)}
                                                    style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid rgba(218,54,51,0.45)', background: '#202c33', color: '#da3633', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            

        </div>
    );
};

export default BusinessSidebar;

