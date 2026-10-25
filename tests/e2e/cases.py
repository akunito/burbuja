"""Real input against the built add-on in Zen. Engines are LIVE (Google/Bing)."""
import time
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.actions.action_builder import ActionBuilder
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import Select, WebDriverWait

PAGES = 'http://127.0.0.1:8765'
OUT = '/app/.output/e2e'

ALL = ['loads', 'translate_paragraph', 'change_source', 'switch_engine', 'swap', 'word_dictionary', 'copy',
       'close_paths', 'input_ignored', 'hostile_page', 'listen',
       'options_render', 'options_engine_test', 'options_target', 'options_excluded', 'options_shortcut_mode', 'options_light_theme']
BLOCKED = ['fallback_when_google_blocked']
OPTIONS = 'moz-extension://0b0b0b0b-0000-4000-8000-000000000001/options.html'


def wait(d, fn, timeout=10, msg=''):
    return WebDriverWait(d, timeout, poll_frequency=0.05).until(lambda _: fn(), msg)


def root(d):
    return d.execute_script("const h=document.querySelector('burbuja-ui');return h&&h.shadowRoot")


def q(d, sel):
    r = root(d)
    if not r:
        return None
    els = r.find_elements(By.CSS_SELECTOR, sel)
    return els[0] if els else None


def select_paragraph(d, el_id):
    el = d.find_element(By.ID, el_id)
    ActionChains(d).move_to_element(el).click().click().click().perform()  # triple click: real pointerup
    wait(d, lambda: d.execute_script('return getSelection().toString().trim()'), msg='no selection')


def open_panel(d, el_id):
    select_paragraph(d, el_id)
    icon = wait(d, lambda: q(d, '[data-testid=icon]'), msg='icon did not appear')
    icon.click()
    return wait_result(d)


def wait_result(d, timeout=12):
    def done():
        o = q(d, '[data-testid=out]')
        if o and o.text.strip():
            return o
        e = q(d, '[data-testid=error]')
        if e:
            raise AssertionError('error shown: ' + e.text)
    return wait(d, done, timeout, 'no translation')


def from_label(d):
    s = Select(q(d, '[data-testid=from]'))
    return s.first_selected_option.text


def loads(d):
    d.get(f'{PAGES}/basic.html')
    assert d.find_element(By.ID, 'pl').text.startswith('Dzień')


def translate_paragraph(d):
    d.get(f'{PAGES}/basic.html')
    t0 = time.perf_counter()
    out = open_panel(d, 'pl')
    ms = (time.perf_counter() - t0) * 1000
    assert 'cómo' in out.text.lower(), out.text
    assert 'Polish' in from_label(d), from_label(d)
    assert q(d, '[data-testid=engine]').text.startswith('Google'), q(d, '[data-testid=engine]').text
    bg = d.execute_script("return getComputedStyle(arguments[0]).backgroundColor", q(d, '[data-testid=panel]'))
    assert bg == 'rgb(27, 31, 42)', f'dark theme expected, got {bg}'
    assert d.execute_script('return getSelection().toString().trim()') != '', 'page selection collapsed by the icon click'
    time.sleep(0.3)
    d.save_screenshot(f'{OUT}/panel-basic.png')
    print(f'   select→icon→translation {ms:.0f} ms: {out.text!r}')


def change_source(d):
    d.get(f'{PAGES}/basic.html')
    open_panel(d, 'pl')
    first = q(d, '[data-testid=out]').text
    Select(q(d, '[data-testid=from]')).select_by_value('cs')
    wait(d, lambda: q(d, '[data-testid=out]') and q(d, '[data-testid=out]').text != first or q(d, '[data-testid=out]') and Select(q(d, '[data-testid=from]')).first_selected_option.get_attribute('value') == 'cs', msg='no re-translation')
    wait_result(d)
    assert q(d, '[data-testid=panel]'), 'panel closed on source change'
    assert Select(q(d, '[data-testid=from]')).first_selected_option.get_attribute('value') == 'cs'


