import React, { useEffect, useMemo, useState } from 'react';

const toTitleCaseLabel = (value = '') => {
    const normalized = String(value || '').trim();
    if (!normalized) return normalized;
    return normalized
        .toLocaleLowerCase('es')
        .split(' ')
        .map((word) => {
            if (!word) return word;
            return word.charAt(0).toLocaleUpperCase('es') + word.slice(1);
        })
        .join(' ');
};

const extractTextContent = (node) => {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractTextContent).join(' ');
    if (React.isValidElement(node)) return extractTextContent(node.props?.children);
    return '';
};

const deriveActionVariant = (item) => {
    const className = String(item?.props?.className || '').toLowerCase();
    const label = extractTextContent(item?.props?.children).trim().toLowerCase();
    if (className.includes('saas-header-btn--') || className.includes('saas-btn--')) return null;
    if (className.includes('danger') || /(cerrar sesión|logout|eliminar|descartar)/.test(label)) return 'danger';
    if (className.includes('cancel') || /(cancelar|limpiar|volver|cerrar|desactivar)/.test(label)) return 'secondary';
    if (/(editar|guardar|crear|nuevo|nueva|agregar|activar|sincronizar)/.test(label)) return 'primary';
    return 'secondary';
};

const decorateActionItem = (item) => {
    if (!React.isValidElement(item) || item.type !== 'button') return item;
    const variant = deriveActionVariant(item);
    const nextClassName = [
        'saas-btn',
        'saas-header-btn',
        variant ? `saas-header-btn--${variant}` : '',
        item.props.className || ''
    ].filter(Boolean).join(' ');
    return React.cloneElement(item, { className: nextClassName });
};

const decorateActionTree = (node) => {
    if (!React.isValidElement(node)) return node;
    if (node.type === 'button') return decorateActionItem(node);
    const childNodes = React.Children.toArray(node.props?.children);
    if (childNodes.length === 0) return node;
    const nextChildren = childNodes.map(decorateActionTree);
    return React.cloneElement(node, undefined, nextChildren);
};

export const SaasDetailPanelSection = ({
    title,
    defaultOpen = true,
    actions = null,
    className = '',
    children
}) => {
    const [open, setOpen] = useState(Boolean(defaultOpen));
    const rootClassName = ['saas-detail-panel__section', open ? 'is-open' : 'is-collapsed', className].filter(Boolean).join(' ');

    return (
        <section className={rootClassName}>
            <button
                type="button"
                className="saas-detail-panel__section-toggle"
                onClick={() => setOpen((prev) => !prev)}
                aria-expanded={open}
            >
                <span className="saas-detail-panel__section-title">{toTitleCaseLabel(title)}</span>
                <span className="saas-detail-panel__section-meta">
                    {actions}
                    <span className="saas-detail-panel__section-chevron">{open ? '-' : '+'}</span>
                </span>
            </button>
            {open ? (
                <div className="saas-detail-panel__section-content">
                    {children}
                </div>
            ) : null}
        </section>
    );
};

const SaasDetailPanel = ({
    title,
    subtitle = '',
    actions = null,
    className = '',
    bodyClassName = '',
    children
}) => {
    const [compactActions, setCompactActions] = useState(false);
    const [overflowOpen, setOverflowOpen] = useState(false);
    const rootClassName = useMemo(
        () => ['saas-detail-panel', className].filter(Boolean).join(' '),
        [className]
    );
    const actionItems = useMemo(
        () => React.Children.toArray(actions).filter(Boolean).map(decorateActionTree),
        [actions]
    );
    const inlineActionItems = useMemo(
        () => (compactActions ? actionItems.slice(0, 2) : actionItems),
        [compactActions, actionItems]
    );
    const overflowActionItems = useMemo(
        () => (compactActions ? actionItems.slice(2) : []),
        [compactActions, actionItems]
    );

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        const mediaQuery = window.matchMedia('(max-width: 1440px)');
        const sync = () => setCompactActions(mediaQuery.matches);
        sync();
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', sync);
            return () => mediaQuery.removeEventListener('change', sync);
        }
        mediaQuery.addListener(sync);
        return () => mediaQuery.removeListener(sync);
    }, []);

    useEffect(() => {
        if (!compactActions) setOverflowOpen(false);
    }, [compactActions]);

    return (
        <article className={rootClassName}>
            <header className="saas-detail-panel__header">
                <div className="saas-detail-panel__heading">
                    <h3>{title}</h3>
                    {subtitle ? <p>{subtitle}</p> : null}
                </div>
                {actionItems.length > 0 ? (
                    <div className="saas-detail-panel__actions">
                        {inlineActionItems}
                        {compactActions && overflowActionItems.length > 0 ? (
                            <div className="saas-header-actions-overflow">
                                <button
                                    type="button"
                                    className="saas-btn saas-header-btn saas-header-btn--secondary"
                                    onClick={() => setOverflowOpen((prev) => !prev)}
                                    aria-expanded={overflowOpen}
                                >
                                    ...
                                </button>
                                {overflowOpen ? (
                                    <div className="saas-header-actions-overflow__menu saas-header-actions-overflow__menu--detail">
                                        {overflowActionItems.map((item, index) => (
                                            <div key={`detail_action_${index}`} className="saas-header-actions-overflow__item">
                                                {item}
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </header>
            <div className={['saas-detail-panel__body', bodyClassName].filter(Boolean).join(' ')}>
                {children}
            </div>
        </article>
    );
};

export default SaasDetailPanel;
