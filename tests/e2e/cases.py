ALL = ['loads']


def loads(d):
    d.get('data:text/html,<p id=p>Hello</p>')
    assert d.find_element('id', 'p').text == 'Hello'
