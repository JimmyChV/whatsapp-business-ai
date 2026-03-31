import React from 'react';

function resolveAssignmentVisual(assignment = null, isAssignedToMe = false, compact = false) {
  const hasAssignee = Boolean(String(assignment?.assigneeUserId || '').trim());
  const assigneeName = String(
    assignment?.assigneeName
    || assignment?.assigneeDisplayName
    || assignment?.metadata?.assigneeName
    || assignment?.assigneeUserId
    || ''
  ).trim();
  const status = String(assignment?.status || '').trim().toLowerCase();

  if (!hasAssignee || status === 'released') {
    return {
      tone: 'unassigned',
      label: compact ? 'Libre' : 'Sin asignar'
    };
  }

  if (status === 'en_espera') {
    return {
      tone: 'waiting',
      label: compact ? 'Espera' : 'En espera'
    };
  }

  if (isAssignedToMe) {
    return {
      tone: 'mine',
      label: compact ? 'Mio' : 'Asignado a ti'
    };
  }

  return {
    tone: 'assigned',
    label: compact ? 'Asignado' : (assigneeName ? `Asignado: ${assigneeName}` : 'Asignado')
  };
}

export default function AssignmentBadge({
  assignment = null,
  isAssignedToMe = false,
  compact = false,
  className = ''
}) {
  const { tone, label } = resolveAssignmentVisual(assignment, isAssignedToMe, compact);
  return (
    <span
      className={`assignment-badge assignment-badge--${tone}${compact ? ' assignment-badge--compact' : ''}${className ? ` ${className}` : ''}`}
      title={label}
    >
      {label}
    </span>
  );
}
