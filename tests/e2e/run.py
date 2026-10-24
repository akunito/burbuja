"""Zen/Firefox e2e: temporary add-on install + real selection/click on local fixture pages."""
import os, sys, time, glob, zipfile, io, traceback, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

OUT = '/app/.output/e2e'


def xpi() -> str:
    src = '/app/.output/firefox-mv2'
    path = f'{OUT}/burbuja-test.xpi'
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in glob.glob(f'{src}/**', recursive=True):
            if os.path.isfile(f):
                z.write(f, os.path.relpath(f, src))
    return path


def driver():
    o = Options()
    o.binary_location = os.environ['BROWSER_BIN']
    o.add_argument('-headless')
    o.set_preference('intl.locale.requested', 'en-US')
    o.set_preference('intl.accept_languages', 'es-ES, es, en')
    o.set_preference('extensions.experiments.enabled', False)
    o.set_preference('devtools.console.stdout.content', True)
    # fixed internal UUID so tests can open moz-extension://…/options.html
    o.set_preference('extensions.webextensions.uuids', '{"burbuja@akunito.com":"0b0b0b0b-0000-4000-8000-000000000001"}')
    o.set_preference('devtools.console.stdout.chrome', True)
    # --allow-system-access: chrome context, used to open moz-extension:// pages
    svc = Service('/usr/local/bin/geckodriver', log_output=f'{OUT}/geckodriver.log', service_args=['--allow-system-access'])
    d = webdriver.Firefox(options=o, service=svc)
    d.set_window_size(1280, 900)
    return d


def serve_pages():
    # content scripts are not injected into file:// pages in Zen 1.22 (measured), so pages go over local HTTP
    h = functools.partial(SimpleHTTPRequestHandler, directory='/app/tests/e2e/pages')
    h.log_message = lambda *a, **k: None
    srv = ThreadingHTTPServer(('127.0.0.1', 8765), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()


def main(names):
    serve_pages()
    import tests.e2e.cases as cases
    d = driver()
    failed = 0
    try:
        addon = d.install_addon(xpi(), temporary=True)
        print('addon installed:', addon, '| browser', d.capabilities.get('browserName'), d.capabilities.get('browserVersion'))
        default = cases.BLOCKED if os.environ.get('E2E_BLOCK_GOOGLE') == '1' else cases.ALL
        for name in names or default:
            t0 = time.perf_counter()
            try:
                getattr(cases, name)(d)
                print(f'PASS {name} ({time.perf_counter()-t0:.2f}s)')
            except Exception:
                failed += 1
                d.save_screenshot(f'{OUT}/{name}.png')
                print(f'FAIL {name}\n{traceback.format_exc()}')
    finally:
        d.quit()
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main(sys.argv[1:])
