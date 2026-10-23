"""李老师的音乐班: same-origin analytics, protected learning records, stdlib runtime."""
import os, json, sqlite3, hashlib, hmac, secrets, time, re, threading, mimetypes, uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from urllib.parse import urlparse, parse_qs
import reviewer

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get('MUSICCLASS_BASE', '/lilaoshi').rstrip('/')
if not re.fullmatch(r'/[a-z][a-z0-9-]*', BASE):
    raise ValueError('invalid MUSICCLASS_BASE')
ZONE = timezone(timedelta(hours=8))
DB = os.environ.get('MUSICCLASS_DB', str(ROOT / '.runtime/analytics.sqlite3'))
SECRET = os.environ.get('MUSICCLASS_SECRET', '')
PIN_HASH = os.environ.get('MUSICCLASS_PIN_SHA256', '')
ORIGINS = set(os.environ.get('MUSICCLASS_ORIGINS', 'http://127.0.0.1:8798,http://localhost:8798').split(','))
CORRECT = [1, 1, 1, 1, 0, 1, 1, 1]
COURSE = json.loads((ROOT / 'web/course.json').read_text())
QUESTIONS = COURSE['questions']
CHAPTERS_BY_ID={chapter['id']:chapter for chapter in COURSE['chapters']}
CHAPTER_STARTS=tuple(next(q['id'] for q in QUESTIONS if q['chapter']==chapter['id']) for chapter in COURSE['chapters'])
CHAPTER_QUESTIONS={start:tuple(q['id'] for q in QUESTIONS if q['chapter']==QUESTIONS[start]['chapter']) for start in CHAPTER_STARTS}
# Runs created before chapter expansion did not submit a syllabus; their IDs stop at 55.
LEGACY_CHAPTER_QUESTIONS={start:tuple(q for q in ids if q<56) for start,ids in CHAPTER_QUESTIONS.items()}
NAMES = [q['principle'] for q in QUESTIONS[:8]]
UUID = re.compile(r'^[a-f0-9-]{36}$')
lock = threading.Lock()
sessions, attempts, collect_rates, review_rates = {}, {}, {}, {}
review_slots = threading.BoundedSemaphore(4)

@contextmanager
def connect():
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    try:
        with db:
            yield db
    finally:
        db.close()

