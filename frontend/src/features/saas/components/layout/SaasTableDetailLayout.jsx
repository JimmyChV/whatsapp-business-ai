import React from 'react';

const SaasTableDetailLayout = ({
    selectedId,
    header = null,
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
            {header ? (
                <div className="saas-td-layout__header">
                    {header}
                </div>
            ) : null}
            <div className="saas-td-layout__content">
                <section className="saas-td-layout__left">
                    {left}
                </section>
                {hasSelection ? (
                    <aside className="saas-td-layout__right">
                        {right}
                    </aside>
                ) : null}
            </div>
        </div>
    );
};

export default SaasTableDetailLayout;
