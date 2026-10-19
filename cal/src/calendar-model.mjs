import {DateTime} from 'luxon';
export const CALENDAR_ZONE='Asia/Shanghai';
export const VIEW_NAMES={dayGridMonth:'月',timeGridWeek:'周 · 7 天',timeGridThreeDay:'3 天',list:'全部列表'};
export const COLOR_PALETTE={sage:{background:'#e2eee4',border:'#83ab8a',text:'#416c4a'},apricot:{background:'#f8eadb',border:'#d3a173',text:'#92633e'},lavender:{background:'#eee7f6',border:'#ac98c2',text:'#806695'}};
export function lessonEvent(lesson,teachers,students,editable){
 const teacher=teachers.find(p=>p.id===lesson.teacher),student=students.find(p=>p.id===lesson.student);
 const start=DateTime.fromISO(`${lesson.date}T${lesson.time}`,{zone:CALENDAR_ZONE});
 const color=COLOR_PALETTE[teacher?.color]||COLOR_PALETTE.sage;
 return {id:lesson.id,title:`${student?.name||'学员'} · ${teacher?.instrument||'音乐课'}`,start:start.toISO(),end:start.plus({minutes:60}).toISO(),allDay:false,startEditable:editable&&lesson.status==='scheduled',durationEditable:false,backgroundColor:color.background,borderColor:color.border,textColor:color.text,classNames:['music-calendar-event',lesson.status==='completed'?'is-completed':''],extendedProps:{lesson,teacher,student}};
}
export function movePayload(event,oldEvent){
 const start=DateTime.fromJSDate(event.start,{zone:CALENDAR_ZONE});
 const old=DateTime.fromJSDate(oldEvent.start,{zone:CALENDAR_ZONE});
 return {id:event.id,date:start.toISODate(),time:start.toFormat('HH:mm'),expected_date:old.toISODate(),expected_time:old.toFormat('HH:mm')};
}
export function sortedLessons(lessons){return [...lessons].filter(l=>l.status!=='cancelled').sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)||a.id.localeCompare(b.id))}
