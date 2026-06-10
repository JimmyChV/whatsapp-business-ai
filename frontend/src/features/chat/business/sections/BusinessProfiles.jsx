import React from 'react';
import { ChevronRight, Sparkles, X } from 'lucide-react';
import {
    avatarColorForName,
    firstValue,
    formatBoolValue,
    formatPhoneForDisplay,
    formatTimestampValue,
    isLikelyPhoneDigits,
    looksLikeInternalId,
    normalizeDigits,
    sanitizeProfileText
} from '../helpers';

export const ClientProfilePanel = ({ contact, chats = [], onClose, onQuickAiAction, panelRef }) => {
    if (!contact) return null;

    const toProfileText = (value = '') => String(value ?? '').trim();
    const toTitleCaseProfileText = (value = '') => toProfileText(value)
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    const firstProfileValue = (...values) => {
        for (const value of values) {
            const text = toProfileText(value);
            if (text && text !== '--') return text;
        }
        return '--';
    };
    const formatProfileMoney = (value = null) => {
        if (value === null || value === undefined || value === '') return '--';
        const parsed = Number(String(value).replace(',', '.'));
        if (!Number.isFinite(parsed)) return '--';
        return `S/ ${parsed.toFixed(1)}`;
    };
    const formatProfileNumber = (value = null) => {
        if (value === null || value === undefined || value === '') return '--';
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return '--';
        return String(parsed);
    };
    const formatProfileDate = (value = '') => {
        const raw = toProfileText(value);
        if (!raw) return '--';
        const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) return raw;
        return date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    const marketingOptInLabel = (value = '') => {
        const status = toProfileText(value).toLowerCase();
        if (['opted_in', 'yes', 'si', 'true', '1', 'autorizado'].includes(status)) return 'Si';
        if (['opted_out', 'no', 'false', '0', 'rechazado'].includes(status)) return 'No';
        if (['pending', 'unknown'].includes(status)) return 'Pendiente';
        return status || '--';
    };
    const segmentClassName = (value = '') => {
        const key = toProfileText(value).toUpperCase();
        if (key === 'VIP') return 'client-profile-segment--vip';
        if (key === 'FRECUENTE' || key.includes('RECURRENTE')) return 'client-profile-segment--frecuente';
        if (key === 'EN RIESGO' || key === 'DORMIDO') return 'client-profile-segment--riesgo';
        if (key === 'PERDIDO') return 'client-profile-segment--perdido';
        if (key === 'NUEVO') return 'client-profile-segment--nuevo';
        return 'client-profile-segment--neutral';
    };
    const hasRealValue = (value = '') => {
        const text = toProfileText(value);
        return Boolean(text && text !== '--');
    };

    const erpCustomer = contact.erpCustomer && typeof contact.erpCustomer === 'object' ? contact.erpCustomer : null;
    const erpFullName = [
        String(erpCustomer?.firstName || erpCustomer?.first_name || '').trim(),
        String(erpCustomer?.lastNamePaternal || erpCustomer?.last_name_paternal || '').trim(),
        String(erpCustomer?.lastNameMaternal || erpCustomer?.last_name_maternal || '').trim()
    ].filter(Boolean).join(' ');
    const erpDisplayName = firstValue(erpFullName, erpCustomer?.contactName, '');    
    const displayName = firstValue(erpDisplayName, contact.name, contact.pushname, contact.shortName, 'Contacto');
    const fallbackPhone = String(contact.id || '').replace('@c.us', '').replace('@g.us', '');
    const rawPhone = firstValue(contact.phone, contact.number, contact.user, fallbackPhone);
    const displayPhone = formatPhoneForDisplay(rawPhone);
    const accountType = contact.isBusiness ? 'Business' : 'Personal';
    const participantNameMap = new Map();
    if (Array.isArray(chats)) {
        chats.forEach((chat) => {
            const rawName = firstValue(chat?.name, chat?.pushname, chat?.shortName, '');
            const safeName = sanitizeProfileText(rawName);
            if (!safeName || looksLikeInternalId(safeName)) return;

            const candidates = [
                chat?.phone,
                chat?.number,
                chat?.user,
                String(chat?.id || '').split('@')[0]
            ];

            candidates.forEach((candidate) => {
                const digits = normalizeDigits(candidate);
                if (!isLikelyPhoneDigits(digits)) return;
                if (!participantNameMap.has(digits)) participantNameMap.set(digits, safeName);
            });
        });
    }

    const isDisplayPhoneLike = (value = '') => /^\+?\d{8,}$/.test(String(value || '').trim());

    const participantsList = (Array.isArray(contact.participantsList)
        ? contact.participantsList.filter((participant) => participant && participant.id)
        : []).map((participant) => {
            const phoneDigits = normalizeDigits(participant.phone || String(participant.id || '').split('@')[0] || '');
            const mappedName = sanitizeProfileText(participantNameMap.get(phoneDigits) || '');
            const waName = sanitizeProfileText(participant.name || '');
            const waDisplayName = sanitizeProfileText(participant.displayName || '');
            const waPushname = sanitizeProfileText(participant.pushname || '');
            const waShortName = sanitizeProfileText(participant.shortName || '');
            const preferredMappedName = (!mappedName || looksLikeInternalId(mappedName) || isDisplayPhoneLike(mappedName)) ? '' : mappedName;
            const displayName = firstValue(
                waDisplayName && !looksLikeInternalId(waDisplayName) ? waDisplayName : '',
                waName && !looksLikeInternalId(waName) ? waName : '',
                waPushname && !looksLikeInternalId(waPushname) ? waPushname : '',
                waShortName && !looksLikeInternalId(waShortName) ? waShortName : '',
                preferredMappedName,
                phoneDigits ? `+${phoneDigits}` : '',
                participant.id
            );

            return {
                ...participant,
                phone: phoneDigits || null,
                displayName: displayName || 'Participante'
            };
        });
    const participantsCount = Number(
        contact.participants
        || contact.chatState?.participantsCount
        || participantsList.length
        || 0
    ) || 0;

    const segment = firstProfileValue(erpCustomer?.segmento, erpCustomer?.segmento_final, '');
    const hasSegment = hasRealValue(segment);

    const identityRows = [
        ['Nombre', displayName],
        (erpCustomer?.contactName
            ? ['Nombre de pila', toTitleCaseProfileText(String(erpCustomer.contactName))]
            : null),
        ['Telefono', displayPhone],
        ['Codigo sistema', firstProfileValue(erpCustomer?.customerId, erpCustomer?.customer_id)],
        ['Codigo ERP', firstProfileValue(erpCustomer?.erpId, erpCustomer?.erp_id)],
        ['Nombre ERP', firstProfileValue(erpDisplayName)],
        ['Telefono ERP', formatPhoneForDisplay(firstProfileValue(erpCustomer?.phoneE164, erpCustomer?.phone_e164, rawPhone))],
        ['Documento', firstProfileValue(erpCustomer?.documentNumber, erpCustomer?.document_number)],
        ['Tipo documento', firstProfileValue(erpCustomer?.documentTypeId, erpCustomer?.document_type_id)]
    ].filter((row) => row && hasRealValue(row[1]));

    const purchaseRows = erpCustomer ? [
        ['Ultima compra', formatProfileDate(erpCustomer?.ultimaFechaCompra || erpCustomer?.ultima_fecha_compra)],
        ['Ultimo pedido', firstProfileValue(erpCustomer?.ultimoPedidoId, erpCustomer?.ultimo_pedido_id)],
        ['Total compras', formatProfileNumber(erpCustomer?.comprasTotal ?? erpCustomer?.compras_total)],
        ['Monto acumulado', formatProfileMoney(erpCustomer?.montoAcumulado ?? erpCustomer?.monto_acumulado)],
        ['Ticket prom. 180d', formatProfileMoney(erpCustomer?.ticketProm180 ?? erpCustomer?.ticket_prom_180)],
        ['Compras 120d', `${formatProfileNumber(erpCustomer?.compras120 ?? erpCustomer?.compras_120)} · ${formatProfileMoney(erpCustomer?.monto120 ?? erpCustomer?.monto_120)}`],
        ['Compras 180d', `${formatProfileNumber(erpCustomer?.compras180 ?? erpCustomer?.compras_180)} · ${formatProfileMoney(erpCustomer?.monto180 ?? erpCustomer?.monto_180)}`],
        ['Dias ult. compra', formatProfileNumber(erpCustomer?.diasUltimaCompra ?? erpCustomer?.dias_ultima_compra)],
        ['Cadencia prom.', formatProfileNumber(erpCustomer?.cadenciaPromDias ?? erpCustomer?.cadencia_prom_dias)],
        ['Segmento', segment]
    ].filter(([, value]) => hasRealValue(value) && !String(value).startsWith('-- · --')) : [];

    const contactRows = erpCustomer ? [
        ['Email', firstProfileValue(erpCustomer?.email)],
        ['Telefono 2', formatPhoneForDisplay(firstProfileValue(erpCustomer?.phoneAlt, erpCustomer?.phone_alt))],
        ['Idioma', firstProfileValue(erpCustomer?.preferredLanguage, erpCustomer?.preferred_language)],
        ['Tipo cliente', firstProfileValue(erpCustomer?.customerTypeName, erpCustomer?.customer_type_name, erpCustomer?.customerTypeId, erpCustomer?.customer_type_id)],
        ['Fuente', firstProfileValue(erpCustomer?.acquisitionSourceName, erpCustomer?.acquisition_source_name, erpCustomer?.acquisitionSourceId, erpCustomer?.acquisition_source_id)],
        ['Responsable', firstProfileValue(erpCustomer?.erpEmployeeName, erpCustomer?.erp_employee_name, erpCustomer?.erpEmployeeId, erpCustomer?.erp_employee_id)],
        ['Marketing', marketingOptInLabel(erpCustomer?.marketingOptInStatus || erpCustomer?.marketing_opt_in_status)],
        ['Actualizado ERP', formatProfileDate(erpCustomer?.erpLastSeenAt || erpCustomer?.erp_last_seen_at)]
    ].filter(([, value]) => hasRealValue(value)) : [];

    const chatStateRows = [
        ['Archivado', formatBoolValue(contact.chatState?.archived)],
        ['Fijado', formatBoolValue(contact.chatState?.pinned)],
        ['Silenciado', formatBoolValue(contact.chatState?.isMuted)],
        ['Ultima actividad', formatTimestampValue(contact.chatState?.timestamp)],
    ];
    if (contact.isGroup) {
        chatStateRows.push(['Participantes', String(participantsCount)]);
    }

    const businessRows = [
        ['Categoria', firstValue(contact.businessDetails?.category, '')],
        ['Web', firstValue(contact.businessDetails?.website, '')],
        ['Webs', (contact.businessDetails?.websites || []).join(', ') || ''],
        ['Email', firstValue(contact.businessDetails?.email, '')],
        ['Direccion', firstValue(contact.businessDetails?.address, '')],
        ['Descripcion', firstValue(contact.businessDetails?.description, '')],
    ].filter(([, value]) => hasRealValue(value));

    const erpTags = Array.isArray(erpCustomer?.tags)
        ? erpCustomer.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
        : [];
    const erpAddresses = Array.isArray(erpCustomer?.addresses) ? erpCustomer.addresses : [];

    const quickActions = [
        { label: 'Redactar saludo', prompt: 'Redacta un saludo personalizado y profesional para este cliente.' },
        { label: 'Crear propuesta de venta', prompt: 'Crea una propuesta de venta persuasiva para este cliente basada en la conversacion.' },
        { label: 'Mensaje de seguimiento', prompt: 'Redacta un mensaje de seguimiento para este cliente que no ha respondido.' },
    ];

    return (
        <aside className="client-profile-panel" ref={panelRef}>
            <div className="client-profile-header">
                <button className="client-profile-close" onClick={onClose} aria-label="Cerrar perfil">
                    <X size={20} />
                </button>
                <div className="client-profile-header-copy">
                    <span className="client-profile-kicker">Ficha del cliente</span>
                    <h3>Perfil del contacto</h3>
                </div>
            </div>

            <div className="client-profile-hero">
                <div className="client-profile-avatar" style={{ background: avatarColorForName(displayName) }}>
                    {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="client-profile-name">{displayName}</div>
                <div className="client-profile-phone">{displayPhone}</div>
                <div className="client-profile-badges">
                    {hasSegment && <span className={`client-profile-badge client-profile-segment ${segmentClassName(segment)}`}>{segment}</span>}
                    {contact.isBusiness && <span className="client-profile-badge business">Cuenta Business</span>}
                    {contact.isMyContact && <span className="client-profile-badge">Contacto guardado</span>}
                </div>
            </div>

            <div className="client-profile-scroll">
                {contact.status && (
                    <div className="client-profile-card">
                        <div className="client-profile-card-title">Info / Estado</div>
                        <div className="client-profile-status">{contact.status}</div>
                    </div>
                )}

                <div className="client-profile-card">
                    <div className="client-profile-card-title">Identificacion</div>
                    <div className="client-profile-grid">
                        {identityRows.map(([label, value]) => (
                            <React.Fragment key={label}>
                                <span className="client-profile-key">{label}</span>
                                <span className="client-profile-value">{value}</span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {erpCustomer && (
                    <div className="client-profile-card client-profile-card--erp">
                        <div className="client-profile-card-title">Historial de compras ERP</div>
                        {purchaseRows.length > 0 ? (
                            <div className="client-profile-grid">
                                {purchaseRows.map(([label, value]) => (
                                    <React.Fragment key={label}>
                                        <span className="client-profile-key">{label}</span>
                                        <span className="client-profile-value">{value}</span>
                                    </React.Fragment>
                                ))}
                            </div>
                        ) : (
                            <div className="client-profile-empty">Sin historial de compras ERP.</div>
                        )}
                    </div>
                )}

                {contactRows.length > 0 && (
                    <div className="client-profile-card">
                        <div className="client-profile-card-title">Contacto ERP</div>
                        <div className="client-profile-grid">
                            {contactRows.map(([label, value]) => (
                                <React.Fragment key={label}>
                                    <span className="client-profile-key">{label}</span>
                                    <span className="client-profile-value">{value}</span>
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                )}

                {erpCustomer && (
                    <div className="client-profile-card client-profile-card--erp">
                        {erpAddresses.length > 0 && (
                            <div className="client-profile-subsection">
                                <div className="client-profile-subsection-title">Direcciones ERP</div>
                                <div className="client-profile-address-list">
                                    {erpAddresses.map((address, index) => {
                                        const street = String(address?.street || '').trim();
                                        const location = [
                                            String(address?.districtName || '').trim(),
                                            String(address?.provinceName || '').trim(),
                                            String(address?.departmentName || '').trim()
                                        ].filter(Boolean).join(' - ');
                                        return (
                                            <div key={String(address?.addressId || index)} className="client-profile-address-item">
                                                <div className="client-profile-address-line">
                                                    {street || 'Direccion sin detalle'}
                                                </div>
                                                <div className="client-profile-address-meta">
                                                    {location || 'Ubicacion no registrada'}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {erpAddresses.length === 0 && <div className="client-profile-empty">Sin direcciones ERP registradas.</div>}
                    </div>
                )}

                <div className="client-profile-card">
                    <div className="client-profile-card-title">Etiquetas</div>
                    {(contact.labels?.length > 0 || erpTags.length > 0) ? (
                        <div className="client-profile-labels">
                            {contact.labels?.map((label, idx) => (
                                <span key={`chat-${idx}`} className="client-profile-label-chip" style={{ '--label-color': label.color || 'var(--chat-control-text-soft)' }}>
                                    {label.name}
                                </span>
                            ))}
                            {erpTags.map((tag) => (
                                <span key={`erp-${tag}`} className="client-profile-label-chip client-profile-label-chip--erp">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <div className="client-profile-empty">Sin etiquetas.</div>
                    )}
                </div>

                {erpCustomer && (
                    <div className="client-profile-card">
                        <div className="client-profile-card-title">Pedidos en sistema</div>
                        <div className="client-profile-empty">Abre la pestana Pedidos para ver o registrar pedidos de este cliente.</div>
                    </div>
                )}

                <div className="client-profile-card">
                    <div className="client-profile-card-title">Estado del chat</div>
                    <div className="client-profile-grid">
                        {chatStateRows.map(([label, value]) => (
                            <React.Fragment key={label}>
                                <span className="client-profile-key">{label}</span>
                                <span className="client-profile-value">{value}</span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {contact.isGroup && (
                    <div className="client-profile-card">
                        <div className="client-profile-card-title">Participantes del grupo</div>
                        {participantsList.length > 0 ? (
                            <div className="client-profile-participants-list">
                                {participantsList.map((participant) => {
                                    const participantName = firstValue(participant.displayName, participant.name, participant.phone ? `+${participant.phone}` : '', participant.id);
                                    const participantPhone = participant.phone ? `+${participant.phone}` : '';
                                    return (
                                        <div key={participant.id} className="client-profile-participant-item">
                                            <div className="client-profile-participant-main">
                                                <span className="client-profile-participant-name">{participantName}</span>
                                                {participantPhone && (
                                                    <span className="client-profile-participant-phone">{participantPhone}</span>
                                                )}
                                            </div>
                                            <div className="client-profile-participant-tags">
                                                {participant.isMe && <span className="client-profile-participant-tag me">Tu</span>}
                                                {participant.isSuperAdmin && <span className="client-profile-participant-tag admin">Superadmin</span>}
                                                {!participant.isSuperAdmin && participant.isAdmin && <span className="client-profile-participant-tag admin">Admin</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="client-profile-participant-empty">No se pudieron cargar participantes de este grupo.</div>
                        )}
                    </div>
                )}
                {businessRows.length > 0 && (
                    <div className="client-profile-card">
                        <div className="client-profile-card-title">Perfil Business (WhatsApp)</div>
                        <div className="client-profile-grid">
                            {businessRows.map(([label, value]) => (
                                <React.Fragment key={label}>
                                    <span className="client-profile-key">{label}</span>
                                    <span className="client-profile-value">{value}</span>
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                )}

                <div className="client-profile-card">
                    <div className="client-profile-actions-title">
                        <Sparkles size={12} /> Acciones rapidas IA
                    </div>
                    <div className="client-profile-actions-list">
                        {quickActions.map((action, idx) => (
                            <button
                                key={idx}
                                className="client-profile-action-btn"
                                onClick={() => onQuickAiAction && onQuickAiAction(action.prompt)}
                                type="button"
                            >
                                <span>{action.label}</span>
                                <ChevronRight size={14} />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </aside>
    );
};

export const CompanyProfilePanel = ({ profile, labels = [], onClose, onLogout, panelRef }) => {
    if (!profile) return null;

    const displayName = firstValue(profile.name, profile.pushname, profile.shortName, 'Mi negocio');
    const displayPhone = formatPhoneForDisplay(firstValue(profile.phone, profile.id));
    const accountType = profile.isBusiness ? 'Business' : 'Personal';

    const companyRows = [
        ['Nombre comercial', displayName],
        ['Telefono', displayPhone],
        ['Estado', firstValue(profile.status, '--')],
        ['Cuenta', accountType],
    ];

    const accountStateRows = [
        ['Etiquetas activas', String(profile.labelsCount ?? labels.length ?? 0)],
        ['Canal', firstValue(profile.platform, 'WhatsApp Cloud API')],
    ];

    const businessRows = [
        ['Categoria', firstValue(profile.category, profile.businessDetails?.category, '--')],
        ['Web', firstValue(profile.website, profile.businessDetails?.website, '--')],
        ['Webs', firstValue((profile.websites || profile.businessDetails?.websites || []).join(', '), '--')],
        ['Email', firstValue(profile.email, profile.businessDetails?.email, '--')],
        ['Direccion', firstValue(profile.address, profile.businessDetails?.address, '--')],
        ['Descripcion', firstValue(profile.description, profile.businessDetails?.description, '--')],
    ];

    return (
        <aside className="client-profile-panel company-profile-panel" ref={panelRef}>
            <div className="client-profile-header">
                <button className="client-profile-close" onClick={onClose} aria-label="Cerrar perfil de empresa">
                    <X size={20} />
                </button>
                <div className="client-profile-header-copy">
                    <span className="client-profile-kicker">Cuenta de negocio</span>
                    <h3>Perfil de la empresa</h3>
                </div>
            </div>

            <div className="client-profile-hero company-profile-hero">
                <div className="client-profile-avatar" style={{ background: avatarColorForName(displayName) }}>
                    {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="client-profile-name">{displayName}</div>
                <div className="client-profile-phone">{displayPhone}</div>
            </div>

            <div className="client-profile-scroll">
                {labels.length > 0 && (
                    <div className="client-profile-card">
                        <div className="client-profile-card-title">Etiquetas del negocio</div>
                        <div className="client-profile-labels">
                            {labels.map((label) => (
                                <span key={String(label?.id || label?.name)} className="client-profile-label-chip" style={{ '--label-color': label?.color || 'var(--chat-control-text-soft)' }}>
                                    {label?.name || `Etiqueta ${label?.id || ''}`}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <div className="client-profile-card">
                    <div className="client-profile-card-title">Datos de cuenta</div>
                    <div className="client-profile-grid">
                        {companyRows.map(([label, value]) => (
                            <React.Fragment key={label}>
                                <span className="client-profile-key">{label}</span>
                                <span className="client-profile-value">{value}</span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="client-profile-card">
                    <div className="client-profile-card-title">Estado de la cuenta</div>
                    <div className="client-profile-grid">
                        {accountStateRows.map(([label, value]) => (
                            <React.Fragment key={label}>
                                <span className="client-profile-key">{label}</span>
                                <span className="client-profile-value">{value}</span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="client-profile-card">
                    <div className="client-profile-card-title">Perfil Business</div>
                    <div className="client-profile-grid">
                        {businessRows.map(([label, value]) => (
                            <React.Fragment key={label}>
                                <span className="client-profile-key">{label}</span>
                                <span className="client-profile-value">{value}</span>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="client-profile-card">
                    <button type="button" className="client-profile-action-btn company-logout-btn" onClick={() => onLogout && onLogout()}>
                        <span>Cerrar sesion de WhatsApp</span>
                        <ChevronRight size={14} />
                    </button>
                                </div>
            </div>
        </aside>
    );
};


