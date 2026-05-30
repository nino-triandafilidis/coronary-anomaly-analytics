#!/usr/bin/env python3
"""
AAOCA classifier. AAOCA = anomalous coronary ORIGIN.
Anchors on IMPRESSION + CORONARY ARTERIES findings (sliced from FINDINGS:, never the referral question).
Triggers: explicit origin-anomaly lexemes (bare or with 'origin of/to'), sinus-anchored mismatch,
single/common origin, and interarterial course. 'intramural'/'intramuscular' not a sole trigger (bridge confound).
Laterality: explicit subject vessel wins over the interarterial nearest-vessel guess.

Importable: `from classify_final import analyze, is_coronary_cta`.
CLI: python classify_final.py [radiology_report.csv] [classified_reports.csv]
"""
import csv, re
from collections import Counter
csv.field_size_limit(10**9)

def is_coronary_cta(title):
    t = title.lower()
    if 'coronary' not in t: return False
    if 'non-coronary' in t or 'non coronary' in t: return False
    if not any(tok in t for tok in ['angio','cta','cardiac','arteries','artery']): return False
    if 'calcium' in t and not any(tok in t for tok in ['angio','cta']): return False
    return True

def get_impression(text):
    m = re.search(r'\bIMPRESSION:?\s*(.+?)(?:\n\s*(?:I,? the attending|Interpreted by|Electronically|Dictated by|Signed|This study was reviewed|Final Report|Attending Radiologist)|\Z)', text, re.I|re.S)
    return m.group(1).strip() if m else ''

def get_coronary_findings(text):
    fm = re.search(r'\bFINDINGS:?\s*(.+)', text, re.I|re.S)
    body = fm.group(1) if fm else text
    m = re.search(r'CORONARY ARTER(?:IES|Y):?\s*(.+?)(?:\n\s*(?:IMPRESSION|AORTA|PULMONARY VEIN|PULMONARY ARTER|CARDIAC CHAMBER|EXTRACARDIAC|PERICARD|GREAT (?:VESSEL|ARTER)|VENTRICLE|ATRI|SYSTEMIC VEIN|NON[- ]?CARDIAC|ABDOMEN|LUNGS|BONES|CLINICAL HISTORY|COMPARISON|PROCEDURE|TECHNIQUE)\b|\Z)', body, re.I|re.S)
    return m.group(1).strip() if m else ''

RIGHT_V = r'(?:rca|right coronary artery|right coronary(?!\s+(?:sinus|cusp)))'
LEFT_V  = r'(?:lmca|lca|left main(?:\s+coronary)?(?:\s+artery)?|left coronary artery|lad|left anterior descending|lcx|left circumflex|circumflex|ramus)'
GEN_V   = r'coronary arter(?:y|ies)'
MOD     = r'(?:\s+(?:aortic|high|medialized|commissural|proximal|ectopic|abnormal|interarterial|inter-arterial))*'
ORIGIN_VERB = r'(?:aris\w+|arising|origin\w*|takes?\s*[\- ]?off|take[\- ]?off|gives?\s+rise|high off)'

# explicit anomaly lexeme; the 'origin of/to' clause is optional so "aberrant RCA" matches too
LEX_ANOM_OF = re.compile(r'(?:anomalous|aberrant|ectopic)' + MOD + r'\s+(?:(?:origin|arising)\s+(?:of|to)\s+)?(?:the\s+)?(' + RIGHT_V + r'|' + LEFT_V + r'|' + GEN_V + r')', re.I)
LEX_GENERIC = re.compile(r'anomalous\s+(?:origin|course)[/ ]?(?:and\s+|/)?(?:origin|course)?\s*of\s+(?:the\s+)?coronary', re.I)
LEX_SIDE_AN = re.compile(r'(left|right)\s+coronary\s+anomaly', re.I)
LEX_OPP     = re.compile(r'(' + RIGHT_V + r'|' + LEFT_V + r')[^.]{0,60}?from\s+the\s+(?:opposite|wrong|non[\-\s]?coronary)\s+(?:coronary\s+)?(?:sinus|cusp)', re.I)
LEX_SINGLE  = re.compile(r'single\s+coronary\s+(?:artery|ostium|trunk|origin)', re.I)
LEX_COMMON  = re.compile(r'common\s+origin\s+of\s+(?:the\s+)?(?:both\s+the\s+)?(?:left and right|right and left|left main and right)\s*coronary', re.I)
# sinus/cusp-anchored mismatch (no origin verb needed); requires opposite-side SINUS/CUSP, so "from the left main" (landmark) won't trip it
MIS_RCA  = re.compile(RIGHT_V + r'[^.]{0,55}?\bfrom\b[^.]{0,30}?\bleft\b\s*(?:coronary\s+|anterior\s+|aortic\s+)?(?:sinus|cusp)', re.I)
MIS_RCA2 = re.compile(RIGHT_V + r'[^.]{0,90}?(?:above|over|off)\s+the\s+left\s+(?:coronary\s+)?(?:sinus|cusp)', re.I)
MIS_LEFT = re.compile(LEFT_V  + r'[^.]{0,55}?\bfrom\b[^.]{0,30}?\bright\b\s*(?:coronary\s+|anterior\s+|aortic\s+)?(?:sinus|cusp)', re.I)
IA       = re.compile(r'inter[\-\s]?arterial', re.I)
PA_RX    = re.compile(r'from\s+the\s+(?:main\s+)?pulmonary\s+artery|alcapa|arcapa', re.I)

