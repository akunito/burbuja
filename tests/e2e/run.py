"""Zen/Firefox e2e: temporary add-on install + real selection/click on local fixture pages."""
import os, sys, time, glob, zipfile, io, traceback
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
    d = webdriver.Firefox(options=o, service=Service('/usr/local/bin/geckodriver', log_output=f'{OUT}/geckodriver.log'))
    d.set_window_size(1280, 900)
    return d


def main(names):
    import tests.e2e.cases as cases
    d = driver()
    failed = 0
    try:
        addon = d.install_addon(xpi(), temporary=True)
        print('addon installed:', addon, '| browser', d.capabilities.get('browserName'), d.capabilities.get('browserVersion'))
        for name in names or cases.ALL:
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
