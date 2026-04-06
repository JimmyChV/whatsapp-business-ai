import React, { useMemo, useState } from 'react';

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
                <span className="saas-detail-panel__section-title">{title}</span>
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
    children
}) => {
    const rootClassName = useMemo(
        () => ['saas-detail-panel', className].filter(Boolean).join(' '),
        [className]
    );

    return (
        <article className={rootClassName}>
            <header className="saas-detail-panel__header">
                <div className="saas-detail-panel__heading">
                    <h3>{title}</h3>
                    {subtitle ? <p>{subtitle}</p> : null}
                </div>
                {actions ? (
                    <div className="saas-detail-panel__actions">{actions}</div>
                ) : null}
            </header>
            <div className="saas-detail-panel__body">
                {children}
            </div>
        </article>
    );
};

export default SaasDetailPanel;
