/**
 * docs/openapi.json describes the REST API of the app. The server decides what exists, so this
 * test reads its route table (KioskHttpServer.kt) and fails when the two drift apart: a route
 * added or removed, a method that changed, a command that stopped (or started) checking
 * "Allow remote control", a POST-only endpoint that became GET-able.
 *
 * It also checks the file on its own, as far as a hand-written test can without an OpenAPI
 * validator in the repository: references resolve, ids are unique, path parameters are declared,
 * required body fields exist, no component is left unused.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'openapi.json'), 'utf8'));
const SERVER = fs.readFileSync(
  path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'freekiosk', 'api', 'KioskHttpServer.kt'),
  'utf8',
);

type Route = { method: 'get' | 'post'; path: string; handler: string };

/** The routes of the `when` block of the server, one entry per method. */
function serverRoutes(): Route[] {
  const lines = SERVER.split(/\r?\n/);
  const routes: Route[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*(isGetOrPost|method == Method\.POST|method == Method\.GET) && (uri == "([^"]+)"|uri\.startsWith\("([^"]+)"\)) ->\s*(.*)$/);
    if (!m) continue;
    const kind = m[1];
    const exact = m[3];
    const prefix = m[4];
    const routePath = exact ?? `${prefix}{key}`;
    let rest = m[5];
    const handlerFor = (method: 'get' | 'post'): string => {
      if (rest.startsWith('{')) {
        // handlers chosen by method on the next line: if (method == Method.POST) handleSetX(session) else handleGetX()
        const next = lines[i + 1];
        const pick = next.match(/if \(method == Method\.POST\) (handle\w+)\([^)]*\) else (handle\w+)\(/);
        if (!pick) throw new Error(`cannot read the handlers of ${routePath}`);
        return method === 'post' ? pick[1] : pick[2];
      }
      const h = rest.match(/(handle\w+)\(/);
      if (!h) throw new Error(`cannot read the handler of ${routePath}`);
      return h[1];
    };
    const methods: Array<'get' | 'post'> = kind === 'isGetOrPost' ? ['get', 'post'] : kind.endsWith('POST') ? ['post'] : ['get'];
    for (const method of methods) routes.push({ method, path: routePath, handler: handlerFor(method) });
  }
  return routes;
}

