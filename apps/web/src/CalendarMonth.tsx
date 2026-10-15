import { useEffect, useRef, useState } from "react";
import { Pressable } from "@veloradesk/ui";
import type { Calendar, CalendarEvent } from "@veloradesk/core/model";
import { addDays, dateInZone, type EventOccurrence } from "@veloradesk/integrations";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export default function CalendarMonth({ days, date, now, zone, occurrences, calendars, onSelect, onDay, onCreate, onOpen, onMonth }: { days:string[]; date:string; now:Date; zone:string; occurrences:EventOccurrence<CalendarEvent>[]; calendars:Calendar[]; onSelect:(day:string)=>void; onDay:(day:string)=>void; onCreate:(day:string)=>void; onOpen:(event:EventOccurrence<CalendarEvent>)=>void; onMonth:(direction:number)=>void }) {
  const grid = useRef<HTMLDivElement>(null);
  const [capacity,setCapacity] = useState(2), [overflow,setOverflow] = useState<string|null>(null);
  const start = (event:EventOccurrence<CalendarEvent>) => event.event.allDay ? event.start.slice(0,10) : dateInZone(new Date(event.start),zone);
  const end = (event:EventOccurrence<CalendarEvent>) => event.event.allDay ? addDays(event.end.slice(0,10),-1) : dateInZone(new Date(new Date(event.end).getTime()-1),zone);
  const entries = (day:string) => occurrences.filter(event=>start(event)<=day && end(event)>=day);
  useEffect(() => {
    const element = grid.current?.querySelector('.cal-week'); if (!element) return;
    const observer = new ResizeObserver(([entry]) => setCapacity(Math.max(1,Math.floor((entry!.contentRect.height-48)/44))));
    observer.observe(element); return () => observer.disconnect();
  },[days.length]);
  const label = (day:string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined,{ weekday:"long",month:"long",day:"numeric",year:"numeric" });
  const focusDay = (day:string) => {
    onSelect(day);
    requestAnimationFrame(()=>grid.current?.querySelector<HTMLElement>(`[data-day="${day}"]`)?.focus());
  };
  const chip = (event:EventOccurrence<CalendarEvent>, className="", style?:React.CSSProperties) => <Pressable key={event.key} className={`cal-month-event ${event.event.allDay ? "all-day" : "timed"} cal-color-${calendars.find(calendar=>calendar.id === event.event.calendarId)?.color ?? "lime"} ${className}`} style={style} aria-label={`${event.event.title}, ${event.event.allDay ? "All day" : new Date(event.start).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit",timeZone:zone})}`} onClick={()=>onOpen(event)}><span>{!event.event.allDay && <><i /> <time>{new Date(event.start).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit",timeZone:zone})}</time> </>}{event.event.title || "Untitled"}</span></Pressable>;
  return <><div className="cal-month" ref={grid}><div className="cal-month-head" aria-hidden="true">{days.slice(0,7).map(day=><span key={day}>{new Date(`${day}T12:00:00`).toLocaleDateString(undefined,{weekday:"short"})}</span>)}</div>
    <div className="cal-month-grid" role="grid" aria-label="Month calendar" style={{ '--weeks':days.length/7 } as React.CSSProperties}>
      {Array.from({length:days.length/7},(_,week)=>{
        const weekDays=days.slice(week*7,week*7+7), lanes:number[][]=[], spans:{ event:EventOccurrence<CalendarEvent>; first:number; last:number; lane:number }[]=[];
        for (const event of occurrences.filter(event=>event.event.allDay && start(event)<=weekDays[6]! && end(event)>=weekDays[0]!).sort((a,b)=>start(a).localeCompare(start(b)))) {
          const first=Math.max(0,weekDays.indexOf(start(event))), last=weekDays.includes(end(event)) ? weekDays.indexOf(end(event)) : 6;
          let lane=lanes.findIndex(used=>!used.some(column=>column>=first && column<=last));
          if (lane<0) { lane=lanes.length; lanes.push([]); }
          lanes[lane]!.push(...Array.from({length:last-first+1},(_,i)=>first+i)); spans.push({event,first,last,lane});
        }
        const shownLanes=Math.min(lanes.length,Math.max(0,capacity-1));
        return <div className="cal-week" role="row" key={weekDays[0]}>{weekDays.map(day=>{
          const all=entries(day), timed=all.filter(event=>!event.event.allDay), clipped=all.length>capacity;
          const visibleSpans=spans.filter(span=>span.lane<shownLanes && start(span.event)<=day && end(span.event)>=day).length;
          const limit=Math.max(0,capacity-shownLanes-(clipped ? 1 : 0));
          const hidden=Math.max(0,all.length-visibleSpans-Math.min(limit,timed.length));
          return <div key={day} role="gridcell" data-day={day} tabIndex={day===date ? 0:-1} aria-label={label(day)} aria-selected={day===date} className={`cal-day ${day.slice(0,7)!==date.slice(0,7) ? "outside":""} ${day===dateInZone(now,zone) ? "today":""} ${day===date ? "selected-day":""}`} onClick={event=>{ if (event.target === event.currentTarget) onCreate(day); }} onKeyDown={event=>{
            if (event.target !== event.currentTarget) return;
            const offset=event.key==="ArrowRight" ? 1:event.key==="ArrowLeft" ? -1:event.key==="ArrowDown" ? 7:event.key==="ArrowUp" ? -7:0;
            if (offset) { event.preventDefault(); focusDay(addDays(day,offset)); }
            else if (event.key==="PageUp" || event.key==="PageDown") { event.preventDefault(); onMonth(event.key==="PageUp" ? -1:1); requestAnimationFrame(()=>grid.current?.querySelector<HTMLElement>('[data-day][tabindex="0"]')?.focus()); }
            else if (event.key==="Enter") { event.preventDefault(); onCreate(day); }
          }}><div className="cal-day-header"><Pressable className="cal-day-number" tabIndex={-1} aria-label={`Open ${label(day)}`} onClick={()=>{ onSelect(day); if (innerWidth>=600) onDay(day); }}><span>{day.endsWith("-01") ? new Date(`${day}T12:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric"}) : Number(day.slice(-2))}</span></Pressable></div>
            <span className="cal-day-dots" aria-hidden="true">{all.slice(0,3).map(event=><i key={event.key} className={`cal-color-${calendars.find(calendar=>calendar.id === event.event.calendarId)?.color ?? "lime"}`} />)}</span>
            <div className="cal-day-events" style={{paddingTop:shownLanes*44}}>{timed.slice(0,limit).map(event=>chip(event))}{hidden>0 && <Pressable className="cal-more" aria-label={`${hidden} more events on ${label(day)}`} onClick={()=>setOverflow(day)}>+{hidden} more</Pressable>}</div>
          </div>;
        })}<div className="cal-week-spans" role="gridcell" aria-colspan={7} aria-label="All-day events">{spans.filter(span=>span.lane<shownLanes).map(({event,first,last,lane})=>chip(event,`${start(event)<weekDays[0]! ? "continues-before":""} ${end(event)>weekDays[6]! ? "continues-after":""}`,{left:`${first/7*100}%`,width:`${(last-first+1)/7*100}%`,top:lane*44}))}</div></div>;
      })}</div></div>
    <Dialog.Root open={!!overflow} onOpenChange={open=>{if (!open) setOverflow(null);}}><Dialog.Portal><Dialog.Overlay className="cal-overlay"/><Dialog.Content className="cal-dialog"><div className="cal-actions cal-dialog-head"><Dialog.Title>{overflow ? label(overflow):"Events"}</Dialog.Title><Dialog.Close asChild><Pressable className="icon-button" aria-label="Close events"><X size={20}/></Pressable></Dialog.Close></div><Dialog.Description className="ws-sr-only">All events for the selected day</Dialog.Description>{overflow && entries(overflow).map(event=>chip(event))}</Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}
