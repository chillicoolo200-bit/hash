"""Browser test: drives the real page in headless Chromium with the production Content-Security-Policy on.

Optional and separate from `npm test` (the project itself has no dependencies). To run it:
    pip install playwright && playwright install chromium
    python3 e2e/e2e.py
"""
import os, subprocess, time, re, json, sys, tempfile
from playwright.sync_api import sync_playwright

results = []
def wait_until(page, expr, timeout=8000):
    # Poll from Python: the app's strict CSP (no unsafe-eval) correctly blocks string-eval waits.
    end = time.time() + timeout / 1000
    while time.time() < end:
        if page.evaluate(expr): return
        time.sleep(0.1)
    raise AssertionError("timed out waiting for: " + expr[:80])
def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

servers = [subprocess.Popen(["node", os.path.join(os.path.dirname(os.path.abspath(__file__)), "server.js"), m, str(p)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
           for m, p in (("ai", 5101), ("fallback", 5102))]
time.sleep(1.5)
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        def new_page(port, width=390, height=844):
            ctx = browser.new_context(viewport={"width": width, "height": height}, accept_downloads=True, locale="bn-BD")
            ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=f"http://127.0.0.1:{port}")
            page = ctx.new_page()
            page.logs, page.errors = [], []
            page.api_calls = 0
            def count(req):
                if req.method == "POST" and req.url.endswith("/api/assist"): page.api_calls += 1
            page.on("request", count)
            page.on("console", lambda m: page.logs.append((m.type, m.text)))
            page.on("pageerror", lambda e: page.errors.append(str(e)))
            page.add_init_script("window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI));")
            page.goto(f"http://127.0.0.1:{port}/")
            return page

        # ---------------- AI-enabled server, phone width ----------------
        p = new_page(5101)
        check("page loads with title in Bengali", "অনুষ্ঠান বন্ধু" in p.title())
        check("form pre-filled (100 guests, 50000)", p.input_value("#headcount") == "100" and p.input_value("#budget") == "50000")
        check("results hidden before submit", not p.is_visible("#results"))

        p.click("#submitBtn")
        p.wait_for_selector("#results", state="visible")
        total_text = p.inner_text("#budgetTotal")
        check("budget total shows ৫০,০০০", "৫০,০০০" in total_text, total_text)
        rows = p.eval_on_selector_all("#budgetBody tr", "rs => rs.map(r => r.cells[2].textContent)")
        bn = "০১২৩৪৫৬৭৮৯"
        amounts = [int("".join(str(bn.index(c)) for c in r if c in bn)) for r in rows]
        check("budget rows add up to exactly 50000", sum(amounts) == 50000, f"{amounts} sum={sum(amounts)}")
        n_tasks = p.locator("#timelineList > li").count()
        check("timeline has tasks", n_tasks >= 8, str(n_tasks))
        check("summary line shown", "১০০" in p.inner_text("#summaryText"))
        check("focus moved to plan heading", p.evaluate("document.activeElement.id") == "planTitle")

        wait_until(p, "document.getElementById('aiBadge').textContent.includes('Gemini')", timeout=8000)
        check("AI section shows Gemini badge", "Gemini" in p.inner_text("#aiBadge"), p.inner_text("#aiBadge"))
        check("AI focus text rendered", "আগে কমিটি গড়ো" in p.inner_text("#aiFocus"))
        check("5 ideas + 3 tips rendered", p.locator("#ideasList li").count() == 5 and p.locator("#tipsList li").count() == 3)
        check("WhatsApp message in textarea", "চাঁদা দিলে" in p.input_value("#messageBox"))
        href = p.get_attribute("#waLink", "href")
        check("WhatsApp link encodes the message", href.startswith("https://wa.me/?text=") and "%E0%A6" in href)
        check("aria-busy cleared", p.get_attribute("#aiSection", "aria-busy") == "false")
        check("efficiency: the first plan makes exactly one API call", p.api_calls == 1, str(p.api_calls))

        # question chip -> AI answer
        p.click("button[data-question=qaQ1]")
        wait_until(p, "document.getElementById('qaAnswerText').textContent.includes('AI-এর উত্তর')", timeout=8000)
        check("chip question answered by AI", p.is_visible("#qaAnswer"))
        check("efficiency: a question is one more API call", p.api_calls == 2, str(p.api_calls))
        p.click("button[data-question=qaQ1]")
        wait_until(p, "document.getElementById('qaAnswerText').textContent.includes('AI-এর উত্তর')", timeout=8000)
        check("efficiency: asking the same question again is served from the session cache", p.api_calls == 2, str(p.api_calls))
        # free-text question too short
        p.fill("#qaInput", "ab"); p.click("#qaForm button[type=submit]")
        check("too-short question shows hint", "প্রশ্ন" in p.inner_text("#qaAnswerText") or len(p.inner_text("#qaAnswerText")) > 0)

        # re-plan: delay a task
        p.select_option("#changeType", "delay")
        p.select_option("#delayTask", index=2)
        p.fill("#delayDays", "5")
        p.click("#replanForm button[type=submit]")
        check("re-plan shows a diff box", p.is_visible("#diffBox") and "পিছি" in p.inner_text("#diffBox") or p.is_visible("#diffBox"))
        diff_txt = p.inner_text("#diffBox")
        check("diff lists moved tasks", "→" in diff_txt or "থেকে" in diff_txt or len(diff_txt) > 20, diff_txt[:80])
        check("'refresh AI' button appears after re-plan", p.is_visible("#refreshAi"))
        # budget change
        p.select_option("#changeType", "budget"); p.fill("#newBudget", "30000"); p.click("#replanForm button[type=submit]")
        check("budget re-plan updates the total", "৩০,০০০" in p.inner_text("#budgetTotal"), p.inner_text("#budgetTotal"))
        # invalid re-plan value
        p.fill("#newBudget", "10"); p.click("#replanForm button[type=submit]")
        check("invalid re-plan value is explained, plan unchanged", "৩০,০০০" in p.inner_text("#budgetTotal") and p.is_visible("#diffBox"))

        # calendar download
        with p.expect_download() as dl:
            p.click("#icsBtn")
        path = dl.value.path()
        ics = open(path, "rb").read().decode("utf-8")  # bytes: text mode would silently turn CRLF into LF
        check("ICS downloads with right filename", dl.value.suggested_filename == "anushthan-bondhu-plan.ics", dl.value.suggested_filename)
        check("ICS is a valid calendar (CRLF, events, ends properly)", ics.startswith("BEGIN:VCALENDAR\r\n") and ics.endswith("END:VCALENDAR\r\n") and ics.count("BEGIN:VEVENT") == ics.count("END:VEVENT") >= 9)
        check("ICS lines are ≤ 75 bytes", all(len(l.encode()) <= 75 for l in ics.split("\r\n")))

        # clipboard
        p.click("#textBtn")
        clip = p.evaluate("navigator.clipboard.readText()")
        check("plan text copied to clipboard", "বাজেট" in clip and "কাজের তারিখ" in clip, clip[:50])
        p.click("#copyBtn")
        check("message copied to clipboard", "চাঁদা দিলে" in p.evaluate("navigator.clipboard.readText()"))

        # language toggle
        p.click("#langToggle")
        wait_until(p, "document.documentElement.lang === 'en'")
        check("English: html lang + button switch", p.inner_text("#langToggle") == "বাংলা")
        check("English: summary localized", "guests" in p.inner_text("#summaryText"), p.inner_text("#summaryText"))
        wait_until(p, "document.getElementById('aiBadge').textContent.length>0 && !document.getElementById('aiBadge').textContent.includes('...')", timeout=8000)
        check("English: rupee uses Latin digits", "₹30,000" in p.inner_text("#budgetTotal"), p.inner_text("#budgetTotal"))
        calls_before = p.api_calls
        check("efficiency: the English advice is one new API call", calls_before == 3, str(calls_before))
        # The plan changed (budget 30000) after the first Bengali answer, so Bengali needs one fresh call; after that, both languages are cached.
        p.click("#langToggle")
        wait_until(p, "document.documentElement.lang === 'bn'")
        wait_until(p, "document.getElementById('aiBadge').textContent.includes('Gemini')", timeout=8000)
        check("efficiency: Bengali for the changed plan is one new API call", p.api_calls == calls_before + 1, str(p.api_calls))
        p.click("#langToggle")
        wait_until(p, "document.documentElement.lang === 'en'")
        wait_until(p, "document.getElementById('aiBadge').textContent.includes('Gemini')", timeout=8000)
        p.click("#langToggle")
        wait_until(p, "document.documentElement.lang === 'bn'")
        wait_until(p, "document.getElementById('aiBadge').textContent.includes('Gemini')", timeout=8000)
        check("efficiency: toggling the language back and forth reuses cached advice (no API call)", p.api_calls == calls_before + 1, str(p.api_calls))

        # no CSP violations / JS errors in the whole run, with the production CSP on
        csp = p.evaluate("window.__csp")
        errs = [t for (ty, t) in p.logs if ty == "error"]
        check("no CSP violations under production headers", csp == [], str(csp))
        check("no console errors", errs == [], str(errs)[:200])
        check("no uncaught page errors", p.errors == [], str(p.errors)[:200])
        check("no horizontal scroll at 390px", p.evaluate("document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth"))
        p.screenshot(path=os.path.join(tempfile.gettempdir(), "anushthan-phone.png"), full_page=False)
        p.context.close()

        # ---------------- validation errors (fresh page) ----------------
        v = new_page(5101)
        v.fill("#headcount", "2"); v.fill("#budget", "100")
        v.click("#submitBtn")
        check("validation: error summary visible and focused", v.is_visible("#formErrors") and v.evaluate("document.activeElement.id") == "formErrors")
        check("validation: both bad fields flagged aria-invalid", v.get_attribute("#headcount", "aria-invalid") == "true" and v.get_attribute("#budget", "aria-invalid") == "true")
        check("validation: results stay hidden", not v.is_visible("#results"))
        v.click("#formErrors a >> nth=0")
        check("validation: clicking an error focuses the field", v.evaluate("document.activeElement.id") == "headcount")
        v.fill("#headcount", "50"); v.fill("#budget", "20000"); v.click("#submitBtn")
        v.wait_for_selector("#results", state="visible")
        check("validation: fixing inputs clears errors", not v.is_visible("#formErrors") and v.locator(".field-error").count() == 0)
        v.context.close()

        # ---------------- no API key -> built-in answers with visible reason ----------------
        f = new_page(5102)
        f.click("#submitBtn"); f.wait_for_selector("#results", state="visible")
        wait_until(f, "document.getElementById('aiBadge').textContent.includes('API key')", timeout=8000)
        check("fallback: reason shown (no API key)", "API key" in f.inner_text("#aiBadge"), f.inner_text("#aiBadge"))
        check("efficiency: fallback mode made one API call so far", f.api_calls == 1, str(f.api_calls))
        check("fallback: ideas still present", f.locator("#ideasList li").count() >= 3)
        f.click("button[data-question=qaQ3]")
        wait_until(f, "document.getElementById('qaAnswerText').textContent.length>20", timeout=8000)
        check("fallback: rule-based rain answer", "ছাউনি" in f.inner_text("#qaAnswerText") or "ত্রিপল" in f.inner_text("#qaAnswerText"))
        check("efficiency: once the server said 'no key', questions stop calling it", f.api_calls == 1, str(f.api_calls))
        f.click("#langToggle")
        wait_until(f, "document.documentElement.lang === 'en'")
        wait_until(f, "document.getElementById('aiBadge').textContent.includes('no API key')", timeout=8000)
        check("efficiency: switching language in fallback mode makes no API call", f.api_calls == 1, str(f.api_calls))
        check("fallback: no CSP violations", f.evaluate("window.__csp") == [])
        f.context.close()

        # ---------------- API unreachable -> app still works offline ----------------
        o = new_page(5102)
        o.route("**/api/assist", lambda r: r.abort())
        o.click("#submitBtn"); o.wait_for_selector("#results", state="visible")
        wait_until(o, "document.getElementById('aiBadge').textContent.length>0 && document.getElementById('aiBadge').textContent!==''", timeout=8000)
        o.wait_for_timeout(500)
        check("offline: plan + built-in ideas still render", o.locator("#timelineList > li").count() >= 8 and o.locator("#ideasList li").count() >= 3)
        o.context.close()

        # ---------------- small screen, 404 page, headers ----------------
        s = new_page(5102, width=320, height=640)
        s.click("#submitBtn"); s.wait_for_selector("#results", state="visible")
        check("no horizontal scroll at 320px with results shown", s.evaluate("document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth"),
              str(s.evaluate("[document.scrollingElement.scrollWidth, document.scrollingElement.clientWidth]")))
        small_targets = s.evaluate("""[...document.querySelectorAll('button, a.btn, select, input:not([type=radio]), textarea')]
            .filter(e => e.offsetParent !== null && (e.getBoundingClientRect().height < 44)).map(e => e.id || e.className)""")
        check("touch targets ≥ 44px tall", small_targets == [], str(small_targets))
        s.context.close()

        nf = new_page(5102)
        r = nf.goto("http://127.0.0.1:5102/does-not-exist")
        check("404 page served with status 404", r.status == 404 and "404" in nf.inner_text("h1"))
        nf.context.close()

        browser.close()
finally:
    for sv in servers: sv.terminate()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results)-len(failed)}/{len(results)} browser checks passed")
sys.exit(1 if failed else 0)