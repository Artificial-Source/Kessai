#!/usr/bin/env python3
"""Build eval fixtures A and B as checkpointed SQLite files.

Usage: python3 fixtures.py <kessai-web binary> <dist dir> <out dir>
Seeds through the web API (interface-agnostic), then patches fields without an API via SQL.
"""
import datetime as dt
import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

WEB, DIST, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
PORT = 3397
BASE = f'http://127.0.0.1:{PORT}/api'
ORIGIN = f'http://127.0.0.1:{PORT}'
D = dt.datetime.utcnow().date()  # core uses UTC "today"


def day(n):
    return (D + dt.timedelta(days=n)).isoformat()


def add_months(date, n):
    y, m = date.year, date.month + n
    while m > 12:
        y, m = y + 1, m - 12
    while m < 1:
        y, m = y - 1, m + 12
    import calendar
    return date.replace(year=y, month=m, day=min(date.day, calendar.monthrange(y, m)[1]))


def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', 'Origin': ORIGIN})
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f'ERR {method} {path} {e.code} {e.read()[:300]}')


def with_server(db, fn):
    for s in ('', '-wal', '-shm'):
        try:
            os.remove(db + s)
        except FileNotFoundError:
            pass
    p = subprocess.Popen([WEB, '--dist-dir', DIST, '--port', str(PORT)], env={**os.environ, 'KESSAI_DB_PATH': db},
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(f'{BASE}/settings').read()
                break
            except Exception:
                time.sleep(0.1)
        result = fn()
    finally:
        p.terminate()
        p.wait()
    c = sqlite3.connect(db)
    c.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    c.execute('PRAGMA journal_mode=DELETE')
    c.commit()
    c.close()
    return result


def sub(name, amount, cur, cycle, status, next_date, **kw):
    body = {'name': name, 'amount': amount, 'currency': cur, 'billing_cycle': cycle, 'status': status,
            'is_active': status in ('active', 'trial', 'grace_period', 'pending_cancellation'),
            'next_payment_date': next_date, 'shared_count': 1}
    body.update(kw)
    return call('POST', '/subscriptions', body)


def fixture_a(db):
    ids = {}

    def build():
        cats = {c['name']: c['id'] for c in call('GET', '/categories')}
        for name in ('Streaming', 'Music'):
            if name not in cats:
                cats[name] = call('POST', '/categories', {'name': name, 'color': '#3366ff', 'icon': 'folder'})['id']
        cats['Cloud'] = call('POST', '/categories', {'name': 'Cloud', 'color': '#00aaff', 'icon': 'cloud'})['id']
        ids['CLOUD'] = cats['Cloud']
        ids['OTHER'] = cats['Other']
        tags = {t['name']: t['id'] for t in call('GET', '/tags')}
        for t in ('work', 'personal'):
            tags[t] = call('POST', '/tags', {'name': t, 'color': '#888888'})['id']
        ids['WORK'] = tags['work']
        call('POST', '/cards', {'name': 'Visa', 'card_type': 'credit', 'last_four': '1234', 'color': '#1a1f71'})
        call('POST', '/cards', {'name': 'Amex', 'card_type': 'credit', 'last_four': '9876', 'color': '#2e77bc'})
        call('PUT', '/settings', {'currency': 'EUR', 'monthly_budget': 100, 'theme': 'light'})
        ids['NETFLIX'] = sub('Netflix', 15.99, 'EUR', 'monthly', 'active', day(3), category_id=cats['Streaming'])['id']
        ids['SPOTIFY_FAMILY'] = sub('Spotify Family', 16.99, 'USD', 'monthly', 'active', day(10), category_id=cats['Music'])['id']
        ids['SPOTIFY_STUDENT'] = sub('Spotify Student', 5.99, 'EUR', 'monthly', 'active', day(12), category_id=cats['Music'], notes='student discount')['id']
        ids['DROPBOX'] = sub('Dropbox', 11.99, 'USD', 'monthly', 'active', day(5), category_id=cats['Other'])['id']
        ids['HULU'] = sub('Hulu', 7.99, 'USD', 'monthly', 'active', day(20), category_id=cats['Streaming'])['id']
        ids['ADOBE_1'] = sub('Adobe CC', 59.99, 'EUR', 'monthly', 'active', day(8))['id']
        ids['ADOBE_DUP'] = sub('Adobe CC', 59.99, 'EUR', 'monthly', 'active', day(8))['id']
        ids['AUDIBLE'] = sub('Audible', 9.95, 'EUR', 'monthly', 'active', day(-2))['id']
        ids['ICLOUD'] = sub('iCloud', 2.99, 'EUR', 'monthly', 'paused', None)['id']
        ids['FIGMA'] = sub('Figma', 144, 'USD', 'yearly', 'active', day(40))['id']
        ids['NYT'] = sub('NYT', 4.00, 'USD', 'weekly', 'active', day(1))['id']
        ids['NOTION'] = sub('Notion', 0, 'USD', 'monthly', 'trial', day(5), trial_end_date=day(5))['id']
        ids['CRUNCHYROLL'] = sub('Crunchyroll', 7.99, 'EUR', 'monthly', 'cancelled', None)['id']
        # 6 monthly paid rows (D-180..D-30 by month) for four subscriptions
        for key, amount in (('NETFLIX', 15.99), ('SPOTIFY_FAMILY', 16.99), ('ADOBE_1', 59.99), ('AUDIBLE', 9.95)):
            for k in range(1, 7):
                due = add_months(D, -k).isoformat()
                call('POST', '/payments', {'subscription_id': ids[key], 'amount': amount, 'due_date': due,
                                           'paid_at': due + 'T09:00:00Z', 'status': 'paid'})
        # 12 paid rows in calendar year Y-1 across Netflix/Adobe/Audible
        y = D.year - 1
        s1 = 0.0
        for m in range(1, 13):
            key, amount = [('NETFLIX', 13.99), ('ADOBE_1', 59.99), ('AUDIBLE', 9.95)][m % 3]
            due = f'{y}-{m:02d}-15'
            call('POST', '/payments', {'subscription_id': ids[key], 'amount': amount, 'due_date': due,
                                       'paid_at': due + 'T09:00:00Z', 'status': 'paid'})
            s1 += amount
        ids['S1'] = round(s1, 2)
        ids['D'] = D.isoformat()
        return ids

    with_server(db, build)
    c = sqlite3.connect(db)
    c.execute("UPDATE subscriptions SET last_reviewed_at=? WHERE id=?", ((D - dt.timedelta(days=200)).isoformat() + 'T12:00:00Z', ids['FIGMA']))
    c.execute("UPDATE subscriptions SET last_reviewed_at=? WHERE id=?", ((D - dt.timedelta(days=120)).isoformat() + 'T12:00:00Z', ids['NYT']))
    c.execute("UPDATE subscriptions SET cancelled_at=?, status_changed_at=? WHERE id=?", ((D - dt.timedelta(days=30)).isoformat() + 'T12:00:00Z',) * 2 + (ids['CRUNCHYROLL'],))
    c.execute("INSERT INTO price_history (id, subscription_id, old_amount, new_amount, old_currency, new_currency, changed_at) VALUES (lower(hex(randomblob(16))), ?, 13.99, 15.99, 'EUR', 'EUR', ?)",
              (ids['NETFLIX'], (D - dt.timedelta(days=60)).isoformat() + 'T12:00:00Z'))
    c.commit()
    c.close()
    json.dump(ids, open(os.path.join(OUT, 'fixture-a.json'), 'w'), indent=2)
    return ids


def fixture_b(db):
    def build():
        names = []
        for i in range(1, 181):
            cycle = 'yearly' if i % 5 == 0 or i in (3, 7) else 'monthly'
            sub(f'Service {i:03d}', 9.99, 'USD', cycle, 'active', day(i % 28 + 1))
            if cycle == 'yearly':
                names.append(f'Service {i:03d}')
        return names
    yearly = with_server(db, build)
    json.dump({'yearly': yearly, 'total': 180}, open(os.path.join(OUT, 'fixture-b.json'), 'w'), indent=2)
    return yearly


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    a = fixture_a(os.path.join(OUT, 'fixture-a.db'))
    b = fixture_b(os.path.join(OUT, 'fixture-b.db'))
    print('fixture A ids:', len(a), '| S1 =', a['S1'], '| fixture B yearly:', len(b))
