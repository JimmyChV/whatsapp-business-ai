import React, { useEffect, useMemo, useRef, useState } from 'react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';

const normalizeText = (value = '') => String(value || '').trim();
const normalizeRole = (value = '') => String(value || '').trim().toLowerCase();
const normalizeStatus = (value = '') => String(value || '').trim().toLowerCase();

const MANUAL_STATUS_ROLES = new Set(['seller', 'admin', 'owner', 'superadmin']);
const MANUAL_STATUS_OPTIONS = [
  { value: 'aceptado', label: 'ACEPTADO', color: '#4CAF50' },
  { value: 'programado', label: 'PROGRAMADO', color: '#1565C0' },
  { value: 'atendido', label: 'ATENDIDO', color: '#2E7D32' },
  { value: 'vendido', label: 'VENDIDO', color: '#00A884' },
  { value: 'perdido', label: 'PERDIDO', color: '#FF5C5C' },
  { value: 'expirado', label: 'EXPIRADO', color: '#616161' }
];

export default function CommercialStatusActions({
  chatId = '',
  commercialStatus = null,
  chatCommercialStatusState = null,
  currentUserRole = ''
}) {
  const { confirm } = useUiFeedback();
  const [pendingStatus, setPendingStatus] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const safeChatId = normalizeText(chatId);
  const currentStatus = normalizeStatus(commercialStatus?.status || '');
  const canManage = useMemo(() => MANUAL_STATUS_ROLES.has(normalizeRole(currentUserRole)), [currentUserRole]);
  const setManualCommercialStatus = typeof chatCommercialStatusState?.setManualCommercialStatus === 'function'
    ? chatCommercialStatusState.setManualCommercialStatus
    : null;

  if (!safeChatId || !canManage || !setManualCommercialStatus) return null;

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target)) return;
      setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const runStatusUpdate = async (targetStatus = '') => {
    const safeStatus = normalizeStatus(targetStatus);
    if (!safeStatus || pendingStatus) return;
    if (safeStatus === currentStatus) return;

    if (safeStatus === 'perdido') {
      const ok = await confirm({
        title: 'Marcar como perdido',
        message: 'Esta accion marcara el chat como perdido. Puedes cambiarlo despues si es necesario.',
        confirmText: 'Marcar perdido',
        cancelText: 'Cancelar',
        tone: 'danger'
      });
      if (!ok) return;
    }

    try {
      setPendingStatus(safeStatus);
      await setManualCommercialStatus(safeChatId, safeStatus);
      setOpen(false);
    } finally {
      setPendingStatus('');
    }
  };

  return (
    <div
      ref={rootRef}
      className="commercial-status-actions commercial-status-actions--dropdown"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="commercial-status-dropdown-trigger"
        onClick={() => setOpen((prev) => !prev)}
        disabled={Boolean(pendingStatus)}
        title="Cambiar estado comercial"
      >
        Cambiar estado
      </button>
      {open && (
        <div className="commercial-status-dropdown-menu">
          {MANUAL_STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`commercial-status-dropdown-item ${currentStatus === option.value ? 'active' : ''}`}
              onClick={() => runStatusUpdate(option.value)}
              disabled={Boolean(pendingStatus)}
              title={`Marcar chat como ${option.label.toLowerCase()}`}
            >
              <span
                className="commercial-status-dropdown-dot"
                style={{ backgroundColor: option.color }}
                aria-hidden="true"
              />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
