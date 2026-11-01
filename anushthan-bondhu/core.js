'use strict';
/**
 * core.js - pure planning logic for "Anushthan Bondhu" (অনুষ্ঠান বন্ধু). The content it plans
 * with (presets, task templates, fallback ideas) lives in data.js.
 *
 * Runs in the browser (window.AnushthanCore) and in Node (require).
 * No network, no DOM, no randomness: the same input always gives the same plan,
 * which keeps every rule easy to test. Money, dates and task dependencies live
 * here on purpose; the AI model is only used for ideas and wording (see assist-handler.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.AnushthanCore = factory(root.AnushthanData);
})(typeof self !== 'undefined' ? self : this, function (data) {
  // ---------------------------------------------------------------- constants
  const LIMITS = Object.freeze({
    minBudget: 2000,
    maxBudget: 10000000,
    minHeadcount: 5,
    maxHeadcount: 5000,
    maxNotes: 300,
    maxDaysAhead: 730,
    maxDelayDays: 60,
  });
  // Rough planning thresholds (rupees). They are heuristics, documented in README.
  const MIN_TOTAL_PER_HEAD = 50;
  const TIGHT_TIMELINE_DAYS = 7;
  const DAY_MS = 86400000;
  // Context rules (rough rules of thumb for West Bengal, documented in README).
  const GUESTS_PER_VOLUNTEER = 25;
  const MIN_VOLUNTEERS = 4;
  const VENDOR_CATEGORIES = new Set(['sound_light', 'pandal_decor', 'stage_decor', 'idol_ritual', 'food_bhog', 'food_refreshments',
    'food', 'food_catering', 'photography', 'entertainment_music', 'venue_decor']);
  const FOOD_CATEGORIES = new Set(['food_bhog', 'food_refreshments', 'food', 'food_catering']);
  const VEG_QUESTION = {
    bn: 'শুধু নিরামিষ: আলাদা রান্না ও বাসনের ব্যবস্থা আছে কি, আর পেঁয়াজ-রসুন লাগবে কি না জেনে নাও।',
    en: 'Vegetarian only: ask about separate cooking and utensils, and whether onion and garlic are used.',
  };

  const { EVENT_TYPES, CATEGORIES, PRESETS, TEMPLATES, FALLBACK } = data;

  // ------------------------------------------------------------- date helpers
  function parseISODate(text) {
    if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const [y, m, d] = text.split('-').map(Number);
    const ms = Date.UTC(y, m - 1, d);
    const check = new Date(ms);
    const real = check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
    return real ? ms : null;
  }
  const toISODate = (ms) => new Date(ms).toISOString().slice(0, 10);
  const addDays = (iso, n) => toISODate(parseISODate(iso) + n * DAY_MS);
  const daysBetween = (fromISO, toISO) => Math.round((parseISODate(toISO) - parseISODate(fromISO)) / DAY_MS);

  // ---------------------------------------------------------- text formatting
  const pick = (obj, lang) => (obj && (obj[lang] || obj.en)) || '';

  const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  const localizeDigits = (text, lang) => (lang === 'bn' ? String(text).replace(/\d/g, (d) => BN_DIGITS[d]) : String(text));

  /** Indian digit grouping (12,34,567), done by hand so output is identical on every device. */
  function groupIndian(n) {
    const s = String(Math.round(Math.abs(n)));
    if (s.length <= 3) return s;
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return rest + ',' + s.slice(-3);
  }
  const formatRupee = (n, lang) => localizeDigits('₹' + (n < 0 ? '-' : '') + groupIndian(n), lang);
  const formatDate = (iso, lang) => {
    const [y, m, d] = iso.split('-');
    return localizeDigits(d + '/' + m + '/' + y, lang);
  };

  // --------------------------------------------------------------- validation
  const err = (field, bn, en) => ({ field, bn, en });

  /**
   * Checks raw user input. Returns { ok, errors, value }; bad input is reported, never thrown
   * (only a malformed `today`, a programming error, throws).
   * Text is trimmed and length-limited; numbers must be whole numbers in range.
   */
  function validateInput(raw, today) {
    if (parseISODate(today) === null) throw new TypeError('today must be an ISO date (YYYY-MM-DD)');
    const body = raw && typeof raw === 'object' ? raw : {};
    const errors = [];

    const eventType = typeof body.eventType === 'string' && EVENT_TYPES[body.eventType] ? body.eventType : null;
    if (!eventType) errors.push(err('eventType', 'অনুষ্ঠানের ধরন বেছে নাও।', 'Choose an event type.'));

    const eventDate = typeof body.eventDate === 'string' && parseISODate(body.eventDate) ? body.eventDate : null;
    if (!eventDate) {
      errors.push(err('eventDate', 'সঠিক তারিখ দাও।', 'Enter a valid date.'));
    } else if (daysBetween(today, eventDate) < 0) {
      errors.push(err('eventDate', 'তারিখ আজ বা তার পরের হতে হবে।', 'The date must be today or later.'));
    } else if (daysBetween(today, eventDate) > LIMITS.maxDaysAhead) {
      errors.push(err('eventDate', 'তারিখ দুই বছরের মধ্যে হতে হবে।', 'The date must be within two years.'));
    }

    const headcount = Number(body.headcount);
    if (!Number.isInteger(headcount) || headcount < LIMITS.minHeadcount || headcount > LIMITS.maxHeadcount) {
      errors.push(err('headcount', `কতজন আসবে: ${LIMITS.minHeadcount} থেকে ${LIMITS.maxHeadcount}-এর মধ্যে একটি পূর্ণ সংখ্যা দাও।`,
        `Guests must be a whole number from ${LIMITS.minHeadcount} to ${LIMITS.maxHeadcount}.`));
    }

    const budget = Number(body.budget);
    if (!Number.isInteger(budget) || budget < LIMITS.minBudget || budget > LIMITS.maxBudget) {
      errors.push(err('budget', `বাজেট ${LIMITS.minBudget} থেকে ${LIMITS.maxBudget} টাকার মধ্যে একটি পূর্ণ সংখ্যা হতে হবে।`,
        `Budget must be a whole number of rupees from ${LIMITS.minBudget} to ${LIMITS.maxBudget}.`));
    }

    const diet = body.diet === 'veg' ? 'veg' : 'any';
    const lang = body.lang === 'en' ? 'en' : 'bn';
    const notes = typeof body.notes === 'string'
      ? body.notes.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.maxNotes)
      : '';

    if (errors.length) return { ok: false, errors, value: null };
    return { ok: true, errors: [], value: { eventType, eventDate, headcount, budget, diet, lang, notes } };
  }

  // ------------------------------------------------------------------- budget
  /** Splits the total by percentage; the largest-remainder rule makes the parts add up exactly. */
  function allocateBudget(total, eventType) {
    const rows = PRESETS[eventType].shares.map(([id, percent]) => {
      const exact = (total * percent) / 100;
      return { id, percent, exact, amount: Math.floor(exact) };
    });
    let left = total - rows.reduce((sum, r) => sum + r.amount, 0);
    const byRemainder = [...rows].sort((a, b) => (b.exact - b.amount) - (a.exact - a.amount) || a.id.localeCompare(b.id));
    for (const r of byRemainder) {
      if (left <= 0) break;
      r.amount += 1;
      left -= 1;
    }
    return rows.map(({ id, percent, amount }) => ({ id, percent, amount, bn: CATEGORIES[id].bn, en: CATEGORIES[id].en }));
  }

  /**
   * Context that changes the advice: rainy months, peak booking months, and how many
   * volunteers a crowd event needs. Months are the event month (1-12).
   */
  function seasonContext(input) {
    const month = Number(input.eventDate.slice(5, 7));
    const peakMonths = { puja: [10, 11, 1, 2], home_event: [11, 12, 1, 2] }[input.eventType] || [];
    const crowdEvent = input.eventType === 'puja' || input.eventType === 'college_fest';
    return {
      rainy: month >= 6 && month <= 9 && input.eventType !== 'birthday',
      peak: peakMonths.includes(month),
      volunteers: crowdEvent ? Math.max(MIN_VOLUNTEERS, Math.ceil(input.headcount / GUESTS_PER_VOLUNTEER)) : null,
    };
  }

  function budgetWarnings(input, rows, timeline) {
    const warnings = [];
    const preset = PRESETS[input.eventType];
    const perHead = Math.floor(input.budget / input.headcount);
    const foodRow = rows.find((r) => r.id === preset.foodCategory);
    const foodPerHead = Math.floor(foodRow.amount / input.headcount);

    if (perHead < MIN_TOTAL_PER_HEAD) {
      const trims = preset.trimFirst.map((id) => CATEGORIES[id]);
      warnings.push({
        code: 'LOW_PER_HEAD', severity: 'high',
        bn: `জনপ্রতি বাজেট মাত্র ${formatRupee(perHead, 'bn')}। অতিথি কমাও বা বাজেট বাড়াও। আগে ছাঁটতে পারো: ${trims.map((c) => c.bn).join(', ')}।`,
        en: `Budget per guest is only ${formatRupee(perHead, 'en')}. Reduce guests or raise the budget. Trim first: ${trims.map((c) => c.en).join(', ')}.`,
      });
    }
    if (foodPerHead < preset.minFoodPerHead) {
      warnings.push({
        code: 'LOW_FOOD_PER_HEAD', severity: 'medium',
        bn: `খাবারে জনপ্রতি ${formatRupee(foodPerHead, 'bn')} পড়ছে, সাধারণত অন্তত ${formatRupee(preset.minFoodPerHead, 'bn')} লাগে।`,
        en: `Food works out to ${formatRupee(foodPerHead, 'en')} per guest; plan for at least ${formatRupee(preset.minFoodPerHead, 'en')}.`,
      });
    }
    if (timeline.daysLeft < TIGHT_TIMELINE_DAYS) {
      warnings.push({
        code: 'TIGHT_TIMELINE', severity: 'high',
        bn: `অনুষ্ঠানের আর ${localizeDigits(timeline.daysLeft, 'bn')} দিন বাকি। প্রতিমা, মণ্ডপ, ক্যাটারারের মতো বড় বুকিং আজই শুরু করো।`,
        en: `Only ${timeline.daysLeft} day(s) left. Start the big bookings (venue, caterer, sound) today.`,
      });
    } else if (timeline.compressed) {
      warnings.push({
        code: 'COMPRESSED', severity: 'medium',
        bn: 'হাতে সময় স্বাভাবিকের চেয়ে কম, তাই সব কাজের সময়সীমা চেপে সাজানো হয়েছে।',
        en: 'There is less time than usual, so every deadline has been compressed.',
      });
    }
    if (timeline.season.rainy) {
      warnings.push({
        code: 'RAIN_RISK', severity: 'medium',
        bn: 'বর্ষাকালে অনুষ্ঠান: কোনো অংশ খোলা জায়গায় হলে ছাউনি বা ভিতরের বিকল্প জায়গা আগে থেকে ঠিক রাখো।',
        en: 'Rainy season: if any part is outdoors, arrange a cover or an indoor backup in advance.',
      });
    }
    if (timeline.season.peak) {
      warnings.push({
        code: 'PEAK_SEASON', severity: 'medium',
        bn: 'এই সময়ে সাউন্ড, মণ্ডপ ও সাজ, ক্যাটারার আর ফটোগ্রাফারের চাহিদা বেশি। "আগে বুক করো" চিহ্ন দেওয়া কাজগুলো সবার আগে সারো।',
        en: 'Sound, decoration, caterers and photographers are in high demand now. Do the tasks marked "book early" first.',
      });
    }
    if (timeline.eventAtRisk) {
      warnings.push({
        code: 'EVENT_AT_RISK', severity: 'high',
        bn: 'দেরির কারণে কিছু কাজ অনুষ্ঠানের তারিখের পরে চলে গেছে। তারিখ পিছোও বা কাজ ভাগ করে নাও।',
        en: 'Because of the delay, some tasks now fall after the event date. Move the date or share the work.',
      });
    }
    return warnings;
  }

  // ----------------------------------------------------------------- timeline
  /**
   * Schedules tasks backwards from the event date. If there is less time than the
   * template needs, every deadline is scaled down (order is preserved). `delays`
   * maps a task id to extra days; a delayed task also pushes back everything that depends on it.
   */
  function buildTimeline(input, today, delays) {
    const template = TEMPLATES[input.eventType];
    const daysLeft = daysBetween(today, input.eventDate);
    const longestLead = Math.max(...template.map((t) => t.dueBefore));
    const compressed = daysLeft < longestLead;
    const scale = compressed ? daysLeft / longestLead : 1;
    const season = seasonContext(input);

    const done = {};
    template.forEach((tpl, order) => {
      const dueBefore = Math.round(tpl.dueBefore * scale);
      const baseDue = addDays(input.eventDate, -dueBefore);
      const requested = Math.max(0, Math.min(LIMITS.maxDelayDays, Math.floor(Number(delays && delays[tpl.id]) || 0)));
      let due = addDays(baseDue, requested);
      for (const dep of tpl.dependsOn) {
        if (done[dep].due > due) due = done[dep].due;
      }
      const status = due > input.eventDate ? 'late' : due === today ? 'today' : 'upcoming';
      const vegetarian = input.diet === 'veg' && FOOD_CATEGORIES.has(tpl.category);
      const questions = vegetarian
        ? { bn: [...(tpl.ask ? tpl.ask.bn : []), VEG_QUESTION.bn], en: [...(tpl.ask ? tpl.ask.en : []), VEG_QUESTION.en] }
        : tpl.ask;
      done[tpl.id] = {
        id: tpl.id, order, title: tpl.title, category: tpl.category, ask: questions,
        earlyBook: season.peak && VENDOR_CATEGORIES.has(tpl.category),
        dependsOn: tpl.dependsOn, baseDue, due, status,
        shiftDays: daysBetween(baseDue, due),
      };
    });
    const tasks = Object.values(done).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.order - b.order));
    return { tasks, daysLeft, compressed, season, eventAtRisk: tasks.some((t) => t.status === 'late') };
  }

  /** Builds the full plan for validated input. `today` is an ISO date (YYYY-MM-DD). */
  function buildPlan(input, today, delays) {
    const timeline = buildTimeline(input, today, delays || {});
    const rows = allocateBudget(input.budget, input.eventType);
    return {
      input, today, eventDate: input.eventDate,
      daysLeft: timeline.daysLeft,
      budget: { total: input.budget, perHead: Math.floor(input.budget / input.headcount), rows },
      tasks: timeline.tasks,
      compressed: timeline.compressed,
      season: timeline.season,
      volunteers: timeline.season.volunteers,
      eventAtRisk: timeline.eventAtRisk,
      delays: { ...(delays || {}) },
      warnings: budgetWarnings(input, rows, timeline),
    };
  }

  // ------------------------------------------------------------------ re-plan
  function comparePlans(before, after) {
    const previous = Object.fromEntries(before.tasks.map((t) => [t.id, t]));
    const tasks = after.tasks
      .filter((t) => previous[t.id].due !== t.due)
      .map((t) => ({ id: t.id, title: t.title, from: previous[t.id].due, to: t.due, shiftDays: daysBetween(previous[t.id].due, t.due) }));
    const oldAmounts = Object.fromEntries(before.budget.rows.map((r) => [r.id, r.amount]));
    const budget = after.budget.rows
      .filter((r) => oldAmounts[r.id] !== r.amount)
      .map((r) => ({ id: r.id, bn: r.bn, en: r.en, from: oldAmounts[r.id], to: r.amount, delta: r.amount - oldAmounts[r.id] }));
    const seen = new Set(before.warnings.map((w) => w.code));
    return {
      tasks, budget,
      newWarnings: after.warnings.filter((w) => !seen.has(w.code)),
      eventAtRisk: after.eventAtRisk,
    };
  }

  /**
   * Applies one change ("the venue is 5 days late", "budget cut", ...) to a plan state
   * { input, delays } and reports exactly what moved. Never mutates its arguments.
   * change: { type: 'delay', taskId, days } | { type: 'date', eventDate } |
   *         { type: 'budget', budget } | { type: 'headcount', headcount }
   */
  function applyChange(state, change, today) {
    const before = buildPlan(state.input, today, state.delays);
    let input = { ...state.input };
    const delays = { ...state.delays };

    if (change && change.type === 'delay') {
      const known = TEMPLATES[input.eventType].some((t) => t.id === change.taskId);
      const days = Number(change.days);
      if (!known || !Number.isInteger(days) || days < 1 || days > LIMITS.maxDelayDays) {
        return { ok: false, errors: [err('delay', `দেরির দিন ১ থেকে ${LIMITS.maxDelayDays}-এর মধ্যে হতে হবে।`, `Delay must be between 1 and ${LIMITS.maxDelayDays} days.`)] };
      }
      delays[change.taskId] = Math.min(LIMITS.maxDelayDays, (delays[change.taskId] || 0) + days);
    } else if (change && ['date', 'budget', 'headcount'].includes(change.type)) {
      const field = { date: 'eventDate', budget: 'budget', headcount: 'headcount' }[change.type];
      const merged = { ...input, [field]: change[field] };
      const checked = validateInput(merged, today);
      const bad = checked.errors.filter((e) => e.field === field);
      if (bad.length) return { ok: false, errors: bad };
      input = { ...input, [field]: checked.value[field] };
    } else {
      return { ok: false, errors: [err('change', 'এই বদল চেনা যায়নি।', 'Unknown change.')] };
    }

    const plan = buildPlan(input, today, delays);
    return { ok: true, state: { input, delays }, plan, diff: comparePlans(before, plan) };
  }

  // ------------------------------------------------- built-in (no-AI) assistant
  function inviteMessage(input, lang) {
    const date = formatDate(input.eventDate, lang);
    const count = localizeDigits(input.headcount, lang);
    const money = formatRupee(input.budget, lang);
    const name = pick(EVENT_TYPES[input.eventType], lang);
    const bn = {
      puja: `নমস্কার! আমাদের ${name} হবে ${date} তারিখে। প্রায় ${count} জনের আয়োজন, আনুমানিক খরচ ${money}। আপনার সাধ্যমতো চাঁদা দিয়ে পাশে থাকলে খুব খুশি হব। ধন্যবাদ।`,
      college_fest: `নমস্কার! আমরা ${date} তারিখে ${name} করছি, প্রায় ${count} জন অংশ নেবে। আপনার সহযোগিতা বা স্পনসরশিপ পেলে আমরা কৃতজ্ঞ থাকব। বিস্তারিত জানাতে আমরা দেখা করতে রাজি।`,
      birthday: `নমস্কার! ${date} তারিখে আমাদের ${name}। আপনি এলে খুব ভালো লাগবে। সময় ও জায়গা আমি আলাদা করে জানিয়ে দেব।`,
      home_event: `নমস্কার! ${date} তারিখে আমাদের বাড়িতে ${name}। আপনি সপরিবারে এলে খুব আনন্দ পাব। সময় ও জায়গা আলাদা করে জানাব।`,
    };
    const en = {
      puja: `Hello! Our ${name} is on ${date}. We are planning for about ${count} people at roughly ${money}. We would be glad if you could contribute what you comfortably can. Thank you.`,
      college_fest: `Hello! We are holding our ${name} on ${date} with about ${count} participants. Your support or sponsorship would mean a lot, and we would be happy to meet and share details.`,
      birthday: `Hello! We are celebrating a ${name} on ${date}. We would love to see you there. I will share the time and place separately.`,
      home_event: `Hello! We are holding a ${name} at home on ${date}. We would be delighted to have you and your family. I will share the time and place separately.`,
    };
    return (lang === 'bn' ? bn : en)[input.eventType];
  }

  function summaryLine(plan, lang) {
    const i = plan.input;
    const type = pick(EVENT_TYPES[i.eventType], lang);
    const n = (v) => localizeDigits(v, lang);
    return lang === 'bn'
      ? `${type}: ${n(i.headcount)} জন, বাজেট ${formatRupee(i.budget, 'bn')} (জনপ্রতি প্রায় ${formatRupee(plan.budget.perHead, 'bn')}), আর ${n(plan.daysLeft)} দিন বাকি।`
      : `${type}: ${i.headcount} guests, budget ${formatRupee(i.budget, 'en')} (about ${formatRupee(plan.budget.perHead, 'en')} each), ${plan.daysLeft} day(s) left.`;
  }

  /** Same shape as the AI answer (plus a code-built summary), from fixed templates. Used when the AI is unavailable. */
  function fallbackAssist(input, plan) {
    const set = FALLBACK[input.eventType][input.lang];
    const first = plan.tasks[0];
    const when = formatDate(first.due, input.lang);
    return {
      summary: summaryLine(plan, input.lang),
      focus: input.lang === 'bn'
        ? `সবার আগে: ${first.title.bn} (${when}-র মধ্যে)।`
        : `Do this first: ${first.title.en} (by ${when}).`,
      ideas: set.ideas.slice(),
      savingTips: set.tips.slice(),
      messageDraft: inviteMessage(input, input.lang),
    };
  }

  // ------------------------------------------------------------------ exports
  const CRLF = '\r\n';
  const icsEscape = (text) => String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const icsDate = (iso) => iso.replace(/-/g, '');

  /** RFC 5545 line folding: at most 75 octets per line, never splitting a UTF-8 character. */
  function foldLine(line) {
    const encoder = new TextEncoder();
    const parts = [];
    let current = '';
    let size = 0;
    for (const char of line) {
      const bytes = encoder.encode(char).length;
      const limit = parts.length === 0 ? 75 : 74; // continuation lines start with one space
      if (size + bytes > limit) {
        parts.push(current);
        current = '';
        size = 0;
      }
      current += char;
      size += bytes;
    }
    parts.push(current);
    return parts.map((part, i) => (i === 0 ? part : ' ' + part)).join(CRLF);
  }

  /** The timeline as an iCalendar file: one all-day event per task plus the event day, each with a reminder. */
  function toICS(plan, lang) {
    const stamp = `${icsDate(plan.today)}T000000Z`;
    const title = pick(EVENT_TYPES[plan.input.eventType], lang);
    const events = plan.tasks.map((t) => ({
      uid: `${plan.eventDate}-${plan.input.eventType}-${t.id}@anushthan-bondhu`,
      date: t.due,
      summary: `${pick(t.title, lang)} (${title})`,
      description: t.ask ? pick(t.ask, lang).join('\n') : '',
    }));
    events.push({
      uid: `${plan.eventDate}-${plan.input.eventType}-event-day@anushthan-bondhu`,
      date: plan.eventDate,
      summary: `${lang === 'bn' ? 'অনুষ্ঠানের দিন' : 'Event day'}: ${title}`,
      description: summaryLine(plan, lang),
    });
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Anushthan Bondhu//Planner//EN', 'CALSCALE:GREGORIAN'];
    for (const e of events) {
      lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(e.date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(e.date, 1))}`,
        `SUMMARY:${icsEscape(e.summary)}`);
      if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
      lines.push('TRANSP:TRANSPARENT', 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.summary)}`, 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join(CRLF) + CRLF;
  }

  /** A plain-text copy of the plan, short enough to paste into a WhatsApp group. */
  function toText(plan, lang) {
    const heads = lang === 'bn' ? { budget: 'বাজেট', tasks: 'কাজের তারিখ' } : { budget: 'Budget', tasks: 'Task dates' };
    return [
      summaryLine(plan, lang), '',
      heads.budget,
      ...plan.budget.rows.map((r) => `- ${pick(r, lang)}: ${formatRupee(r.amount, lang)}`), '',
      heads.tasks,
      ...plan.tasks.map((t) => `${formatDate(t.due, lang)}  ${pick(t.title, lang)}${t.earlyBook ? (lang === 'bn' ? ' (আগে বুক করো)' : ' (book early)') : ''}`),
    ].join('\n');
  }

  // ------------------------------------------------- built-in answers to questions
  // Order matters: the first topic whose keyword appears in the question wins.
  const TOPICS = [
    ['rain', ['বৃষ্টি', 'বর্ষা', 'rain', 'weather', 'monsoon']],
    ['budget', ['বাজেট', 'টাকা', 'খরচ', 'ছাঁট', 'দাম', 'budget', 'cost', 'money', 'cut', 'cheap', 'price', 'trim']],
    ['food', ['খাবার', 'ভোগ', 'রান্না', 'নিরামিষ', 'food', 'menu', 'cater', 'veg']],
    ['people', ['স্বেচ্ছাসেবক', 'ভিড়', 'লোক', 'volunteer', 'crowd', 'staff']],
    ['late', ['দেরি', 'পিছ', 'late', 'delay', 'postpone']],
    ['book', ['বুক', 'আগে', 'কোনটা', 'প্রথম', 'book', 'first', 'start', 'priority']],
  ];

  /** Rule-based answer used when the AI cannot answer. Built only from the plan, never invented. */
  function answerFallback(question, plan, lang) {
    const q = String(question).toLowerCase();
    const topic = (TOPICS.find(([, words]) => words.some((w) => q.includes(w))) || [])[0] || 'default';
    const bn = lang === 'bn';
    const preset = PRESETS[plan.input.eventType];
    const names = (ids) => ids.map((id) => pick(CATEGORIES[id], lang)).join(bn ? ', ' : ', ');
    const firstThree = plan.tasks.slice(0, 3).map((t) => `${pick(t.title, lang)} (${formatDate(t.due, lang)})`).join('; ');

    if (topic === 'rain') {
      return bn
        ? (plan.season.rainy ? 'এই সময় বর্ষাকাল। ' : '') + 'ছাউনি বা ত্রিপলের ব্যবস্থা রাখো, ভিতরের বিকল্প জায়গা ঠিক করো, আর অনুষ্ঠানের ২-৩ দিন আগে আবহাওয়া দেখে সিদ্ধান্ত নাও। সাউন্ড-আলোর তার ও বিদ্যুতের জায়গা ঢেকে রেখো।'
        : (plan.season.rainy ? 'It is the rainy season. ' : '') + 'Arrange a cover or tarpaulin, fix an indoor backup, and decide 2 to 3 days before using the forecast. Keep sound and lighting cables and power points covered.';
    }
    if (topic === 'budget') {
      return bn
        ? `বাজেট কম পড়লে আগে ছাঁটো: ${names(preset.trimFirst)}। "অপ্রত্যাশিত খরচের তহবিল"-এ হাত দিও না। বর্তমান বাজেট জনপ্রতি প্রায় ${formatRupee(plan.budget.perHead, 'bn')}।`
        : `If money runs short, trim first: ${names(preset.trimFirst)}. Do not touch the contingency fund. The budget is about ${formatRupee(plan.budget.perHead, 'en')} per guest.`;
    }
    if (topic === 'food') {
      const food = plan.budget.rows.find((r) => r.id === preset.foodCategory);
      const perHead = Math.floor(food.amount / plan.input.headcount);
      return bn
        ? `খাবারে বরাদ্দ ${formatRupee(food.amount, 'bn')}, জনপ্রতি প্রায় ${formatRupee(perHead, 'bn')}।${plan.input.diet === 'veg' ? ' শুধু নিরামিষ ধরা আছে, তাই আলাদা রান্না ও বাসনের কথা বিক্রেতাকে জিজ্ঞেস করো।' : ''} কতজনের মাপে দাম, অগ্রিম কত আর মেনু লিখিতভাবে নিও।`
        : `The food allocation is ${formatRupee(food.amount, 'en')}, about ${formatRupee(perHead, 'en')} per guest.${plan.input.diet === 'veg' ? ' Vegetarian-only is set, so ask the vendor about separate cooking and utensils.' : ''} Get the headcount basis, advance and menu in writing.`;
    }
    if (topic === 'people') {
      const n = plan.volunteers || Math.max(MIN_VOLUNTEERS, Math.ceil(plan.input.headcount / GUESTS_PER_VOLUNTEER));
      return bn
        ? `প্রতি ${localizeDigits(GUESTS_PER_VOLUNTEER, 'bn')} জন অতিথিতে একজন ধরলে প্রায় ${localizeDigits(n, 'bn')} জন স্বেচ্ছাসেবক লাগবে (ন্যূনতম ${localizeDigits(MIN_VOLUNTEERS, 'bn')})। আগে থেকে দায়িত্ব ভাগ করে নাম লিখে রাখো।`
        : `At one helper per ${GUESTS_PER_VOLUNTEER} guests you need about ${n} volunteers (minimum ${MIN_VOLUNTEERS}). Split the duties and write the names down in advance.`;
    }
    if (topic === 'late') {
      return bn
        ? 'কোনো কাজ পিছোলে নিচের "কিছু বদলেছে?" অংশে বলো, কোন কাজের তারিখ নড়বে আমি দেখিয়ে দেব।'
        : 'If a task slips, use "Has something changed?" below and I will show which task dates move.';
    }
    if (topic === 'book') {
      const early = plan.tasks.filter((t) => t.earlyBook).slice(0, 3).map((t) => pick(t.title, lang)).join('; ');
      return bn
        ? `সবার আগের কাজ: ${firstThree}।${early ? ` এই সময়ে চাহিদা বেশি, তাই আগে বুক করো: ${early}।` : ''}`
        : `First tasks: ${firstThree}.${early ? ` Demand is high now, so book early: ${early}.` : ''}`;
    }
    return bn
      ? `${summaryLine(plan, 'bn')} আরও নির্দিষ্ট করে জিজ্ঞেস করো, যেমন বাজেট, বুকিং, খাবার বা বৃষ্টি নিয়ে।`
      : `${summaryLine(plan, 'en')} Ask something more specific, such as budget, bookings, food or rain.`;
  }

  return {
    LIMITS, EVENT_TYPES, CATEGORIES, PRESETS, TEMPLATES, MIN_TOTAL_PER_HEAD,
    parseISODate, toISODate, addDays, daysBetween,
    pick, localizeDigits, formatRupee, formatDate,
    validateInput, allocateBudget, buildPlan, applyChange, comparePlans,
    summaryLine, fallbackAssist, seasonContext, toICS, toText, foldLine, answerFallback,
  };
});