NEG = re.compile(r'\b(?:no|not|without|neither|rather than|versus|vs\.?|normal)\b', re.I)
NORMAL_SENT = re.compile(r'arise[s]?\s+from\s+(?:their|its)\s+expected|expected\s+(?:sinus|location|position)|no\s+coronary\s+anomaly|normal\s+(?:in\s+)?origin|no\s+(?:evidence\s+of\s+)?(?:anomalous|interarterial|inter-arterial)', re.I)

def side_from_vessel(v):
    v = v.lower()
    if v.startswith('coronary arter'): return 'OTHER'
    return 'RCA' if (v.startswith('r') or v == 'rca') else 'LEFT'

def side_near(item, pos):
    best=None; bestd=10**9
    for m in re.finditer(RIGHT_V, item, re.I):
        d=abs(m.start()-pos)
        if d<bestd: bestd, best = d,'RCA'
    for m in re.finditer(LEFT_V, item, re.I):
        d=abs(m.start()-pos)
        if d<bestd: bestd, best = d,'LEFT'
    return best

def items(field):
    parts = re.split(r'(?:^|\n)\s*\d+\.\s+|(?:^|\n)\s*\*\s+', field)
    if len([p for p in parts if p.strip()]) <= 1:
        parts = re.split(r'(?<=[.])\s+', field)
    return [p.strip() for p in parts if p.strip()]

EXPLICIT_KINDS = {'anom_of','side_an','opp','mis'}

