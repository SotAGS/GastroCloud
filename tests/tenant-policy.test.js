const test = require('node:test');
const assert = require('node:assert/strict');

const { getPlanCapabilities, getEffectiveSubscriptionPlan, hasCompanyAccess, hasLocalAccess, canAccessFeature } = require('../dist/services/account-policy.service.js');
const { getTenantScope } = require('../dist/utils/tenant-scope.util.js');
const { ensureSufficientSaleStock } = require('../dist/utils/sale-quantity.util.js');
const { priceSaleDetails } = require('../dist/utils/sale-price.util.js');
const { BootstrapSecurityService } = require('../dist/services/bootstrap-security.service.js');
const { validationResult } = require('express-validator');
const { createSaleValidator } = require('../dist/validators/sale.validator.js');

test('Freemium permite ventas y bloquea compras, empleados y chat', () => {
  const caps = getPlanCapabilities('FREEMIUM');
  assert.equal(caps.includes('ventas:view'), true);
  assert.equal(caps.includes('compras:view'), false);
  assert.equal(caps.includes('empleados:create'), false);
  assert.equal(caps.includes('ai:chat'), false);
  assert.equal(canAccessFeature('FREEMIUM', 'ai:chat'), false);
});

test('Premium permite gestionar empleados, reportes y chat', () => {
  const caps = getPlanCapabilities('PREMIUM');
  assert.equal(caps.includes('empleados:create'), true);
  assert.equal(caps.includes('reportes:view'), true);
  assert.equal(caps.includes('ai:chat'), true);
  assert.equal(canAccessFeature('PREMIUM', 'ai:chat'), true);
});

test('Premium vuelve a Freemium cuando el pago no está activo o vence', () => {
  const now = new Date('2026-01-31T12:00:00Z');
  assert.equal(getEffectiveSubscriptionPlan('PREMIUM', 'ACTIVE', new Date(now.getTime() + 1), now), 'PREMIUM');
  assert.equal(getEffectiveSubscriptionPlan('PREMIUM', 'ACTIVE', new Date(now), now), 'FREEMIUM');
  assert.equal(getEffectiveSubscriptionPlan('PREMIUM', 'PAST_DUE', null, now), 'FREEMIUM');
  assert.equal(getEffectiveSubscriptionPlan('PREMIUM', 'ACTIVE', null, now), 'PREMIUM');
  assert.equal(getEffectiveSubscriptionPlan('FREEMIUM', 'ACTIVE', null, now), 'FREEMIUM');
});

test('No se permite acceder a otra empresa ni a otra sucursal', () => {
  assert.equal(hasCompanyAccess({ companyId: 'c1' }, 'c2'), false);
  assert.equal(hasLocalAccess({ companyId: 'c1', localId: 'l1' }, { companyId: 'c1', id: 'l2' }, 'EMPLEADO'), false);
  assert.equal(hasLocalAccess({ companyId: 'c1', localId: 'l1' }, { companyId: 'c1', id: 'l1' }, 'EMPLEADO'), true);
  assert.equal(hasLocalAccess({ companyId: 'c1', localId: 'l1' }, { companyId: 'c1', id: 'l2' }, 'GERENTE'), true);
});

test('El administrador y los roles de empresa ven sus sucursales; el empleado conserva alcance local', () => {
  assert.deepEqual(getTenantScope({ companyId: 'c1', localId: 'l1', role: 'ADMIN' }), {
    companyId: 'c1',
    localId: null,
  });
  assert.deepEqual(getTenantScope({ companyId: 'c1', localId: 'l1', role: 'EMPLEADO' }), {
    companyId: 'c1',
    localId: 'l1',
  });
  assert.deepEqual(getTenantScope({ companyId: 'c1', localId: 'l1', role: 'GERENTE' }), {
    companyId: 'c1',
    localId: null,
  });
  assert.deepEqual(getTenantScope({ companyId: 'c1', localId: 'l1', role: 'CONTADOR' }), {
    companyId: 'c1',
    localId: null,
  });
});

test('El alcance tenant falla cerrado si falta empresa o sucursal de empleado', () => {
  assert.throws(() => getTenantScope({ role: 'ADMIN' }), { statusCode: 403 });
  assert.throws(() => getTenantScope({ companyId: 'c1', role: 'EMPLEADO' }), { statusCode: 403 });
});

test('La venta exige stock positivo y suficiente para toda la cantidad', () => {
  assert.doesNotThrow(() => ensureSufficientSaleStock(2.5, 2.5));
  assert.throws(() => ensureSufficientSaleStock(0, 0.1), { statusCode: 409 });
  assert.throws(() => ensureSufficientSaleStock(-1, 0.1), { statusCode: 409 });
  assert.throws(() => ensureSufficientSaleStock(1, 1.1), { statusCode: 409 });
});

test('El formulario elimina renglones vacíos y convierte cantidades', async () => {
  const req = {
    body: {
      details: [
        { productId: '44e9fe20-e0fc-4dc8-82ab-0b411b860423', quantity: '1.250', unitPrice: '99.90' },
        { productId: '', quantity: '', unitPrice: '' },
      ],
    },
  };
  for (const validator of createSaleValidator) await validator.run(req);

  assert.equal(validationResult(req).isEmpty(), true);
  assert.equal(req.body.details.length, 1);
  assert.equal(req.body.details[0].quantity, 1.25);
  assert.equal(req.body.details[0].unitPrice, '99.90');
});

test('El formulario rechaza cantidades con precisión mayor a la guardada', async () => {
  const req = {
    body: {
      details: [{ productId: '44e9fe20-e0fc-4dc8-82ab-0b411b860423', quantity: '1.0001', unitPrice: '1.001' }],
    },
  };
  for (const validator of createSaleValidator) await validator.run(req);

  assert.equal(validationResult(req).isEmpty(), false);
});

test('El precio de la venta se toma del catálogo y queda guardado como importe histórico', () => {
  const details = priceSaleDetails(
    [{ productId: 'p1', quantity: 1.5, unitPrice: 0.01 }],
    [{ id: 'p1', salePrice: '125.40' }],
  );
  assert.deepEqual(details[0], {
    productId: 'p1',
    quantity: 1.5,
    unitPrice: 125.4,
    lineTotal: 188.1,
  });
});

test('GERENTE y CONTADOR tienen permisos diferenciados y limitados', () => {
  const managerPermissions = BootstrapSecurityService.getDefaultPermissionsForRole('GERENTE');
  const accountantPermissions = BootstrapSecurityService.getDefaultPermissionsForRole('CONTADOR');
  assert.equal(managerPermissions.includes('catalog:manage-products'), true);
  assert.equal(managerPermissions.includes('seguridad:manage-users'), true);
  assert.equal(managerPermissions.includes('reportes:view'), true);
  assert.equal(accountantPermissions.includes('reportes:view'), true);
  assert.equal(accountantPermissions.includes('catalog:manage-products'), false);
  assert.equal(accountantPermissions.includes('seguridad:manage-users'), false);
});
