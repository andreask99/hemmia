// The join page (M6): reads the link from the fragment (never sent to the server) and offers
// the app or the web. Texts in English or German by the browser language.
(function () {
  var root = document.documentElement;
  var relayDomain = root.getAttribute('data-relay') || '';
  var appStore = root.getAttribute('data-app-store') || '';
  var playStore = root.getAttribute('data-play-store') || '';
  var de = /^de\b/i.test(navigator.language || '');
  var T = de
    ? {
        title: 'Du wurdest zu Hemmia eingeladen',
        signin: 'Ein Gerät bei Hemmia anmelden',
        intro:
          'Hemmia ist eine private KI für deine Familie. Sie läuft auf ihrem Computer zu Hause und behält eure Chats für sich.',
        step1: '1. Hol dir die App',
        appStore: 'Im App Store laden',
        play: 'Bei Google Play laden',
        step2: '2. Komm zurück und tippe',
        open: 'Einladung in Hemmia öffnen',
        web: 'Lieber im Browser?',
        webLink: 'Im Web weitermachen',
        note: 'Der Code bleibt auf dieser Seite: Er wird nie an diesen Server geschickt.',
        bad: 'Dieser Link funktioniert nicht. Bitte um einen neuen.',
      }
    : {
        title: 'You’re invited to Hemmia',
        signin: 'Sign a device in to Hemmia',
        intro:
          'Hemmia is a private AI for your family. It lives on their computer at home and keeps your chats to itself.',
        step1: '1. Get the app',
        appStore: 'Download on the App Store',
        play: 'Get it on Google Play',
        step2: '2. Come back and tap',
        open: 'Open the invite in Hemmia',
        web: 'Rather use the browser?',
        webLink: 'Continue on the web',
        note: 'The code stays on this page: it is never sent to this server.',
        bad: 'This link isn’t valid. Ask for a new one.',
      };
  function text(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  function show(id, on) {
    var el = document.getElementById(id);
    if (el) el.hidden = !on;
  }
  var payload = location.hash.slice(1);
  var link = window.kchatParseShare(payload, relayDomain);
  if (!link) {
    text('title', T.bad);
    show('content', false);
    return;
  }
  text('title', link.kind === 'i' ? T.title : T.signin);
  text('intro', T.intro);
  text('step1', T.step1);
  text('step2', T.step2);
  text('web', T.web);
  text('note', T.note);
  var ua = navigator.userAgent || '';
  var ios = /iPhone|iPad|iPod/.test(ua);
  var android = /Android/.test(ua);
  var a = document.getElementById('appstore');
  var g = document.getElementById('play');
  if (a) {
    a.textContent = T.appStore;
    a.setAttribute('href', appStore);
  }
  if (g) {
    g.textContent = T.play;
    g.setAttribute('href', playStore);
  }
  show('appstore', !!appStore && !android);
  show('play', !!playStore && !ios);
  var open = document.getElementById('open');
  if (open) {
    open.textContent = T.open;
    open.setAttribute('href', 'hemmia://join#' + payload);
  }
  var web = document.getElementById('weblink');
  if (web) {
    web.textContent = T.webLink;
    web.setAttribute('href', 'https://' + link.hubHost + '/join#' + link.kind + '~' + link.code);
  }
  // No app for this device in a store yet (before the store release, or a desktop): the web is
  // the way in, so it becomes the main button and the app steps go.
  var appHere = (ios && !!appStore) || (android && !!playStore);
  if (!appHere) {
    show('appcard', false);
    show('opencard', false);
    show('web', false);
    if (web) web.className = 'button';
  }
  show('content', true);
})();
