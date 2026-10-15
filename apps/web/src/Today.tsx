import { useEffect, useRef, useState } from "react";
import ActionMenu from "./ActionMenu";
import { useWorkspaceSize } from "./WorkspaceChrome";
import { ArrowUpRight, CalendarDays, Check, ChevronDown, Plus } from "lucide-react";
import { Pressable } from "@veloradesk/ui";
import type { CalendarEvent, DatabaseDefinition, Page, PropertyDefinition, PropertyValue } from "@veloradesk/core/model";
import { store } from "@veloradesk/core/store";
import { projectPreset, projectType, taskDone, taskDue, type ProjectTypes } from "@veloradesk/core/projects";
import "./today.css";

const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const title = (page: Page) => page.properties.__locked ? "Locked entry" : page.title || "Untitled";
const time = (value: string | Date) => new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export function statusClass(value: string) {
  return /^(done|shipped|completed?)$/i.test(value) ? "done" : /^(in progress|doing|building|testing|redo|review)$/i.test(value) ? "active" : /^(blocked|stuck|overdue)$/i.test(value) ? "blocked" : "neutral";
}
export function OptionPill({ property, value, onChange }: { property: PropertyDefinition; value: PropertyValue; onChange: (value: PropertyValue) => void }) {
  const label = String(value || "Not started");
  return <ActionMenu label={property.name} className={`ws-status-pill ${statusClass(label)}`} items={["", ...property.options ?? []].map(option => ({label:option || "Clear",onSelect:()=>onChange(option || null)}))}><span className="ws-pill-dot" />{label}<ChevronDown size={14} /></ActionMenu>;
}
export function ProjectCard({ project, pages, definition, types = {}, onOpen }: { project: Page; pages: Page[]; definition?: DatabaseDefinition; types?: ProjectTypes; onOpen: (id: string) => void }) {
  const tasks = pages.filter(page => page.databaseId === project.id && page.type === "row");
  const done = tasks.filter(task => taskDone(task, definition)).length;
  const next = tasks.filter(task => !taskDone(task, definition)).map(task => taskDue(task, definition)).filter((due): due is string => !!due).sort()[0];
  return <Pressable className="ws-project-card" onClick={() => onOpen(project.id)}><span className="ws-project-symbol" aria-hidden="true">{project.icon || "✓"}</span><strong>{title(project)}</strong><small>{projectPreset(projectType(project, types))?.label ?? "Project"}</small><span className="ws-progress" role="progressbar" aria-label={`${title(project)} progress`} aria-valuenow={done} aria-valuemax={tasks.length || 1} aria-valuemin={0}><i style={{ width: `${tasks.length ? done/tasks.length*100 : 0}%` }} /></span><small>{done} of {tasks.length} done{next ? ` · Due ${next}` : ""}</small></Pressable>;
}
export function TaskCard({ task, project, definition, next, onOpen, onComplete }: { task: Page; project?: Page; definition?: DatabaseDefinition; next?: boolean; onOpen: (id: string) => void; onComplete: (page: Page) => void }) {
  const [completing, setCompleting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const due = taskDue(task, definition), done = taskDone(task, definition);
  const status = definition?.properties.find(property => property.type === "status");
  return <article className={`ws-task-card${next ? " next" : ""}${done ? " done" : ""}${completing ? " completing" : ""}`}>
    <div className="ws-task-card-meta"><span>{project ? title(project) : "Task"}</span>{due && <time dateTime={due} className={due < dateKey() && !done ? "ws-danger" : ""}>{due}</time>}</div>
    <Pressable className="ws-task-title" onClick={() => onOpen(task.id)}><strong>{title(task)}</strong></Pressable>
    <footer>{status ? <OptionPill property={status} value={task.properties[status.id] ?? null} onChange={value => void store.patchPage(task.id, { properties: { ...task.properties, [status.id]: value } }).catch(cause => window.dispatchEvent(new CustomEvent("velora-appearance-error", { detail: String(cause) })))} /> : <span>{done ? "Done" : "Not started"}</span>}
      <Pressable className="ws-task-check" role="checkbox" aria-checked={done || completing} aria-label={`${done ? "Reopen" : "Complete"} ${title(task)}`} disabled={completing} onClick={() => { setCompleting(true); timer.current = setTimeout(() => { onComplete(task); setCompleting(false); }, 200); }}><span>{(done || completing) && <Check size={16} />}</span></Pressable>
      <Pressable className="ws-icon" aria-label={`Open ${title(task)}`} onClick={() => onOpen(task.id)}><ArrowUpRight size={18} /></Pressable></footer>
  </article>;
}
function Schedule({ events, now, onOpen, onCalendar }: { events: CalendarEvent[]; now: Date; onOpen: (id: string) => void; onCalendar: () => void }) {
  const { tablet } = useWorkspaceSize();
  const hours = tablet ? 6 : 8, start = new Date(now); start.setMinutes(0,0,0); start.setHours(start.getHours()-1);
  const running = events.find(event => !event.allDay && new Date(event.start) <= now && new Date(event.end) > now);
  const upcoming = running ?? events.find(event => event.allDay || new Date(event.start) > now);
  return <section className="ws-schedule" aria-label="Today’s schedule"><span className="ws-schedule-label"><CalendarDays size={20} /><span>Your schedule<small>{now.toLocaleDateString(undefined,{ month:"short",day:"numeric" })}</small></span></span>
    <div className="ws-schedule-track"><div className="ws-schedule-ticks" aria-hidden="true">{Array.from({ length: hours },(_,i) => <span key={i}>{time(new Date(start.getTime()+i*3600000))}</span>)}</div>
      {events.filter(event => !event.allDay && new Date(event.end) > start && new Date(event.start).getTime() < start.getTime()+hours*3600000).map(event => {
        const left = Math.max(0,(new Date(event.start).getTime()-start.getTime())/(hours*3600000)*100);
        const right = Math.min(100,(new Date(event.end).getTime()-start.getTime())/(hours*3600000)*100);
        return <Pressable key={event.id} className={`ws-schedule-segment${event.id === running?.id ? " now" : ""}`} style={{ left:`${left}%`, width:`${Math.max(1,right-left)}%` }} aria-label={`${event.title}, ${time(event.start)} to ${time(event.end)}`} onClick={() => event.pageId ? onOpen(event.pageId) : onCalendar()}><span>{time(event.start)} · {event.title}</span></Pressable>;
      })}
      <span className="ws-now-marker" style={{ left:`${(now.getTime()-start.getTime())/(hours*3600000)*100}%` }} aria-hidden="true"><small>{time(now)}</small></span>{!events.length && <span className="ws-no-events">No events today</span>}
    </div><span className="ws-schedule-phone">{upcoming ? <>{running ? "Now" : "Next"} · {upcoming.allDay ? "All day" : time(upcoming.start)} {upcoming.title}{!running && !upcoming.allDay ? ` · in ${Math.ceil((new Date(upcoming.start).getTime()-now.getTime())/60000)} min` : ""}</> : "No events today"}</span>
    <Pressable className="ws-icon" aria-label="Open today’s schedule" onClick={onCalendar}><ArrowUpRight size={20} /></Pressable></section>;
}
export default function Today({ pages, events, databases, types = {}, onOpen, onCapture, onCalendar, onComplete }: { pages: Page[]; events: CalendarEvent[]; databases: DatabaseDefinition[]; types?: ProjectTypes; onOpen:(id:string)=>void; onCapture:()=>void; onCalendar:()=>void; onComplete:(page:Page)=>void }) {
  const [now,setNow] = useState(() => new Date()), [filter,setFilter] = useState("All"), [projectFilter,setProjectFilter] = useState("All");
  useEffect(() => { const timer = setInterval(() => setNow(new Date()),60000); return () => clearInterval(timer); },[]);
  const today = dateKey(now), definitions = new Map(databases.map(definition => [definition.id,definition]));
  const [expanded, setExpanded] = useState<CalendarEvent[] | null>(null);
  useEffect(() => {
    let active = true;
    setExpanded(null);
    if (events.some(event => event.recurrence)) {
      const start = new Date(`${today}T00:00:00`), end = new Date(start); end.setDate(end.getDate()+1);
      void import("@veloradesk/integrations").then(({expandEvents}) => {
        const entries = expandEvents(events.filter(event => !event.deletedAt),start.toISOString(),end.toISOString());
        if (active) setExpanded(entries.map(occurrence => ({...occurrence.event,id:occurrence.key,start:occurrence.start,end:occurrence.end})));
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [events,today]);
  const tasks = pages.filter(page => page.type === "row"), projects = pages.filter(page => page.type === "database");
  const done = tasks.filter(task => taskDone(task,definitions.get(task.databaseId ?? ""))), open = tasks.filter(task => !done.includes(task));
  const due = (task:Page) => taskDue(task,definitions.get(task.databaseId ?? ""));
  const groups: Record<string,Page[]> = { All:open, Today:open.filter(task => due(task) === today), Overdue:open.filter(task => !!due(task) && due(task)! < today), Upcoming:open.filter(task => !!due(task) && due(task)! > today), Anytime:open.filter(task => !due(task)), Done:done };
  const next = groups.Today![0] ?? [...open].filter(task => due(task)).sort((a,b)=>due(a)!.localeCompare(due(b)!))[0];
  const start = new Date(now); start.setHours(0,0,0,0); const end = new Date(start); end.setDate(end.getDate()+1);
  const dailyEvents = (expanded ?? events.filter(event => !event.deletedAt && (event.allDay ? event.start.slice(0,10) <= today && event.end.slice(0,10) > today : new Date(event.start) < end && new Date(event.end) > start))).sort((a,b) => a.start.localeCompare(b.start));
  const projectKinds = [...new Set(projects.map(project=>projectType(project,types)).filter(Boolean))];
  return <div className="ws-today ws-task-today"><Schedule events={dailyEvents} now={now} onOpen={onOpen} onCalendar={onCalendar} />
    <header className="ws-today-hero"><div><h1>Today</h1><p className="ws-eyebrow">{now.toLocaleDateString(undefined,{ weekday:"long",day:"numeric",month:"long" })}</p></div><Pressable className="ws-button ws-filled" onClick={onCapture}><Plus size={18} />New task</Pressable><div className="ws-today-stats" aria-label="Workspace overview"><span><strong>{open.length}</strong>Open</span><span><strong>{done.length}</strong>Done</span><span className={groups.Overdue!.length ? "overdue" : ""}><strong>{groups.Overdue!.length}</strong>Overdue</span></div></header>
    {!!projects.length && <section className="ws-project-section" aria-label="Projects"><div className="ws-section-title"><h2>Projects <span>{projects.length}</span></h2><div className="ws-filter-chips" aria-label="Project types">{["All",...projectKinds].map(kind=><Pressable key={kind} aria-pressed={projectFilter === kind} onClick={()=>setProjectFilter(kind!)}>{kind === "All" ? kind : projectPreset(kind)?.label}</Pressable>)}</div></div><div className="ws-project-strip" data-scroll-x tabIndex={0}>{projects.filter(project=>projectFilter === "All" || projectType(project,types) === projectFilter).map(project=><ProjectCard key={project.id} project={project} pages={pages} definition={definitions.get(project.id)} types={types} onOpen={onOpen} />)}</div></section>}
    <section aria-label="Tasks"><div className="ws-section-title"><h2>Today’s tasks <span>{tasks.length}</span></h2><div className="ws-filter-chips" aria-label="Task filters">{Object.entries(groups).map(([name,items])=><Pressable key={name} aria-pressed={filter === name} onClick={()=>setFilter(name)}>{name} <span>{items.length}</span></Pressable>)}</div></div><div className="ws-task-grid">{groups[filter]!.map(task=><TaskCard key={task.id} task={task} project={projects.find(project=>project.id === task.databaseId)} definition={definitions.get(task.databaseId ?? "")} next={next?.id === task.id} onOpen={onOpen} onComplete={onComplete} />)}</div>{!groups[filter]!.length && <div className="ws-quiet-empty"><Check size={28} /><Pressable className="ws-button ws-tinted" onClick={onCapture}>Add task</Pressable></div>}</section>
    {!!dailyEvents.length && <section className="ws-card ws-agenda-card" aria-label="Agenda"><h2>Agenda</h2>{dailyEvents.map(event=><div className="ws-agenda-row" key={event.id}><time>{event.allDay ? "All day" : time(event.start)}</time><span className="ws-event-dot" /><span><strong>{event.title || "Untitled"}</strong><small>{event.location}</small></span><Pressable className="ws-icon" aria-label={`Open ${event.title}`} onClick={()=>event.pageId ? onOpen(event.pageId) : onCalendar()}><ArrowUpRight size={18} /></Pressable></div>)}</section>}
  </div>;
}
