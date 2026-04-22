BEGIN;

INSERT INTO global_labels (
    id,
    name,
    color,
    description,
    commercial_status_key,
    sort_order,
    is_active,
    created_at,
    updated_at
) VALUES
    ('NUEVO', 'Nuevo', '#7D8D95', 'Etiqueta comercial predeterminada para clientes nuevos.', 'nuevo', 1, TRUE, NOW(), NOW()),
    ('EN_CONVERSACION', 'En conversacion', '#34B7F1', 'Etiqueta comercial predeterminada para conversaciones activas.', 'en_conversacion', 2, TRUE, NOW(), NOW()),
    ('COTIZADO', 'Cotizado', '#FFB02E', 'Etiqueta comercial predeterminada para clientes cotizados.', 'cotizado', 3, TRUE, NOW(), NOW()),
    ('VENDIDO', 'Vendido', '#00A884', 'Etiqueta comercial predeterminada para ventas cerradas.', 'vendido', 4, TRUE, NOW(), NOW()),
    ('PERDIDO', 'Perdido', '#FF5C5C', 'Etiqueta comercial predeterminada para oportunidades perdidas.', 'perdido', 5, TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

COMMIT;