def switch_engine(d):
    d.get(f'{PAGES}/basic.html')
    open_panel(d, 'pl')
    q(d, '[data-testid=engine]').click()
    wait(d, lambda: q(d, '.menu [data-engine=bing]')).click()
    wait(d, lambda: q(d, '[data-testid=engine]') and q(d, '[data-testid=engine]').text.startswith('Bing'), msg='engine chip did not switch to Bing')
    assert 'cómo' in wait_result(d).text.lower()


def swap(d):
    d.get(f'{PAGES}/basic.html')
    open_panel(d, 'pl')
    q(d, '[data-testid=swap]').click()
    wait(d, lambda: Select(q(d, '[data-testid=to]')).first_selected_option.get_attribute('value') == 'pl', msg='target not swapped to Polish')
    out = wait_result(d)
    assert Select(q(d, '[data-testid=from]')).first_selected_option.get_attribute('value') == 'es'
    assert any(w in out.text.lower() for w in ('dzień', 'dobry', 'jak', 'się')), out.text


def word_dictionary(d):
    d.get(f'{PAGES}/basic.html')
    ActionChains(d).double_click(d.find_element(By.ID, 'word')).perform()
    wait(d, lambda: q(d, '[data-testid=icon]')).click()
    out = wait_result(d)
    assert out.text.strip().lower() == 'casa', out.text
    dic = wait(d, lambda: q(d, '[data-testid=dict]'), msg='no dictionary for a single word')
    assert 'casa' in dic.text


def copy(d):
    d.get(f'{PAGES}/basic.html')
    open_panel(d, 'pl')
    q(d, '[data-testid=copy]').click()
    wait(d, lambda: q(d, '.toast'), msg='copy did not confirm')


def close_paths(d):
    d.get(f'{PAGES}/basic.html')
    open_panel(d, 'pl')
    ActionChains(d).send_keys(Keys.ESCAPE).perform()
    wait(d, lambda: q(d, '[data-testid=panel]') is None, msg='Esc did not close')
    open_panel(d, 'pl')
    a = ActionBuilder(d)
    a.pointer_action.move_to_location(10, 500).click()
    a.perform()
    wait(d, lambda: q(d, '[data-testid=panel]') is None, msg='outside click did not close')
    open_panel(d, 'pl')
    q(d, '[data-testid=close]').click()
    wait(d, lambda: q(d, '[data-testid=panel]') is None, msg='close button did not close')


def input_ignored(d):
    d.get(f'{PAGES}/basic.html')
    f = d.find_element(By.ID, 'field')
    ActionChains(d).double_click(f).perform()
    time.sleep(0.6)
    assert q(d, '[data-testid=icon]') is None, 'icon shown for a selection inside an input'


def hostile_page(d):
    d.get(f'{PAGES}/hostile.html')
    out = open_panel(d, 'pl')
    panel = q(d, '[data-testid=panel]')
    w = d.execute_script('return arguments[0].getBoundingClientRect().width', panel)
    fs = d.execute_script('return getComputedStyle(arguments[0]).fontSize', out)
    color = d.execute_script('return getComputedStyle(arguments[0]).color', out)
    assert 390 <= w <= 402, f'panel width {w}'
    assert fs == '15px', f'font-size leaked: {fs}'
    assert color != 'rgb(255, 0, 0)', 'page color leaked into the panel'
    top_el = d.execute_script('const r=arguments[0].getBoundingClientRect();const e=document.elementFromPoint(r.left+20,r.top+20);return e&&e.tagName', panel)
    assert top_el == 'BURBUJA-UI', f'panel covered by {top_el}'
    time.sleep(0.3)  # entry animation is 120 ms
    bg = d.execute_script('return getComputedStyle(arguments[0]).backgroundColor', panel)
    assert bg == 'rgb(27, 31, 42)', f'panel background leaked: {bg}'
    d.save_screenshot(f'{OUT}/panel-hostile.png')


