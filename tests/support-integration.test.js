const test = require('node:test');
const assert = require('node:assert/strict');

test('soporte entra en una empresa con auditoría y no puede modificarla', {
  skip: process.env.SUPPORT_INTEGRATION_TEST !== '1',
}, async () => {
  assert.match(process.env.DB_NAME || '', /^gastrocloud_support_test_[0-9]+$/);
  process.env.MERCADOPAGO_TEST_ACCESS_TOKEN = 'integration-test-token';
  const bcrypt = require('bcrypt');
  const signature = require('cookie-signature');
  const fs = require('node:fs');
  const path = require('node:path');
  const { connectDatabase, sequelize } = require('../dist/config/database.config');
  const { sessionStore } = require('../dist/config/session.config');
  const { env } = require('../dist/config/env.config');
  const { createApp } = require('../dist/app');
  const { BootstrapSecurityService } = require('../dist/services/bootstrap-security.service');
  const { sandboxProvider } = require('../dist/services/sandbox-payment.service');
  const { Company, Local, Role, User, SupportAccount, SupportActivity, PaymentAttempt } = require('../dist/models');
  const originalProviderRequest = sandboxProvider.request;
  const sandboxPayments = new Map();
  let checkoutUrl = 'https://sandbox.mercadopago.com/mla/checkout/pay?pref_id=integration';
  sandboxProvider.request = async (path, method, payload) => {
    const url = new URL(path, 'https://api.mercadopago.com');
    if (url.pathname === '/checkout/preferences' && method === 'POST') {
      const request = payload;
      assert.equal(request.items[0].unit_price, 1);
      assert.equal(request.items[0].currency_id, 'ARS');
      return { id: 'integration-preference', collector_id: 12345, sandbox_init_point: checkoutUrl };
    }
    if (url.pathname === '/v1/payments/search' && method === 'GET') {
      return { results: sandboxPayments.get(url.searchParams.get('external_reference')) || [] };
    }
    throw new Error('Solicitud inesperada al proveedor simulado');
  };
  let server;
  try {
    await sequelize.authenticate();
    const [existingTables] = await sequelize.query(
      "SELECT count(*) AS total FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'",
    );
    assert.equal(Number(existingTables[0].total), 0, 'La base de integración debe estar vacía');
    await connectDatabase();
    await sequelize.query('DROP TABLE support_activity, support_account, payment_attempt');
    await sequelize.query('ALTER TABLE company DROP COLUMN is_support_operator, DROP COLUMN premium_expires_at');
    const migration = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'migrations', '002_support_access.sql'), 'utf8');
    await sequelize.query(migration);
    await sequelize.query(migration);
    const premiumMigration = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'migrations', '003_premium_expiration.sql'), 'utf8');
    await sequelize.query(premiumMigration);
    await sequelize.query(premiumMigration);
    await BootstrapSecurityService.ensureBaseSecurityData();
    await sessionStore.sync();
    const globalEmployeeRole = await Role.findOne({ where: { name: 'EMPLEADO', companyId: null }, rejectOnEmpty: true });
    const legacyCompany = await Company.create({ name: 'Empresa anterior', slug: 'empresa-anterior', isActive: true });
    const legacyLocal = await Local.create({ name: 'Sucursal', companyId: legacyCompany.id, isActive: true });
    const legacyManager = await Role.create({
      name: 'GERENTE', companyId: legacyCompany.id, description: 'Gerente anterior',
    });
    const legacyEmployee = await User.create({
      roleId: globalEmployeeRole.id, companyId: legacyCompany.id, localId: legacyLocal.id,
      fullName: 'Empleado anterior', username: 'legacy_employee', email: 'legacy@example.test',
      passwordHash: await bcrypt.hash('legacy-password', 10), isActive: true,
    });
    await sequelize.query('ALTER TABLE role DROP COLUMN company_wide_access');
    const rolesMigration = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'migrations', '004_company_roles.sql'), 'utf8');
    await sequelize.query(rolesMigration);
    await sequelize.query(rolesMigration);
    const legacyRole = await Role.findOne({
      where: { companyId: legacyCompany.id, name: 'EMPLEADO' }, include: ['permissions'], rejectOnEmpty: true,
    });
    await legacyEmployee.reload();
    assert.equal(legacyEmployee.roleId, legacyRole.id);
    await legacyManager.reload();
    assert.equal(legacyManager.companyWideAccess, true);
    assert.deepEqual(
      legacyRole.permissions.map((p) => `${p.module}:${p.action}`).sort(),
      BootstrapSecurityService.getDefaultPermissionsForRole('EMPLEADO').sort(),
    );
    const role = await Role.findOne({ where: { name: 'ADMIN', companyId: null }, rejectOnEmpty: true });
    const home = await Company.create({ name: 'Operador', slug: 'operador', subscriptionPlan: 'PREMIUM', subscriptionStatus: 'ACTIVE', isActive: true, isSupportOperator: true });
    const homeLocal = await Local.create({ name: 'Origen', companyId: home.id, isActive: true });
    const client = await Company.create({ name: 'Empresa Uno', slug: 'empresa-uno', subscriptionPlan: 'FREEMIUM', subscriptionStatus: 'ACTIVE', isActive: true });
    const clientLocal = await Local.create({ name: 'Sucursal', companyId: client.id, isActive: true });
    const other = await Company.create({ name: 'Empresa Dos', slug: 'empresa-dos', subscriptionPlan: 'FREEMIUM', subscriptionStatus: 'ACTIVE', isActive: true });
    const otherLocal = await Local.create({ name: 'Sucursal', companyId: other.id, isActive: true });
    const inactive = await Company.create({ name: 'Empresa Inactiva', slug: 'empresa-inactiva', subscriptionPlan: 'FREEMIUM', subscriptionStatus: 'ACTIVE', isActive: false });
    const user = await User.create({
      roleId: role.id, companyId: home.id, localId: homeLocal.id, fullName: 'Operador',
      username: 'test_support', email: 'test_support@example.test',
      passwordHash: await bcrypt.hash('shortpass', 10), isActive: true,
    });
    await SupportAccount.create({ userId: user.id, canManageSupport: true });
    await User.create({
      roleId: role.id, companyId: home.id, localId: homeLocal.id, fullName: 'No habilitado',
      username: 'operator_without_support', email: 'operator_without_support@example.test',
      passwordHash: await bcrypt.hash('owner-password', 10), isActive: true,
    });
    for (const [company, local, username] of [[client, clientLocal, 'owner_one'], [other, otherLocal, 'owner_two']]) {
      await User.create({
        roleId: role.id, companyId: company.id, localId: local.id, fullName: username,
        username, email: `${username}@example.test`,
        passwordHash: await bcrypt.hash('owner-password', 10), isActive: true,
      });
    }

    server = createApp().listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const legacyId = `legacy-${Date.now()}`;
    await new Promise((resolve, reject) => sessionStore.set(legacyId, {
      cookie: { originalMaxAge: 60000, expires: new Date(Date.now() + 60000), httpOnly: true, path: '/' },
      user: { id: user.id, companyId: home.id, localId: homeLocal.id, role: 'ADMIN' },
    }, (error) => error ? reject(error) : resolve()));
    const legacyCookie = `connect.sid=${encodeURIComponent(`s:${signature.sign(legacyId, env.sessionSecret)}`)}`;
    let legacyResponse = await fetch(`${base}/dashboard`, { headers: { cookie: legacyCookie }, redirect: 'manual' });
    assert.equal(legacyResponse.status, 302);
    assert.equal(legacyResponse.headers.get('location'), '/auth/login?reason=support-session');
    legacyResponse = await fetch(`${base}/auth/login?reason=support-session`, { headers: { cookie: legacyCookie } });
    assert.equal(legacyResponse.status, 200);
    assert.match(await legacyResponse.text(), /sesión anterior ya no es válida/);
    const storedLegacy = await new Promise((resolve, reject) => sessionStore.get(legacyId, (error, session) => error ? reject(error) : resolve(session)));
    assert.ok(!storedLegacy);
    function browser() {
      let cookie = '';
      return async (path, { method = 'GET', body, origin = base } = {}) => {
        const headers = { origin };
        if (cookie) headers.cookie = cookie;
        if (body) headers['content-type'] = 'application/x-www-form-urlencoded';
        const response = await fetch(base + path, {
          method, headers, body: body && new URLSearchParams(body), redirect: 'manual',
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return response;
      };
    }
    const support = browser();
    let response = await support('/auth/login', { method: 'POST', body: { usernameOrEmail: 'test_support', password: 'shortpass' } });
    assert.equal(response.status, 302);
    response = await support('/soporte');
    assert.equal(response.status, 200);
    const panel = await response.text();
    assert.match(panel, /Empresa Uno/);
    assert.match(panel, /Empresa Inactiva/);
    response = await support(`/soporte/acceder/${client.id}`, { method: 'POST' });
    assert.equal(response.headers.get('location'), '/dashboard');
    response = await support('/catalogo/productos');
    assert.equal(response.status, 200);
    response = await support('/reportes');
    assert.equal(response.status, 200);
    response = await support('/catalogo/categorias', { method: 'POST', body: { name: 'forbidden' } });
    assert.equal(response.status, 403);
    response = await support('/empresa/baja', {
      method: 'POST', body: { confirmation: 'DAR DE BAJA', password: 'shortpass' },
    });
    assert.equal(response.status, 403);
    await client.reload();
    assert.equal(client.isActive, true);
    response = await support('/soporte/volver', { method: 'POST', origin: 'https://other.example' });
    assert.equal(response.status, 403);
    response = await support('/soporte/volver', { method: 'POST' });
    assert.equal(response.headers.get('location'), '/soporte');
    response = await support(`/soporte/acceder/${inactive.id}`, { method: 'POST' });
    assert.equal(response.status, 302);
    response = await support('/dashboard');
    assert.equal(response.status, 200);
    response = await support('/soporte/volver', { method: 'POST' });
    assert.equal(response.status, 302);
    response = await support('/soporte/cuentas', {
      method: 'POST',
      body: { fullName: 'Soporte dos', username: 'test_support_two', email: 'support_two@example.test', password: 'strong-test-password' },
    });
    assert.equal(response.status, 302);
    const supportTwo = browser();
    response = await supportTwo('/auth/login', {
      method: 'POST', body: { usernameOrEmail: 'test_support_two', password: 'strong-test-password' },
    });
    assert.equal(response.status, 302);
    response = await supportTwo('/soporte/cuentas', {
      method: 'POST',
      body: { fullName: 'Forbidden', username: 'forbidden', email: 'forbidden@example.test', password: 'strong-test-password' },
    });
    assert.equal(response.status, 403);
    const activities = await SupportActivity.findAll({ where: { companyId: client.id }, order: [['createdAt', 'ASC']] });
    assert.ok(activities.some((entry) => entry.action === 'INGRESO'));
    assert.ok(activities.some((entry) => entry.action === 'CONSULTA' && entry.path === '/catalogo/productos'));
    assert.ok(activities.some((entry) => entry.action === 'INTENTO'));
    assert.ok(activities.some((entry) => entry.action === 'SALIDA'));
    assert.equal(await SupportActivity.count({ where: { companyId: other.id } }), 0);

    const owner = browser();
    const unprivileged = browser();
    response = await unprivileged('/auth/login', {
      method: 'POST', body: { usernameOrEmail: 'operator_without_support', password: 'owner-password' },
    });
    assert.equal(response.status, 403);
    response = await owner('/auth/login', { method: 'POST', body: { usernameOrEmail: 'owner_one', password: 'owner-password' } });
    assert.equal(response.status, 302);
    response = await owner('/soporte');
    assert.equal(response.status, 403);
    response = await owner('/reportes/soporte');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /test_support/);
    const otherOwner = browser();
    await otherOwner('/auth/login', { method: 'POST', body: { usernameOrEmail: 'owner_two', password: 'owner-password' } });
    response = await otherOwner('/reportes/soporte');
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), /test_support/);

    response = await owner('/planes');
    assert.equal(response.status, 200);
    checkoutUrl = 'https://example.test/not-a-sandbox';
    response = await owner('/planes/pagos', { method: 'POST' });
    assert.equal(response.status, 502);
    assert.equal(await PaymentAttempt.count({ where: { companyId: client.id } }), 0);
    checkoutUrl = 'https://sandbox.mercadopago.com/mla/checkout/pay?pref_id=integration';
    response = await owner('/planes/pagos', { method: 'POST' });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location'), /^https:\/\/sandbox\.mercadopago\.com\//);
    const attempt = await PaymentAttempt.findOne({ where: { companyId: client.id }, rejectOnEmpty: true });
    response = await otherOwner(`/planes/pagos/${attempt.id}/confirmar`, { method: 'POST' });
    assert.equal(response.status, 404);
    response = await owner(`/planes/pagos/${attempt.id}/confirmar`, { method: 'POST' });
    assert.equal(response.status, 409);
    const payment = {
      id: 888888, status: 'approved', live_mode: true, external_reference: attempt.id,
      currency_id: 'ARS', transaction_amount: 1, collector_id: 12345, date_approved: new Date().toISOString(),
    };
    sandboxPayments.set(attempt.id, [payment]);
    response = await owner(`/planes/pagos/${attempt.id}/confirmar`, { method: 'POST' });
    assert.equal(response.status, 409);
    payment.live_mode = false;
    payment.transaction_amount = 2;
    response = await owner(`/planes/pagos/${attempt.id}/confirmar`, { method: 'POST' });
    assert.equal(response.status, 409);
    payment.transaction_amount = 1;
    response = await owner(`/planes/pagos/${attempt.id}/confirmar`, { method: 'POST' });
    assert.equal(response.status, 302);
    await client.reload();
    assert.equal(client.subscriptionPlan, 'PREMIUM');
    assert.equal(client.premiumExpiresAt.getTime(), new Date(payment.date_approved).getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiration = client.premiumExpiresAt.getTime();
    response = await owner(`/planes/pagos/${attempt.id}/confirmar`, { method: 'POST' });
    assert.equal(response.status, 302);
    await client.reload();
    assert.equal(client.premiumExpiresAt.getTime(), expiration);
    response = await owner('/ia/chat');
    assert.equal(response.status, 200);
    await client.update({ subscriptionStatus: 'PAST_DUE' });
    response = await owner('/ia/chat');
    assert.equal(response.status, 403);
    response = await owner('/compras');
    assert.equal(response.status, 403);
    response = await owner('/seguridad/roles', { method: 'POST', body: { name: 'ROL_PRUEBA' } });
    assert.equal(response.status, 403);
    response = await owner('/ventas');
    assert.equal(response.status, 200);
    await client.update({ subscriptionStatus: 'ACTIVE', premiumExpiresAt: new Date(Date.now() - 1000) });
    response = await owner('/ia/chat');
    assert.equal(response.status, 403);

    const secondSession = browser();
    response = await secondSession('/auth/login', { method: 'POST', body: { usernameOrEmail: 'owner_two', password: 'owner-password' } });
    assert.equal(response.status, 302);
    response = await otherOwner('/empresa');
    assert.equal(response.status, 200);
    response = await otherOwner('/empresa/baja', {
      method: 'POST', origin: 'https://other.example',
      body: { confirmation: 'DAR DE BAJA', password: 'owner-password' },
    });
    assert.equal(response.status, 403);
    response = await otherOwner('/empresa/baja', {
      method: 'POST', body: { confirmation: 'DAR DE BAJA', password: 'incorrect' },
    });
    assert.equal(response.status, 403);
    await other.reload();
    assert.equal(other.isActive, true);
    response = await otherOwner('/empresa/baja', {
      method: 'POST', body: { confirmation: 'DAR DE BAJA', password: 'owner-password' },
    });
    assert.equal(response.status, 302);
    await other.reload();
    assert.equal(other.isActive, false);
    response = await secondSession('/dashboard');
    assert.equal(response.headers.get('location'), '/auth/login?reason=company-inactive');
    response = await secondSession('/auth/login', {
      method: 'POST', body: { usernameOrEmail: 'owner_two', password: 'owner-password' },
    });
    assert.equal(response.status, 403);
    response = await support(`/soporte/acceder/${other.id}`, { method: 'POST' });
    assert.equal(response.status, 302);
    response = await support('/dashboard');
    assert.equal(response.status, 200);
    response = await support('/soporte/volver', { method: 'POST' });
    assert.equal(response.status, 302);

    const publicUser = browser();
    response = await publicUser('/auth/register', {
      method: 'POST',
      body: {
        companyName: 'Empresa nueva', localName: 'Principal',
        email: 'owner_new@example.test', password: '1',
      },
    });
    assert.equal(response.status, 302);
    response = await publicUser('/dashboard');
    assert.equal(response.status, 200);
    const registered = await User.findOne({
      where: { email: 'owner_new@example.test' },
      include: ['company', 'local', 'role'],
    });
    assert.equal(registered.company.name, 'Empresa nueva');
    assert.equal(registered.local.name, 'Principal');
    assert.equal(registered.company.subscriptionPlan, 'FREEMIUM');
    assert.equal(registered.role.name, 'ADMIN');
    assert.equal(registered.company.isSupportOperator, false);
    assert.equal(await SupportAccount.count({ where: { userId: registered.id } }), 0);
    response = await publicUser('/seguridad');
    assert.equal(response.status, 200);
    const employeeRole = await Role.findOne({
      where: { name: 'EMPLEADO', companyId: registered.companyId }, rejectOnEmpty: true,
    });
    response = await publicUser('/seguridad/usuarios', {
      method: 'POST',
      body: {
        fullName: 'Usuario adicional',
        username: 'new_employee',
        email: 'owner_new@example.test',
        password: 'temporary-password',
        roleId: employeeRole.id,
        localId: registered.localId,
        isActive: 'on',
      },
    });
    assert.equal(response.status, 400);
    const duplicateEmailPage = await response.text();
    assert.match(duplicateEmailPage, /El email ya esta en uso/);
    assert.match(duplicateEmailPage, /value="Usuario adicional"/);
    assert.match(duplicateEmailPage, /value="new_employee"/);
    assert.doesNotMatch(duplicateEmailPage, /temporary-password/);
    assert.equal(await User.count({ where: { companyId: registered.companyId } }), 1);
    await legacyEmployee.destroy();
    response = await publicUser('/seguridad/usuarios', {
      method: 'POST',
      body: {
        fullName: 'Usuario adicional', username: 'new_employee', email: 'legacy@example.test',
        password: '1', roleId: employeeRole.id, localId: registered.localId, isActive: 'on',
      },
    });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /El email ya esta en uso/);
    response = await publicUser('/seguridad/usuarios', {
      method: 'POST',
      body: {
        fullName: 'Usuario adicional',
        username: 'new_employee',
        email: 'new_employee@example.test',
        password: '1',
        roleId: employeeRole.id,
        localId: registered.localId,
        isActive: 'on',
      },
    });
    assert.equal(response.status, 302);
    response = await publicUser('/seguridad/usuarios', {
      method: 'POST',
      body: {
        fullName: 'Usuario excedido',
        username: 'extra_employee',
        email: 'extra_employee@example.test',
        password: '1',
        roleId: employeeRole.id,
        localId: registered.localId,
      },
    });
    assert.equal(response.status, 403);
    assert.equal(await User.count({ where: { companyId: registered.companyId } }), 2);

    await registered.company.update({ subscriptionPlan: 'PREMIUM', subscriptionStatus: 'ACTIVE' });
    response = await publicUser('/seguridad');
    assert.equal(response.status, 200);
    assert.match(await response.text(), new RegExp(`value="${employeeRole.id}"`));
    const employee = browser();
    response = await employee('/auth/login', {
      method: 'POST', body: { usernameOrEmail: 'new_employee', password: '1' },
    });
    assert.equal(response.status, 302);
    response = await employee('/stock');
    assert.equal(response.status, 200);
    response = await publicUser(`/seguridad/roles/${employeeRole.id}`, {
      method: 'POST', body: { _method: 'PUT', name: 'CAJERO', description: 'Caja' },
    });
    assert.equal(response.status, 302);
    response = await publicUser(`/seguridad/roles/${employeeRole.id}/permisos`, {
      method: 'POST', body: { _method: 'PATCH', permissions: 'dashboard:view' },
    });
    assert.equal(response.status, 302);
    response = await employee('/stock');
    assert.equal(response.status, 403);
    response = await employee('/dashboard');
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), /href="\/stock"/);
    await BootstrapSecurityService.ensureBaseSecurityData();
    await employeeRole.reload();
    assert.equal(employeeRole.name, 'CAJERO');
    await sequelize.query(rolesMigration);
    assert.equal(await Role.count({ where: { companyId: registered.companyId, name: 'EMPLEADO' } }), 0);
    response = await publicUser(`/seguridad/roles/${employeeRole.id}`, {
      method: 'POST', body: { _method: 'DELETE' },
    });
    assert.equal(response.status, 400);
    response = await publicUser('/seguridad/roles', { method: 'POST', body: { name: 'TEMPORAL' } });
    assert.equal(response.status, 302);
    const temporaryRole = await Role.findOne({ where: { companyId: registered.companyId, name: 'TEMPORAL' }, rejectOnEmpty: true });
    response = await publicUser(`/seguridad/roles/${temporaryRole.id}`, { method: 'POST', body: { _method: 'DELETE' } });
    assert.equal(response.status, 302);
    assert.equal(await Role.findByPk(temporaryRole.id), null);
    const managerRole = await Role.findOne({ where: { companyId: registered.companyId, name: 'GERENTE' }, rejectOnEmpty: true });
    response = await publicUser(`/seguridad/roles/${managerRole.id}`, {
      method: 'POST', body: { _method: 'PUT', name: 'SUPERVISOR', description: 'Empresa' },
    });
    assert.equal(response.status, 302);
    await managerRole.reload();
    assert.equal(managerRole.companyWideAccess, true);
    response = await publicUser(`/seguridad/roles/${managerRole.id}/permisos`, {
      method: 'POST', body: { _method: 'PATCH', permissions: 'dashboard:view' },
    });
    assert.equal(response.status, 302);
    await BootstrapSecurityService.ensureBaseSecurityData();
    const managerPermissions = await Role.findByPk(managerRole.id, { include: ['permissions'] });
    assert.deepEqual(managerPermissions.permissions.map((p) => `${p.module}:${p.action}`), ['dashboard:view']);
    assert.equal(await Role.count({ where: { companyId: registered.companyId, name: 'GERENTE' } }), 0);
    assert.equal((await Role.findByPk(legacyRole.id, { include: ['permissions'] })).permissions.length, legacyRole.permissions.length);
    response = await publicUser(`/seguridad/roles/${managerRole.id}`, { method: 'POST', body: { _method: 'DELETE' } });
    assert.equal(response.status, 302);
  } finally {
    sandboxProvider.request = originalProviderRequest;
    if (server) await new Promise((resolve) => server.close(resolve));
    sessionStore.stopExpiringSessions();
    await sequelize.close();
  }
});
