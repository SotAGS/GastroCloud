const test = require('node:test');
const assert = require('node:assert/strict');

const { getPlanCapabilities, getEffectiveSubscriptionPlan, hasCompanyAccess, hasLocalAccess, canAccessFeature } = require('../dist/services/account-policy.service.js');
const { getTenantScope } = require('../dist/utils/tenant-scope.util.js');
const { ensureSufficientSaleStock } = require('../dist/utils/sale-quantity.util.js');
const { priceSaleDetails } = require('../dist/utils/sale-price.util.js');
const { BootstrapSecurityService } = require('../dist/services/bootstrap-security.service.js');
const { validationResult } = require('express-validator');
const { createSaleValidator } = require('../dist/validators/sale.validator.js');
const { loadNavigationPermissions } = require('../dist/middlewares/permission.middleware.js');
const { SecurityController } = require('../dist/controllers/security.controller.js');
const { HttpError } = require('../dist/utils/http-error.util.js');
const ejs = require('ejs');
const path = require('node:path');

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

test('el alcance de un rol se conserva aunque se cambie su nombre', () => {
  assert.deepEqual(getTenantScope({ companyId: 'c1', localId: 'l1', role: 'SUPERVISOR', companyWideAccess: true }), {
    companyId: 'c1',
    localId: null,
  });
  assert.deepEqual(getTenantScope({ companyId: 'c1', localId: 'l1', role: 'CAJERO', companyWideAccess: false }), {
    companyId: 'c1',
    localId: 'l1',
  });
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

test('el menú muestra solo rutas permitidas por rol y plan', async () => {
    async function menu(user, supportMode = false, isProduction = false) {
      const req = { session: { user } };
      const res = { locals: {} };
      let nextError;
      await loadNavigationPermissions(req, res, (error) => { nextError = error; });
      if (nextError) throw nextError;
      return ejs.renderFile(path.join(__dirname, '..', 'src', 'views', 'partials', 'sidebar.ejs'), {
        user, supportMode, isProduction, canNavigate: res.locals.canNavigate,
      });
    }

    const accountant = await menu({
      role: 'CONTADOR', roleId: 'accountant', permissions: ['dashboard:view', 'reportes:view'],
      subscriptionPlan: 'FREEMIUM',
    });
    assert.match(accountant, /href="\/dashboard"/);
    assert.match(accountant, /href="\/reportes\/soporte"/);
    assert.doesNotMatch(accountant, /href="\/ventas"|href="\/stock"|href="\/compras"|href="\/reportes"|href="\/catalogo\/productos"/);

    const customPremium = await menu({
      role: 'PERSONALIZADO', roleId: 'role',
      permissions: ['stock:view', 'catalog:read', 'compras:view'], subscriptionPlan: 'PREMIUM',
    });
    assert.match(customPremium, /href="\/stock"/);
    assert.match(customPremium, /href="\/compras"/);
    assert.match(customPremium, /href="\/catalogo\/productos"/);
    assert.doesNotMatch(customPremium, /href="\/ventas"|href="\/seguridad\/usuarios"/);

    const adminProduction = await menu({ role: 'ADMIN', permissions: [], subscriptionPlan: 'FREEMIUM' }, false, true);
    assert.match(adminProduction, /href="\/seguridad\/usuarios"/);
    assert.doesNotMatch(adminProduction, /href="\/compras"|href="\/planes"/);

    const support = await menu({ role: 'ADMIN', permissions: [], subscriptionPlan: 'FREEMIUM' }, true);
    assert.match(support, /href="\/compras"/);
    assert.doesNotMatch(support, /href="\/empresa"|href="\/planes"/);
});

test('al repetir un email se conserva el formulario sin volver a mostrar la contraseña', async () => {
  const controller = new SecurityController();
  controller.securityService.createUser = async () => { throw new HttpError(400, 'El email ya esta en uso.'); };
  controller.securityService.securityDashboard = async () => ({
    users: [], roles: [{ id: 'r1', name: 'EMPLEADO' }],
    assignableRoles: [{ id: 'r1', name: 'EMPLEADO' }],
    locals: [{ id: 'l1', name: 'Principal' }], canManageRoles: false, availablePermissions: [],
  });
  const user = { companyId: 'c1', localId: 'l1', role: 'ADMIN', subscriptionPlan: 'FREEMIUM' };
  const req = { session: { user }, body: {
    fullName: 'Nombre <prueba>', username: 'usuario', email: 'usado@example.test',
    password: 'secret-not-for-html', roleId: 'r1', localId: 'l1', isActive: 'on',
  } };
  let status;
  let view;
  let locals;
  const res = {
    status(code) { status = code; return this; },
    render(name, data) { view = name; locals = data; },
  };
  let nextError;
  await controller.createUser(req, res, (error) => { nextError = error; });
  assert.equal(nextError, undefined);
  assert.equal(status, 400);
  assert.equal(view, 'seguridad/usuarios');
  const html = await ejs.renderFile(path.join(__dirname, '..', 'src', 'views', 'seguridad', 'usuarios.ejs'), {
    ...locals, supportMode: false, supportCompanyName: null, isProduction: false, canNavigate: () => true,
  });
  assert.match(html, /El email ya esta en uso/);
  assert.match(html, /value="Nombre &lt;prueba&gt;"/);
  assert.match(html, /value="usado@example.test"/);
  assert.match(html, /value="r1" selected/);
  assert.doesNotMatch(html, /secret-not-for-html/);
});
