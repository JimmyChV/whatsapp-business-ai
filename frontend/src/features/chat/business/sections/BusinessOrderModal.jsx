import React, { useMemo } from 'react';

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

const toNumber = (value = 0) => {
    const cleaned = String(value ?? '')
        .replace(/[^0-9,.-]/g, '')
        .replace(',', '.');
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
};

const inputStyle = {
    width: '100%',
    border: `1px solid ${tone.controlBorder}`,
    borderRadius: '9px',
    padding: '8px 10px',
    background: 'var(--chat-control-surface)',
    color: 'var(--text-primary)',
    fontSize: '0.84rem',
    boxSizing: 'border-box'
};

const labelStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    color: tone.textSoft,
    fontSize: '0.72rem',
    fontWeight: 800
};

const getItemName = (item = {}) => String(item.productName || item.product_name || item.name || item.title || item.description || 'Producto').trim();

export default function BusinessOrderModal({
    draft = null,
    saving = false,
    onChange,
    onClose,
    onSubmit,
    formatMoney
}) {
    const money = typeof formatMoney === 'function'
        ? formatMoney
        : ((value) => Number(value || 0).toFixed(1));
    const items = Array.isArray(draft?.items) ? draft.items : [];
    const sourceType = String(draft?.sourceType || draft?.mode || 'manual').trim().toLowerCase();
    const isManual = sourceType === 'manual';
    const isCatalog = sourceType === 'catalog';
    const readOnlyItems = sourceType === 'quote';

    const totals = useMemo(() => {
        const subtotal = items.reduce((sum, item) => {
            const quantity = Math.max(0, toNumber(item.quantity ?? item.qty ?? 1));
            const unitPrice = Math.max(0, toNumber(item.unitPrice ?? item.unit_price ?? item.price ?? 0));
            return sum + (quantity * unitPrice);
        }, 0);
        const delivery = Math.max(0, toNumber(draft?.deliveryAmount));
        const discount = Math.max(0, toNumber(draft?.discountAmount));
        return {
            subtotal,
            delivery,
            discount,
            total: Math.max(0, subtotal + delivery - discount)
        };
    }, [draft?.deliveryAmount, draft?.discountAmount, items]);

    if (!draft) return null;

    const patchDraft = (patch) => {
        if (typeof onChange !== 'function') return;
        onChange({ ...draft, ...patch });
    };

    const updateItem = (index, patch) => {
        const nextItems = items.map((item, itemIndex) => (
            itemIndex === index ? { ...item, ...patch } : item
        ));
        patchDraft({ items: nextItems });
    };

    const title = sourceType === 'quote'
        ? 'Crear pedido desde cotizacion'
        : sourceType === 'catalog'
            ? 'Cliente acepto producto'
            : 'Nuevo pedido manual';

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15,23,42,0.46)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px' }}>
            <div style={{ width: 'min(520px, 100%)', maxHeight: '92vh', overflow: 'hidden', background: tone.cardSurface, border: `1px solid ${tone.controlBorder}`, borderRadius: '16px', boxShadow: '0 24px 80px rgba(15,23,42,0.28)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '16px 18px', borderBottom: `1px solid ${tone.controlBorder}`, background: tone.cardSurfaceAlt, display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem' }}>{title}</h3>
                        <p style={{ margin: '4px 0 0', color: tone.textMuted, fontSize: '0.76rem' }}>
                            Revisa monto, delivery y descuento antes de registrar.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        style={{ border: `1px solid ${tone.controlBorder}`, background: 'var(--chat-control-surface)', color: tone.textSoft, borderRadius: '999px', width: 34, height: 34, cursor: saving ? 'not-allowed' : 'pointer' }}
                    >
                        x
                    </button>
                </div>

                <div style={{ padding: '14px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {isManual ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: '10px' }}>
                            <label style={labelStyle}>
                                Descripcion
                                <input
                                    style={inputStyle}
                                    value={draft.description || ''}
                                    onChange={(event) => {
                                        const description = event.target.value;
                                        patchDraft({
                                            description,
                                            items: [{ ...(items[0] || {}), productName: description, quantity: 1, unitPrice: toNumber(draft.amount) }]
                                        });
                                    }}
                                    placeholder="Pedido del cliente"
                                />
                            </label>
                            <label style={labelStyle}>
                                Monto
                                <input
                                    style={inputStyle}
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={draft.amount ?? ''}
                                    onChange={(event) => {
                                        const amount = event.target.value;
                                        patchDraft({
                                            amount,
                                            items: [{ ...(items[0] || {}), productName: draft.description || 'Pedido manual', quantity: 1, unitPrice: amount }]
                                        });
                                    }}
                                    placeholder="0.00"
                                />
                            </label>
                        </div>
                    ) : (
                        <div style={{ border: `1px solid ${tone.controlBorder}`, background: tone.cardSurfaceAlt, borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ fontSize: '0.72rem', color: tone.textMuted, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Items del pedido
                            </div>
                            {items.map((item, index) => (
                                <div key={`${getItemName(item)}_${index}`} style={{ display: 'grid', gridTemplateColumns: isCatalog ? '1fr 76px 100px' : '1fr auto', gap: '8px', alignItems: 'center' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 900, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {getItemName(item)}
                                        </div>
                                        {readOnlyItems ? (
                                            <div style={{ color: tone.textMuted, fontSize: '0.7rem', marginTop: 2 }}>
                                                Cantidad: {toNumber(item.quantity ?? item.qty ?? 1)} - Unitario: S/ {money(item.unitPrice ?? item.unit_price ?? item.price)}
                                            </div>
                                        ) : null}
                                    </div>
                                    {isCatalog ? (
                                        <>
                                            <input
                                                style={{ ...inputStyle, padding: '7px 8px' }}
                                                type="number"
                                                min="1"
                                                step="1"
                                                value={item.quantity ?? 1}
                                                onChange={(event) => updateItem(index, { quantity: event.target.value })}
                                            />
                                            <input
                                                style={{ ...inputStyle, padding: '7px 8px' }}
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                value={item.unitPrice ?? ''}
                                                onChange={(event) => updateItem(index, { unitPrice: event.target.value })}
                                            />
                                        </>
                                    ) : (
                                        <strong style={{ whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                                            S/ {money((toNumber(item.quantity ?? item.qty ?? 1)) * toNumber(item.unitPrice ?? item.unit_price ?? item.price))}
                                        </strong>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <label style={labelStyle}>
                            Delivery
                            <input
                                style={inputStyle}
                                type="number"
                                min="0"
                                step="0.1"
                                value={draft.deliveryAmount ?? ''}
                                onChange={(event) => patchDraft({ deliveryAmount: event.target.value })}
                                placeholder="0.00"
                            />
                        </label>
                        <label style={labelStyle}>
                            Descuento
                            <input
                                style={inputStyle}
                                type="number"
                                min="0"
                                step="0.1"
                                value={draft.discountAmount ?? ''}
                                onChange={(event) => patchDraft({ discountAmount: event.target.value })}
                                placeholder="0.00"
                            />
                        </label>
                    </div>

                    <label style={labelStyle}>
                        Notas
                        <textarea
                            style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
                            value={draft.notes || ''}
                            onChange={(event) => patchDraft({ notes: event.target.value })}
                            placeholder="Referencia, condiciones, fecha acordada..."
                        />
                    </label>

                    <div style={{ border: `1px solid ${tone.controlBorder}`, background: tone.cardSurfaceAlt, borderRadius: '12px', padding: '11px', display: 'grid', gap: '6px', fontSize: '0.78rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: tone.textSoft }}><span>Subtotal</span><strong>S/ {money(totals.subtotal)}</strong></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: tone.textSoft }}><span>Delivery</span><strong>S/ {money(totals.delivery)}</strong></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: tone.textSoft }}><span>Descuento</span><strong>- S/ {money(totals.discount)}</strong></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)', borderTop: `1px solid ${tone.controlBorder}`, paddingTop: '7px', fontSize: '0.95rem' }}><span>Total</span><strong>S/ {money(totals.total)}</strong></div>
                    </div>
                </div>

                <div style={{ padding: '12px 18px', borderTop: `1px solid ${tone.controlBorder}`, background: tone.cardSurfaceAlt, display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        style={{ border: `1px solid ${tone.controlBorder}`, background: 'transparent', color: tone.textSoft, borderRadius: '999px', padding: '8px 12px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => typeof onSubmit === 'function' && onSubmit({ ...draft, totals })}
                        disabled={saving || totals.total <= 0 || items.length === 0}
                        style={{ border: `1px solid ${tone.successBorder}`, background: tone.successSurface, color: tone.successText, borderRadius: '999px', padding: '8px 14px', fontWeight: 900, cursor: (!saving && totals.total > 0 && items.length > 0) ? 'pointer' : 'not-allowed', opacity: (!saving && totals.total > 0 && items.length > 0) ? 1 : 0.65 }}
                    >
                        {saving ? 'Guardando...' : 'Crear pedido'}
                    </button>
                </div>
            </div>
        </div>
    );
}