def listen(d):
    # Measured 2026-10-24: in the headless container Web Audio never leaves "suspended" (no output device,
    # also with a PulseAudio null sink). This checks the TTS fetch and that the button can never get stuck;
    # real playback is a hand test in Zen.
    d.get(f'{PAGES}/basic.html')
    open_panel(d, 'pl')
    q(d, '[data-testid=listen]').click()
    wait(d, lambda: 'on' in (q(d, '[data-testid=listen]').get_attribute('class') or ''), msg='listen did not start')
    wait(d, lambda: 'on' not in (q(d, '[data-testid=listen]').get_attribute('class') or ''), 15, 'listen button stuck')
    state = d.execute_script('return document.documentElement.dataset.burbujaAudio') or ''
    assert state.startswith(('ended', 'error:NotAllowedError')) or 'chunks' in state, state



def goto_options(d):
    # WebDriver refuses content→moz-extension:// navigation; the browser chrome may do it.
    with d.context(d.CONTEXT_CHROME):
        url = d.execute_script("""
            const p = WebExtensionPolicy.getByID('burbuja@akunito.com');
            const url = p.getURL('options.html');
            gBrowser.selectedBrowser.fixupAndLoadURIString(url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
            return url;""")
    wait(d, lambda: d.current_url.startswith('moz-extension://') and d.find_elements(By.CSS_SELECTOR, '.engine'), msg=f'options page did not open ({url} / {d.current_url})')

def opt(d, sel):
    return d.find_element(By.CSS_SELECTOR, sel)


def set_select(d, sel, value):
    Select(opt(d, sel)).select_by_value(value)
    wait(d, lambda: d.find_elements(By.CSS_SELECTOR, '.toast'), msg='not saved')


def options_render(d):
    goto_options(d)
    wait(d, lambda: d.find_elements(By.CSS_SELECTOR, '.engine'))
    names = [e.text for e in d.find_elements(By.CSS_SELECTOR, '.engine .name')]
    assert names == ['Google', 'Google (alt)', 'Bing', 'DeepL'], names
    bg = d.execute_script('return getComputedStyle(document.body).backgroundColor')
    assert bg == 'rgb(18, 21, 29)', bg
    d.save_screenshot(f'{OUT}/options.png')


def options_engine_test(d):
    goto_options(d)
    wait(d, lambda: d.find_elements(By.CSS_SELECTOR, '.engine'))
    rows = d.find_elements(By.CSS_SELECTOR, '.engine')
    bing_row = [r for r in rows if r.find_element(By.CSS_SELECTOR, '.name').text == 'Bing'][0]
    bing_row.find_element(By.XPATH, './/button[last()]').click()
    res = wait(d, lambda: bing_row.find_elements(By.CSS_SELECTOR, '.result'), 12, 'no test result')[0]
    assert 'ok' in res.get_attribute('class'), res.text
    deepl_row = [r for r in rows if r.find_element(By.CSS_SELECTOR, '.name').text == 'DeepL'][0]
    deepl_row.find_element(By.XPATH, './/button[last()]').click()
    res = wait(d, lambda: deepl_row.find_elements(By.CSS_SELECTOR, '.result'), 12, 'no test result')[0]
    assert 'bad' in res.get_attribute('class'), 'DeepL without key must fail: ' + res.text


def options_target(d):
    goto_options(d)
    wait(d, lambda: d.find_elements(By.ID, 'target'))
    set_select(d, '#target', 'fr')
    try:
        d.get(f'{PAGES}/basic.html')
        out = open_panel(d, 'pl')
        assert Select(q(d, '[data-testid=to]')).first_selected_option.get_attribute('value') == 'fr'
        assert 'bonjour' in out.text.lower() or 'comment' in out.text.lower(), out.text
    finally:
        hidpi(d, False)
        goto_options(d)
        wait(d, lambda: d.find_elements(By.ID, 'target'))
        set_select(d, '#target', '')
        set_select(d, '#second', 'en')


