const test = require('node:test');
const assert = require('node:assert/strict');
const { supportContext } = require('../dist/middlewares/support.middleware.js');
const { SupportAccount, SupportActivity, Company } = require('../dist/models');
const envConfig = require('../dist/config/env.config');

async function exercise({ method = 'GET', origin = 'http://localhost:3000', account = true, auditError = false, missingClient = false, oldSession = false, mustChangePassword = false, production = false, path = '/catalogo/productos' } = {}) {
  const originals = [SupportAccount.findByPk, SupportActivity.create, Company.findByPk];
  const originalProduction = envConfig.isProduction;
  envConfig.isProduction = production;
  const events = [];
  SupportAccount.findByPk = async () => account ? {
    canManageSupport: false,
    user: { isActive: true, companyId: 'gc', username: 'support' },
  } : null;
  SupportActivity.create = async (event) => {
    if (auditError) throw new Error('audit unavailable');
    events.push(event);
  };
  Company.findByPk = async (id) => id === 'gc'
    ? { id: 'gc', isSupportOperator: true, isActive: true }
    : missingClient ? null : { id: 'client', name: 'Cliente', subscriptionPlan: 'FREEMIUM' };
  let nextCalled = false;
  let nextError;
  let status;
  let message;
  let destroyed = false;
  const req = {
    method,
    protocol: 'http',
    path,
    get: (name) => name === 'origin' ? origin : 'localhost:3000',
    session: {
      user: { id: 'support-id', companyId: 'gc', localId: 'gc-local', role: 'EMPLEADO' },
      support: {
        homeCompanyId: 'gc', homeLocalId: 'gc-local', targetCompanyId: 'client',
        canManageSupport: true, mustChangePassword,
      },
      destroy: (callback) => { destroyed = true; callback(); },
    },
  };
  if (oldSession) delete req.session.support;
  const res = {
    locals: {},
    status: (value) => { status = value; return res; },
    send: (value) => { message = value; },
    redirect: (value) => { message = value; },
  };
  try {
    await supportContext(req, res, (error) => { nextCalled = true; nextError = error; });
    return { req, events, nextCalled, nextError, status, message, destroyed };
  } finally {
    [SupportAccount.findByPk, SupportActivity.create, Company.findByPk] = originals;
    envConfig.isProduction = originalProduction;
  }
}

test('una sesión anterior de GC se cierra y vuelve al inicio de sesión', async () => {
  const result = await exercise({ oldSession: true });
  assert.equal(result.destroyed, true);
  assert.equal(result.message, '/auth/login?reason=support-session');
  assert.equal(result.nextCalled, false);
});

test('el cambio de contraseña de soporte se exige en producción, no en desarrollo', async () => {
  const development = await exercise({ mustChangePassword: true });
  assert.equal(development.nextCalled, true);
  assert.equal(development.message, undefined);
  const production = await exercise({ mustChangePassword: true, production: true });
  assert.equal(production.message, '/soporte/cambiar-clave');
  assert.equal(production.nextCalled, false);
});

test('soporte consulta solo la empresa seleccionada y deja un registro', async () => {
  const result = await exercise();
  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
  assert.equal(result.req.session.user.companyId, 'client');
  assert.equal(result.req.session.user.localId, null);
  assert.equal(result.req.session.support.canManageSupport, false);
  assert.equal(result.events[0].companyId, 'client');
  assert.equal(result.events[0].action, 'CONSULTA');
  assert.equal(result.events[0].actorType, 'SOPORTE_GC');
});

test('soporte no puede modificar datos de la empresa y el intento queda registrado', async () => {
  const result = await exercise({ method: 'POST' });
  assert.equal(result.nextError.statusCode, 403);
  assert.equal(result.events[0].action, 'INTENTO');
});

test('se bloquea el acceso si el registro de auditoría falla', async () => {
  const result = await exercise({ auditError: true });
  assert.equal(result.nextError.message, 'audit unavailable');
  assert.equal(result.events.length, 0);
});

test('una cuenta de soporte revocada pierde acceso inmediatamente', async () => {
  const result = await exercise({ account: false });
  assert.equal(result.status, 403);
  assert.equal(result.nextCalled, false);
});

test('una petición de otro origen no puede efectuar acciones de soporte', async () => {
  const result = await exercise({ method: 'POST', origin: 'https://other.example' });
  assert.equal(result.nextError.statusCode, 403);
  assert.equal(result.events.length, 0);
});

test('se puede volver al panel si la empresa dejó de estar disponible', async () => {
  const result = await exercise({ method: 'POST', missingClient: true, path: '/soporte/volver' });
  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
});