def analyze(text):
    """Return (relevant, pre|post, laterality, evidence, flags, reason) for one report's text."""
    impr = get_impression(text)
    coro = get_coronary_findings(text)
    field = ' \n '.join(x for x in (impr, coro) if x)
    if not field:
        field = re.sub(r'CLINICAL HISTORY:.*?(?=COMPARISON:|PROCEDURE|TECHNIQUE:|FINDINGS:|\Z)', ' ', text, flags=re.I|re.S)

    hits = []; pa = False
    for it in items(field):
        if NORMAL_SENT.search(it) and not re.search(r'anomalous|aberrant|ectopic', it, re.I):
            continue
        if PA_RX.search(it): pa = True
        def add(kind, side, m):
            pre = it[max(0, m.start()-28):m.start()]
            if NEG.search(pre): return
            hits.append((kind, side, re.sub(r'\s+',' ', it[max(0,m.start()-12):m.end()+22]).strip()))
        for m in LEX_ANOM_OF.finditer(it): add('anom_of', side_from_vessel(m.group(1)), m)
        for m in LEX_GENERIC.finditer(it): add('generic', 'OTHER', m)
        for m in LEX_SIDE_AN.finditer(it): add('side_an', 'RCA' if m.group(1).lower()=='right' else 'LEFT', m)
        for m in LEX_OPP.finditer(it):     add('opp',     side_from_vessel(m.group(1)), m)
        for m in MIS_RCA.finditer(it):     add('mis',     'RCA', m)
        for m in MIS_RCA2.finditer(it):    add('mis',     'RCA', m)
        for m in MIS_LEFT.finditer(it):    add('mis',     'LEFT', m)
        for m in LEX_SINGLE.finditer(it):  add('single',  'SINGLE', m)
        for m in LEX_COMMON.finditer(it):  add('common',  'OTHER', m)
        for m in IA.finditer(it):          add('ia',      side_near(it, m.start()) or 'UNSPEC', m)

    relevant = len(hits) > 0
    explicit = {s for k,s,_ in hits if k in EXPLICIT_KINDS and s in ('RCA','LEFT')}
    ia_sides = {s for k,s,_ in hits if k=='ia' and s in ('RCA','LEFT')}
    if len(explicit)==1: lat = explicit.pop()
    elif explicit=={'RCA','LEFT'}: lat='BOTH'
    elif not explicit and len(ia_sides)==1: lat=ia_sides.pop()
    elif not explicit and ia_sides=={'RCA','LEFT'}: lat='BOTH'
    elif any(s=='SINGLE' for _,s,_ in hits): lat='SINGLE'
    elif any(s=='OTHER' for _,s,_ in hits): lat='OTHER'
    else: lat='UNSPEC'

    post=False; reason=''
    m = re.search(r'Prior Surgery/Intervention:\s*(.+)', text, re.I)
    if m and not m.group(1).strip().lower().startswith(('none','no','n/a','-','unknown')):
        post=True; reason='prior-field'
    if not post and re.search(r'status\s+post|\bs/p\b|post[\-\s]?surgical|postsurgical', text, re.I) and \
       re.search(r'unroof|reimplant|re-implant|reinsert|translocat|lecompte|bypass|\bcabg\b|\bgraft|conduit|double switch|anastomos|coronary\s+repair|ostioplast|neo[\-\s]?osti|\bstent|reconstruction', text, re.I):
        post=True; reason='sp+proc'
    if not post and re.search(r'post[\-\s]?(?:surgical|operative)\s+changes', text, re.I):
        post=True; reason='postsurg'

    ev = ' | '.join(f'{k}:{s}:{sn}' for k,s,sn in hits[:3])
    flag=[]
    if lat in ('BOTH','SINGLE','OTHER','UNSPEC'): flag.append('lat-'+lat.lower())
    if pa: flag.append('origin-from-PA')
    return relevant, ('post' if post else 'pre'), lat, ev, ';'.join(flag), reason

def run(in_path, out_path):
    """Classify every report in in_path (STARR radiology_report.csv) -> out_path (per-report labels)."""
    L1=Counter(); L2=Counter(); L3=Counter(); fl=Counter(); rel_pat=set()
    rows=[]
    with open(in_path, newline='') as fh:
        for row in csv.DictReader(fh):
            cand = is_coronary_cta(row['title'])
            rec = {'patient_id':row['patient_id'],'date':row['date'],'age':row['age'],'title':row['title'],
                   'accession_number':row['accession_number'],'candidate':int(cand),'relevant_aaoca':0,
                   'prepost':'','laterality':'','laterality_label':'','review_flag':'','evidence':''}
            if cand:
                relevant, pp, lat, ev, flag, reason = analyze(row['text'])
                if relevant:
                    rec.update(relevant_aaoca=1, prepost=pp, laterality=lat, review_flag=flag, evidence=ev)
                    rel_pat.add(row['patient_id']); L2[pp]+=1
                    if pp=='pre':
                        lab={'RCA':'RCA anomaly','LEFT':'LCA anomaly'}.get(lat,'FLAG:'+lat)
                        rec['laterality_label']=lab; L3[lab]+=1
                    for f in flag.split(';'):
                        if f: fl[f]+=1
                    L1['relevant']+=1
                else:
                    L1['candidate-not-AAOCA']+=1
            else:
                L1['non-coronary-CT']+=1
            rows.append(rec)

    with open(out_path,'w',newline='') as fh:
        w=csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)

    print('total:',len(rows))
    print('\n=== L1 relevance ==='); [print(f'{v:6d}  {k}') for k,v in L1.most_common()]
    print(f'relevant patients: {len(rel_pat)}')
    print('\n=== L2 pre/post (within relevant) ==='); [print(f'{v:6d}  {k}') for k,v in L2.most_common()]
    print('\n=== L3 laterality (within pre) ==='); [print(f'{v:6d}  {k}') for k,v in L3.most_common()]
    print('\n=== review flags (within relevant) ==='); [print(f'{v:6d}  {k}') for k,v in fl.most_common()]

if __name__ == '__main__':
    import sys
    in_path  = sys.argv[1] if len(sys.argv) > 1 else 'radiology_report.csv'
    out_path = sys.argv[2] if len(sys.argv) > 2 else 'classified_reports.csv'
    run(in_path, out_path)