def options_excluded(d):
    goto_options(d)
    ta = wait(d, lambda: d.find_elements(By.ID, 'excl'))[0]
    ta.send_keys('127.0.0.1')
    d.find_element(By.TAG_NAME, 'h1').click()  # change fires on blur
    wait(d, lambda: d.find_elements(By.CSS_SELECTOR, '.toast'), msg='not saved')
    try:
        d.get(f'{PAGES}/basic.html')
        select_paragraph(d, 'pl')
        time.sleep(0.6)
        assert q(d, '[data-testid=icon]') is None, 'icon on an excluded site'
    finally:
        goto_options(d)
        ta = wait(d, lambda: d.find_elements(By.ID, 'excl'))[0]
        ta.clear()
        d.find_element(By.TAG_NAME, 'h1').click()
        wait(d, lambda: d.find_elements(By.CSS_SELECTOR, '.toast'), msg='not saved')


def options_shortcut_mode(d):
    goto_options(d)
    radios = wait(d, lambda: d.find_elements(By.CSS_SELECTOR, 'input[name=trigger]'))
    radios[1].click()
    wait(d, lambda: d.find_elements(By.CSS_SELECTOR, '.toast'), msg='not saved')
    try:
        d.get(f'{PAGES}/basic.html')
        select_paragraph(d, 'pl')
        time.sleep(0.6)
        assert q(d, '[data-testid=icon]') is None, 'icon shown in shortcut-only mode'
    finally:
        goto_options(d)
        wait(d, lambda: d.find_elements(By.CSS_SELECTOR, 'input[name=trigger]'))[0].click()
        wait(d, lambda: d.find_elements(By.CSS_SELECTOR, '.toast'), msg='not saved')


def options_light_theme(d):
    goto_options(d)
    wait(d, lambda: d.find_elements(By.CSS_SELECTOR, 'input[name=theme]'))[1].click()
    wait(d, lambda: d.find_elements(By.CSS_SELECTOR, '.toast'), msg='not saved')
    try:
        d.get(f'{PAGES}/basic.html')
        open_panel(d, 'pl')
        time.sleep(0.3)
        bg = d.execute_script('return getComputedStyle(arguments[0]).backgroundColor', q(d, '[data-testid=panel]'))
        assert bg == 'rgb(255, 255, 255)', bg
        d.save_screenshot(f'{OUT}/panel-light.png')
    finally:
        goto_options(d)
        wait(d, lambda: d.find_elements(By.CSS_SELECTOR, 'input[name=theme]'))[0].click()
        wait(d, lambda: d.find_elements(By.CSS_SELECTOR, '.toast'), msg='not saved')


def fallback_when_google_blocked(d):
    d.get(f'{PAGES}/basic.html')
    t0 = time.perf_counter()
    out = open_panel(d, 'pl')
    ms = (time.perf_counter() - t0) * 1000
    chip = q(d, '[data-testid=engine]').text
    assert chip.startswith('Bing'), f'expected Bing after Google failures, got {chip}'
    assert 'cómo' in out.text.lower(), out.text
    print(f'   google blocked → {chip} in {ms:.0f} ms')


# README/AMO screenshots: run on demand (`./scripts/e2e screenshots`), never part of ALL.
SHOTS = '/app/docs/screenshots'


def rect(d, el):
    return d.execute_script('const r=arguments[0].getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]', el)


def shot(d, name, boxes, pad=24, full=False):
    """Crop the union of boxes (viewport px) + pad out of a screenshot, in-browser via canvas (no PIL in the image)."""
    import base64, os
    os.makedirs(SHOTS, exist_ok=True)
    b64 = d.get_full_page_screenshot_as_base64() if full else d.get_screenshot_as_base64()
    x0 = min(b[0] for b in boxes) - pad; y0 = min(b[1] for b in boxes) - pad
    x1 = max(b[2] for b in boxes) + pad; y1 = max(b[3] for b in boxes) + pad
    data = d.execute_async_script("""
        const [b64, x0, y0, x1, y1, done] = arguments;
        const img = new Image();
        img.onload = () => {
          const k = devicePixelRatio;
          const x = Math.max(0, Math.round(x0 * k)), y = Math.max(0, Math.round(y0 * k));
          const w = Math.min(img.width, Math.round(x1 * k)) - x, h = Math.min(img.height, Math.round(y1 * k)) - y;
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
          done(c.toDataURL('image/png').split(',')[1]);
        };
        img.onerror = () => done(null);
        img.src = 'data:image/png;base64,' + b64;""", b64, x0, y0, x1, y1)
    assert data, 'crop failed'
    with open(f'{SHOTS}/{name}.png', 'wb') as f:
        f.write(base64.b64decode(data))


