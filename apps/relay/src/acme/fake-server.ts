/**
 * A small ACME server for tests and the local development stack (RELAY.md §6, P2.5). It checks
 * JWS signatures, nonces and URLs like a real CA, validates dns-01 through a TXT lookup and
 * signs CSRs with an injected signer (a test CA). Plain HTTP on 127.0.0.1.
 */
import { randomBytes, X509Certificate } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { dns01Value, type EcJwk, type Jws, verifyJws } from './jws.ts';

export interface FakeAcmeOptions {
  /** TXT values currently visible for a name. */
  lookupTxt: (name: string) => string[];
  /** Signs a CSR (DER); returns the leaf PEM. Throws for an unacceptable CSR. */
  signCsr: (csrDer: Buffer) => string;
  /** Appended to every issued leaf (the issuing CA). */
  chainPem?: string;
  /** Answer the next N POSTs with badNonce (tests the client's retry). */
  badNonces?: number;
  /** Authorizations stay pending forever (tests timeouts). */
  neverValidate?: boolean;
}

interface Order {
  id: number;
  account: string;
  names: string[];
  authz: number[];
  status: 'pending' | 'ready' | 'processing' | 'valid' | 'invalid';
  cert?: string;
}
interface Authz {
  id: number;
  name: string;
  token: string;
  status: 'pending' | 'valid' | 'invalid';
}

