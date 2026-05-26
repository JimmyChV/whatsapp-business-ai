import { ChevronDown, ChevronUp } from 'lucide-react';

export default function BusinessQuotesTabSection({
    quoteHistory = [],
    quoteHistoryExpanded = true,
    setQuoteHistoryExpanded,
    onLoadQuoteToCart,
    onStartNewQuote,
    quoteOptionsModeActive = false,
    formatMoney,
    canWriteByAssignment = false
}) {
    const tone = {
        successSurface: 'var(--chat-success-surface)',
        successBorder: 'var(--chat-success-border)',
        successText: 'var(--chat-success-text)',
        cardSurface: 'var(--chat-card-surface)',
        cardSurfaceAlt: 'var(--chat-card-surface-alt)',
        controlBorder: 'var(--chat-control-border)',
        textMuted: 'var(--chat-control-text-soft)',
        textSoft: 'var(--chat-control-text)'
    };

    const normalizeStatus = (status) => {
        const value = String(status || 'sent').trim().toLowerCase();
        if (['accepted', 'accepted_by_client', 'chosen', 'elegida', 'won'].includes(value)) return 'accepted';
        if (['rejected', 'rechazada', 'lost', 'cancelled', 'canceled'].includes(value)) return 'rejected';
        if (['not_chosen', 'not-selected', 'not_selected', 'no_elegida', 'discarded'].includes(value)) return 'not_chosen';
        return 'sent';
    };

    const statusMeta = {
        sent: { label: 'Enviada', background: 'var(--chat-control-surface-strong)', border: tone.controlBorder, color: tone.textSoft },
        accepted: { label: 'Aceptada', background: tone.successSurface, border: tone.successBorder, color: tone.successText },
        rejected: { label: 'Rechazada', background: 'var(--chat-danger-soft)', border: 'var(--chat-danger-border)', color: 'var(--chat-danger-text)' },
        not_chosen: { label: 'No elegida', background: 'var(--chat-control-surface)', border: tone.controlBorder, color: tone.textMuted }
    };

    const formatQuoteDate = (value) => {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString('es-PE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    };

    const getQuoteDateValue = (quote = {}) => quote?.sentAt || quote?.sent_at || quote?.updatedAt || quote?.updated_at || quote?.createdAt || quote?.created_at || null;
    const quoteHistoryGroups = Array.isArray(quoteHistory)
        ? quoteHistory.reduce((groups, quote) => {
            const isOptionMode = Boolean(quote?.isOptionMode ?? quote?.is_option_mode ?? false);
            if (!isOptionMode) {
                groups.push({ type: 'single', key: `quote_${quote?.quoteId || groups.length}`, quotes: [quote] });
                return groups;
            }
            const dateValue = getQuoteDateValue(quote);
            const date = dateValue ? new Date(dateValue) : null;
            const dateKey = date && !Number.isNaN(date.getTime())
                ? date.toISOString().slice(0, 10)
                : 'sin-fecha';
            const groupId = String(quote?.optionGroupId || quote?.option_group_id || dateKey || 'options').trim() || 'options';
            const key = `options_${groupId}`;
            let group = groups.find((entry) => entry.key === key);
            if (!group) {
                group = { type: 'options', key, dateValue, quotes: [] };
                groups.push(group);
            }
            group.quotes.push(quote);
            return groups;
        }, [])
        : [];

    const renderQuoteCard = (quote, { compact = false } = {}) => {
        const quoteNumber = Number(quote?.quoteNumber || quote?.quote_number || 0) || null;
        const revisionNumber = Number(quote?.revisionNumber || quote?.revision_number || 1) || 1;
        const optionNumber = Number(quote?.optionNumber || quote?.option_number || 0) || null;
        const isOptionMode = Boolean(quote?.isOptionMode ?? quote?.is_option_mode ?? false);
        const summary = quote?.summaryJson && typeof quote.summaryJson === 'object' ? quote.summaryJson : {};
        const items = Array.isArray(quote?.itemsJson) ? quote.itemsJson : [];
        const itemCount = Number(summary?.itemCount || summary?.itemsCount || items.length || 0) || 0;
        const total = Number(summary?.totalPayable ?? summary?.total ?? 0) || 0;
        const statusKey = normalizeStatus(quote?.status);
        const badge = statusMeta[statusKey] || statusMeta.sent;
        const dateLabel = formatQuoteDate(getQuoteDateValue(quote));
        const title = isOptionMode
            ? `Opción ${optionNumber || ''}`.trim()
            : `Cotizacion ${quoteNumber || ''}${revisionNumber > 1 ? ` (Rev. ${revisionNumber})` : ''}`.trim();

        return (
            <div key={quote.quoteId} style={{ border: `1px solid ${tone.controlBorder}`, borderRadius: '9px', padding: compact ? '8px' : '9px', background: tone.cardSurfaceAlt, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px', alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 900, color: 'var(--text-primary)', fontSize: compact ? '0.76rem' : '0.8rem' }}>
                            {(isOptionMode ? `Opcion ${optionNumber || ''}`.trim() : title) || 'Cotizacion'}
                        </span>
                        <span style={{ background: badge.background, border: `1px solid ${badge.border}`, color: badge.color, borderRadius: '999px', padding: '2px 7px', fontSize: '0.66rem', fontWeight: 800 }}>
                            {badge.label}
                        </span>
                    </div>
                    <div style={{ color: tone.textMuted, fontSize: '0.72rem', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span>Productos: {itemCount} items</span>
                        <span>Total: {total > 0 ? `S/ ${formatMoney(total)}` : 'Sin total'}</span>
                        <span>Fecha: {dateLabel}</span>
                    </div>
                </div>
                {!quoteOptionsModeActive && (
                    <button
                        type="button"
                        disabled={!canWriteByAssignment}
                        onClick={() => typeof onLoadQuoteToCart === 'function' && onLoadQuoteToCart(quote)}
                        style={{ border: `1px solid ${tone.successBorder}`, color: tone.successText, background: tone.successSurface, borderRadius: '999px', padding: '5px 9px', fontWeight: 800, fontSize: '0.72rem', cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', opacity: canWriteByAssignment ? 1 : 0.65, whiteSpace: 'nowrap' }}
                    >
                        Cargar en carrito
                    </button>
                )}
            </div>
        );
    };

    return (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ flex: 1, minHeight: 0, background: tone.cardSurface, border: `1px solid ${tone.controlBorder}`, borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <button
                    type="button"
                    onClick={() => typeof setQuoteHistoryExpanded === 'function' && setQuoteHistoryExpanded((prev) => !prev)}
                    style={{ width: '100%', padding: '9px 10px', background: tone.cardSurfaceAlt, border: 'none', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontWeight: 800, fontSize: '0.82rem' }}
                >
                    <span>Cotizaciones</span>
                    {quoteHistoryExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {quoteHistoryExpanded && (
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '7px', padding: '8px' }}>
                        {quoteHistoryGroups.length === 0 ? (
                            <div style={{ color: tone.textMuted, background: tone.cardSurfaceAlt, border: `1px dashed ${tone.controlBorder}`, borderRadius: '9px', padding: '12px', fontSize: '0.76rem', lineHeight: 1.45, textAlign: 'center' }}>
                                Aun no hay cotizaciones enviadas en este chat.
                            </div>
                        ) : quoteHistoryGroups.map((group) => {
                            if (group.type === 'options') {
                                const dateLabel = formatQuoteDate(group.dateValue).split(' ')[0] || '-';
                                const sortedOptions = group.quotes.slice().sort((a, b) => {
                                    const aOption = Number(a?.optionNumber || a?.option_number || a?.quoteNumber || 0) || 0;
                                    const bOption = Number(b?.optionNumber || b?.option_number || b?.quoteNumber || 0) || 0;
                                    return aOption - bOption;
                                });
                                return (
                                    <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ color: tone.textMuted, fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '3px 2px' }}>
                                            -- Opciones enviadas {dateLabel} --
                                        </div>
                                        {sortedOptions.map((quote) => renderQuoteCard(quote, { compact: true }))}
                                    </div>
                                );
                            }
                            return group.quotes.map((quote) => renderQuoteCard(quote));
                        })}
                        {!quoteOptionsModeActive && (
                            <button
                                type="button"
                                disabled={!canWriteByAssignment}
                                onClick={() => typeof onStartNewQuote === 'function' && onStartNewQuote()}
                                style={{ width: '100%', border: `1px dashed ${tone.successBorder}`, background: 'transparent', color: tone.successText, borderRadius: '8px', padding: '8px 10px', fontWeight: 800, cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', opacity: canWriteByAssignment ? 1 : 0.65 }}
                            >
                                + Nueva cotizacion
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
