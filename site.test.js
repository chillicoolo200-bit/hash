'use strict';
// Static checks on the interface files: accessibility basics, translations, colour contrast and
// security rules. They run in Node with no browser and no dependencies.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const html = read('index.html');
const css = read('style.css');
const appJs = read('app.js');
const { TEXT, REASONS } = require('./strings.js');

const all = (re, text) => [...text.matchAll(re)].map((m) => m[1]);

// ----------------------------------------------------------------------- HTML
test('the page declares its language, has one h1 and a viewport that allows zoom', () => {
  assert.match(html, /<html lang="bn">/);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  const viewport = html.match(/<meta name="viewport" content="([^"]+)"/)[1];
  assert.doesNotMatch(viewport, /user-scalable\s*=\s*no|maximum-scale/);
});

test('ids are unique and every reference points at an existing id', () => {
  const ids = all(/\sid="([^"]+)"/g, html);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id');
  for (const attr of ['for', 'aria-labelledby', 'aria-describedby']) {
    for (const target of all(new RegExp(`${attr}="([^"]+)"`, 'g'), html).flatMap((v) => v.split(' '))) {
      assert.ok(ids.includes(target), `${attr}="${target}" has no matching id`);
    }
  }
  for (const href of all(/href="#([^"]+)"/g, html)) assert.ok(ids.includes(href), `link to #${href}`);
});

test('every form control has a visible label or an accessible name', () => {
  const labelled = new Set(all(/<label[^>]*\sfor="([^"]+)"/g, html));
  for (const tag of html.match(/<(input|select|textarea)\b[^>]*>/g)) {
    const id = (tag.match(/\sid="([^"]+)"/) || [])[1];
    const isRadio = /type="radio"/.test(tag);
    if (isRadio) continue; // wrapped in its own <label>
    assert.ok(id && labelled.has(id), `control without a label: ${tag}`);
  }
  assert.equal((html.match(/type="radio"/g) || []).length, 2);
  assert.match(html, /<fieldset[^>]*>\s*<legend/);
});

test('buttons and links have text or an accessible name', () => {
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    assert.ok(/aria-label=/.test(m[1]) || m[2].replace(/<[^>]+>/g, '').trim().length > 0, `empty button: ${m[0]}`);
  }
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    assert.ok(m[2].replace(/<[^>]+>/g, '').trim().length > 0, `empty link: ${m[0]}`);
  }
});

test('headings never skip a level', () => {
  const levels = all(/<h([1-6])[\s>]/g, html).map(Number);
  assert.equal(levels[0], 1);
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] - levels[i - 1] <= 1, `h${levels[i - 1]} jumps to h${levels[i]}`);
});

test('there is a skip link, landmarks, live regions and a no-JavaScript message', () => {
  assert.match(html, /class="skip" href="#main"/);
  for (const landmark of ['<header', '<main', '<footer']) assert.ok(html.includes(landmark), landmark);
  assert.ok((html.match(/aria-live="polite"/g) || []).length >= 3);
  assert.match(html, /<noscript>/);
  assert.match(html, /<caption/);
  assert.match(html, /scope="col"/);
});

