const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildErpCustomerDisplayName,
    buildPrimaryLocationLabel,
    resolveChatDisplayName,
    resolveChatSubtitle
} = require('../domains/channels/helpers/chat-profile.helpers');

test('chat_profile_helpers prioritizes ERP full name over WhatsApp contact labels', () => {
    const chat = {
        name: 'Pushname WA',
        contact: {
            name: 'wa contact',
            pushname: 'contacto whatsapp'
        },
        erpCustomer: {
            firstName: 'maria',
            lastNamePaternal: 'perez',
            lastNameMaternal: 'lopez',
            addresses: [{
                districtName: 'miraflores',
                provinceName: 'lima',
                isPrimary: true
            }]
        }
    };

    assert.equal(buildErpCustomerDisplayName(chat.erpCustomer), 'Maria Perez Lopez');
    assert.equal(buildPrimaryLocationLabel(chat.erpCustomer), 'Miraflores - Lima');
    assert.equal(resolveChatDisplayName(chat), 'Maria Perez Lopez');
    assert.equal(resolveChatSubtitle(chat), 'Contacto Whatsapp • Miraflores - Lima');
});

test('chat_profile_helpers uses razon social for juridical customers and whatsapp fallback subtitle', () => {
    const chat = {
        contact: {
            pushname: 'proveedor lavitat'
        },
        erpCustomer: {
            documentType: 'RUC',
            lastNamePaternal: 'inversiones lavitat sac'
        }
    };

    assert.equal(buildErpCustomerDisplayName(chat.erpCustomer), 'Inversiones Lavitat Sac');
    assert.equal(resolveChatDisplayName(chat), 'Inversiones Lavitat Sac');
    assert.equal(resolveChatSubtitle(chat), 'Proveedor Lavitat');
});