export async function startFakeAcme(o: FakeAcmeOptions) {
  const nonces = new Set<string>();
  const accounts = new Map<string, EcJwk>();
  const orders = new Map<number, Order>();
  const authzs = new Map<number, Authz>();
  let seq = 1;
  let badNonces = o.badNonces ?? 0;
  const stats = { posts: 0, badNonceSent: 0, finalized: 0 };
  let base = '';

  const nonce = () => {
    const n = randomBytes(16).toString('base64url');
    nonces.add(n);
    return n;
  };
  const send = (
    res: http.ServerResponse,
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ) => {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, {
      'content-type':
        typeof body === 'string' ? 'application/pem-certificate-chain' : 'application/json',
      'replay-nonce': nonce(),
      ...headers,
    });
    res.end(text);
  };
  const problem = (res: http.ServerResponse, status: number, type: string) => {
    send(res, status, { type: `urn:ietf:params:acme:error:${type}`, detail: type });
  };
  const orderJson = (ord: Order) => ({
    status: ord.status,
    identifiers: ord.names.map((value) => ({ type: 'dns', value })),
    authorizations: ord.authz.map((a) => `${base}/authz/${String(a)}`),
    finalize: `${base}/finalize/${String(ord.id)}`,
    ...(ord.cert ? { certificate: `${base}/cert/${String(ord.id)}` } : {}),
  });

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString()));
    req.on('end', () => {
      const path = req.url ?? '/';
      if (req.method === 'GET' && path === '/directory') {
        send(res, 200, {
          newNonce: `${base}/new-nonce`,
          newAccount: `${base}/new-account`,
          newOrder: `${base}/new-order`,
        });
        return;
      }
      if (path === '/new-nonce') {
        res.writeHead(200, { 'replay-nonce': nonce(), 'cache-control': 'no-store' });
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        problem(res, 405, 'malformed');
        return;
      }
      stats.posts++;
      let jws: Jws;
      let header: { alg?: string; nonce?: string; url?: string; jwk?: EcJwk; kid?: string };
      try {
        jws = JSON.parse(raw) as Jws;
        header = JSON.parse(Buffer.from(jws.protected, 'base64url').toString()) as typeof header;
      } catch {
        problem(res, 400, 'malformed');
        return;
      }
      if (badNonces > 0 || !header.nonce || !nonces.delete(header.nonce)) {
        if (badNonces > 0) badNonces--;
        stats.badNonceSent++;
        problem(res, 400, 'badNonce');
        return;
      }
      if (header.alg !== 'ES256' || header.url !== `${base}${path}`) {
        problem(res, 400, 'malformed');
        return;
      }
      const jwk = header.jwk ?? (header.kid ? accounts.get(header.kid) : undefined);
      if (!jwk || !verifyJws(jws, jwk)) {
        problem(res, 401, 'unauthorized');
        return;
      }
      const payload: unknown =
        jws.payload === '' ? null : JSON.parse(Buffer.from(jws.payload, 'base64url').toString());
      const id = Number(path.split('/')[2]);

      if (path === '/new-account') {
        if (!header.jwk) {
          problem(res, 400, 'malformed');
          return;
        }
        const url = `${base}/acct/${String(seq++)}`;
        accounts.set(url, header.jwk);
        send(res, 201, { status: 'valid' }, { location: url });
        return;
      }
      if (!header.kid || !accounts.has(header.kid)) {
        problem(res, 400, 'accountDoesNotExist');
        return;
      }
      const account = header.kid;

      if (path === '/new-order') {
        const p = payload as { identifiers?: { type: string; value: string }[] } | null;
        const names = (p?.identifiers ?? []).map((i) => i.value);
        if (names.length === 0) {
          problem(res, 400, 'malformed');
          return;
        }
        const ord: Order = { id: seq++, account, names, authz: [], status: 'pending' };
        for (const name of names) {
          const a: Authz = {
            id: seq++,
            name,
            token: randomBytes(16).toString('base64url'),
            status: 'pending',
          };
          authzs.set(a.id, a);
          ord.authz.push(a.id);
        }
        orders.set(ord.id, ord);
        send(res, 201, orderJson(ord), { location: `${base}/order/${String(ord.id)}` });
        return;
      }
      if (path.startsWith('/authz/') || path.startsWith('/chall/')) {
        const a = authzs.get(id);
        if (!a) {
          problem(res, 404, 'malformed');
          return;
        }
        if (path.startsWith('/chall/') && a.status === 'pending' && !o.neverValidate) {
          const ord = [...orders.values()].find((x) => x.authz.includes(a.id));
          const key = ord ? accounts.get(ord.account) : undefined;
          const want = key ? dns01Value(a.token, key) : '';
          a.status = o.lookupTxt(`_acme-challenge.${a.name}`).includes(want) ? 'valid' : 'invalid';
          if (ord) {
            const all = ord.authz.map((x) => authzs.get(x)?.status);
            if (all.some((s) => s === 'invalid')) ord.status = 'invalid';
            else if (all.every((s) => s === 'valid')) ord.status = 'ready';
          }
        }
        if (path.startsWith('/chall/')) {
          send(res, 200, {
            type: 'dns-01',
            url: `${base}/chall/${String(a.id)}`,
            token: a.token,
            status: a.status,
          });
          return;
        }
        send(res, 200, {
          status: a.status,
          identifier: { type: 'dns', value: a.name },
          challenges: [
            {
              type: 'dns-01',
              url: `${base}/chall/${String(a.id)}`,
              token: a.token,
              status: a.status,
            },
          ],
        });
        return;
      }
      const ord = orders.get(id);
      if (!ord || ord.account !== account) {
        problem(res, 404, 'malformed');
        return;
      }
      if (path.startsWith('/order/')) {
        send(res, 200, orderJson(ord));
        return;
      }
      if (path.startsWith('/finalize/')) {
        if (ord.status !== 'ready') {
          problem(res, 403, 'orderNotReady');
          return;
        }
        const csr = Buffer.from((payload as { csr?: string } | null)?.csr ?? '', 'base64url');
        let leaf: string;
        try {
          leaf = o.signCsr(csr);
        } catch {
          problem(res, 400, 'badCSR');
          return;
        }
        const sans = (new X509Certificate(leaf).subjectAltName ?? '')
          .split(', ')
          .map((s) => s.replace(/^DNS:/, ''))
          .sort();
        if (JSON.stringify(sans) !== JSON.stringify([...ord.names].sort())) {
          problem(res, 400, 'badCSR');
          return;
        }
        ord.cert = leaf + (o.chainPem ?? '');
        ord.status = 'valid';
        stats.finalized++;
        send(res, 200, orderJson(ord));
        return;
      }
      if (path.startsWith('/cert/') && ord.cert) {
        send(res, 200, ord.cert);
        return;
      }
      problem(res, 404, 'malformed');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  return {
    directoryUrl: `${base}/directory`,
    stats,
    close: () =>
      new Promise<void>((r) =>
        server.close(() => {
          r();
        }),
      ),
  };
}
