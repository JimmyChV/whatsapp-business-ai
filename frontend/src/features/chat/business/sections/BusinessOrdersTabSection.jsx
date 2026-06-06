import React from 'react';
import { RefreshCw } from 'lucide-react';

const STATUS_OPTIONS = [
    { value: 'aceptado', label: 'Aceptado' },
    { value: 'programado', label: 'Programado' },
    { value: 'atendido', label: 'Atendido' },
    { value: 'vendido', label: 'Vendido' },
    { value: 'perdido', label: 'Perdido' },
    { value: 'cancelado', label: 'Cancelado' }
];

const STATUS_META = {
    aceptado: { label: 'Aceptado', background: 'var(--chat-success-surface)', border: 'var(--chat-success-border)', color: 'var(--chat-success-text)' },
    programado: { label: 'Programado', background: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', color: '#2563eb' },
    atendido: { label: 'Atendido', background: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', color: '#15803d' },
    vendido: { label: 'Vendido', background: 'rgba(5,150,105,0.14)', border: 'rgba(5,150,105,0.36)', color: '#047857' },
    perdido: { label: 'Perdido', background: 'var(--chat-danger-soft)', border: 'var(--chat-danger-border)', color: 'var(--chat-danger-text)' },
    cancelado: { label: 'Cancelado', background: 'var(--chat-control-surface-strong)', border: 'var(--chat-control-border)', color: 'var(--chat-control-text-soft)' }
};

const tone = {
    cardSurface: 'var(--chat-card-surface)',
    cardSurfaceAlt: 'var(--chat-card-surface-alt)',
    controlBorder: 'var(--chat-control-border)',
    textMuted: 'var(--chat-control-text-soft)',
    textSoft: 'var(--chat-control-text)',
    successBorder: 'var(--chat-success-border)',
    successSurface: 'var(--chat-success-surface)',
    successText: 'var(--chat-success-text)'
};

const formatOrderDate = (value) => {
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

const getItemName = (item = {}) => String(
    item.product_name
    || item.productName
    || item.name
    || item.title
    || item.description
    || 'Producto'
).trim();

const getItemQty = (item = {}) => {
    const parsed = Number(item.quantity ?? item.qty ?? 1);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const summarizeOrderItems = (items = []) => {
    const safeItems = Array.isArray(items) ? items : [];
    if (safeItems.length === 0) return 'Sin detalle de items';
    const names = safeItems.slice(0, 2).map((item) => `${getItemName(item)} x${getItemQty(item)}`);
    const extra = safeItems.length > 2 ? ` +${safeItems.length - 2}` : '';
    return `${names.join(' - ')}${extra}`;
};

export default function BusinessOrdersTabSection({
    orders = [],
    ordersLoading = false,
    ordersError = '',
    onRefreshOrders,
    onOpenManualOrder,
    onUpdateOrderStatus,
    formatMoney,
    canWriteByAssignment = false
}) {
    const safeOrders = Array.isArray(orders) ? orders : [];
    const money = typeof formatMoney === 'function'
        ? formatMoney
        : ((value) => Number(value || 0).toFixed(1));

    return (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ background: tone.cardSurface, border: `1px solid ${tone.controlBorder}`, borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
                <div style={{ padding: '10px', background: tone.cardSurfaceAlt, borderBottom: `1px solid ${tone.controlBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div>
                        <div style={{ fontWeight: 900, color: 'var(--text-primary)', fontSize: '0.86rem' }}>Pedidos</div>
                        <div style={{ color: tone.textMuted, fontSize: '0.7rem', marginTop: 2 }}>
                            {safeOrders.length} registro{safeOrders.length === 1 ? '' : 's'} del chat
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                            type="button"
                            onClick={() => typeof onRefreshOrders === 'function' && onRefreshOrders()}
                            title="Recargar pedidos"
                            style={{ border: `1px solid ${tone.controlBorder}`, background: 'var(--chat-control-surface)', color: tone.textSoft, borderRadius: '999px', width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        >
                            <RefreshCw size={14} />
                        </button>
                        <button
                            type="button"
                            disabled={!canWriteByAssignment}
                            onClick={() => typeof onOpenManualOrder === 'function' && onOpenManualOrder()}
                            style={{ border: `1px solid ${tone.successBorder}`, background: tone.successSurface, color: tone.successText, borderRadius: '999px', padding: '7px 10px', fontWeight: 900, fontSize: '0.74rem', cursor: canWriteByAssignment ? 'pointer' : 'not-allowed', opacity: canWriteByAssignment ? 1 : 0.65, whiteSpace: 'nowrap' }}
                        >
                            + Nuevo pedido
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {ordersError ? (
                        <div style={{ border: '1px solid var(--chat-danger-border)', background: 'var(--chat-danger-soft)', color: 'var(--chat-danger-text)', borderRadius: '9px', padding: '10px', fontSize: '0.76rem' }}>
                            {ordersError}
                        </div>
                    ) : null}

                    {ordersLoading ? (
                        <div style={{ color: tone.textMuted, background: tone.cardSurfaceAlt, border: `1px dashed ${tone.controlBorder}`, borderRadius: '9px', padding: '12px', fontSize: '0.76rem', textAlign: 'center' }}>
                            Cargando pedidos...
                        </div>
                    ) : safeOrders.length === 0 ? (
                        <div style={{ color: tone.textMuted, background: tone.cardSurfaceAlt, border: `1px dashed ${tone.controlBorder}`, borderRadius: '9px', padding: '12px', fontSize: '0.76rem', lineHeight: 1.45, textAlign: 'center' }}>
                            Aun no hay pedidos registrados en este chat.
                        </div>
                    ) : safeOrders.map((order) => {
                        const status = String(order?.status || 'aceptado').trim().toLowerCase();
                        const statusMeta = STATUS_META[status] || STATUS_META.aceptado;
                        return (
                            <div key={order.orderId} style={{ border: `1px solid ${tone.controlBorder}`, borderRadius: '10px', background: tone.cardSurfaceAlt, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 900, fontSize: '0.82rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            Pedido {String(order.orderId || '').slice(-6)}
                                        </div>
                                        <div style={{ color: tone.textMuted, fontSize: '0.68rem', marginTop: 3 }}>
                                            {formatOrderDate(order.createdAt)}
                                        </div>
                                    </div>
                                    <span style={{ background: statusMeta.background, border: `1px solid ${statusMeta.border}`, color: statusMeta.color, borderRadius: '999px', padding: '3px 8px', fontSize: '0.66rem', fontWeight: 900, whiteSpace: 'nowrap' }}>
                                        {statusMeta.label}
                                    </span>
                                </div>

                                <div style={{ color: tone.textSoft, fontSize: '0.76rem', lineHeight: 1.35 }}>
                                    {summarizeOrderItems(order.items)}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                                    <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                                        S/ {money(order.totalAmount)}
                                    </strong>
                                    <select
                                        value={status}
                                        disabled={!canWriteByAssignment}
                                        onChange={(event) => typeof onUpdateOrderStatus === 'function' && onUpdateOrderStatus(order, event.target.value)}
                                        style={{ minWidth: 132, border: `1px solid ${tone.controlBorder}`, borderRadius: '999px', padding: '6px 8px', background: 'var(--chat-control-surface)', color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.72rem', cursor: canWriteByAssignment ? 'pointer' : 'not-allowed' }}
                                    >
                                        {STATUS_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {order.notes ? (
                                    <div style={{ color: tone.textMuted, fontSize: '0.68rem', lineHeight: 1.35 }}>
                                        Nota: {order.notes}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
