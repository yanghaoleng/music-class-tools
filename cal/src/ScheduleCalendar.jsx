import React,{useEffect,useMemo,useRef,useState} from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import zhCnLocale from '@fullcalendar/core/locales/zh-cn';
import {DateTime} from 'luxon';
import {CaretLeft,CaretRight,CalendarBlank,ArrowsOutCardinal,Clock} from '@phosphor-icons/react';
import {CALENDAR_ZONE,VIEW_NAMES,lessonEvent,movePayload,sortedLessons} from './calendar-model.mjs';
import './calendar.css';
const VIEWS={timeGridThreeDay:{type:'timeGrid',duration:{days:3},dateAlignment:'day'}};
function initialView(){try{const saved=localStorage.getItem('music-cal-view');if(saved in VIEW_NAMES)return saved}catch{}return window.matchMedia('(max-width:760px)').matches?'timeGridThreeDay':'timeGridWeek'}
function readableDate(date){return DateTime.fromISO(date,{zone:CALENDAR_ZONE}).toFormat('M月d日 ccc',{locale:'zh-cn'})}
export default function ScheduleCalendar({lessons,teachers,students,filter,onFilter,editable,busy,today,focusDate,onOpen,onCreate,onMove}){
 const calendar=useRef(null),[view,setView]=useState(initialView),[range,setRange]=useState(null),[query,setQuery]=useState('');
 const filtered=useMemo(()=>sortedLessons(lessons).filter(l=>!filter||l.teacher===filter),[lessons,filter]);
 const events=useMemo(()=>filtered.map(l=>lessonEvent(l,teachers,students,editable&&!busy)),[filtered,teachers,students,editable,busy]);
 const minMinutes=Math.min(9*60,...filtered.map(l=>Number(l.time.slice(0,2))*60));
 const maxMinutes=Math.max(21*60,...filtered.map(l=>Math.ceil((Number(l.time.slice(0,2))*60+Number(l.time.slice(3))+60)/60)*60));
 const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:00:00`;
 useEffect(()=>{calendar.current?.getApi().gotoDate(focusDate)},[focusDate]);
 function switchView(next){
  setView(next);try{localStorage.setItem('music-cal-view',next)}catch{}
  if(next!=='list'){
   const api=calendar.current?.getApi();if(!api)return;
   const focus=api.getDate();api.changeView(next,focus);
  }
 }
 const displayCount=range&&view!=='list'?filtered.filter(l=>l.date>=range.start&&l.date<range.end).length:filtered.length;
 const list=filtered.filter(l=>!query.trim()||[students.find(s=>s.id===l.student)?.name,teachers.find(t=>t.id===l.teacher)?.name,l.date,l.room].some(v=>v?.includes(query.trim())));
 const groups=Object.groupBy?Object.groupBy(list,l=>l.date):list.reduce((groups,l)=>{(groups[l.date]??=[]).push(l);return groups},{});
 useEffect(()=>{if(view!=='list'){const frame=requestAnimationFrame(()=>calendar.current?.getApi().updateSize());return()=>cancelAnimationFrame(frame)}},[view]);
 async function drop(info){const payload=movePayload(info.event,info.oldEvent);if(info.view.type==='dayGridMonth')payload.time=info.oldEvent.extendedProps.lesson.time;try{await onMove(payload)}catch{info.revert()}}
 return <section className={`schedule-calendar calendar-view-${view}`} aria-label="课程日历">
  <div className="schedule-toolbar">
   <div className="calendar-view-tabs" role="group" aria-label="切换课表视图">{Object.entries(VIEW_NAMES).map(([key,label])=><button key={key} type="button" disabled={busy} aria-pressed={view===key} onClick={()=>switchView(key)}>{label}</button>)}</div>
   <div className="schedule-filter"><span>{view==='list'?'全部':'当前'} {displayCount} 节</span><select aria-label="筛选老师" value={filter} onChange={e=>onFilter(e.target.value)}><option value="">全部老师</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
  </div>
  <div className="schedule-rangebar">
   {view==='list'?<><h2>全部课程</h2><input type="search" aria-label="搜索课程" value={query} placeholder="搜索学员、老师、日期或琴房" onChange={e=>setQuery(e.target.value)}/></>:<><div className="schedule-navigation"><button title="上一段日期" aria-label="上一段日期" disabled={busy} onClick={()=>calendar.current?.getApi().prev()}><CaretLeft size={17}/></button><button title="下一段日期" aria-label="下一段日期" disabled={busy} onClick={()=>calendar.current?.getApi().next()}><CaretRight size={17}/></button><button className="schedule-today" disabled={busy} onClick={()=>calendar.current?.getApi().gotoDate(today)}>今天</button></div><h2 aria-live="polite">{range?.title||'课程日历'}</h2></>}
  </div>
  <div className="calendar-view-legend">{teachers.filter(t=>!filter||t.id===filter).map(t=><span key={t.id}><i style={{background:events.find(e=>e.extendedProps.teacher?.id===t.id)?.borderColor||'#9db294'}}/>{t.name} · {t.instrument}</span>)}</div>
  <div className="schedule-grid-wrap" hidden={view==='list'}>
   <FullCalendar ref={calendar} plugins={[dayGridPlugin,timeGridPlugin,interactionPlugin,luxonPlugin]} locale={zhCnLocale} timeZone={CALENDAR_ZONE} initialDate={focusDate} initialView={view==='list'?'timeGridWeek':view} views={VIEWS}
    headerToolbar={false} firstDay={1} weekends={true} hiddenDays={[]} allDaySlot={false} nowIndicator={true} now={`${today}T${DateTime.now().setZone(CALENDAR_ZONE).toFormat('HH:mm:ss')}+08:00`}
    events={events} editable={editable&&!busy} eventDurationEditable={false} eventResizableFromStart={false} eventStartEditable={editable&&!busy}
    eventLongPressDelay={400} selectLongPressDelay={400} eventDragMinDistance={6} dragScroll={true} snapDuration="00:15:00" slotDuration="00:30:00" slotLabelInterval="01:00:00" slotLabelFormat={{hour:'2-digit',minute:'2-digit',hour12:false}} eventTimeFormat={{hour:'2-digit',minute:'2-digit',hour12:false}}
    slotMinTime={clock(minMinutes)} slotMaxTime={clock(maxMinutes)} scrollTime="09:00:00" height="auto" expandRows={true} fixedWeekCount={false} dayMaxEvents={3} moreLinkText={n=>`还有 ${n} 节`} displayEventEnd={true} eventDisplay="block"
    datesSet={info=>{setRange({start:DateTime.fromJSDate(info.view.currentStart,{zone:CALENDAR_ZONE}).toISODate(),end:DateTime.fromJSDate(info.view.currentEnd,{zone:CALENDAR_ZONE}).toISODate(),title:info.view.title})}}
    dayHeaderFormat={view==='dayGridMonth'?{weekday:'short'}:{weekday:'short',month:'numeric',day:'numeric'}}
    eventClick={info=>{if(!busy)onOpen(info.event.extendedProps.lesson)}}
    dateClick={info=>{if(!editable||busy)return;const date=DateTime.fromJSDate(info.date,{zone:CALENDAR_ZONE});onCreate(date.toISODate(),info.allDay?'16:00':date.toFormat('HH:mm'))}}
    eventDrop={drop} eventAllow={(info,event)=>!busy&&editable&&event.extendedProps.lesson.status==='scheduled'}
    eventContent={info=><div className="music-event-content" title={`${info.event.title} · ${info.timeText} · ${info.event.extendedProps.teacher?.name}${info.event.extendedProps.lesson.room?' · '+info.event.extendedProps.lesson.room:''}`}><span className="music-event-time">{info.timeText}</span><b>{info.event.title}</b><span className="music-event-teacher">{info.event.extendedProps.teacher?.name}{info.event.extendedProps.lesson.room?' · '+info.event.extendedProps.lesson.room:''}{info.event.extendedProps.lesson.status==='completed'?' · 已完成':''}</span></div>}
   />
  </div>
  {view==='list'&&<div className="all-lessons-list">{Object.entries(groups).map(([date,items])=><section className="lesson-date-group" key={date}><h3>{readableDate(date)}<span>{date===today?'今天':date<today?'已过去':''}</span><small>{items.length} 节</small></h3>{items.map(l=>{const teacher=teachers.find(t=>t.id===l.teacher),student=students.find(s=>s.id===l.student);return <button className="all-lesson-row" key={l.id} disabled={busy} onClick={()=>onOpen(l)}><span className={'dot '+(teacher?.color||'sage')}/><time>{l.time}<small>60 分钟</small></time><span className="all-lesson-person"><b>{student?.name} · {teacher?.instrument}</b><small>{teacher?.name}{l.room?' · '+l.room:''}</small></span><span className={'status '+l.status}>{l.status==='completed'?'已完成':'已预约'}</span></button>})}</section>)}{!list.length&&<div className="empty"><CalendarBlank size={32}/><h3>{query?'没有匹配的课程':'还没有课程'}</h3><p>{query?'试试其他学员姓名、老师或日期。':'已安排的课程会显示在这里。'}</p></div>}</div>}
  <footer className="schedule-help"><span><Clock size={15}/>每节 60 分钟，含课内休息 10 分钟 · 北京时间</span>{view!=='list'&&editable&&<span><ArrowsOutCardinal size={15}/>{busy?'正在保存…':'拖动课程调整安排；手机长按后拖动'}{view==='dayGridMonth'?'，月历保留原上课时间。':'，时间按 15 分钟对齐。'}</span>}{view==='list'&&<span>显示全部日期，点击课程可查看{editable?'或修改':''}。</span>}</footer>
 </section>
}