/** Names of the handlers that refuse the request when remote control is off. */
function gatedHandlers(): Set<string> {
  const lines = SERVER.split(/\r?\n/);
  const gated = new Set<string>();
  let current: string | null = null;
  for (const line of lines) {
    const fn = line.match(/private fun (handle\w+)\(/);
    if (fn) current = fn[1];
    if (current && /checkControlAllowed\(\)\?\.let/.test(line)) gated.add(current);
  }
  return gated;
}

function postOnlyUris(): string[] {
  const m = SERVER.match(/val postOnlyUris = setOf\(([\s\S]*?)\)/);
  if (!m) throw new Error('postOnlyUris not found');
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const specOperations: Array<{ method: 'get' | 'post'; path: string; op: any }> = [];
for (const [p, item] of Object.entries<any>(SPEC.paths)) {
  for (const method of ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const) {
    if (item[method]) specOperations.push({ method: method as 'get' | 'post', path: p, op: item[method] });
  }
}

function walk(node: any, visit: (value: any, key: string | null) => void, key: string | null = null): void {
  visit(node, key);
  if (Array.isArray(node)) node.forEach((x) => walk(x, visit, null));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, visit, k);
}

function resolve(refValue: string): any {
  const parts = refValue.replace(/^#\//, '').split('/');
  let cur: any = SPEC;
  for (const part of parts) cur = cur?.[part];
  return cur;
}

describe('docs/openapi.json against the server', () => {
  const routes = serverRoutes();

  it('reads a believable route table from the server', () => {
    expect(routes.length).toBeGreaterThan(90);
    expect(routes.some((r) => r.path === '/api/status' && r.method === 'get')).toBe(true);
    expect(routes.some((r) => r.path === '/api/remote/keyboard/{key}')).toBe(true);
  });

  it('has exactly the routes and methods the server serves', () => {
    const fromServer = new Set(routes.map((r) => `${r.method.toUpperCase()} ${r.path}`));
    const fromSpec = new Set(specOperations.map((o) => `${o.method.toUpperCase()} ${o.path}`));
    const missing = [...fromServer].filter((x) => !fromSpec.has(x));
    const extra = [...fromSpec].filter((x) => !fromServer.has(x));
    expect({ missingFromSpec: missing, notInServer: extra }).toEqual({ missingFromSpec: [], notInServer: [] });
  });

  it('answers 403 exactly where the server checks "Allow remote control"', () => {
    const gated = gatedHandlers();
    const wrong: string[] = [];
    for (const r of routes) {
      const op = SPEC.paths[r.path]?.[r.method];
      if (!op) continue;
      const documented = Boolean(op.responses['403']);
      if (documented !== gated.has(r.handler)) {
        wrong.push(`${r.method.toUpperCase()} ${r.path}: spec ${documented ? 'has' : 'lacks'} 403, handler ${r.handler} ${gated.has(r.handler) ? 'checks' : 'does not check'}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('lists a 405 on the POST-only endpoints and nowhere else', () => {
    const postOnly = new Set(postOnlyUris());
    for (const { method, path: p, op } of specOperations) {
      expect([p, method, Boolean(op.responses['405'])]).toEqual([p, method, method === 'post' && postOnly.has(p)]);
    }
    // and they have no GET operation, since the server refuses it
    for (const p of postOnly) expect(SPEC.paths[p].get).toBeUndefined();
  });

  it('documents the API key both ways the server accepts it', () => {
    expect(SERVER).toContain('x-api-key');
    expect(SERVER).toContain('basicAuthPassword');
    expect(SPEC.components.securitySchemes.ApiKeyHeader).toMatchObject({ type: 'apiKey', in: 'header', name: 'X-Api-Key' });
    expect(SPEC.components.securitySchemes.ApiKeyBasic).toMatchObject({ type: 'http', scheme: 'basic' });
    expect(SPEC.security).toEqual([{ ApiKeyHeader: [] }, { ApiKeyBasic: [] }]);
  });
});

describe('docs/openapi.json on its own', () => {
  it('is an OpenAPI 3.0 document with its basics', () => {
    expect(SPEC.openapi).toMatch(/^3\.0\.\d+$/);
    expect(typeof SPEC.info.title).toBe('string');
    expect(typeof SPEC.info.version).toBe('string');
    expect(SPEC.servers.length).toBeGreaterThan(0);
    for (const p of Object.keys(SPEC.paths)) expect(p.startsWith('/')).toBe(true);
  });

  it('has references that all resolve', () => {
    const broken: string[] = [];
    walk(SPEC, (value, key) => {
      if (key === '$ref' && typeof value === 'string' && resolve(value) === undefined) broken.push(value);
    });
    expect(broken).toEqual([]);
  });

  it('has no component that nothing uses', () => {
    const used = new Set<string>();
    walk(SPEC, (value, key) => {
      if (key === '$ref' && typeof value === 'string') used.add(value);
    });
    const unused: string[] = [];
    for (const section of ['schemas', 'responses'] as const) {
      for (const name of Object.keys(SPEC.components[section])) {
        if (!used.has(`#/components/${section}/${name}`)) unused.push(`${section}/${name}`);
      }
    }
    expect(unused).toEqual([]);
  });

  it('gives every operation a unique id, a summary, a declared tag and described responses', () => {
    const ids = new Set<string>();
    const tags = new Set<string>(SPEC.tags.map((t: any) => t.name));
    for (const { method, path: p, op } of specOperations) {
      const label = `${method.toUpperCase()} ${p}`;
      expect([label, typeof op.operationId]).toEqual([label, 'string']);
      expect([label, ids.has(op.operationId)]).toEqual([label, false]);
      ids.add(op.operationId);
      expect([label, typeof op.summary]).toEqual([label, 'string']);
      expect(op.tags.length).toBe(1);
      expect([label, tags.has(op.tags[0])]).toEqual([label, true]);
      expect([label, Boolean(op.responses['200'])]).toEqual([label, true]);
      for (const [code, response] of Object.entries<any>(op.responses)) {
        expect([label, code, /^[1-5]\d\d$/.test(code)]).toEqual([label, code, true]);
        const resolved = response.$ref ? resolve(response.$ref) : response;
        expect([label, code, typeof resolved.description]).toEqual([label, code, 'string']);
      }
    }
  });

  it('declares every path parameter and no parameter twice', () => {
    for (const [p, item] of Object.entries<any>(SPEC.paths)) {
      const templated = [...p.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const { op, path: opPath } of specOperations.filter((o) => o.path === p)) {
        const params = [...(item.parameters ?? []), ...(op.parameters ?? [])];
        for (const name of templated) {
          const declared = params.find((x: any) => x.in === 'path' && x.name === name);
          expect([opPath, name, Boolean(declared?.required)]).toEqual([opPath, name, true]);
        }
        const seen = new Set<string>();
        for (const x of params) {
          expect(['query', 'path', 'header']).toContain(x.in);
          const key = `${x.in}:${x.name}`;
          expect([opPath, key, seen.has(key)]).toEqual([opPath, key, false]);
          seen.add(key);
        }
      }
    }
  });

  it('only requires body fields that exist, and bodies are JSON objects', () => {
    for (const { method, path: p, op } of specOperations) {
      if (!op.requestBody) continue;
      const schema = op.requestBody.content['application/json'].schema;
      expect([method, p, schema.type]).toEqual([method, p, 'object']);
      for (const name of schema.required ?? []) {
        expect([p, name, name in schema.properties]).toEqual([p, name, true]);
      }
    }
  });
});
