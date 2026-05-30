#!/usr/bin/env python3
"""
End-to-end preprocessing: STARR export -> parse-ready AAOCA pre-op cohort.

Steps:
  1. classify every coronary CTA (reuses classify_final: is_coronary_cta + analyze)
  2. keep relevant (anomalous origin) reports
  3. dedup same-date duplicate rows -> one row per distinct study (patient + date)
  4. drop all post-op studies (keep pre-op only)
  5. one report per patient: when a patient has >1 pre-op study, take the latest by date
  6. split into clean (RCA / LCA, no review flag) vs tricky (flagged -> further medical inspection)

Output (see README): JSONL (parser input) + manifest CSV (counts / QA), for clean and tricky.
CLI: python preprocess.py [radiology_report.csv] [-o OUTPUT_DIR]
"""
import argparse, csv, json, os
from collections import defaultdict, Counter
from classify_final import analyze, is_coronary_cta
csv.field_size_limit(10**9)

SIDE = {'RCA': 'RCA', 'LEFT': 'LCA'}
FLAG_REASON = {
    'lat-single': 'single coronary artery (no left/right side)',
    'lat-both': 'both vessels named anomalous / bilateral',
    'lat-other': 'common origin / generic anomalous coronary arteries',
    'lat-unspec': 'interarterial course, subject vessel not specified',
    'origin-from-PA': 'origin from pulmonary artery (ALCAPA/ARCAPA), not aortic',
}

def write(rows, folder, is_tricky):
    os.makedirs(folder, exist_ok=True)
    with open(folder + '/reports.jsonl', 'w') as jf, open(folder + '/manifest.csv', 'w', newline='') as cf:
        cols = ['patient_id', 'date', 'side', 'age', 'title'] + (['flag', 'flag_reason'] if is_tricky else [])
        w = csv.DictWriter(cf, fieldnames=cols); w.writeheader()
        for s in sorted(rows, key=lambda s: s['patient_id']):
            side = SIDE.get(s['lat'], s['lat'])
            jf.write(json.dumps(dict(patient_id=s['patient_id'], date=s['date'], side=side,
                                     age=s['age'], title=s['title'], text=s['text'])) + '\n')
            m = dict(patient_id=s['patient_id'], date=s['date'], side=side, age=s['age'], title=s['title'])
            if is_tricky:
                m['flag'] = s['flag']
                m['flag_reason'] = '; '.join(FLAG_REASON.get(f, f) for f in s['flag'].split(';') if f)
            w.writerow(m)

def main(export_path, out_dir):
    # 1-2. classify, keep relevant
    recs = []
    with open(export_path, newline='') as fh:
        for row in csv.DictReader(fh):
            if not is_coronary_cta(row['title']):
                continue
            relevant, pp, lat, ev, flag, reason = analyze(row['text'])
            if not relevant:
                continue
            recs.append(dict(patient_id=row['patient_id'], date=row['date'][:10], age=row['age'],
                             title=row['title'], text=row['text'], prepost=pp, lat=lat, flag=flag))

    # 3. dedup same-date duplicate rows -> distinct studies (text is identical across casing-variant rows)
    bykey = {}
    for r in recs:
        bykey.setdefault((r['patient_id'], r['date']), r)
    studies = list(bykey.values())

    # 4. drop post-op
    preop = [s for s in studies if s['prepost'] == 'pre']

    # 5. one per patient: latest pre-op study
    bypat = defaultdict(list)
    for s in preop:
        bypat[s['patient_id']].append(s)
    chosen, multi, lost_clean = [], 0, 0
    for pid, ss in bypat.items():
        ss = sorted(ss, key=lambda s: s['date'])
        if len(ss) > 1:
            multi += 1
            latest = ss[-1]  # edge case: latest tricky but an earlier study was clean
            if (latest['flag'] or latest['lat'] not in ('RCA', 'LEFT')) and \
               any((not s['flag'] and s['lat'] in ('RCA', 'LEFT')) for s in ss[:-1]):
                lost_clean += 1
        chosen.append(ss[-1])

    # 6. split clean vs tricky
    clean = [s for s in chosen if not s['flag'] and s['lat'] in ('RCA', 'LEFT')]
    tricky = [s for s in chosen if s['flag'] or s['lat'] not in ('RCA', 'LEFT')]

    write(clean, out_dir + '/clean', False)
    write(tricky, out_dir + '/tricky', True)

    print(f"relevant reports:                  {len(recs)}")
    print(f"distinct studies (dedup same-day): {len(studies)}")
    print(f"pre-op studies:                    {len(preop)}")
    print(f"pre-op patients (1 report each):   {len(chosen)}")
    print(f"  with >1 pre-op study (took latest): {multi}")
    print(f"  latest was tricky but had earlier clean study: {lost_clean}")
    print(f"\nCLEAN (parse-ready): {len(clean)} patients  {dict(Counter(SIDE.get(s['lat'], s['lat']) for s in clean))}")
    print(f"TRICKY (review):     {len(tricky)} patients  {dict(Counter(s['flag'] for s in tricky))}")
    print(f"\nwrote {out_dir}/clean/ and {out_dir}/tricky/")

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument('export', nargs='?', default='radiology_report.csv',
                    help='STARR radiology_report.csv export (default: ./radiology_report.csv)')
    ap.add_argument('-o', '--out', default='aaoca_preprocessed', help='output directory')
    a = ap.parse_args()
    main(a.export, a.out)
