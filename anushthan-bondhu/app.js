'use strict';
/**
 * app.js - the browser side of "Anushthan Bondhu".
 *
 * The plan itself (budget, dates, dependencies, re-planning) is computed in the browser
 * by core.js, so it works instantly and offline. Only the ideas and the WhatsApp message
 * come from the server (/api/assist -> Gemini). All text is written with textContent,
 * never innerHTML, so nothing typed by the user or returned by the AI can inject markup.
 */
(function () {
  const Core = window.AnushthanCore;
  if (!Core || !window.AnushthanStrings) return;

  const $ = (id) => document.getElementById(id);
  const AI_TIMEOUT_MS = 12000;

  const { TEXT, REASONS } = window.AnushthanStrings;

  // ----------------------------------------------------------------- state
  let lang = 'bn';
  let state = null; // { input, delays } - what the plan is built from
  let plan = null; // result of Core.buildPlan
  let assistToken = 0; // lets a newer AI request replace an older one
  let askToken = 0; // same, for questions

  const t = (key, ...args) => {
    const value = TEXT[lang][key];
    return typeof value === 'function' ? value(...args) : value;
  };

  // --------------------------------------------------------------- helpers
  /** Tiny element builder. Text goes in through textContent/append, never as HTML. */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs || {})) {
      if (value === false || value == null) continue;
      if (name === 'class') node.className = value;
      else if (name === 'text') node.textContent = value;
      else node.setAttribute(name, value === true ? '' : value);
    }
    for (const child of children.flat()) if (child != null) node.append(child);
    return node;
  }

  const localISODate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const announce = (message) => { $('status').textContent = message; };

  function fillList(list, items) {
    list.replaceChildren(...items.map((text) => el('li', { text })));
  }

  // -------------------------------------------------------- language / labels
  function applyStrings() {
    document.documentElement.lang = lang;
    document.title = t('docTitle');
    document.querySelectorAll('[data-i18n]').forEach((node) => {
      const value = t(node.dataset.i18n);
      if (typeof value === 'string') node.textContent = value;
    });
    $('langToggle').textContent = lang === 'bn' ? 'English' : 'বাংলা';
    $('langToggle').lang = lang === 'bn' ? 'en' : 'bn';
    $('langToggle').setAttribute('aria-label', t('langToggleLabel'));
  }

  function fillEventTypes() {
    const select = $('eventType');
    const current = select.value || 'puja';
    select.replaceChildren(...Object.keys(Core.EVENT_TYPES).map((id) => el('option', { value: id, text: Core.pick(Core.EVENT_TYPES[id], lang) })));
    select.value = current;
  }

  function fillTaskSelect() {
    if (!state) return;
    const select = $('delayTask');
    const current = select.value;
    select.replaceChildren(...Core.TEMPLATES[state.input.eventType].map((task) => el('option', { value: task.id, text: Core.pick(task.title, lang) })));
    if (current) select.value = current;
  }

  function syncReplanDefaults() {
    $('newDate').value = plan.eventDate;
    $('newBudget').value = plan.input.budget;
    $('newHeadcount').value = plan.input.headcount;
  }

  // ---------------------------------------------------------------- errors
  function clearErrors() {
    $('formErrors').hidden = true;
    $('formErrors').replaceChildren();
    document.querySelectorAll('.field-error').forEach((node) => node.remove());
    document.querySelectorAll('[aria-invalid]').forEach((node) => { node.removeAttribute('aria-invalid'); node.removeAttribute('aria-describedby'); });
  }

  function showErrors(errors) {
    const box = $('formErrors');
    const link = (e) => {
      const anchor = el('a', { href: `#${e.field}`, text: Core.pick(e, lang) });
      anchor.addEventListener('click', (click) => { click.preventDefault(); $(e.field).focus(); });
      return anchor;
    };
    box.replaceChildren(el('p', { text: t('errorsTitle') }), el('ul', {}, errors.map((e) => el('li', {}, link(e)))));
    box.hidden = false;
    for (const e of errors) {
      const field = $(e.field);
      if (!field) continue;
      const id = `err-${e.field}`;
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', id);
      field.closest('.field').append(el('p', { class: 'field-error', id, text: Core.pick(e, lang) }));
    }
    box.focus();
  }

  // -------------------------------------------------------------- rendering
  function renderPlan() {
    $('summaryText').textContent = Core.summaryLine(plan, lang);
    $('volunteersInfo').hidden = plan.volunteers === null;
    if (plan.volunteers !== null) $('volunteersInfo').textContent = t('volunteers', plan.volunteers);

    $('warnings').replaceChildren(...plan.warnings.map((w) => el('li', { class: `warn warn--${w.severity}` },
      el('strong', { text: t(w.severity) }), Core.pick(w, lang))));

    const widest = Math.max(...plan.budget.rows.map((r) => r.percent));
    $('budgetBody').replaceChildren(...plan.budget.rows.map((row) => {
      const fill = el('span');
      fill.style.width = `${Math.round((row.percent / widest) * 100)}%`; // CSSOM, allowed by the strict CSP
      return el('tr', {},
        el('th', { scope: 'row' }, Core.pick(row, lang), el('div', { class: 'bar', 'aria-hidden': 'true' }, fill)),
        el('td', { text: Core.localizeDigits(`${row.percent}%`, lang) }),
        el('td', { class: 'num', text: Core.formatRupee(row.amount, lang) }));
    }));
    $('budgetTotal').textContent = Core.formatRupee(plan.budget.total, lang);

    $('timelineList').replaceChildren(...plan.tasks.map((task) => {
      const tags = [];
      if (task.status === 'today') tags.push(el('span', { class: 'tag', text: t('today') }));
      if (task.status === 'late') tags.push(el('span', { class: 'tag tag--late', text: t('late') }));
      if (task.earlyBook) tags.push(el('span', { class: 'tag tag--book', text: t('earlyBook') }));
      if (task.shiftDays > 0) tags.push(el('span', { class: 'tag tag--shift', text: t('shift', task.shiftDays) }));
      const questions = task.ask
        ? el('details', {}, el('summary', { text: t('askTitle') }), el('ul', {}, Core.pick(task.ask, lang).map((q) => el('li', { text: q }))))
        : null;
      return el('li', { class: `task task--${task.status}` },
        el('time', { datetime: task.due, text: Core.formatDate(task.due, lang) }),
        el('span', { class: 'task__title', text: Core.pick(task.title, lang) }),
        tags.length ? el('div', {}, tags) : null,
        questions);
    }));
  }

  function renderAssist(data) {
    $('aiFocus').textContent = data.focus;
    fillList($('ideasList'), data.ideas);
    fillList($('tipsList'), data.savingTips);
    $('messageBox').value = data.messageDraft;
    $('waLink').href = `https://wa.me/?text=${encodeURIComponent(data.messageDraft)}`;
    $('aiBadge').textContent = sourceBadge(data);
  }

  /** "AI: Gemini (model)" or the reason the built-in answer was used instead. */
  function sourceBadge(data) {
    return data.source === 'gemini'
      ? t('aiGemini', String(data.model || 'Gemini'))
      : t('aiFallback', REASONS[lang][data.reason] || data.reason || REASONS[lang].offline);
  }

  function renderDiff(diff) {
    const box = $('diffBox');
    const parts = [el('h3', { text: t('diffTitle') })];
    if (!diff.tasks.length && !diff.budget.length) parts.push(el('p', { text: t('noChange') }));
    if (diff.tasks.length) {
      parts.push(el('p', { text: t('movedTitle') }),
        el('ul', {}, diff.tasks.map((d) => el('li', { text: t('moved', Core.pick(d.title, lang), Core.formatDate(d.from, lang), Core.formatDate(d.to, lang)) }))));
    }
    if (diff.budget.length) {
      parts.push(el('p', { text: t('budgetMoved') }),
        el('ul', {}, diff.budget.map((d) => el('li', { text: t('budgetRow', Core.pick(d, lang), Core.formatRupee(d.from, lang), Core.formatRupee(d.to, lang)) }))));
    }
    if (diff.newWarnings.length) {
      parts.push(el('p', { text: t('newWarn') }), el('ul', {}, diff.newWarnings.map((w) => el('li', { text: Core.pick(w, lang) }))));
    }
    box.replaceChildren(...parts);
    box.hidden = false;
    box.focus();
  }

  // -------------------------------------------------------------- AI request
  const isUsable = (data) => {
    const strings = (list) => Array.isArray(list) && list.length > 0 && list.every((s) => typeof s === 'string');
    return Boolean(data) && typeof data.focus === 'string' && typeof data.messageDraft === 'string'
      && strings(data.ideas) && strings(data.savingTips);
  };

  /** POSTs to the server and returns the parsed answer. Throws an Error whose `reason` says why it failed. */
  async function callServer(extra) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const response = await fetch('/api/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...state.input, today: plan.today, ...extra }),
        signal: controller.signal,
      });
      if (response.status === 429) throw Object.assign(new Error('rate limited'), { reason: 'rate_limited' });
      if (!response.ok) throw Object.assign(new Error(`http ${response.status}`), { reason: 'offline' });
      return await response.json();
    } catch (error) {
      if (error && error.reason) throw error;
      throw Object.assign(new Error('request failed'), { reason: error && error.name === 'AbortError' ? 'timeout' : 'offline' });
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadAssist() {
    const token = ++assistToken;
    $('aiSection').setAttribute('aria-busy', 'true');
    $('aiBadge').textContent = t('loadingAi');
    announce(t('loadingAi'));

    let data;
    try {
      data = await callServer({});
      if (!isUsable(data)) throw Object.assign(new Error('unexpected answer'), { reason: 'offline' });
    } catch (error) {
      // The plan never depends on the server: show built-in ideas instead.
      data = { ...Core.fallbackAssist(state.input, plan), source: 'fallback', reason: error.reason || 'offline' };
    }
    if (token !== assistToken) return; // a newer request owns the screen now
    renderAssist(data);
    $('aiSection').setAttribute('aria-busy', 'false');
    announce(t('aiDone'));
  }

  function showAnswer(text, badge) {
    $('qaAnswerText').textContent = text;
    $('qaBadge').textContent = badge;
    $('qaBadge').hidden = !badge;
    $('qaAnswer').hidden = false;
  }

  async function ask(question) {
    const token = ++askToken;
    showAnswer(t('qaThinking'), '');
    let data;
    try {
      data = await callServer({ action: 'ask', question });
      if (typeof data.answer !== 'string' || !data.answer) throw Object.assign(new Error('unexpected answer'), { reason: 'offline' });
    } catch (error) {
      data = { answer: Core.answerFallback(question, plan, lang), source: 'fallback', reason: error.reason || 'offline' };
    }
    if (token !== askToken) return;
    showAnswer(data.answer, sourceBadge(data));
    $('qaAnswer').focus();
  }

  // ---------------------------------------------------------------- events
  function readForm() {
    return {
      eventType: $('eventType').value,
      eventDate: $('eventDate').value,
      headcount: $('headcount').value,
      budget: $('budget').value,
      diet: $('planForm').elements.diet.value,
      notes: $('notes').value,
      lang,
    };
  }

  function onSubmit(event) {
    event.preventDefault();
    clearErrors();
    const today = localISODate();
    const checked = Core.validateInput(readForm(), today);
    if (!checked.ok) {
      showErrors(checked.errors);
      return;
    }
    state = { input: checked.value, delays: {} };
    plan = Core.buildPlan(state.input, today, state.delays);
    renderPlan();
    fillTaskSelect();
    syncReplanDefaults();
    $('diffBox').hidden = true;
    $('qaAnswer').hidden = true;
    $('refreshAi').hidden = true;
    $('results').hidden = false;
    $('planTitle').focus();
    announce(t('planReady'));
    loadAssist();
  }

  function onChangeType() {
    const type = $('changeType').value;
    document.querySelectorAll('[data-change]').forEach((node) => { node.hidden = node.dataset.change !== type; });
  }

  function onReplan(event) {
    event.preventDefault();
    const type = $('changeType').value;
    const change = {
      delay: { type, taskId: $('delayTask').value, days: Number($('delayDays').value) },
      date: { type, eventDate: $('newDate').value },
      budget: { type, budget: Number($('newBudget').value) },
      headcount: { type, headcount: Number($('newHeadcount').value) },
    }[type];
    const result = Core.applyChange(state, change, plan.today);
    if (!result.ok) {
      const box = $('diffBox');
      box.replaceChildren(el('p', { text: t('changeFail') }), el('ul', {}, result.errors.map((e) => el('li', { text: Core.pick(e, lang) }))));
      box.hidden = false;
      box.focus();
      return;
    }
    state = result.state;
    plan = result.plan;
    renderPlan();
    syncReplanDefaults();
    renderDiff(result.diff);
    $('refreshAi').hidden = false;
  }

  async function onCopy() {
    const box = $('messageBox');
    try {
      await navigator.clipboard.writeText(box.value);
      announce(t('copied'));
    } catch (error) {
      box.focus();
      box.select();
      announce(t('copyManual'));
    }
  }

  function onQuestion(event) {
    event.preventDefault();
    const question = $('qaInput').value.trim();
    if (question.length < 3) {
      showAnswer(t('qaEmpty'), '');
      $('qaInput').focus();
      return;
    }
    ask(question);
  }

  function onChip(event) {
    const text = t(event.currentTarget.dataset.question);
    $('qaInput').value = text;
    ask(text);
  }

  function onIcs() {
    const blob = new Blob([Core.toICS(plan, lang)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: 'anushthan-bondhu-plan.ics' });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce(t('icsReady'));
  }

  async function onText() {
    try {
      await navigator.clipboard.writeText(Core.toText(plan, lang));
      announce(t('textCopied'));
    } catch (error) {
      announce(t('copyFailed'));
    }
  }

  function setLanguage(next) {
    lang = next;
    if (state) state.input = { ...state.input, lang };
    applyStrings();
    fillEventTypes();
    fillTaskSelect();
    $('diffBox').hidden = true;
    $('qaAnswer').hidden = true;
    if (plan) {
      renderPlan();
      loadAssist();
    }
  }

  // ------------------------------------------------------------------ start
  function init() {
    const today = localISODate();
    $('eventDate').min = today;
    $('eventDate').max = Core.addDays(today, Core.LIMITS.maxDaysAhead);
    $('eventDate').value = Core.addDays(today, 45);
    $('headcount').value = 100;
    $('budget').value = 50000;
    $('newDate').min = today;
    $('newDate').max = Core.addDays(today, Core.LIMITS.maxDaysAhead);

    applyStrings();
    fillEventTypes();
    onChangeType();

    $('planForm').addEventListener('submit', onSubmit);
    $('replanForm').addEventListener('submit', onReplan);
    $('changeType').addEventListener('change', onChangeType);
    $('copyBtn').addEventListener('click', onCopy);
    $('printBtn').addEventListener('click', () => window.print());
    $('icsBtn').addEventListener('click', onIcs);
    $('textBtn').addEventListener('click', onText);
    $('qaForm').addEventListener('submit', onQuestion);
    document.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', onChip));
    $('refreshAi').addEventListener('click', () => { $('refreshAi').hidden = true; loadAssist(); });
    $('langToggle').addEventListener('click', () => setLanguage(lang === 'bn' ? 'en' : 'bn'));
  }

  init();
})();