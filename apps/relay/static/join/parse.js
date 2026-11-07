// The join page's copy of relay-protocol's share-link parser (RELAY.md §8). A test in
// apps/relay runs both on the same vectors so they can't drift. No other code runs here.
(function (root) {
  var CODE = /^[A-Za-z0-9_-]{43}$/;
  var NAME = /^[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*$/;
  var HUB_ID = /^[0-9a-hjkmnp-tv-z]{12}$/;
  function hubHostOk(host, relayDomain) {
    if (host.length > 253 || !NAME.test(host)) return false;
    if (host.slice(-7) === '.ts.net') return true;
    var suffix = '.h.' + relayDomain.toLowerCase();
    return host.slice(-suffix.length) === suffix && HUB_ID.test(host.slice(0, -suffix.length));
  }
  /** "1~<hubHost>~<kind>~<code>" → { hubHost, kind, code } or null. */
  function parseShare(payload, relayDomain) {
    var parts = String(payload).split('~');
    if (parts.length !== 4 || parts[0] !== '1') return null;
    var host = parts[1];
    var kind = parts[2];
    var code = parts[3];
    if (kind !== 'i' && kind !== 'l' && kind !== 'd') return null;
    host = String(host).toLowerCase();
    if (!CODE.test(code) || !hubHostOk(host, relayDomain)) return null;
    return { hubHost: host, kind: kind, code: code };
  }
  root.kchatParseShare = parseShare;
})(typeof window !== 'undefined' ? window : globalThis);
