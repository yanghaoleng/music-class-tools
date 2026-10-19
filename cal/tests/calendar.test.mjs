import test from 'node:test';
import assert from 'node:assert/strict';
import {lessonEvent,movePayload,sortedLessons} from '../src/calendar-model.mjs';
const lesson={id:'a',date:'2026-12-31',time:'23:15',teacher:'t',student:'s',status:'scheduled',room:'A'};
const teachers=[{id:'t',name:'林老师',instrument:'钢琴',color:'sage'}],students=[{id:'s',name:'小禾'}];
test('one lesson always includes 60 minutes across year boundary in Beijing time',()=>{
 const e=lessonEvent(lesson,teachers,students,true);
 assert.equal(e.start,'2026-12-31T23:15:00.000+08:00');assert.equal(e.end,'2027-01-01T00:15:00.000+08:00');assert.equal(e.startEditable,true);assert.equal(e.durationEditable,false);
 assert.equal(lessonEvent({...lesson,status:'completed'},teachers,students,true).startEditable,false);
 assert.equal(lessonEvent(lesson,teachers,students,false).startEditable,false);
});
test('drag uses Beijing clock regardless of browser zone, and includes stale-write guard',()=>{
 const oldTZ=process.env.TZ;process.env.TZ='America/Los_Angeles';
 try{assert.deepEqual(movePayload({id:'a',start:new Date('2026-11-01T01:15:00Z')},{start:new Date('2026-10-31T08:00:00Z')}),{id:'a',date:'2026-11-01',time:'09:15',expected_date:'2026-10-31',expected_time:'16:00'})}finally{process.env.TZ=oldTZ}
});
test('all-list retains every date, sorts without mutating source and excludes cancellations',()=>{
 const input=[{...lesson,id:'later',date:'2027-01-01'},{...lesson,id:'cancel',status:'cancelled'},{...lesson,id:'old',date:'2025-01-01'}];
 assert.deepEqual(sortedLessons(input).map(l=>l.id),['old','later']);assert.equal(input[0].id,'later');
});
