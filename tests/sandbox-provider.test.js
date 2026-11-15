const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { env } = require('../dist/config/env.config');
const { sandboxProvider } = require('../dist/services/sandbox-payment.service');

test('el proveedor envía HTTPS con el token y procesa la respuesta JSON', async () => {
  const originalRequest = https.request;
  const originalToken = env.mercadoPagoTestAccessToken;
  env.mercadoPagoTestAccessToken = 'test-token';
  let written = '';
  https.request = (url, options, callback) => {
    assert.equal(url, 'https://api.mercadopago.com/checkout/preferences');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.headers['Content-Type'], 'application/json');
    const request = new EventEmitter();
    request.setTimeout = () => request;
    request.write = (body) => { written += body; };
    request.end = () => {
      const response = new PassThrough();
      response.statusCode = 201;
      callback(response);
      response.end('{"id":"preference"}');
    };
    return request;
  };
  try {
    assert.deepEqual(await sandboxProvider.request('/checkout/preferences', 'POST', { amount: 1 }), { id: 'preference' });
    assert.deepEqual(JSON.parse(written), { amount: 1 });
  } finally {
    https.request = originalRequest;
    env.mercadoPagoTestAccessToken = originalToken;
  }
});
