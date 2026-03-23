import React, { useState, useRef, useEffect } from 'react';
import { Search, MoreVertical, ChevronUp, ChevronDown, Tag, MapPin, Share2, X } from 'lucide-react';
import MessageBubble from './message-bubble/MessageBubble';
import moment from 'moment';
import ChannelBrandIcon from './ChannelBrandIcon';
import ChatInput from './ChatInput';
import { normalizeModuleImageUrl } from '../core/helpers/appChat.helpers';

// ============================================================
// ChatWindow - Full component with Profile Panel
// ============================================================
const ChatWindow = ({
    activeChatDetails,
    messages,
    messagesEndRef,
    isCopilotMode,
    setIsCopilotMode,
    isDragOver,
    onDragOver,
    onDragLeave,
    onDrop,
    showClientProfile,
    setShowClientProfile,
    labelDefinitions = [],
    onToggleChatLabel,
    onToggleChatPinned,
    onEditMessage,
    onReplyMessage,
    onForwardMessage,
    onDeleteMessage,
    forwardChatOptions = [],

    canEditMessages = true,
    buildApiHeaders,
    waModules = [],
    ...inputProps
}) => {
    const [showMenu, setShowMenu] = useState(false);
    const [searchVisible, setSearchVisible] = useState(false);
    const [chatSearch, setChatSearch] = useState('');
    const [showLabelMenu, setShowLabelMenu] = useState(false);
    const [activeMatchIdx, setActiveMatchIdx] = useState(0);
    const [lightboxMedia, setLightboxMedia] = useState(null);
    const [showMapModal, setShowMapModal] = useState(false);
    const [mapQuery, setMapQuery] = useState('');
    const [mapEmbedUrl, setMapEmbedUrl] = useState('');
    const [mapSuggestions, setMapSuggestions] = useState([]);
    const [mapSuggestionsLoading, setMapSuggestionsLoading] = useState(false);
    const [mapResolveLoading, setMapResolveLoading] = useState(false);
    const [selectedMapSuggestion, setSelectedMapSuggestion] = useState(null);
    const messageRefs = useRef({});

    const searchTerm = chatSearch.trim().toLowerCase();
    const matchIndexes = searchTerm
        ? messages.reduce((acc, msg, idx) => (String(msg.body || '').toLowerCase().includes(searchTerm) ? [...acc, idx] : acc), [])
        : [];

    const jumpToMatch = (idx) => {
        const targetMessageIdx = matchIndexes[idx];
        if (targetMessageIdx === undefined) return;
        const messageId = messages[targetMessageIdx]?.id || `idx_${targetMessageIdx}`;
        const node = messageRefs.current[messageId];
        if (node?.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    useEffect(() => {
        if (!matchIndexes.length) {
            setActiveMatchIdx(0);
            return;
        }
        setActiveMatchIdx(0);
        setTimeout(() => jumpToMatch(0), 0);
    }, [chatSearch, messages.length]);

    useEffect(() => {
        const onEsc = (event) => {
            if (event.key === 'Escape') { setLightboxMedia(null); setShowMapModal(false); }
        };
        window.addEventListener('keydown', onEsc);
        return () => window.removeEventListener('keydown', onEsc);
    }, []);

    const avatarColor = (name) => {
        const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
        if (!name) return colors[0];
        return colors[name.charCodeAt(0) % colors.length];
    };

    const getChannelMarker = (channelType = '') => {
        const clean = String(channelType || '').trim().toLowerCase();
        if (!clean) return { key: 'generic', short: 'CH', label: 'Canal' };
        if (clean === 'whatsapp') return { key: 'whatsapp', short: 'WA', label: 'WhatsApp' };
        if (clean === 'instagram') return { key: 'instagram', short: 'IG', label: 'Instagram' };
        if (clean === 'messenger') return { key: 'messenger', short: 'MS', label: 'Messenger' };
        if (clean === 'facebook') return { key: 'facebook', short: 'FB', label: 'Facebook' };
        if (clean === 'webchat') return { key: 'webchat', short: 'WEB', label: 'Webchat' };
        return { key: 'generic', short: clean.slice(0, 3).toUpperCase(), label: clean.toUpperCase() };
    };

    const formatHeaderPhone = (phoneValue) => {
        const raw = String(phoneValue || '').trim();
        if (!raw) return '';
        const normalized = raw.replace(/[^\d+]/g, '');
        if (!normalized) return '';
        return normalized.startsWith('+') ? normalized : `+${normalized}`;
    };

    const headerPhone = formatHeaderPhone(activeChatDetails?.phone);
    const headerParticipantsCount = Number(
        activeChatDetails?.participants
        || activeChatDetails?.chatState?.participantsCount
        || (Array.isArray(activeChatDetails?.participantsList) ? activeChatDetails.participantsList.length : 0)
        || 0
    ) || 0;
    const normalizeHeaderText = (value = '') => String(value || '').trim().toLowerCase();
    const normalizeHeaderDigits = (value = '') => String(value || '').replace(/\D/g, '');
    const isPhoneLikeHeaderValue = (value = '') => /^\+?\d{8,15}$/.test(String(value || '').replace(/[^\d+]/g, ''));
    const sameHeaderIdentity = (left = '', right = '') => {
        const leftDigits = normalizeHeaderDigits(left);
        const rightDigits = normalizeHeaderDigits(right);
        if (leftDigits && rightDigits) return leftDigits === rightDigits;
        return normalizeHeaderText(left) === normalizeHeaderText(right);
    };
    const rawHeaderName = String(activeChatDetails?.name || '').trim();
    const rawHeaderPushname = String(activeChatDetails?.pushname || '').trim();
    const cleanHeaderPushname = isPhoneLikeHeaderValue(rawHeaderPushname) ? '' : rawHeaderPushname;
    const headerDisplayName = (!activeChatDetails?.isGroup && cleanHeaderPushname && (isPhoneLikeHeaderValue(rawHeaderName) || !rawHeaderName))
        ? cleanHeaderPushname
        : (rawHeaderName || headerPhone || rawHeaderPushname || 'Sin nombre');
    const headerMetaItems = [];
    if (activeChatDetails?.isGroup) {
        if (headerParticipantsCount > 0) {
            headerMetaItems.push(`${headerParticipantsCount} participantes`);
        }
    } else {
        if (headerPhone && !sameHeaderIdentity(headerPhone, headerDisplayName)) {
            headerMetaItems.push(headerPhone);
        }
        const cleanHeaderAlias = String(cleanHeaderPushname || '').trim();
        if (cleanHeaderAlias && !sameHeaderIdentity(cleanHeaderAlias, headerDisplayName) && !sameHeaderIdentity(cleanHeaderAlias, headerPhone)) {
            headerMetaItems.push(`Alias: ${cleanHeaderAlias}`);
        }
    }
    if (headerMetaItems.length === 0) {
        headerMetaItems.push(activeChatDetails?.isGroup ? 'Grupo' : 'Perfil del contacto');
    }
    const normalizeModuleKey = (value = '') => String(value || '').trim().toLowerCase();
    const headerModuleId = String(activeChatDetails?.scopeModuleId || activeChatDetails?.lastMessageModuleId || '').trim().toUpperCase();
    const normalizedHeaderModuleId = normalizeModuleKey(activeChatDetails?.scopeModuleId || activeChatDetails?.lastMessageModuleId || '');
    const headerRawModuleName = String(activeChatDetails?.lastMessageModuleName || '').trim();
    const normalizedHeaderModuleName = String(headerRawModuleName || '').trim().toLowerCase();
    const modulePool = Array.isArray(waModules) ? waModules : [];
    const headerModuleConfig = modulePool.find((moduleEntry) => normalizeModuleKey(moduleEntry?.moduleId || moduleEntry?.id || '') === normalizedHeaderModuleId)
        || modulePool.find((moduleEntry) => normalizedHeaderModuleName && String(moduleEntry?.name || '').trim().toLowerCase() === normalizedHeaderModuleName)
        || null;
    const headerModuleName = headerRawModuleName || String(headerModuleConfig?.name || '').trim() || headerModuleId;
    const headerModuleChannelType = String(activeChatDetails?.lastMessageChannelType || headerModuleConfig?.channelType || '').trim().toLowerCase();
    const headerModuleChannel = headerModuleChannelType ? headerModuleChannelType.toUpperCase() : '';
    const headerModuleImageUrl = normalizeModuleImageUrl(
        activeChatDetails?.lastMessageModuleImageUrl
        || headerModuleConfig?.imageUrl
        || headerModuleConfig?.logoUrl
        || ''
    );
    const showHeaderModule = Boolean(headerModuleName || headerModuleChannel);
    const headerChannelMarker = getChannelMarker(headerModuleChannelType);
    const headerAvatarImageUrl = headerModuleImageUrl || null;
    const headerAvatarFallback = headerChannelMarker.short || (headerModuleName ? String(headerModuleName).charAt(0).toUpperCase() : (activeChatDetails?.name?.charAt(0)?.toUpperCase() || '?'));
    const normalizeSenderDigits = (value = '') => String(value || '').replace(/\D/g, '');
    const participantRecords = Array.isArray(activeChatDetails?.participantsList) ? activeChatDetails.participantsList : [];
    const participantNameById = new Map();
    const participantNameByPhone = new Map();

    participantRecords.forEach((participant) => {
        if (!participant || typeof participant !== 'object') return;
        const id = String(participant.id || '').trim();
        const name = String(participant.displayName || participant.name || participant.pushname || participant.shortName || '').trim();
        const phoneDigits = normalizeSenderDigits(participant.phone || id.split('@')[0] || '');
        if (id && name) participantNameById.set(id, name);
        if (phoneDigits && name) participantNameByPhone.set(phoneDigits, name);
    });

    const isHumanSenderLabel = (value = '') => {
        const label = String(value || '').trim();
        if (!label) return false;
        if (label.includes('@')) return false;
        if (/^\+?\d{8,}$/.test(label)) return false;
        if (/^\d{14,}$/.test(label)) return false;
        return true;
    };

    const resolveGroupSenderName = (msg = {}) => {
        if (!activeChatDetails?.isGroup || msg?.fromMe) return '';

        const senderId = String(msg?.senderId || msg?.author || '').trim();
        if (senderId && participantNameById.has(senderId)) return participantNameById.get(senderId);

        const senderDigits = normalizeSenderDigits(msg?.senderPhone || senderId.split('@')[0] || '');
        if (senderDigits && participantNameByPhone.has(senderDigits)) return participantNameByPhone.get(senderDigits);

        const notifyName = String(msg?.notifyName || '').trim();
        if (isHumanSenderLabel(notifyName)) return notifyName;

        const senderPushname = String(msg?.senderPushname || '').trim();
        if (isHumanSenderLabel(senderPushname)) return senderPushname;

        if (senderDigits) return `+${senderDigits}`;
        return 'Participante';
    };
    const formatDayLabel = (unixTs) => {
        const m = moment.unix(unixTs || 0);
        if (!m.isValid()) return '';
        if (m.isSame(moment(), 'day')) return 'Hoy';
        if (m.isSame(moment().subtract(1, 'day'), 'day')) return 'Ayer';
        return m.format('dddd, D [de] MMMM');
    };

    const parseMapCoord = (value) => Number.parseFloat(String(value ?? '').replace(',', '.'));
    const isValidMapLat = (value) => Number.isFinite(value) && value >= -90 && value <= 90;
    const isValidMapLng = (value) => Number.isFinite(value) && value >= -180 && value <= 180;

    const extractCoordsToken = (value = '') => {
        const source = String(value || '');
        if (!source) return null;
        const patterns = [
            /@(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
            /[?&](?:q|query|ll|sll|destination|daddr)=(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
            /\b(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})\b/
        ];
        for (const pattern of patterns) {
            const match = source.match(pattern);
            if (!match) continue;
            const lat = parseMapCoord(match[1]);
            const lng = parseMapCoord(match[2]);
            if (isValidMapLat(lat) && isValidMapLng(lng)) return { lat, lng };
        }
        return null;
    };

    const normalizeMapSeed = (seed = '') => {
        const raw = String(seed || '').trim();
        if (!raw) return '';
        if (!/^https?:\/\//i.test(raw)) return raw;

        const normalizedUrl = raw.replace(/[),.;!?]+$/g, '');
        try {
            const parsed = new URL(normalizedUrl);
            for (const key of ['q', 'query', 'll', 'sll', 'destination', 'daddr']) {
                const fromParam = parsed.searchParams.get(key);
                if (!fromParam) continue;
                const trimmed = String(fromParam).trim();
                if (!trimmed) continue;
                const coords = extractCoordsToken(trimmed);
                if (coords) return `${coords.lat},${coords.lng}`;
                return trimmed;
            }

            const decodedPath = decodeURIComponent(`${parsed.pathname || ''}${parsed.hash || ''}`);
            const pathCoords = extractCoordsToken(decodedPath);
            if (pathCoords) return `${pathCoords.lat},${pathCoords.lng}`;

            const placeMatch = decodedPath.match(/\/place\/([^/]+)/i);
            if (placeMatch?.[1]) return String(placeMatch[1]).replace(/\+/g, ' ');

            const searchMatch = decodedPath.match(/\/search\/([^/]+)/i);
            if (searchMatch?.[1]) return String(searchMatch[1]).replace(/\+/g, ' ');

            return normalizedUrl;
        } catch (e) {
            return normalizedUrl;
        }
    };

    const buildMapEmbedUrl = (seed = '') => {
        const normalized = normalizeMapSeed(seed);
        if (!normalized) return '';
        return `https://www.google.com/maps?q=${encodeURIComponent(normalized)}&output=embed`;
    };

    const buildExternalMapUrl = (seed = '') => {
        const raw = String(seed || '').trim();
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        const normalized = normalizeMapSeed(raw);
        if (!normalized) return '';
        return `https://www.google.com/maps?q=${encodeURIComponent(normalized)}`;
    };

    const toSuggestionItem = (item = {}) => {
        const latitude = parseMapCoord(item?.latitude);
        const longitude = parseMapCoord(item?.longitude);
        const hasCoords = isValidMapLat(latitude) && isValidMapLng(longitude);
        const label = String(item?.label || '').trim();
        const mapUrl = String(item?.mapUrl || '').trim();
        if (!label && !hasCoords && !mapUrl) return null;
        const seed = hasCoords ? `${latitude},${longitude}` : (normalizeMapSeed(mapUrl || label) || label);
        return {
            id: String(item?.id || seed || label || Date.now()),
            label: label || (hasCoords ? `${latitude}, ${longitude}` : 'Ubicacion'),
            latitude: hasCoords ? latitude : null,
            longitude: hasCoords ? longitude : null,
            seed,
            mapUrl: mapUrl || buildExternalMapUrl(seed)
        };
    };

    const resolveMapUrlViaApi = async (rawUrl = '') => {
        const cleanUrl = String(rawUrl || '').trim();
        if (!/^https?:\/\//i.test(cleanUrl)) return null;
        try {
            const encoded = encodeURIComponent(cleanUrl);
            const response = await fetch(`${API_URL}/api/map-resolve?url=${encoded}`, {
                headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : undefined
            });
            const payload = await response.json();
            if (!payload?.ok) return null;
            return {
                seed: String(payload.seed || '').trim(),
                latitude: parseMapCoord(payload.latitude),
                longitude: parseMapCoord(payload.longitude),
                mapUrl: String(payload.resolvedUrl || cleanUrl).trim()
            };
        } catch (e) {
            return null;
        }
    };

    const selectMapSuggestion = (item = null) => {
        const suggestion = toSuggestionItem(item);
        if (!suggestion) return;
        setSelectedMapSuggestion(suggestion);
        setMapQuery(suggestion.label);
        setMapEmbedUrl(buildMapEmbedUrl(suggestion.seed));
        setMapSuggestions([]);
    };

    const openMapModal = async ({ query = '', mapUrl = '', latitude = null, longitude = null } = {}) => {
        const lat = parseMapCoord(latitude);
        const lng = parseMapCoord(longitude);
        const hasCoords = isValidMapLat(lat) && isValidMapLng(lng);

        const initialSeed = hasCoords
            ? `${lat},${lng}`
            : String(mapUrl || query || '').trim();
        const normalizedSeed = normalizeMapSeed(initialSeed);

        setShowMapModal(true);
        setSelectedMapSuggestion(null);
        setMapSuggestions([]);
        setMapQuery(normalizedSeed || initialSeed || '');
        setMapEmbedUrl(buildMapEmbedUrl(normalizedSeed || initialSeed));

        if (/^https?:\/\//i.test(initialSeed)) {
            setMapResolveLoading(true);
            const resolved = await resolveMapUrlViaApi(initialSeed);
            setMapResolveLoading(false);
            if (!resolved) return;

            const resolvedSeed = normalizeMapSeed(resolved.seed || resolved.mapUrl || initialSeed);
            const resolvedSuggestion = toSuggestionItem({
                id: resolved.mapUrl || resolvedSeed,
                label: resolvedSeed || initialSeed,
                latitude: resolved.latitude,
                longitude: resolved.longitude,
                mapUrl: resolved.mapUrl
            });

            if (resolvedSuggestion) {
                setSelectedMapSuggestion(resolvedSuggestion);
                setMapQuery(resolvedSuggestion.label);
                setMapEmbedUrl(buildMapEmbedUrl(resolvedSuggestion.seed));
            }
        }
    };

    const submitMapSearch = async (event) => {
        event.preventDefault();
        if (selectedMapSuggestion) {
            setMapEmbedUrl(buildMapEmbedUrl(selectedMapSuggestion.seed));
            return;
        }

        const currentQuery = String(mapQuery || '').trim();
        if (!currentQuery) {
            setMapEmbedUrl('');
            return;
        }

        if (/^https?:\/\//i.test(currentQuery)) {
            setMapResolveLoading(true);
            const resolved = await resolveMapUrlViaApi(currentQuery);
            setMapResolveLoading(false);
            if (resolved) {
                const suggestion = toSuggestionItem({
                    id: resolved.mapUrl || resolved.seed,
                    label: normalizeMapSeed(resolved.seed || resolved.mapUrl || currentQuery) || currentQuery,
                    latitude: resolved.latitude,
                    longitude: resolved.longitude,
                    mapUrl: resolved.mapUrl
                });
                if (suggestion) {
                    setSelectedMapSuggestion(suggestion);
                    setMapQuery(suggestion.label);
                    setMapEmbedUrl(buildMapEmbedUrl(suggestion.seed));
                    return;
                }
            }
        }

        setMapEmbedUrl(buildMapEmbedUrl(currentQuery));
    };

    useEffect(() => {
        if (!showMapModal) {
            setMapSuggestions([]);
            setMapSuggestionsLoading(false);
            return;
        }

        const query = String(mapQuery || '').trim();
        if (!query || query.length < 2 || /^https?:\/\//i.test(query)) {
            setMapSuggestions([]);
            setMapSuggestionsLoading(false);
            return;
        }

        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                setMapSuggestionsLoading(true);
                const encoded = encodeURIComponent(query);
                const response = await fetch(`${API_URL}/api/map-suggest?q=${encoded}&limit=8`, {
                    headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : undefined
                });
                const payload = await response.json();
                if (cancelled) return;
                const items = Array.isArray(payload?.items)
                    ? payload.items.map((item) => toSuggestionItem(item)).filter(Boolean)
                    : [];
                setMapSuggestions(items);
            } catch (e) {
                if (!cancelled) setMapSuggestions([]);
            } finally {
                if (!cancelled) setMapSuggestionsLoading(false);
            }
        }, 260);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [mapQuery, showMapModal]);

    const mapExternalUrl = selectedMapSuggestion?.mapUrl
        || (mapEmbedUrl ? buildExternalMapUrl(mapQuery) : '');

    const shareMapSelection = () => {
        const selected = selectedMapSuggestion;
        const externalUrl = selected?.mapUrl || mapExternalUrl;
        if (!externalUrl) return;

        const header = selected?.label ? `${selected.label}\n` : '';
        const composed = `${header}${externalUrl}`.trim();
        if (typeof inputProps?.setInputText === 'function') {
            inputProps.setInputText(composed);
        }
        setShowMapModal(false);
    };

    const canShareLocation = Boolean(selectedMapSuggestion?.mapUrl || mapExternalUrl);

    return (
        <div
            className={`chat-window drop-zone ${isDragOver ? 'drag-over' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            {/* Chat Header */}
            <div className="chat-header chat-header-pro" onClick={() => setShowClientProfile(v => !v)}>
                <div
                    className="chat-header-avatar chat-header-avatar--module"
                    style={{
                        background: headerAvatarImageUrl
                            ? `url(${headerAvatarImageUrl}) center/cover`
                            : avatarColor(headerModuleName || activeChatDetails?.name),
                    }}
                >
                    {!headerAvatarImageUrl && headerAvatarFallback}
                    <span
                        className={`chat-header-avatar-channel chat-header-avatar-channel--${headerChannelMarker.key}`}
                        title={headerChannelMarker.label}
                    >
                        <ChannelBrandIcon
                            channelType={headerChannelMarker.key}
                            className="chat-header-avatar-channel-icon"
                            size={10}
                            title={headerChannelMarker.label}
                        />
                    </span>
                </div>
                <div className="chat-header-meta">
                    <div className="chat-header-title-row chat-header-title-row--clean">
                        <h3 className="chat-header-name">{headerDisplayName}</h3>
                        {activeChatDetails?.isBusiness && <span className="chat-header-pill">Business</span>}
                        {showHeaderModule && (
                            <span className="chat-header-module-pill" title={headerModuleName || 'Modulo'}>
                                {headerModuleImageUrl
                                    ? <img src={headerModuleImageUrl} alt={headerModuleName || 'Modulo'} className="chat-header-module-avatar" />
                                    : <span className="chat-header-module-dot" aria-hidden="true" />}
                                <span className="chat-header-module-name">{headerModuleName || 'MODULO'}</span>
                                {headerModuleChannel && (
                                    <span className="chat-header-module-channel" title={headerModuleChannel}>
                                        <ChannelBrandIcon
                                            channelType={headerModuleChannelType}
                                            className="chat-header-module-channel-icon"
                                            size={10}
                                            title={headerModuleChannel}
                                        />
                                    </span>
                                )}
                            </span>
                        )}
                    </div>
                    <div className="chat-header-subline">
                        {headerMetaItems.map((item, idx) => (
                            <React.Fragment key={`${item}_${idx}`}>
                                <span className={idx === 0 ? 'chat-header-primary' : 'chat-header-secondary'}>{item}</span>
                                {idx < headerMetaItems.length - 1 && <span className="chat-header-dot">|</span>}
                            </React.Fragment>
                        ))}
                    </div>
                    {!!activeChatDetails?.labels?.length && (
                        <div className="chat-header-labels">
                            {activeChatDetails.labels.slice(0, 3).map((l, i) => (
                                <span
                                    key={i}
                                    className="chat-header-label-chip"
                                    style={{ '--label-color': l.color || '#7a8f9a' }}
                                >
                                    {l.name}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <div className="chat-header-actions" onClick={e => e.stopPropagation()}>
                    <button className={`btn-icon ui-icon-btn chat-header-action-btn ${searchVisible ? 'active' : ''}`}
                        onClick={() => setSearchVisible(v => !v)} title="Buscar en chat">
                        <Search size={20} />
                    </button>
                    <button className={`btn-icon ui-icon-btn chat-header-action-btn ${showMapModal ? 'active' : ''}`}
                        onClick={() => openMapModal({ query: '' })}
                        title="Abrir mapa">
                        <MapPin size={20} />
                    </button>
                    <div className="chat-header-menu-wrap">
                        <button className={`btn-icon ui-icon-btn chat-header-action-btn ${showLabelMenu ? 'active' : ''}`}
                            onClick={() => setShowLabelMenu(v => !v)} title="Etiquetas">
                            <Tag size={20} />
                        </button>
                        {showLabelMenu && (
                            <div className="chat-header-popover chat-header-label-popover">
                                <div className="chat-header-popover-title">Etiquetas del tenant (CRM)</div>
                                {labelDefinitions.length === 0 && <div className="chat-header-popover-empty">No hay etiquetas disponibles.</div>}
                                {labelDefinitions.map((label) => {
                                    const labelId = String(label?.id || label?.labelId || '').trim();
                                    const isActive = (activeChatDetails?.labels || []).some((l) => String(l?.id || l?.labelId || '').trim() === labelId);
                                    return (
                                        <label key={labelId || label.name} className="chat-header-label-option">
                                            <input type="checkbox" checked={isActive} onChange={() => onToggleChatLabel?.(activeChatDetails?.id, labelId)} />
                                            <span className="chat-header-label-color" style={{ background: label.color || '#8696a0' }} />
                                            <span className="chat-header-label-name">{label.name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <div className="chat-header-menu-wrap">
                        <button className="btn-icon ui-icon-btn chat-header-action-btn"
                            onClick={() => setShowMenu(v => !v)} title="Mas opciones">
                            <MoreVertical size={20} />
                        </button>
                        {showMenu && (
                            <div className="chat-header-popover chat-header-actions-popover">
                                {[
                                    { label: 'Ver perfil del contacto', action: () => setShowClientProfile(true) },
                                    { label: 'Buscar mensajes', action: () => setSearchVisible(true) },
                                    {
                                        label: activeChatDetails?.pinned ? 'Desfijar chat' : 'Fijar chat',
                                        action: () => onToggleChatPinned?.(activeChatDetails?.id, !Boolean(activeChatDetails?.pinned))
                                    },
                                    { label: 'Modo Copiloto IA', action: () => setIsCopilotMode(v => !v) },
                                ].map((item, i) => (
                                    <div key={i}
                                        onClick={() => { item.action(); setShowMenu(false); }}
                                        className="chat-header-action-item"
                                    >
                                        {item.label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* In-chat Search Bar */}
            {searchVisible && (
                <div className="chat-searchbar">
                    <Search size={16} color="#8696a0" />
                    <input
                        autoFocus
                        type="text"
                        placeholder="Buscar en esta conversacion..."
                        value={chatSearch}
                        onChange={e => setChatSearch(e.target.value)}
                        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                    />
                    {matchIndexes.length > 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#9db0ba' }}>{activeMatchIdx + 1}/{matchIndexes.length}</span>
                    )}
                    <button disabled={matchIndexes.length === 0} onClick={() => {
                        if (!matchIndexes.length) return;
                        const next = (activeMatchIdx - 1 + matchIndexes.length) % matchIndexes.length;
                        setActiveMatchIdx(next);
                        jumpToMatch(next);
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: matchIndexes.length ? 1 : 0.4 }}><ChevronUp size={16} color="#8696a0" /></button>
                    <button disabled={matchIndexes.length === 0} onClick={() => {
                        if (!matchIndexes.length) return;
                        const next = (activeMatchIdx + 1) % matchIndexes.length;
                        setActiveMatchIdx(next);
                        jumpToMatch(next);
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: matchIndexes.length ? 1 : 0.4 }}><ChevronDown size={16} color="#8696a0" /></button>
                    <button onClick={() => { setSearchVisible(false); setChatSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                        <X size={16} color="#8696a0" />
                    </button>
                </div>
            )}

            {/* Messages Area */}
            <div className="chat-messages" onClick={() => { setShowMenu(false); setShowLabelMenu(false); }}>
                {messages.length === 0 && (
                    <div className="chat-empty-state-pill">
                        No hay mensajes en esta conversacion.
                    </div>
                )}
                {messages.map((msg, idx) => {
                    const currentDay = moment.unix(msg.timestamp || 0).format('YYYY-MM-DD');
                    const prevDay = idx > 0 ? moment.unix(messages[idx - 1].timestamp || 0).format('YYYY-MM-DD') : null;
                    const showDay = idx === 0 || currentDay !== prevDay;
                    const matchIdx = matchIndexes.indexOf(idx);
                    const isHighlighted = matchIdx !== -1;
                    const isCurrentHighlighted = isHighlighted && matchIdx === activeMatchIdx;
                    const messageKey = msg.id || `idx_${idx}`;
                    const senderDisplayName = resolveGroupSenderName(msg);
                    return (
                        <React.Fragment key={messageKey}>
                            {showDay && (
                                <div className="chat-day-separator">
                                    {formatDayLabel(msg.timestamp)}
                                </div>
                            )}
                            <div ref={(el) => { if (el) messageRefs.current[messageKey] = el; }}>
                                <MessageBubble
                                    msg={msg}
                                    isHighlighted={isHighlighted}
                                    isCurrentHighlighted={isCurrentHighlighted}
                                    onPrefillMessage={(text) => inputProps?.setInputText && inputProps.setInputText(text)}
                                    onLoadOrderToCart={inputProps?.onLoadOrderToCart}
                                    onOpenMedia={setLightboxMedia}
                                    onOpenMap={openMapModal}
                                    onOpenPhoneChat={inputProps?.onStartNewChat}
                                    onEditMessage={onEditMessage}
                                    onReplyMessage={onReplyMessage}
                                    onForwardMessage={onForwardMessage}
                                    onDeleteMessage={onDeleteMessage}
                                    forwardChatOptions={forwardChatOptions}
                                    activeChatId={activeChatDetails?.id}
                                    showSenderName={Boolean(activeChatDetails?.isGroup && !msg?.fromMe)}
                                    senderDisplayName={senderDisplayName}
                                    canEditMessages={canEditMessages}
                                    buildApiHeaders={buildApiHeaders}
                                />
                            </div>
                        </React.Fragment>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {lightboxMedia?.src && (
                <div className="chat-lightbox" onClick={() => setLightboxMedia(null)}>
                    <div className="chat-lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <button className="chat-lightbox-close" onClick={() => setLightboxMedia(null)} aria-label="Cerrar vista previa">
                            <X size={20} />
                        </button>
                        <img src={lightboxMedia.src} alt="Vista previa" className="chat-lightbox-image" />
                    </div>
                </div>
            )}

            {showMapModal && (
                <div className="chat-lightbox" onClick={() => setShowMapModal(false)}>
                    <div className="chat-lightbox-content map-lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <button className="chat-lightbox-close" onClick={() => setShowMapModal(false)} aria-label="Cerrar mapa">
                            <X size={20} />
                        </button>

                        <form className="map-search-form" onSubmit={submitMapSearch}>
                            <input
                                className="map-search-input"
                                placeholder="Busca una direccion o pega un link de mapa"
                                value={mapQuery}
                                onChange={(e) => {
                                    setMapQuery(e.target.value);
                                    setSelectedMapSuggestion(null);
                                }}
                            />
                            <button type="submit" className="map-search-btn" disabled={mapResolveLoading}>
                                {mapResolveLoading ? 'Resolviendo...' : 'Buscar'}
                            </button>
                            {mapExternalUrl && (
                                <a
                                    className="map-open-external"
                                    href={mapExternalUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Abrir
                                </a>
                            )}
                            <button
                                type="button"
                                className="map-share-btn"
                                onClick={shareMapSelection}
                                disabled={!canShareLocation}
                                title="Copiar ubicacion al mensaje"
                            >
                                <Share2 size={14} /> Compartir
                            </button>
                        </form>

                        {(mapSuggestionsLoading || mapSuggestions.length > 0) && (
                            <div className="map-suggest-list">
                                {mapSuggestionsLoading && <div className="map-suggest-empty">Buscando lugares...</div>}
                                {!mapSuggestionsLoading && mapSuggestions.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={`map-suggest-item ${selectedMapSuggestion?.id === item.id ? 'active' : ''}`}
                                        onClick={() => selectMapSuggestion(item)}
                                    >
                                        <span className="map-suggest-title">{item.label}</span>
                                        {(item.latitude !== null && item.longitude !== null) && (
                                            <span className="map-suggest-coords">{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        {mapEmbedUrl ? (
                            <iframe
                                title="Mapa"
                                src={mapEmbedUrl}
                                className="map-lightbox-iframe"
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                            />
                        ) : (
                            <div className="map-lightbox-empty">Busca y selecciona un lugar para previsualizarlo.</div>
                        )}
                    </div>
                </div>
            )}

            {/* Input Area */}
            <ChatInput {...inputProps} replyingMessage={inputProps?.replyingMessage} onCancelReplyMessage={inputProps?.onCancelReplyMessage} onOpenMapPicker={() => openMapModal({ query: '' })} buildApiHeaders={buildApiHeaders} />
        </div>
    );
};

export { ChatInput };
export default ChatWindow;







