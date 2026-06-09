const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveMessageSegments } = require('../src/services/message-variables.service');

test('message_variables_service returns raw text when there are no catalog variables', () => {
    const text = 'Hola {{nombre_cliente}}, revisa este mensaje.';
    assert.deepEqual(resolveMessageSegments(text), [
        { type: 'text', content: text }
    ]);
});

test('message_variables_service parses only catalog variable', () => {
    assert.deepEqual(resolveMessageSegments('{{catalogo}}'), [
        { type: 'catalog' }
    ]);
});

test('message_variables_service parses text followed by catalog variable', () => {
    assert.deepEqual(resolveMessageSegments('Mira esto: {{catalogo}}'), [
        { type: 'text', content: 'Mira esto: ' },
        { type: 'catalog' }
    ]);
});

test('message_variables_service parses product variable with sku', () => {
    assert.deepEqual(resolveMessageSegments('{{producto:SKU01}}'), [
        { type: 'product', sku: 'SKU01' }
    ]);
});

test('message_variables_service parses product sku with hyphens and numbers', () => {
    assert.deepEqual(resolveMessageSegments('{{producto:MAT0502009}}'), [
        { type: 'product', sku: 'MAT0502009' }
    ]);
});

test('message_variables_service parses product sku with hyphen', () => {
    assert.deepEqual(resolveMessageSegments('{{producto:SUA-01}}'), [
        { type: 'product', sku: 'SUA-01' }
    ]);
});

test('message_variables_service preserves order across text, product, text and catalog', () => {
    assert.deepEqual(resolveMessageSegments('Inicio {{producto:A}} medio {{catalogo}}'), [
        { type: 'text', content: 'Inicio ' },
        { type: 'product', sku: 'A' },
        { type: 'text', content: ' medio ' },
        { type: 'catalog' }
    ]);
});

test('message_variables_service preserves multiple products in order', () => {
    assert.deepEqual(resolveMessageSegments('{{producto:A}}{{producto:B}} y {{producto:C}}'), [
        { type: 'product', sku: 'A' },
        { type: 'product', sku: 'B' },
        { type: 'text', content: ' y ' },
        { type: 'product', sku: 'C' }
    ]);
});
