import React from 'react';

const SaasTableDetailLayout = ({
    selectedId,
    left,
    right,
    className = '',
    fullClassName = '',
    splitClassName = ''
}) => {
    const hasSelection = Boolean(selectedId);
    const modeClassName = hasSelection ? 'saas-td-layout--split' : 'saas-td-layout--full';
    const variantClassName = hasSelection ? splitClassName : fullClassName;
    const rootClassName = ['saas-td-layout', modeClassName, variantClassName, className].filter(Boolean).join(' ');

    return (
        <div className={rootClassName}>
            <section className="saas-td-layout__left">
                {left}
            </section>
            {hasSelection ? (
                <aside className="saas-td-layout__right">
                    {right}
                </aside>
            ) : null}
        </div>
    );
};

export default SaasTableDetailLayout;
