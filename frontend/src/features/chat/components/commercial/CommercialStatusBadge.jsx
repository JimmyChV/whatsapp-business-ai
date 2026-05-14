import React from 'react';

function resolveCommercialStatusVisual(commercialStatus = null) {
  const status = String(commercialStatus?.status || '').trim().toLowerCase();

  if (status === 'en_conversacion') {
    return { tone: 'en-conversacion', label: 'En conv.' };
  }
  if (status === 'cotizado') {
    return { tone: 'cotizado', label: 'Cotizado' };
  }
  if (status === 'aceptado') {
    return { tone: 'aceptado', label: 'Aceptado' };
  }
  if (status === 'programado') {
    return { tone: 'programado', label: 'Programado' };
  }
  if (status === 'atendido') {
    return { tone: 'atendido', label: 'Atendido' };
  }
  if (status === 'vendido') {
    return { tone: 'vendido', label: 'Vendido' };
  }
  if (status === 'perdido') {
    return { tone: 'perdido', label: 'Perdido' };
  }
  if (status === 'expirado') {
    return { tone: 'expirado', label: 'Expirado' };
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
