const fs = require('fs');
const path = require('path');

const CATALOG_FILE = path.join(__dirname, 'catalog.json');

// Load catalog from disk
function loadCatalog() {
    try {
        if (fs.existsSync(CATALOG_FILE)) {
            return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('Error loading catalog:', e);
    }
    return [];
}

// Save catalog to disk
function saveCatalog(catalog) {
    try {
        fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
    } catch (e) {
        console.error('Error saving catalog:', e);
    }
}

function addProduct(product) {
    const catalog = loadCatalog();
    const newProduct = {
        id: Date.now().toString(),
        title: product.title || 'Sin nombre',
        price: product.price || '',
        description: product.description || '',
        imageUrl: product.imageUrl || null,
        createdAt: new Date().toISOString(),
    };
    catalog.push(newProduct);
    saveCatalog(catalog);
    return newProduct;
}

function updateProduct(id, updates) {
    let catalog = loadCatalog();
    catalog = catalog.map(p => p.id === id ? { ...p, ...updates } : p);
    saveCatalog(catalog);
    return catalog.find(p => p.id === id);
}

function deleteProduct(id) {
    let catalog = loadCatalog();
    catalog = catalog.filter(p => p.id !== id);
    saveCatalog(catalog);
}

module.exports = { loadCatalog, saveCatalog, addProduct, updateProduct, deleteProduct };
