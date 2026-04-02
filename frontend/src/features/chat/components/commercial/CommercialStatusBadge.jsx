import React from 'react';

function resolveCommercialStatusVisual(commercialStatus = null) {
  const status = String(commercialStatus?.status || '').trim().toLowerCase();

  if (status === 'en_conversacion') {
    return { tone: 'en-conversacion', label: 'En conv.' };
  }
  if (status === 'cotizado') {
    return { tone: 'cotizado', label: 'Cotizado' };
  }
  if (status === 'vendido') {
    return { tone: 'vendido', label: 'Vendido' };
  }
  if (status === 'perdido') {
    return { tone: 'perdido', label: 'Perdido' };
  }

  return { tone: 'nuevo', label: 'Nuevo' };
}

export default function CommercialStatusBadge({
  commercialStatus = null,
  compact = false,
  className = ''
}) {
  const { tone, label } = resolveCommercialStatusVisual(commercialStatus);
  return (
    <span
      className={`commercial-status-badge commercial-status-badge--${tone}${compact ? ' commercial-status-badge--compact' : ''}${className ? ` ${className}` : ''}`}
      title={label}
    >
      {label}
    </span>
  );
}
