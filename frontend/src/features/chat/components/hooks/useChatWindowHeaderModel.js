import moment from 'moment';
import { normalizeModuleImageUrl } from '../../core/helpers/appChat.helpers';

const useChatWindowHeaderModel = ({
  activeChat = null,
  waModules = []
} = {}) => {
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

  const headerPhone = formatHeaderPhone(activeChat?.phone);
  const headerParticipantsCount = Number(
    activeChat?.participants
    || activeChat?.chatState?.participantsCount
    || (Array.isArray(activeChat?.participantsList) ? activeChat.participantsList.length : 0)
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
  const rawHeaderName = String(activeChat?.name || '').trim();
  const rawHeaderPushname = String(activeChat?.pushname || '').trim();
  const cleanHeaderPushname = isPhoneLikeHeaderValue(rawHeaderPushname) ? '' : rawHeaderPushname;
  const headerDisplayName = (!activeChat?.isGroup && cleanHeaderPushname && (isPhoneLikeHeaderValue(rawHeaderName) || !rawHeaderName))
    ? cleanHeaderPushname
    : (rawHeaderName || headerPhone || rawHeaderPushname || 'Sin nombre');
  const rawHeaderSubtitle = String(activeChat?.subtitle || '').trim();
  const headerSubtitleParts = rawHeaderSubtitle
    .split('•')
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  const headerAlias = headerSubtitleParts.find((part) => !part.includes(' - ')) || '';
  const headerLocation = headerSubtitleParts.find((part) => part.includes(' - ')) || '';
  const headerMetaItems = [];
  if (activeChat?.isGroup) {
    if (headerParticipantsCount > 0) {
      headerMetaItems.push(`${headerParticipantsCount} participantes`);
    }
  } else {
    if (headerLocation) {
      headerMetaItems.push(headerLocation);
    }
    const cleanHeaderAlias = String(headerAlias || cleanHeaderPushname || '').trim();
    if (cleanHeaderAlias && !sameHeaderIdentity(cleanHeaderAlias, headerDisplayName) && !sameHeaderIdentity(cleanHeaderAlias, headerPhone)) {
      headerMetaItems.push(cleanHeaderAlias);
    }
  }
  if (headerMetaItems.length === 0) {
    headerMetaItems.push(activeChat?.isGroup ? 'Grupo' : 'Perfil del contacto');
  }
  const normalizeModuleKey = (value = '') => String(value || '').trim().toLowerCase();
  const headerModuleId = String(activeChat?.scopeModuleId || activeChat?.lastMessageModuleId || '').trim().toUpperCase();
  const normalizedHeaderModuleId = normalizeModuleKey(activeChat?.scopeModuleId || activeChat?.lastMessageModuleId || '');
  const headerRawModuleName = String(activeChat?.lastMessageModuleName || '').trim();
  const normalizedHeaderModuleName = String(headerRawModuleName || '').trim().toLowerCase();
  const modulePool = Array.isArray(waModules) ? waModules : [];
  const headerModuleConfig = modulePool.find((moduleEntry) => normalizeModuleKey(moduleEntry?.moduleId || moduleEntry?.id || '') === normalizedHeaderModuleId)
    || modulePool.find((moduleEntry) => normalizedHeaderModuleName && String(moduleEntry?.name || '').trim().toLowerCase() === normalizedHeaderModuleName)
    || null;
  const headerModuleName = headerRawModuleName || String(headerModuleConfig?.name || '').trim() || headerModuleId;
  const headerModuleChannelType = String(activeChat?.lastMessageChannelType || headerModuleConfig?.channelType || '').trim().toLowerCase();
  const headerModuleChannel = headerModuleChannelType ? headerModuleChannelType.toUpperCase() : '';
  const headerModuleImageUrl = normalizeModuleImageUrl(
    activeChat?.lastMessageModuleImageUrl
    || headerModuleConfig?.imageUrl
    || headerModuleConfig?.logoUrl
    || ''
  );
  const showHeaderModule = Boolean(headerModuleName || headerModuleChannel);
  const headerChannelMarker = getChannelMarker(headerModuleChannelType);
  const headerAvatarImageUrl = headerModuleImageUrl || null;
  const headerAvatarFallback = headerChannelMarker.short || (headerModuleName ? String(headerModuleName).charAt(0).toUpperCase() : (activeChat?.name?.charAt(0)?.toUpperCase() || '?'));
  const normalizeSenderDigits = (value = '') => String(value || '').replace(/\D/g, '');
  const participantRecords = Array.isArray(activeChat?.participantsList) ? activeChat.participantsList : [];
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
    if (!activeChat?.isGroup || msg?.fromMe) return '';

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

  return {
    avatarColor,
    getChannelMarker,
    formatHeaderPhone,
    normalizeHeaderText,
    normalizeHeaderDigits,
    isPhoneLikeHeaderValue,
    sameHeaderIdentity,
    normalizeSenderDigits,
    isHumanSenderLabel,
    resolveGroupSenderName,
    formatDayLabel,
    headerPhone,
    headerParticipantsCount,
    rawHeaderName,
    rawHeaderPushname,
    cleanHeaderPushname,
    headerDisplayName,
    rawHeaderSubtitle,
    headerAlias,
    headerLocation,
    headerMetaItems,
    headerModuleId,
    normalizedHeaderModuleId,
    headerRawModuleName,
    normalizedHeaderModuleName,
    modulePool,
    headerModuleConfig,
    headerModuleName,
    headerModuleChannelType,
    headerModuleChannel,
    headerModuleImageUrl,
    showHeaderModule,
    headerChannelMarker,
    headerAvatarImageUrl,
    headerAvatarFallback,
    participantRecords,
    participantNameById,
    participantNameByPhone
  };
};

export default useChatWindowHeaderModel;
