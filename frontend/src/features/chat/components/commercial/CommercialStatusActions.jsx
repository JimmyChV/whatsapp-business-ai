import React, { useEffect, useMemo, useRef, useState } from 'react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';

const normalizeText = (value = '') => String(value || '').trim();
const normalizeRole = (value = '') => String(value || '').trim().toLowerCase();
const normalizeStatus = (value = '') => String(value || '').trim().toLowerCase();

const MANUAL_STATUS_ROLES = new Set(['seller', 'admin', 'owner', 'superadmin']);

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
          <button
            type="button"
            className={`commercial-status-dropdown-item commercial-status-dropdown-item--sold ${currentStatus === 'vendido' ? 'active' : ''}`}
            onClick={() => runStatusUpdate('vendido')}
            disabled={Boolean(pendingStatus)}
            title="Marcar chat como vendido"
          >
            Marcar vendido
          </button>
          <button
            type="button"
            className={`commercial-status-dropdown-item commercial-status-dropdown-item--lost ${currentStatus === 'perdido' ? 'active' : ''}`}
            onClick={() => runStatusUpdate('perdido')}
            disabled={Boolean(pendingStatus)}
            title="Marcar chat como perdido"
          >
            Marcar perdido
          </button>
        </div>
      )}
    </div>
  );
}
