import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function compile(relative, mocks = {}) {
  const path = new URL(relative, import.meta.url);
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name in mocks ? mocks[name] : name.startsWith('.') ? compile(new URL(`${name}.ts`, path), mocks) : require(name), mod, mod.exports);
  return mod.exports;
}
const ip = compile('../app/lib/securityIp.ts');
test('normaliza IPv4, IPv6 y direcciones equivalentes; rechaza entradas inválidas', () => {
  assert.equal(ip.normalizeIp(' 203.0.113.10 '), '203.0.113.10');
  assert.equal(ip.normalizeIp('2001:0DB8:0:0:0:0:0:1'), '2001:db8::1');
  assert.equal(ip.normalizeIp('::ffff:203.0.113.10'), '203.0.113.10');
  for (const value of ['fe80::1%eth0', '1.2.3.999', '1.2.3.4/24', 'global', null]) assert.equal(ip.normalizeIp(value), null);
});
test('producción solo acepta cabeceras del proxy configurado', () => {
  const old = { ...process.env };
  try {
    process.env.NODE_ENV = 'production'; delete process.env.VERCEL; delete process.env.TRUSTED_CLIENT_IP_HEADER;
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.10', 'x-client-ip': '192.0.2.1' });
    assert.equal(ip.requestIp(headers), null);
    process.env.TRUSTED_CLIENT_IP_HEADER = 'x-client-ip';
    assert.equal(ip.requestIp(headers), '192.0.2.1');
    process.env.VERCEL = '1';
    assert.equal(ip.requestIp(headers), '203.0.113.10');
  } finally { process.env = old; }
});
test('solo Saúl puede consultar, bloquear y desbloquear; cambios persisten separados del bloqueo global', async () => {
  let session = null;
  const rows = new Map([['global', { state_id: 'global', active: false }]]);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (init.method === 'POST') {
      const row = JSON.parse(init.body); rows.set(row.state_id, row); return Response.json([row]);
    }
    return Response.json([...rows.values()].filter(row => row.state_id.startsWith('ip:') && row.active));
  };
  const db = { supabaseAdminHeaders: () => ({}), supabaseUserHeaders: () => ({}), supabaseRest: (table, query) => `https://test/${table}${query}`, supabaseError: async () => 'error' };
  const route = compile('../app/api/security/ip-blocks/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '../../../lib/authServer': { getAuthenticatedSession: async () => session },
    '../../../lib/securityIp': { ...ip, requestIp: () => '192.0.2.1' },
    '../../../lib/supabaseServer': db, './supabaseServer': db,
  });
  const request = (body) => new Request('https://test/api/security/ip-blocks', { method: 'POST', body: JSON.stringify(body) });
  try {
    for (const user of [null, { email: 'otro@gmail.com', isAdmin: true }]) {
      session = user;
      assert.equal((await route.GET(new Request('https://test'))).status, 403);
      assert.equal((await route.POST(request({ ip: '203.0.113.10', active: true }))).status, 403);
    }
    session = { email: 'saul808c@gmail.com', accessToken: 'test' };
    assert.equal((await route.POST(request({ ip: 'global', active: true }))).status, 400);
    assert.equal((await route.POST(request({ ip: '::ffff:203.0.113.10', active: true, reason: 'Prueba' }))).status, 200);
    assert.equal((await (await route.GET(new Request('https://test'))).json()).records[0].ip, '203.0.113.10');
    assert.equal((await route.POST(request({ ip: '203.0.113.10', active: false }))).status, 200);
    assert.equal((await (await route.GET(new Request('https://test'))).json()).records.length, 0);
    assert.equal(rows.get('global').active, false);
    globalThis.fetch = async () => Response.json({}, { status: 500 });
    assert.equal((await route.POST(request({ ip: '203.0.113.10', active: true }))).status, 500);
  } finally { globalThis.fetch = oldFetch; }
});
test('proxy bloquea sesiones y acceso público; solo identidad verificada de Saúl permite la excepción', async () => {
  let verifiedOwner = false;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => verifiedOwner ? Response.json({ id: 'owner', email: 'saul808c@gmail.com' }) : Response.json({}, { status: 401 });
  const { proxy } = compile('../proxy.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init), next: () => new Response(), redirect: url => Response.redirect(url) } },
    './app/lib/securityIpState': { isIpBlocked: async () => true },
    './app/lib/securityIp': { requestIp: () => '203.0.113.10' },
    './app/lib/supabaseServer': { requireSupabaseKey: () => 'test', SUPABASE_URL: 'https://test' },
  });
  const request = (path, token) => ({ nextUrl: { pathname: path }, url: `https://test${path}`, method: 'GET', headers: new Headers(), cookies: { get: () => token ? { value: token } : undefined } });
  try {
    assert.equal((await proxy(request('/api/seguimiento'))).status, 423);
    const forged = `x.${Buffer.from(JSON.stringify({ email: 'saul808c@gmail.com' })).toString('base64url')}.x`;
    assert.equal((await proxy(request('/api/seguimiento', forged))).status, 423);
    assert.equal((await proxy(request('/admin', forged))).status, 302);
    assert.equal((await proxy(request('/'))).status, 200);
    assert.equal((await proxy(request('/api/session/login'))).status, 200);
    verifiedOwner = true;
    assert.equal((await proxy(request('/api/seguimiento', 'valid'))).status, 200);
  } finally { globalThis.fetch = oldFetch; }
});
