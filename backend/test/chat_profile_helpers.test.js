const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildErpCustomerDisplayName,
    resolveChatDisplayName
} = require('../domains/channels/helpers/chat-profile.helpers');

test('chat_profile_helpers prioritizes ERP full name over WhatsApp contact labels', () => {
    const chat = {
        name: 'Pushname WA',
        contact: {
            name: 'WA Contact',
            pushname: 'Pushname WA'
        },
        erpCustomer: {
            firstName: 'Maria',
            lastNamePaternal: 'Perez',
            lastNameMaternal: 'Lopez'
        }
    };

    assert.equal(buildErpCustomerDisplayName(chat.erpCustomer), 'Maria Perez Lopez');
    assert.equal(resolveChatDisplayName(chat), 'Maria Perez Lopez');
});
