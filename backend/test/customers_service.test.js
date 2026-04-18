const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

function loadServicesFresh() {
    const runtimePath = require.resolve('../config/persistence-runtime');
    const customersPath = require.resolve('../domains/tenant/services/customers.service');
    const addressesPath = require.resolve('../domains/tenant/services/customer-addresses.service');
    delete require.cache[runtimePath];
    delete require.cache[customersPath];
    delete require.cache[addressesPath];
    return {
        customerService: require('../domains/tenant/services/customers.service'),
        customerAddressesService: require('../domains/tenant/services/customer-addresses.service')
    };
}

test('customers_service returns customer by phone with attached addresses', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevDir = process.env.SAAS_TENANT_DATA_DIR;

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'customers-by-phone-'));

    try {
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempRoot;

        const { customerService, customerAddressesService } = loadServicesFresh();

        const saved = await customerService.upsertCustomer('tenant_test', {
            contactName: 'Maria Perez',
            firstName: 'Maria',
            lastNamePaternal: 'Perez',
            lastNameMaternal: 'Lopez',
            phoneE164: '+51911111111',
            email: 'maria@example.com',
            tags: ['vip']
        });

        await customerAddressesService.upsertAddress('tenant_test', {
            customerId: saved?.item?.customerId,
            addressType: 'delivery',
            street: 'Av. Principal 123',
            districtName: 'Miraflores',
            provinceName: 'Lima',
            departmentName: 'Lima',
            isPrimary: true
        });

        const item = await customerService.getCustomerByPhoneWithAddresses('tenant_test', '+51911111111', {
            customerAddressesService
        });

        assert.ok(item);
        assert.equal(item.customerId, saved?.item?.customerId);
        assert.equal(item.contactName, 'Maria Perez');
        assert.equal(item.phoneE164, '+51911111111');
        assert.equal(Array.isArray(item.addresses), true);
        assert.equal(item.addresses.length, 1);
        assert.equal(item.addresses[0].street, 'Av. Principal 123');
        assert.equal(item.addresses[0].isPrimary, true);
    } finally {
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.SAAS_TENANT_DATA_DIR = prevDir;
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
});
