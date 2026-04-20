import { Check, CheckCheck } from 'lucide-react';
import moment from 'moment';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const CHAT_SCOPE_SEPARATOR = '::mod::';

const normalizePhoneDigits = (value = '') => String(value || '').replace(/\D/g, '');
const normalizeModuleKey = (value = '') => String(value || '').trim().toLowerCase();

const normalizeModuleImageUrl = (rawUrl = '') => {
  const value = String(rawUrl || '').trim();
  if (!value) return null;
  if (value.startsWith('data:') || value.startsWith('blob:')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${API_URL}${value}`;
  return `${API_URL}/${value}`;
};

const parseScopedChatId = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return { baseChatId: '', scopeModuleId: '' };
  const idx = raw.lastIndexOf(CHAT_SCOPE_SEPARATOR);
  if (idx < 0) return { baseChatId: raw, scopeModuleId: '' };
  const baseChatId = String(raw.slice(0, idx) || '').trim();
  const scopeModuleId = normalizeModuleKey(raw.slice(idx + CHAT_SCOPE_SEPARATOR.length));
  if (!baseChatId || !scopeModuleId) return { baseChatId: raw, scopeModuleId: '' };
  return { baseChatId, scopeModuleId };
};

const formatPhone = (value = '') => {
  const digits = normalizePhoneDigits(value);
  return digits ? `+${digits}` : '';
};

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

const useSidebarChatPresentationModel = () => {
  const formatTime = (ts) => {
    if (!Number.isFinite(Number(ts)) || Number(ts) <= 0) return '';
    const m = moment.unix(ts || 0);
    if (!m.isValid()) return '';
    if (m.isSame(moment(), 'day')) return m.format('H:mm');
    if (m.isSame(moment().subtract(1, 'day'), 'day')) return 'Ayer';
    return m.format('DD/MM/YY');
  };

  const renderStatus = (chat) => {
    if (!chat.lastMessageFromMe) return null;
    const color = chat.ack === 3 ? '#53bdeb' : '#8696a0';
    return (
      <span className="chat-last-status-icon">
        {chat.ack >= 2 ? <CheckCheck size={16} color={color} /> : <Check size={16} color="#8696a0" />}
      </span>
    );
  };

  const avatarLetter = (name) => (name ? name.charAt(0).toUpperCase() : '?');

  const avatarColor = (name) => {
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444'];
    if (!name) return colors[0];
    return colors[name.charCodeAt(0) % colors.length];
  };

  const isInternalIdentifier = (value = '') => {
    const text = String(value || '').trim();
    if (!text) return false;
    return text.includes('@') || /^\d{14,}$/.test(text);
  };

  const getDisplayName = (chat) => {
    const rawName = sanitizeDisplayText(chat?.name || '');
    const phone = formatPhone(chat?.phone || chat?.id || '');
    if (rawName && !isInternalIdentifier(rawName)) return rawName;
    if (phone) return phone;
    return 'Sin nombre';
  };

  const isHumanSubtitle = (value = '') => {
    const text = String(value || '').trim();
    if (!text) return false;
    if (text.includes('@')) return false;
    const onlyDigitsAndSymbols = text.replace(/[\d\s+().-]/g, '');
    if (!onlyDigitsAndSymbols && normalizePhoneDigits(text).length >= 10) return false;
    return true;
  };

  const getSubtitle = (chat) => {
    const statusText = sanitizeDisplayText(chat?.status || '');
    const subtitleText = sanitizeDisplayText(chat?.subtitle || '');
    const displayName = getDisplayName(chat);

    const candidates = [statusText, subtitleText]
      .filter((v) => isHumanSubtitle(v) && !isInternalIdentifier(v) && v !== displayName);

    if (candidates.length > 0) {
      return candidates[0];
    }

    return '';
  };

  const getContactMeta = (chat, displayName = '') => {
    const subtitle = getSubtitle(chat);
    if (!subtitle || subtitle === displayName) {
      return { subtitle: '', alias: '', location: '' };
    }

    const parts = String(subtitle)
      .split('•')
      .map((part) => sanitizeDisplayText(part))
      .filter(Boolean);

    if (parts.length <= 1) {
      const onlyPart = parts[0] || '';
      const looksLikeLocation = onlyPart.includes(' - ');
      return {
        subtitle,
        alias: looksLikeLocation ? '' : onlyPart,
        location: looksLikeLocation ? onlyPart : ''
      };
    }

    return {
      subtitle,
      alias: parts[0] || '',
      location: parts.slice(1).join(' • ')
    };
  };

  const getContactHint = (chat, displayName = '') => {
    const { subtitle } = getContactMeta(chat, displayName);
    if (!subtitle || subtitle === displayName) return '';
    return subtitle !== displayName ? subtitle : '';
  };

  const getChannelBadge = (chat, waModules = []) => {
    const parsed = parseScopedChatId(chat?.id || '');
    const chatModuleId = normalizeModuleKey(
      chat?.lastMessageModuleId
      || chat?.scopeModuleId
      || parsed?.scopeModuleId
      || ''
    );
    const rawModuleName = sanitizeDisplayText(chat?.lastMessageModuleName || '');
    const normalizedModuleName = String(rawModuleName || '').trim().toLowerCase();
    const moduleConfig = Array.isArray(waModules)
      ? (
        waModules.find((entry) => normalizeModuleKey(entry?.moduleId || entry?.id || '') === chatModuleId)
        || waModules.find((entry) => normalizedModuleName && String(entry?.name || '').trim().toLowerCase() === normalizedModuleName)
        || null
      )
      : null;

    const resolvedModuleId = normalizeModuleKey(chatModuleId || moduleConfig?.moduleId || moduleConfig?.id || '');
    const moduleName = sanitizeDisplayText(rawModuleName || moduleConfig?.name || '');
    const moduleId = String(resolvedModuleId || '').trim().toUpperCase();
    const channelType = String(chat?.lastMessageChannelType || moduleConfig?.channelType || '').trim().toLowerCase();
    const channelLabel = channelType ? channelType.toUpperCase() : '';
    const sourceRaw = moduleName || moduleId;
    const source = String(sourceRaw || '').replace(/\s*\|\s*(whatsapp|instagram|messenger|facebook|webchat)\s*$/i, '').trim() || sourceRaw;
    const imageUrl = normalizeModuleImageUrl(
      chat?.lastMessageModuleImageUrl
      || moduleConfig?.imageUrl
      || moduleConfig?.logoUrl
      || ''
    );

    const label = source || channelLabel || '';

    if (!label) return null;
    return {
      label,
      imageUrl: imageUrl || null,
      moduleName: moduleName || null,
      moduleId: moduleId || null,
      channelType: channelType || null
    };
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

  return {
    formatTime,
    renderStatus,
    getDisplayName,
    getSubtitle,
    getContactMeta,
    getContactHint,
    getChannelBadge,
    getChannelMarker,
    avatarLetter,
    avatarColor,
    isInternalIdentifier,
    isHumanSubtitle
  };
};

export default useSidebarChatPresentationModel;
