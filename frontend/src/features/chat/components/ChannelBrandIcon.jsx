import React from 'react';
import { Globe2, MessageCircle } from 'lucide-react';
import { siFacebook, siInstagram, siMessenger, siWhatsapp } from 'simple-icons';

const BRAND_ICONS = {
    whatsapp: siWhatsapp,
    instagram: siInstagram,
    messenger: siMessenger,
    facebook: siFacebook
};

const normalizeChannelType = (value = '') => {
    const clean = String(value || '').trim().toLowerCase();
    if (!clean) return 'generic';
    if (['wa', 'wsp', 'whatsapp'].includes(clean)) return 'whatsapp';
    if (['ig', 'instagram', 'instagram_dm'].includes(clean)) return 'instagram';
    if (['messenger', 'facebook_messenger', 'facebookmessenger', 'fb_messenger'].includes(clean)) return 'messenger';
    if (['facebook', 'fb'].includes(clean)) return 'facebook';
    if (['webchat', 'web', 'site', 'widget'].includes(clean)) return 'webchat';
    return 'generic';
};

const ChannelBrandIcon = ({
    channelType = '',
    className = '',
    size = 12,
    title = '',
    decorative = true
}) => {
    const channelKey = normalizeChannelType(channelType);
    const icon = BRAND_ICONS[channelKey] || null;

    if (channelKey === 'webchat') {
        return (
            <Globe2
                size={size}
                className={className}
                title={title || undefined}
                aria-hidden={decorative}
                aria-label={decorative ? undefined : (title || 'Canal web')}
            />
        );
    }

    if (!icon) {
        return (
            <MessageCircle
                size={size}
                className={className}
                title={title || undefined}
                aria-hidden={decorative}
                aria-label={decorative ? undefined : (title || 'Canal')}
            />
        );
    }

    return (
        <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            className={className}
            role={decorative ? 'presentation' : 'img'}
            aria-hidden={decorative}
            aria-label={decorative ? undefined : (title || icon.title)}
        >
            <path fill="currentColor" d={icon.path} />
        </svg>
    );
};

export default ChannelBrandIcon;
