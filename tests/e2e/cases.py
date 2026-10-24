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
       'close_paths', 'input_ignored', 'hostile_page', 'listen']


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