def init_db():
    Path(DB).parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''CREATE TABLE IF NOT EXISTS events(
          id TEXT PRIMARY KEY, day TEXT NOT NULL, ts REAL NOT NULL,
          visitor TEXT NOT NULL, session TEXT NOT NULL, kind TEXT NOT NULL,
          run TEXT, start INTEGER, q INTEGER, choice INTEGER);
          CREATE INDEX IF NOT EXISTS events_day ON events(day);
          CREATE UNIQUE INDEX IF NOT EXISTS answer_once ON events(run,q) WHERE kind='answer';
          CREATE UNIQUE INDEX IF NOT EXISTS start_once ON events(run) WHERE kind='start';
          CREATE UNIQUE INDEX IF NOT EXISTS complete_once ON events(run) WHERE kind='complete';
          CREATE TABLE IF NOT EXISTS run_syllabi(run TEXT PRIMARY KEY, questions TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS public_identities(ordinal INTEGER PRIMARY KEY AUTOINCREMENT, visitor TEXT UNIQUE NOT NULL, code TEXT UNIQUE);
          CREATE TABLE IF NOT EXISTS review_usage(id TEXT PRIMARY KEY, day TEXT, client TEXT, q INTEGER);
          CREATE INDEX IF NOT EXISTS events_visitor_ts ON events(visitor,ts);
          CREATE TABLE IF NOT EXISTS conversation_messages(
            id TEXT PRIMARY KEY,visitor TEXT NOT NULL,session TEXT NOT NULL,thread TEXT NOT NULL,
            q INTEGER NOT NULL,variant TEXT NOT NULL,option_order TEXT NOT NULL,
            position INTEGER NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,ts REAL NOT NULL,
            source TEXT NOT NULL,correct INTEGER);
          CREATE INDEX IF NOT EXISTS conversation_visitor_ts ON conversation_messages(visitor,ts);
          CREATE TABLE IF NOT EXISTS bookmarks(visitor TEXT NOT NULL,q INTEGER NOT NULL,ts REAL NOT NULL,PRIMARY KEY(visitor,q));
          CREATE TABLE IF NOT EXISTS bookmark_state(visitor TEXT PRIMARY KEY,updated REAL NOT NULL);
          CREATE TABLE IF NOT EXISTS journey_steps(id TEXT PRIMARY KEY,visitor TEXT NOT NULL,session TEXT NOT NULL,visit TEXT NOT NULL,step INTEGER NOT NULL,ts REAL NOT NULL,page TEXT NOT NULL,q INTEGER,chapter INTEGER,mode TEXT,duration INTEGER NOT NULL,action TEXT NOT NULL,next_page TEXT NOT NULL,next_q INTEGER,next_chapter INTEGER,next_mode TEXT,option INTEGER,verdict INTEGER);
          CREATE UNIQUE INDEX IF NOT EXISTS journey_once ON journey_steps(visitor,visit,step);
          CREATE INDEX IF NOT EXISTS journey_user ON journey_steps(visitor,visit,step);
          CREATE TABLE IF NOT EXISTS recording_meta(key TEXT PRIMARY KEY,value REAL NOT NULL);''')
        if 'course' not in [r[1] for r in db.execute('PRAGMA table_info(events)')]:
            db.execute('ALTER TABLE events ADD COLUMN course INTEGER NOT NULL DEFAULT 1')

    with connect() as db:
        db.execute("INSERT OR IGNORE INTO recording_meta VALUES('conversations_since',?)",(time.time(),))

def resolve_question(question_id,variant='base',order=None):
    base=QUESTIONS[question_id]
    if order is None:order=[0,1]
    if not isinstance(order,list) or len(order)!=2 or any(type(v) is not int for v in order) or sorted(order)!=[0,1]:raise ValueError('invalid option order')
    if not isinstance(variant,str):raise ValueError('invalid question variant')
    override={} if variant=='base' else next((v for v in base.get('variants',[]) if v['id']==variant),None)
    if override is None:raise ValueError('invalid question variant')
    question={**base,**override,'id':base['id'],'variantId':variant,'optionOrder':order}
    question.pop('variants',None)
    if question['kind']=='choice':
        question['correct']=order.index(question['correct']);question['labels']=[question['labels'][i] for i in order]
        if question.get('visuals'):question['visuals']=[question['visuals'][i] for i in order]
    return question

def digest(s):
    return hmac.new(SECRET.encode(), s.encode(), hashlib.sha256).hexdigest()

def support_code(ordinal):
    """Exhaust a collision-free base-36 space before adding another character."""
    alphabet='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    index=ordinal-1;width=3
    if index<0:raise ValueError('invalid ordinal')
    while index>=36**width:index-=36**width;width+=1
    # A permutation spreads sequential allocations across the complete code space.
    value=(index*7919+10463)%(36**width);text=''
    for _ in range(width):value,remainder=divmod(value,36);text=alphabet[remainder]+text
    return text

def public_ids(visitors):
    result={}
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        for visitor in visitors:
            row=db.execute('SELECT code FROM public_identities WHERE visitor=?',(visitor,)).fetchone()
            if row:result[visitor]=row['code'];continue
            ordinal=db.execute('INSERT INTO public_identities(visitor) VALUES(?)',(visitor,)).lastrowid
            code=support_code(ordinal);db.execute('UPDATE public_identities SET code=? WHERE ordinal=?',(code,ordinal));result[visitor]=code
    return result

def collect(data, now=None):
    now = time.time() if now is None else now
    kind = data.get('kind')
    if kind not in ('view','start','answer','complete','note_saved'):
        raise ValueError('invalid event')
    for key in ('id','visitor','session'):
        if not isinstance(data.get(key),str) or not UUID.fullmatch(data[key]):
            raise ValueError('invalid identity')
    run = data.get('run')
    if kind != 'view' and (not isinstance(run,str) or not UUID.fullmatch(run)):
        raise ValueError('invalid run')
    course = data.get('course',1)
    if type(course) is not int or course not in (1,2):raise ValueError('invalid course')
    start = data.get('start')
    if kind == 'start' and (type(start) is not int or start not in ((0,4,6) if course==1 else CHAPTER_STARTS)):
        raise ValueError('invalid start')
    syllabus=None
    if kind=='start' and course==2:
        syllabus=data.get('questions',list(LEGACY_CHAPTER_QUESTIONS[start]))
        if not isinstance(syllabus,list) or any(type(q) is not int for q in syllabus) or tuple(syllabus) not in (CHAPTER_QUESTIONS[start],LEGACY_CHAPTER_QUESTIONS[start]) or not syllabus:raise ValueError('invalid syllabus')
    q, choice = data.get('q'), data.get('choice')
    if kind == 'answer' and (type(q) is not int or q not in range(8 if course==1 else len(QUESTIONS)) or type(choice) is not int or choice not in (0,1,-1)):
        raise ValueError('invalid answer')
    if kind=='answer':
        if course==1 and choice not in (0,1):raise ValueError('invalid answer')
        if course==2 and ((QUESTIONS[q]['kind']=='open' and choice not in (-1,0,1)) or (QUESTIONS[q]['kind']=='choice' and choice not in (0,1))):raise ValueError('invalid answer')
    day = datetime.fromtimestamp(now, ZONE).date().isoformat()
    visitor, session = digest(data['visitor']), digest(data['session'])
    with connect() as db:
        if kind in ('answer','complete','note_saved'):
            begun=db.execute("SELECT * FROM events WHERE kind='start' AND run=? AND visitor=? AND session=?",(run,visitor,session)).fetchone()
            if not begun: raise ValueError('run not started')
            if begun['course']!=course:raise ValueError('course mismatch')
            recorded=db.execute('SELECT questions FROM run_syllabi WHERE run=?',(run,)).fetchone()
            syllabus=tuple(json.loads(recorded['questions'])) if recorded else LEGACY_CHAPTER_QUESTIONS.get(begun['start'],())
            if kind=='answer' and (q < begun['start'] if course==1 else q not in syllabus):raise ValueError('invalid question')
            if kind=='complete':
                count=db.execute("SELECT COUNT(*) FROM events WHERE run=? AND kind='answer'",(run,)).fetchone()[0]
                if count!=(8-begun['start'] if course==1 else len(syllabus)): raise ValueError('run incomplete')
        db.execute('INSERT OR IGNORE INTO events(id,day,ts,visitor,session,kind,run,start,q,choice,course) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
          (data['id'],day,now,visitor,session,kind,run,start,q,choice,course))
        if kind=='start' and course==2:db.execute('INSERT OR IGNORE INTO run_syllabi VALUES(?,?)',(run,json.dumps(syllabus)))
        # Store only a rolling 90 days; no raw IP, UA, prompt or note text enters this table.
        db.execute('DELETE FROM events WHERE ts < ?', (now-90*86400,))
        db.execute("DELETE FROM run_syllabi WHERE run NOT IN (SELECT run FROM events WHERE kind='start')")

def summary(days, now=None):
    now = time.time() if now is None else now
    today = datetime.fromtimestamp(now,ZONE).date()
    first = today-timedelta(days=days-1)
    start = datetime.combine(first,datetime.min.time(),ZONE).timestamp()
    with connect() as db:
        rows = db.execute('SELECT * FROM events WHERE ts>=? AND ts<=?',(start,now)).fetchall()
        earliest=db.execute('SELECT MIN(ts) FROM events').fetchone()[0]
        syllabi={r['run']:tuple(json.loads(r['questions'])) for r in db.execute('SELECT * FROM run_syllabi')}
    views=[r for r in rows if r['kind']=='view']
    starts=[r for r in rows if r['kind']=='start']
    runids={r['run'] for r in starts}
    answers=[r for r in rows if r['kind']=='answer' and r['run'] in runids]
    completions={r['run'] for r in rows if r['kind']=='complete' and r['run'] in runids}
    active={r['visitor'] for r in rows}
    daily=[]
    for n in range(days):
        day=(first+timedelta(days=n)).isoformat()
        dv=[r for r in views if r['day']==day]
        ds=[r for r in starts if r['day']==day]
        daily.append({'day':day,'covered':bool(earliest is not None and day>=datetime.fromtimestamp(earliest,ZONE).date().isoformat()),'views':len(dv),'visitors':len({r['visitor'] for r in dv}),'starts':len(ds),'completed':sum(r['run'] in completions for r in ds)})
    questions=[]
    for version,catalog in ((1,[{'principle':name,'correct':CORRECT[i],'kind':'choice'} for i,name in enumerate(NAMES)]),(2,QUESTIONS)):
        for q,item in enumerate(catalog):
            a=[r for r in answers if r['q']==q and r['course']==version]
            submitted=a
            entrants={r['run'] for r in starts if r['course']==version and (r['start']<=q if version==1 else q in syllabi.get(r['run'],LEGACY_CHAPTER_QUESTIONS[r['start']]))}
            questions.append({'index':q,'course':version,'kind':item['kind'],'name':item['principle'],'answers':len(submitted),'correct':sum(r['choice']==item['correct'] for r in submitted) if item['kind']=='choice' else (sum(r['choice']==1 for r in submitted) if any(r['choice'] in (0,1) for r in submitted) else None),'gradedAnswers':sum(r['choice'] in (0,1) for r in submitted),'eligible':len(entrants)})
    chapters=[]
    for version,starts_at in ((1,(0,4,6)),(2,CHAPTER_STARTS)):
        for ch in starts_at:
            r=[r for r in starts if r['start']==ch and r['course']==version]
            chapters.append({'course':version,'start':ch,'runs':len(r),'completed':sum(x['run'] in completions for x in r)})
    return {'days':days,'from':first.isoformat(),'to':today.isoformat(),'timezone':'Asia/Shanghai',
      'generatedAt':datetime.fromtimestamp(now,ZONE).isoformat(),'collectedSince':datetime.fromtimestamp(earliest,ZONE).isoformat() if earliest else None,
      'metrics':{'views':len(views),'visitors':len(active),'sessions':len({r['session'] for r in rows}),'starts':len(starts),'completed':len(completions),'answers':len(answers),'notes':sum(r['kind']=='note_saved' for r in rows)},
      'daily':daily,'questions':questions,'chapters':chapters}

def save_conversation(data,now=None,source='browser'):
    now=time.time() if now is None else now
    for key in ('visitor','session','thread'):
        if not isinstance(data.get(key),str) or not UUID.fullmatch(data[key]):raise ValueError('invalid identity')
    q=data.get('q')
    if type(q) is not int or q not in range(len(QUESTIONS)):raise ValueError('invalid question')
    variant=data.get('variant','base');order=data.get('optionOrder',[0,1])
    question=resolve_question(q,variant,order)
    messages=data.get('messages')
    if not isinstance(messages,list) or not 1<=len(messages)<=12:raise ValueError('invalid messages')
    rows=[]
    for m in messages:
        if not isinstance(m,dict) or m.get('role') not in ('user','assistant'):raise ValueError('invalid message')
        if not isinstance(m.get('id'),str) or not UUID.fullmatch(m['id']):raise ValueError('invalid message id')
        text=m.get('content');position=m.get('position')
        if not isinstance(text,str) or not 1<=len(text)<=4000 or not text.strip():raise ValueError('invalid content')
        if type(position) is not int or not 0<=position<=100000:raise ValueError('invalid message position')
        correct=int(m['correct']) if type(m.get('correct')) is bool else None
        rows.append((digest(data['visitor']+':'+m['id']),digest(data['visitor']),digest(data['session']),digest(data['visitor']+':'+data['thread']),q,variant,json.dumps(order),position,m['role'],text,now,source,correct))
    with connect() as db:
        db.executemany('INSERT OR IGNORE INTO conversation_messages VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',rows)
        db.execute('DELETE FROM conversation_messages WHERE ts<?',(now-90*86400,))

def report_start(days,now):
    if days=='all':return 0
    first=datetime.fromtimestamp(now,ZONE).date()-timedelta(days=days-1)
    return datetime.combine(first,datetime.min.time(),ZONE).timestamp()

def graded_value(row):
    if row['choice'] not in (0,1):return None
    if row['course']==2:
        q=QUESTIONS[row['q']]
        return row['choice']==(1 if q['kind']=='open' else q['correct'])
    return row['choice']==CORRECT[row['q']]

def learner_totals(events,messages):
    answers=[r for r in events if r['kind']=='answer']
    current=[r for r in answers if r['course']==2]
    graded=[graded_value(r) for r in answers if graded_value(r) is not None]
    submitted={r['q'] for r in current}|{r['q'] for r in messages if r['role']=='user'}
    return {'answers':len(answers),'graded':len(graded),'correct':sum(graded),
      'depth':len(submitted),'totalQuestions':len(QUESTIONS),
      'chapters':len({QUESTIONS[q]['chapter'] for q in submitted}),
      'starts':sum(r['kind']=='start' for r in events),'completed':sum(r['kind']=='complete' for r in events),
      'messages':len(messages),'userMessages':sum(r['role']=='user' for r in messages),
      'openAnswers':sum(r['role']=='user' and QUESTIONS[r['q']]['kind']=='open' for r in messages),
      'lastActive':max([r['ts'] for r in events]+[r['ts'] for r in messages],default=None)}

def daily_trends(days,now):
    today=datetime.fromtimestamp(now,ZONE).date()
    with connect() as db:
        events=db.execute('SELECT ts,visitor,kind,q,choice,course FROM events WHERE ts<=?',(now,)).fetchall()
        messages=db.execute('SELECT ts,visitor,role,q FROM conversation_messages WHERE ts<=?',(now,)).fetchall()
    activity={};first_seen={};views={};graded={};submitted={}
    earliest=None
    for rows,is_message in ((events,False),(messages,True)):
        for r in rows:
            day=datetime.fromtimestamp(r['ts'],ZONE).date();visitor=r['visitor']
            earliest=day if earliest is None else min(earliest,day)
            first_seen[visitor]=min(first_seen.get(visitor,day),day)
            activity.setdefault(day,set()).add(visitor)
            if not is_message and r['kind']=='view':views[day]=views.get(day,0)+1
            if not is_message and r['kind']=='answer':
                value=graded_value(r)
                if value is not None:graded.setdefault(day,[]).append(value)
            if (is_message and r['role']=='user') or (not is_message and r['kind']=='answer' and r['course']==2):
                submitted.setdefault(day,set()).add((visitor,r['q']))
    cohorts={}
    for visitor,day in first_seen.items():cohorts.setdefault(day,set()).add(visitor)
    first=(earliest or today) if days=='all' else today-timedelta(days=days-1)
    rows=[]
    for n in range((today-first).days+1):
        day=first+timedelta(days=n);covered=earliest is not None and day>=earliest
        people=activity.get(day,set());answers=graded.get(day,[]);cohort=cohorts.get(day,set())
        next_day=day+timedelta(days=1);mature=next_day<today
        returned=len(cohort&activity.get(next_day,set())) if mature else None
        rows.append({'day':day.isoformat(),'covered':covered,
          'views':views.get(day,0) if covered else None,'users':len(people) if covered else None,
          'accuracy':100*sum(answers)/len(answers) if answers else None,
          'correct':sum(answers),'graded':len(answers),
          'depth':len(submitted.get(day,set()))/len(people) if people else None,
          'uniqueAnswers':len(submitted.get(day,set())),
          'retention':100*returned/len(cohort) if mature and cohort else None,
          'cohort':len(cohort),'returned':returned,'retentionMature':mature})
    return {'from':first.isoformat(),'to':today.isoformat(),'availableFrom':earliest.isoformat() if earliest else None,'days':rows}

JOURNEY_PAGES=('home','chapters','question','result')
JOURNEY_ACTIONS=('start','choose_chapter','choose_mistakes','next_question','back_to_chapters','back_home','answer_choice','submit_answer','send_message','view_result','open_notes','close_notes','send_note_message','background','resume','leave','stay','skip_question','bookmark','remove_bookmark','arrive')
def save_journey(data,now=None):
    now=time.time() if now is None else now
    for key in ('id','visitor','session','visit'):
        if not isinstance(data.get(key),str) or not UUID.fullmatch(data[key]):raise ValueError('invalid journey identity')
    if data.get('page') not in JOURNEY_PAGES or data.get('nextPage') not in JOURNEY_PAGES or data.get('action') not in JOURNEY_ACTIONS:raise ValueError('invalid journey step')
    for key,maximum in (('q',len(QUESTIONS)),('nextQ',len(QUESTIONS)),('chapter',len(COURSE['chapters'])),('nextChapter',len(COURSE['chapters']))):
        if data.get(key) is not None and (type(data[key]) is not int or not 0<=data[key]<maximum):raise ValueError('invalid journey context')
    for key in ('mode','nextMode'):
        if data.get(key) not in (None,'full','mistakes'):raise ValueError('invalid practice mode')
    step,duration=data.get('step'),data.get('durationMs')
    if type(step) is not int or not 0<=step<=100000 or type(duration) is not int or not 0<=duration<=86400000:raise ValueError('invalid journey duration')
    option=data.get('option');verdict=data.get('correct')
    if option is not None and (type(option) is not int or option not in (0,1)):raise ValueError('invalid option')
    if verdict is not None and type(verdict) is not bool:raise ValueError('invalid verdict')
    with connect() as db:
        db.execute('INSERT OR IGNORE INTO journey_steps VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(data['id'],digest(data['visitor']),digest(data['session']),digest(data['visitor']+':'+data['visit']),step,now,data['page'],data.get('q'),data.get('chapter'),data.get('mode'),duration,data['action'],data['nextPage'],data.get('nextQ'),data.get('nextChapter'),data.get('nextMode'),option,None if verdict is None else int(verdict)))
        db.execute('DELETE FROM journey_steps WHERE ts<?',(now-90*86400,))

def journey_text(rows):
    parts=[];pending=0;pending_key=None
    for r in rows:
        key=(r['page'],r['q'],r['chapter'],r['mode'])
        if key!=pending_key:pending=0
        pending_key=key;pending+=r['duration']
        if r['action']=='stay' and r is not rows[-1]:continue
        page={'home':'首页','chapters':'章节目录','question':f"答题页「{QUESTIONS[r['q']]['title']}」" if r['q'] is not None else '答题页','result':'成绩页'}[r['page']]
        if r['action']=='arrive':
            if r is rows[-1]:parts.append(page+'（已进入，后续停留尚未上报）')
            continue
        seconds=round(pending/1000,1);duration=str(int(seconds)) if seconds.is_integer() else str(seconds)
        action={'start':'点击开始答题','skip_question':'暂时跳过，稍后再做','bookmark':'收藏题目','remove_bookmark':'取消收藏','next_question':'点击下一题','back_to_chapters':'返回章节目录','back_home':'返回首页','answer_choice':f"选择{'A' if r['option']==0 else 'B'}"+(('，答对' if r['verdict'] else '，答错') if r['verdict'] is not None else ''),'submit_answer':'提交简答','send_message':'向 AI 发消息','view_result':'查看本章成绩','open_notes':'打开笔记','close_notes':'收起笔记','send_note_message':'在笔记中追问','background':'切到后台（暂停计时）','resume':'回到页面','leave':'离开页面','stay':'仍在浏览'}.get(r['action'])
        if r['action'] in ('choose_chapter','choose_mistakes'):
            chapter=r['next_chapter'];name=CHAPTERS_BY_ID[chapter]['title'] if chapter is not None else '章节'
            action=f"选择「{name}」"+('消灭错题' if r['action']=='choose_mistakes' else '开始练习')
        parts.append(f'{page}停留{duration}s，{action}');pending=0
    return ' → '.join(parts)

def usage_paths(visitor,days,page,now):
    start=report_start(days,now)
    with connect() as db:
        visits=db.execute('SELECT visit,MIN(ts-duration/1000.0) AS first,MAX(ts) AS last FROM journey_steps WHERE visitor=? AND ts>=? AND ts<=? GROUP BY visit ORDER BY first DESC,visit LIMIT 11 OFFSET ?',(visitor,start,now,page*10)).fetchall()
        items=[]
        for visit in visits[:10]:
            rows=db.execute('SELECT * FROM journey_steps WHERE visitor=? AND visit=? ORDER BY step,ts',(visitor,visit['visit'])).fetchall()
            items.append({'id':visit['visit'],'ts':visit['first'],'last':visit['last'],'text':journey_text(rows),'precise':True,'steps':len(rows)})
        if page==0:
            tracked={r['session']:r['first'] for r in db.execute('SELECT session,MIN(ts-duration/1000.0) AS first FROM journey_steps WHERE visitor=? GROUP BY session',(visitor,))}
            events=db.execute('SELECT * FROM events WHERE visitor=? AND ts>=? AND ts<=? ORDER BY ts',(visitor,start,now)).fetchall();legacy={}
            for r in events:
                if r['session'] in tracked and r['ts']>=tracked[r['session']]:continue
                if r['kind']=='view':text='访问首页'
                elif r['kind']=='start':text='开始练习'+('「'+CHAPTERS_BY_ID[QUESTIONS[r['start']]['chapter']]['title']+'」' if r['course']==2 else '（旧版）')
                elif r['kind']=='answer':text=f"第{r['q']+1}题提交"+('，未判定' if graded_value(r) is None else '，答对' if graded_value(r) else '，答错')
                elif r['kind']=='complete':text='完成本章练习'
                elif r['kind']=='note_saved':text='收藏题目'
                else:continue
                legacy.setdefault(r['session'],{'ts':r['ts'],'parts':[]})['parts'].append(text)
            for session,values in legacy.items():items.append({'id':'legacy:'+session,'ts':values['ts'],'text':' → '.join(values['parts']),'precise':False,'steps':len(values['parts'])})
            items.sort(key=lambda item:item['ts'],reverse=True)
    return {'journeys':items,'journeysHasMore':len(visits)>10,'journeyPage':page}

def question_detail(question_id,days,now=None):
    if type(question_id) is not int or question_id not in range(len(QUESTIONS)):raise ValueError('invalid question')
    now=time.time() if now is None else now;start=report_start(days,now);q=QUESTIONS[question_id]
    with connect() as db:
        answers=db.execute("SELECT * FROM events WHERE kind='answer' AND course=2 AND q=? AND ts>=? AND ts<=? ORDER BY ts DESC",(question_id,start,now)).fetchall()
    graded=[graded_value(r) for r in answers if graded_value(r) is not None]
    with connect() as db:bookmarks=db.execute('SELECT COUNT(*) FROM bookmarks WHERE q=?',(question_id,)).fetchone()[0]
    codes=public_ids({r['visitor'] for r in answers[:50]})
    return {'bookmarks':bookmarks,'question':q,'chapter':CHAPTERS_BY_ID[q['chapter']]['title'],'answers':len(answers),'graded':len(graded),'correct':sum(graded),'users':len({r['visitor'] for r in answers}),'recentAnswers':[{'visitor':r['visitor'],'label':'用户 '+codes[r['visitor']],'ts':r['ts'],'correct':graded_value(r)} for r in answers[:50]]}

def save_bookmarks(data,now=None):
    now=time.time() if now is None else now
    for key in ('visitor','session'):
        if not isinstance(data.get(key),str) or not UUID.fullmatch(data[key]):raise ValueError('invalid identity')
    questions=data.get('questions')
    if not isinstance(questions,list) or len(questions)>256 or any(type(q) is not int or q not in range(len(QUESTIONS)) for q in questions):raise ValueError('invalid bookmarks')
    visitor=digest(data['visitor']);questions=sorted(set(questions))
    with connect() as db:
        existing={r[0] for r in db.execute('SELECT q FROM bookmarks WHERE visitor=?',(visitor,))}
        for q in existing-set(questions):db.execute('DELETE FROM bookmarks WHERE visitor=? AND q=?',(visitor,q))
        for q in set(questions)-existing:db.execute('INSERT INTO bookmarks VALUES(?,?,?)',(visitor,q,now))
        db.execute('INSERT INTO bookmark_state VALUES(?,?) ON CONFLICT(visitor) DO UPDATE SET updated=excluded.updated',(visitor,now))
        db.execute('DELETE FROM bookmarks WHERE visitor IN (SELECT visitor FROM bookmark_state WHERE updated<?)',(now-90*86400,))
        db.execute('DELETE FROM bookmark_state WHERE updated<?',(now-90*86400,))

def bookmark_detail(visitor):
    with connect() as db:
        state=db.execute('SELECT updated FROM bookmark_state WHERE visitor=?',(visitor,)).fetchone()
        rows=db.execute('SELECT q,ts FROM bookmarks WHERE visitor=? ORDER BY ts DESC,q',(visitor,)).fetchall()
    return {'bookmarks':len(rows) if state else None,'bookmarksUpdated':state['updated'] if state else None,'bookmarkedQuestions':[{'id':r['q'],'title':QUESTIONS[r['q']]['title'],'ts':r['ts']} for r in rows]}

def recent_activity(days,now):
    start=report_start(days,now)
    with connect() as db:
        messages=db.execute("SELECT * FROM conversation_messages WHERE ts>=? AND ts<=? AND (role='user' OR source='model') ORDER BY ts DESC,id DESC LIMIT 100",(start,now)).fetchall()
        completions=db.execute("SELECT * FROM events WHERE kind='complete' AND ts>=? AND ts<=? ORDER BY ts DESC LIMIT 30",(start,now)).fetchall()
        items=[];paired=set()
        for m in messages:
            if m['role']!='assistant':continue
            user=db.execute("SELECT * FROM conversation_messages WHERE visitor=? AND thread=? AND role='user' AND position<? ORDER BY position DESC,ts DESC LIMIT 1",(m['visitor'],m['thread'],m['position'])).fetchone()
            if not user:continue
            paired.add(user['id'])
            q=QUESTIONS[m['q']]
            items.append({'id':'chat:'+m['id'],'type':'conversation','visitor':m['visitor'],'label':'访客 '+m['visitor'][:10],'ts':m['ts'],'title':q['title'],'userText':user['content'][:700] if user else '', 'aiText':m['content'][:700]})
        for m in messages:
            if m['role']!='user' or m['id'] in paired:continue
            q=QUESTIONS[m['q']]
            if q['kind']!='open':continue
            items.append({'id':'message:'+m['id'],'type':'answer','visitor':m['visitor'],'label':'访客 '+m['visitor'][:10],'ts':m['ts'],'title':q['title'],'userText':m['content'][:700]})
        for event in completions:
            run_answers=db.execute("SELECT * FROM events WHERE kind='answer' AND run=? AND visitor=? ORDER BY ts",(event['run'],event['visitor'])).fetchall()
            begun=db.execute("SELECT * FROM events WHERE kind='start' AND run=? AND visitor=?",(event['run'],event['visitor'])).fetchone()
            if not begun:continue
            graded=[graded_value(r) for r in run_answers if graded_value(r) is not None]
            chapter=CHAPTERS_BY_ID[QUESTIONS[begun['start']]['chapter']]['title'] if begun['course']==2 else '历史练习'
            items.append({'id':'score:'+event['id'],'type':'score','visitor':event['visitor'],'label':'访客 '+event['visitor'][:10],'ts':event['ts'],'title':chapter,'score':round(100*sum(graded)/len(graded)) if graded and len(graded)==len(run_answers) else None,'accuracy':round(100*sum(graded)/len(graded),1) if graded else None,'correct':sum(graded),'graded':len(graded),'total':len(run_answers)})
    codes=public_ids({item['visitor'] for item in items})
    for item in items:item['label']='用户 '+codes[item['visitor']]
    items.sort(key=lambda item:(item['ts'],item['id']),reverse=True)
    # Balance actual conversations, short answers, and completed practice summaries.
    chosen=[];counts={}
    for item in items:
        kind=item['type']
        if counts.get(kind,0)>=6:continue
        counts[kind]=counts.get(kind,0)+1;chosen.append(item)
    return chosen[:36]

def learning_report(days,page=0,search='',now=None,sort=None,direction=None):
    now=time.time() if now is None else now;start=report_start(days,now)
    if not isinstance(search,str) or len(search)>64:raise ValueError('invalid search')
    with connect() as db:
        events=db.execute('SELECT * FROM events WHERE ts>=? AND ts<=?',(start,now)).fetchall()
        messages=db.execute('SELECT visitor,ts,role,q FROM conversation_messages WHERE ts>=? AND ts<=?',(start,now)).fetchall()
        since=db.execute("SELECT value FROM recording_meta WHERE key='conversations_since'").fetchone()[0]
    people={}
    for kind,rows in (('events',events),('messages',messages)):
        for row in rows:people.setdefault(row['visitor'],{'events':[],'messages':[]})[kind].append(row)
    codes=public_ids(people)
    users=[{'id':key,'publicId':codes[key],'label':'用户 '+codes[key],**learner_totals(v['events'],v['messages'])} for key,v in people.items() if search.lower() in key or search.upper() in codes[key] or search.lower() in ('用户 '+codes[key]).lower() or search.lower() in ('访客 '+key[:10])]
    with connect() as db:
        synced={r['visitor'] for r in db.execute('SELECT visitor FROM bookmark_state')}
        bookmark_counts={r['visitor']:r['count'] for r in db.execute('SELECT visitor,COUNT(*) AS count FROM bookmarks GROUP BY visitor')}
        question_bookmarks={r['q']:r['count'] for r in db.execute('SELECT q,COUNT(*) AS count FROM bookmarks GROUP BY q')}
    for user in users:user['bookmarks']=bookmark_counts.get(user['id'],0) if user['id'] in synced else None
    if sort is not None and (sort not in ('label','depth','chapters','correct','accuracy','openAnswers','lastActive','bookmarks') or direction not in ('asc','desc')):raise ValueError('invalid sort')
    users.sort(key=lambda u:(u['lastActive'] or 0,u['id']),reverse=True)
    if sort:
        def value(user):
            if sort=='accuracy':return user['correct']/user['graded'] if user['graded'] else None
            return user[sort]
        available=[u for u in users if value(u) is not None];missing=[u for u in users if value(u) is None]
        available.sort(key=value,reverse=direction=='desc');users=available+missing
    totals=learner_totals(events,messages)
    totals.update(users=len(people),recordingSince=since)
    question_stats=[]
    for q in QUESTIONS:
        answers=[r for r in events if r['kind']=='answer' and r['course']==2 and r['q']==q['id']]
        graded=[graded_value(r) for r in answers if graded_value(r) is not None]
        question_stats.append({'id':q['id'],'title':q['title'],'principle':q['principle'],'kind':q['kind'],'chapter':q['chapter'],'chapterName':CHAPTERS_BY_ID[q['chapter']]['title'],'answers':len(answers),'graded':len(graded),'correct':sum(graded),'users':len({r['visitor'] for r in answers}),'bookmarks':question_bookmarks.get(q['id'],0)})
    return {'users':users[page*30:(page+1)*30],'total':len(users),'page':page,'pageSize':30,'totals':totals,'questions':question_stats,'chapters':COURSE['chapters'],'trend':daily_trends(days,now),'activity':recent_activity(days,now)}

def learner_detail(visitor,days,page=0,now=None,journey_page=0):
    if isinstance(visitor,str) and re.fullmatch('[A-Z0-9]{3,12}',visitor.upper()):
        with connect() as db:row=db.execute('SELECT visitor FROM public_identities WHERE code=?',(visitor.upper(),)).fetchone()
        if not row:raise ValueError('invalid visitor')
        visitor=row['visitor']
    if not isinstance(visitor,str) or not re.fullmatch('[a-f0-9]{64}',visitor):raise ValueError('invalid visitor')
    now=time.time() if now is None else now;start=report_start(days,now)
    with connect() as db:
        events=db.execute('SELECT * FROM events WHERE visitor=? AND ts>=? AND ts<=? ORDER BY ts',(visitor,start,now)).fetchall()
        message_meta=db.execute('SELECT visitor,ts,role,q FROM conversation_messages WHERE visitor=? AND ts>=? AND ts<=?',(visitor,start,now)).fetchall()
        messages=db.execute('SELECT * FROM conversation_messages WHERE visitor=? AND ts>=? AND ts<=? ORDER BY ts,thread,position,id LIMIT 51 OFFSET ?',(visitor,start,now,page*50)).fetchall()
    answers=[]
    for r in events:
        if r['kind']!='answer':continue
        q=QUESTIONS[r['q']] if r['course']==2 else None
        answers.append({'q':r['q'],'course':r['course'],'title':q['title'] if q else NAMES[r['q']], 'kind':q['kind'] if q else 'choice','correct':graded_value(r),'ts':r['ts']})
    records=[]
    for r in messages[:50]:
        q=resolve_question(r['q'],r['variant'],json.loads(r['option_order']))
        records.append({'id':r['id'],'thread':r['thread'],'position':r['position'],'q':r['q'],'title':q['title'],'question':q['brief']+(' '+q.get('prompt','') if q['kind']=='open' else ''),'kind':q['kind'],'role':r['role'],'content':r['content'],'ts':r['ts'],'source':r['source'],'correct':None if r['correct'] is None else bool(r['correct'])})
    code=public_ids([visitor])[visitor]
    return {'id':visitor,'publicId':code,'label':'用户 '+code,**learner_totals(events,message_meta),'answers':answers,'records':records,'page':page,'hasMore':len(messages)>50,**usage_paths(visitor,days,journey_page,now),**bookmark_detail(visitor)}

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def reply(self,code,data=None,cookie=None):
        raw=json.dumps(data,ensure_ascii=False).encode() if data is not None else b''
        self.send_response(code)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Length',str(len(raw)))
        if cookie:self.send_header('Set-Cookie',cookie)
        self.end_headers()
        self.wfile.write(raw)
    def authorized(self):
        try:
            cookie=SimpleCookie(self.headers.get('Cookie',''))
            token=cookie['lilaoshi_admin'].value
        except (KeyError,ValueError):return False
        with lock:return sessions.get(digest(token),0)>time.time()
    def body(self):
        try:
            size=int(self.headers.get('Content-Length','0'))
            limit=131072 if urlparse(self.path).path.endswith('/review') else 32768 if urlparse(self.path).path.endswith('/conversation') else 16384
            if size<2 or size>limit:raise ValueError()
            data=json.loads(self.rfile.read(size))
            if not isinstance(data,dict):raise ValueError()
            return data
        except (ValueError,json.JSONDecodeError):raise ValueError('invalid body')
    def do_POST(self):
        path=urlparse(self.path).path
        if self.headers.get('Origin') not in ORIGINS:
            return self.reply(403,{'error':'origin rejected'})
        if path not in (BASE+'/api/login',BASE+'/api/logout',BASE+'/api/collect',BASE+'/api/review',BASE+'/api/conversation',BASE+'/api/journey',BASE+'/api/bookmarks',BASE+'/api/identity'):
            return self.reply(404,{'error':'not found'})
        key=digest(self.headers.get('X-Real-IP',self.client_address[0]))
        now=time.time()
        with lock:
            for mapping in (attempts,collect_rates,review_rates,sessions):
                if len(mapping)>10000:
                    mapping.clear()
        if path.endswith('/identity'):
            try:
                visitor=self.body().get('visitor')
                if not isinstance(visitor,str) or not UUID.fullmatch(visitor):raise ValueError()
                return self.reply(200,{'id':public_ids([digest(visitor)])[digest(visitor)]})
            except ValueError:return self.reply(400,{'error':'invalid visitor'})
        if path.endswith('/review'):
            return self.review_request(key,now)
        if path.endswith('/login'):
            with lock:
                count,until=attempts.get(key,(0,now+300))
                if until<=now:count,until=0,now+300
                if count>=5:return self.reply(429,{'error':'尝试过于频繁，请稍后再试。','retryAfter':max(1,int(until-now))})
            try:data=self.body()
            except ValueError:return self.reply(400,{'error':'invalid body'})
            code=str(data.get('code',''))
            valid=re.fullmatch(r'\d{6}',code) and hmac.compare_digest(hashlib.sha256(code.encode()).hexdigest(),PIN_HASH)
            if not valid:
                with lock:attempts[key]=(count+1,until)
                return self.reply(401,{'error':'访问码不正确。'})
            token=secrets.token_urlsafe(32)
            with lock:
                sessions[digest(token)]=now+8*3600
                attempts.pop(key,None)
            return self.reply(200,{'ok':True},f'lilaoshi_admin={token}; HttpOnly; Secure; SameSite=Strict; Path={BASE}/api/')
        if path.endswith('/logout'):
            try:
                c=SimpleCookie(self.headers.get('Cookie',''));token=c['lilaoshi_admin'].value
                with lock:sessions.pop(digest(token),None)
            except (KeyError,ValueError):pass
            return self.reply(200,{'ok':True},f'lilaoshi_admin=; HttpOnly; Secure; SameSite=Strict; Path={BASE}/api/; Max-Age=0')
        with lock:
            count,until=collect_rates.get(key,(0,now+60))
            if until<=now:count,until=0,now+60
            collect_rates[key]=(count+1,until)
        if count>=180:return self.reply(429,{'error':'rate limited'})
        try:
            payload=self.body()
            if path.endswith('/bookmarks'):save_bookmarks(payload,now)
            elif path.endswith('/journey'):save_journey(payload,now)
            elif path.endswith('/conversation'):save_conversation(payload,now)
            else:collect(payload)
        except ValueError as ex:return self.reply(400,{'error':str(ex)})
        except sqlite3.Error:return self.reply(503,{'error':'storage unavailable'})
        return self.reply(204)
    def review_request(self,key,now):
        try:
            data=self.body()
            q=data.get('q');answer=data.get('answer');request_id=data.get('id');chat=data.get('mode') in ('chat','assessment');assess=data.get('mode')=='assessment'
            messages=data.get('messages')
            if chat:messages=reviewer.validate_messages(messages)
            if type(q) is not int or q not in range(len(QUESTIONS)) or (not chat and QUESTIONS[q]['kind']!='open'):raise ValueError()
            if assess and QUESTIONS[q]['kind']!='open':raise ValueError()
            question=resolve_question(q,data.get('variant','base'),data.get('optionOrder')) if 'variant' in data or 'optionOrder' in data else QUESTIONS[q]
            if not isinstance(answer,str) or not (1 if chat else 30)<=len(answer.strip())<=2000:raise ValueError()
            if not isinstance(request_id,str) or not UUID.fullmatch(request_id):raise ValueError()
        except ValueError:return self.reply(400,{'error':'请针对本题写下 30—2000 字的思路。'})
        tracking=data.get('tracking')
        if tracking is not None and not isinstance(tracking,dict):return self.reply(400,{'error':'invalid recording context'})
        if tracking:
            try:save_conversation({**tracking,'q':q,'variant':data.get('variant','base'),'optionOrder':data.get('optionOrder',[0,1]),'messages':data.get('messages') or [{'id':request_id,'role':'user','content':answer,'position':0}]},now)
            except ValueError:return self.reply(400,{'error':'invalid recording context'})
            except sqlite3.Error:return self.reply(503,{'error':'作答记录暂时无法保存，请稍后重试。'})
        if not reviewer.configured():return self.reply(503,{'error':'AI 暂未配置，暂时无法回复。你的想法已留在本机。'})
        day=datetime.fromtimestamp(now,ZONE).date().isoformat()
        with lock:
            count,until=review_rates.get(key,(0,now+60))
            if until<=now:count,until=0,now+60
            review_rates[key]=(count+1,until)
        if count>=4:return self.reply(429,{'error':'点评提交较快，请一分钟后再试。'})
        if not review_slots.acquire(blocking=False):return self.reply(429,{'error':'点评正在排队，请稍后重试。'})
        reserved=False
        try:
            with connect() as db:
                db.execute('BEGIN IMMEDIATE')
                db.execute('DELETE FROM review_usage WHERE day<?',(day,))
                if db.execute('SELECT COUNT(*) FROM review_usage WHERE day=? AND client=?',(day,key)).fetchone()[0]>=32 or db.execute('SELECT COUNT(*) FROM review_usage WHERE day=?',(day,)).fetchone()[0]>=300:
                    return self.reply(429,{'error':'今日模型点评额度已用完。可以先保存思路、对照提示，明天继续。'})
                try:db.execute('INSERT INTO review_usage VALUES(?,?,?,?)',(request_id,day,key,q))
                except sqlite3.IntegrityError:return self.reply(409,{'error':'这次请求已经提交，请等待结果或重新发起点评。'})
                reserved=True
            if chat:
                reply=reviewer.chat(question,messages,assess=True) if assess else reviewer.chat(question,messages)
                result=reply if isinstance(reply,dict) else {'reply':reply,'emotion':'neutral'}
                if tracking:
                    message_id=str(uuid.uuid4())
                    last=data['messages'][-1]
                    save_conversation({**tracking,'q':q,'variant':data.get('variant','base'),'optionOrder':data.get('optionOrder',[0,1]),'messages':[{'id':message_id,'role':'assistant','content':result['reply'],'position':last.get('position',len(data['messages'])-1)+1,'correct':result.get('correct')}]},time.time(),source='model')
                    result={**result,'messageId':message_id}
                return self.reply(200,result)
            feedback=reviewer.review(question,answer.strip())
            return self.reply(200,{'feedback':feedback,'modelLabel':os.environ.get('MUSICCLASS_AI_LABEL','音乐教练')})
        except reviewer.ReviewUnavailable as error:
            reviewer.record_failure(error,request_id,q,'assessment' if assess else 'chat' if chat else 'review')
            if reserved:
                with connect() as db:db.execute('DELETE FROM review_usage WHERE id=?',(request_id,))
            return self.reply(502,{'error':error.public_message,'errorCode':error.kind})
        except sqlite3.Error:return self.reply(503,{'error':'点评服务暂时繁忙，请稍后重试。'})
        finally:review_slots.release()
    def do_GET(self):
        parsed=urlparse(self.path)
        path=parsed.path
        if path==BASE+'/api/health':
            try:
                with connect() as db:db.execute('SELECT 1 FROM events LIMIT 1')
            except sqlite3.Error:return self.reply(503,{'ok':False})
            return self.reply(200,{'ok':True})
        if path in (BASE+'/api/learners',BASE+'/api/learner',BASE+'/api/question'):
            if not self.authorized():return self.reply(401,{'error':'authentication required'})
            try:
                params=parse_qs(parsed.query);period=params.get('days',['7'])[0];days='all' if period=='all' else int(period);page=int(params.get('page',['0'])[0])
                if days not in (7,30,90,'all') or not 0<=page<=100000:raise ValueError()
                if path.endswith('/learners'):result=learning_report(days,page,params.get('search',[''])[0],sort=params.get('sort',[None])[0],direction=params.get('direction',[None])[0])
                elif path.endswith('/question'):result=question_detail(int(params.get('id',['-1'])[0]),days)
                else:
                    journey_page=int(params.get('journeyPage',['0'])[0])
                    if not 0<=journey_page<=100000:raise ValueError()
                    result=learner_detail(params.get('id',[''])[0],days,page,journey_page=journey_page)
                return self.reply(200,result)
            except ValueError:return self.reply(400,{'error':'invalid query'})
            except sqlite3.Error:return self.reply(503,{'error':'storage unavailable'})
        if path==BASE+'/api/summary':
            if not self.authorized():return self.reply(401,{'error':'authentication required'})
            try:
                days=int(parse_qs(parsed.query).get('days',['7'])[0])
                if days not in (7,30,90):raise ValueError()
                return self.reply(200,summary(days))
            except ValueError:return self.reply(400,{'error':'invalid period'})
            except sqlite3.Error:return self.reply(503,{'error':'storage unavailable'})
        if path=='/':
            self.send_response(308);self.send_header('Location',BASE+'/');self.end_headers();return
        if path==BASE or path==BASE+'/data':
            self.send_response(308);self.send_header('Location',path+'/');self.end_headers();return
        files={BASE+'/':'index.html',BASE+'/data/':'data/index.html',BASE+'/style.css':'style.css',BASE+'/app.js':'app.js',BASE+'/analytics.js':'analytics.js',BASE+'/data/admin.js':'data/admin.js',BASE+'/data/admin.css':'data/admin.css'}
        files[BASE+'/icons.svg']='icons.svg'
        for name in ('music.js','music.css'):
            files[BASE+'/'+name]=name
        for asset in ('character-studies.js','character-studies.css','privacy-modal.js','privacy-id.js','feedback.js','privacy.html','privacy.css','hero-carousel.js','hero-carousel.css','theme.js','theme.css','motion.js','coach-guide.js','conversation-sequence.js','chat-format.js','question-run.js','sonner.css','sonner.LICENSE.txt','viewport.js','site-icon.js','chapter-score.js','chapter-practice.js','chapter-particles.js','text-motion.js','text-motion.LICENSE.txt','motion.css','course.json','course.css'):
            files[BASE+'/'+asset]=asset
        for asset in ('teacher-emotions.webp','teacher-positive-emotions.webp','teacher-cool-expressions.webp','teacher-gaze.webp','teacher-friendly-96.webp','teacher-friendly-192.webp','favicon-teacher.ico','favicon-teacher-32.png','apple-touch-teacher.png','teacher-positive-emotions.png','teacher-emotions.png','chick-eyes-original.png','chick-eyes-128.webp','chick-eyes-512.webp','apple-touch-icon.png','favicon-32.png','favicon.ico'):
            files[BASE+'/assets/'+asset]='assets/'+asset
        for question in QUESTIONS:
            for visual in question.get('visuals',[]):
                asset=visual.get('image','')
                if re.fullmatch(r'assets/picturebook/[a-z]+-[ab]\.webp',asset):files[BASE+'/'+asset]=asset
                for frame in visual.get('frames',[]):
                    image=frame.get('image','')
                    if re.fullmatch(r'assets/storyboard/[a-z-]+\.webp',image):files[BASE+'/'+image]=image
        for mood in ('neutral','happy','thinking','curious','surprised','encouraging','empathetic','confused','playful','delighted','approving','inspired','relieved','grateful','amused','cool','confident','mischievous'):
            for suffix in ('96.webp','32.png','180.png'):
                asset='assets/icons/'+mood+'-'+suffix;files[BASE+'/'+asset]=asset
        for asset in ('manrope-counter-700.ttf','Manrope-OFL.txt'):
            files[BASE+'/assets/fonts/'+asset]='assets/fonts/'+asset
        if path not in files:return self.reply(404,{'error':'not found'})
        file=ROOT/'web'/files[path]
        try:raw=file.read_bytes()
        except OSError:return self.reply(404,{'error':'not found'})
        self.send_response(200)
        mime=mimetypes.guess_type(file)[0] or 'application/octet-stream'
        self.send_header('Content-Type',mime+('; charset=utf-8' if mime.startswith('text/') or mime in ('application/javascript','image/svg+xml') else ''))
        self.send_header('Content-Length',str(len(raw)))
        self.send_header('Cache-Control','no-cache')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'")
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','same-origin')
        self.end_headers();self.wfile.write(raw)

if __name__=='__main__':
    if len(SECRET)<32 or not re.fullmatch('[a-f0-9]{64}',PIN_HASH):
        raise SystemExit('MUSICCLASS_SECRET and MUSICCLASS_PIN_SHA256 must be configured')
    init_db()
    ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('PORT','8798'))),Handler).serve_forever()