test('the page works under a strict Content-Security-Policy: no inline code, only local scripts', () => {
  assert.doesNotMatch(html, /\sstyle="/);
  assert.doesNotMatch(html, /\son[a-z]+="/);
  assert.doesNotMatch(html, /<style[\s>]/);
  const scripts = html.match(/<script\b[^>]*>/g);
  assert.deepEqual(scripts.map((s) => (s.match(/src="([^"]+)"/) || [])[1]), ['data.js', 'core.js', 'strings.js', 'app.js']);
  for (const s of scripts) assert.match(s, /defer/);
  assert.doesNotMatch(css, /@import|url\(\s*['"]?https?:/);
});

// --------------------------------------------------------------- translations
test('Bengali and English have exactly the same text keys, with the same kind of value', () => {
  assert.deepEqual(Object.keys(TEXT.bn).sort(), Object.keys(TEXT.en).sort());
  for (const key of Object.keys(TEXT.bn)) assert.equal(typeof TEXT.bn[key], typeof TEXT.en[key], key);
  assert.deepEqual(Object.keys(REASONS.bn).sort(), Object.keys(REASONS.en).sort());
});

test('every text entry produces non-empty text', () => {
  for (const lang of ['bn', 'en']) {
    for (const [key, value] of Object.entries(TEXT[lang])) {
      const out = typeof value === 'function' ? value('x', 'y', 'z') : value;
      assert.equal(typeof out, 'string', `${lang}.${key}`);
      assert.ok(out.trim().length > 0, `${lang}.${key} is empty`);
    }
  }
});

test('every data-i18n key in the page and every t("key") in app.js has a translation', () => {
  const used = new Set([
    ...all(/data-i18n="([^"]+)"/g, html),
    ...all(/data-question="([^"]+)"/g, html),
    ...all(/\bt\('([A-Za-z0-9]+)'/g, appJs),
  ]);
  for (const key of used) {
    assert.ok(key in TEXT.bn, `missing bn.${key}`);
    assert.ok(key in TEXT.en, `missing en.${key}`);
  }
});

test('the Bengali page text really is Bengali', () => {
  const english = new Set(['langToggleLabel', 'aiGemini']);
  for (const [key, value] of Object.entries(TEXT.bn)) {
    if (typeof value !== 'string' || english.has(key) || key === 'docTitle') continue;
    assert.match(value, /[\u0980-\u09FF]/, `bn.${key} has no Bengali characters`);
  }
});

// ------------------------------------------------------------ colour contrast
function luminance(hex) {
  const channels = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const cssVar = (name) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))[1];

test('text colours meet WCAG AA (4.5:1) on the backgrounds they are used on', () => {
  const v = Object.fromEntries(['neel', 'alta', 'alta-dark', 'haldi', 'pata', 'white', 'ink', 'muted'].map((n) => [n, cssVar(n)]));
  const pairs = [
    ['ink on white', v.ink, v.white], ['ink on page', v.ink, v.pata], ['muted on white', v.muted, v.white],
    ['muted on page', v.muted, v.pata], ['headings (neel) on white', v.neel, v.white], ['neel on page', v.neel, v.pata],
    ['white on primary button', v.white, v.alta], ['white on primary hover', v.white, v['alta-dark']],
    ['ink on haldi tag', v.ink, v.haldi], ['white on neel header', v.white, v.neel], ['tagline on neel header', '#dfe3f7', v.neel],
    ['error text on error box', v['alta-dark'], '#fdecee'], ['warning text on warning box', '#5a4000', '#fff4d1'],
  ];
  for (const [name, fg, bg] of pairs) {
    assert.ok(contrast(fg, bg) >= 4.5, `${name}: ${contrast(fg, bg).toFixed(2)}:1`);
  }
  for (const colour of ['#dfe3f7', '#fdecee', '#5a4000', '#fff4d1']) assert.ok(css.includes(colour), `${colour} is no longer in the CSS`);
});

test('the stylesheet supports keyboard focus, reduced motion, high contrast and the hidden attribute', () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /forced-colors/);
  assert.match(css, /prefers-contrast/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.doesNotMatch(css, /font-size:\s*\d+px/, 'font sizes use rem so text can be resized');
  const touch = css.match(/\.btn\s*\{[^}]*min-height:\s*([\d.]+)rem/)[1];
  assert.ok(Number(touch) >= 2.75, 'buttons are at least 44px tall');
});

// ----------------------------------------------------------------- security
test('the interface code never writes HTML or evaluates strings', () => {
  // Comments may mention these names (to explain why they are avoided), so only code is checked.
  const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
  for (const file of ['app.js', 'strings.js', 'core.js', 'data.js']) {
    assert.doesNotMatch(code(read(file)), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/, file);
  }
});

test('vercel.json sets a strict CSP and the usual security headers', () => {
  const config = JSON.parse(read('vercel.json'));
  const headers = Object.fromEntries(config.headers[0].headers.map((h) => [h.key, h.value]));
  assert.match(headers['Content-Security-Policy'], /default-src 'self'/);
  assert.doesNotMatch(headers['Content-Security-Policy'], /unsafe-inline|unsafe-eval|\*/);
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  for (const key of ['X-Content-Type-Options', 'Strict-Transport-Security', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy', 'Cross-Origin-Opener-Policy']) {
    assert.ok(headers[key], key);
  }
});

test('no secret is committed: no key-shaped strings, no .env file, a gitignore that covers it', () => {
  const files = ['index.html', 'style.css', 'app.js', 'strings.js', 'data.js', 'core.js', 'api/assist.js', 'README.md', 'DESIGN.md', '.env.example', 'vercel.json', 'package.json'];
  for (const file of files) assert.doesNotMatch(read(file), /AIza[0-9A-Za-z_-]{20,}/, `${file} contains something that looks like an API key`);
  assert.equal(fs.existsSync(path.join(__dirname, '.env')), false);
  assert.match(read('.gitignore'), /^\.env$/m);
  assert.match(read('.env.example'), /GEMINI_API_KEY=your_key_here/);
});

test('package.json has a test script and no runtime dependencies', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.test, 'node --test');
  assert.equal(pkg.dependencies, undefined);
});