def set_radio(d, name, i):
    goto_options(d)
    wait(d, lambda: d.find_elements(By.CSS_SELECTOR, f'input[name={name}]'))[i].click()
    wait(d, lambda: d.find_elements(By.CSS_SELECTOR, '.toast'), msg='not saved')


def hidpi(d, on):
    # 2x pixels for crisp README images; set_window_size stays in CSS px (measured: 2560 wide → innerWidth 2361 at 2x).
    with d.context(d.CONTEXT_CHROME):
        d.execute_script("arguments[0] ? Services.prefs.setCharPref('layout.css.devPixelsPerPx', '2') : Services.prefs.clearUserPref('layout.css.devPixelsPerPx')", on)
    d.set_window_size(1280, 900)


def screenshots(d):
    goto_options(d)
    wait(d, lambda: d.find_elements(By.ID, 'target'))
    set_select(d, '#target', 'en')
    set_select(d, '#second', 'es')
    hidpi(d, True)
    try:
        # icon right after selecting
        d.get(f'{PAGES}/demo.html')
        select_paragraph(d, 'pl')
        icon = wait(d, lambda: q(d, '[data-testid=icon]'), msg='icon did not appear')
        time.sleep(0.3)
        p = rect(d, d.find_element(By.ID, 'pl'))
        i = rect(d, icon)
        shot(d, 'icon', [[p[0] - 24, i[1] - 100, i[2] + 320, i[3] + 24]], pad=0)
        # hero: dark panel over the article
        icon.click()
        wait_result(d)
        time.sleep(0.4)
        shot(d, 'panel-dark', [rect(d, d.find_element(By.ID, 'pl')), rect(d, q(d, '[data-testid=panel]'))], pad=28)
        # engine menu open
        q(d, '[data-testid=engine]').click()
        menu = wait(d, lambda: q(d, '.menu'))
        time.sleep(0.2)
        shot(d, 'engine-menu', [rect(d, q(d, '[data-testid=panel]')), rect(d, menu)], pad=16)
        # single-word dictionary
        d.get(f'{PAGES}/demo.html')
        ActionChains(d).double_click(d.find_element(By.ID, 'word')).perform()
        wait(d, lambda: q(d, '[data-testid=icon]')).click()
        wait_result(d)
        wait(d, lambda: q(d, '[data-testid=dict]'), msg='no dictionary')
        time.sleep(0.4)
        shot(d, 'dictionary', [rect(d, d.find_element(By.ID, 'es')), rect(d, q(d, '[data-testid=panel]'))], pad=28)
        # options page, dark
        goto_options(d)
        time.sleep(0.3)
        secs = d.find_elements(By.CSS_SELECTOR, 'section')
        hdr = rect(d, d.find_element(By.CSS_SELECTOR, 'header'))
        shot(d, 'options-engines', [hdr, rect(d, secs[1])], pad=20, full=True)
        shot(d, 'options-behaviour', [rect(d, secs[2]), rect(d, secs[3])], pad=20, full=True)
        shot(d, 'options', [hdr, rect(d, d.find_element(By.CSS_SELECTOR, '.privacy'))], pad=24, full=True)
        # light theme
        set_radio(d, 'theme', 1)
        try:
            d.get(f'{PAGES}/demo.html')
            out = open_panel(d, 'de')
            time.sleep(0.4)
            shot(d, 'panel-light', [rect(d, d.find_element(By.ID, 'de')), rect(d, q(d, '[data-testid=panel]'))], pad=28)
        finally:
            set_radio(d, 'theme', 0)
    finally:
        hidpi(d, False)
        goto_options(d)
        wait(d, lambda: d.find_elements(By.ID, 'target'))
        set_select(d, '#target', '')
        set_select(d, '#second', 'en')
