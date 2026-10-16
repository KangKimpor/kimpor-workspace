import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import CalendarMonth from "./CalendarMonth";
import ActionMenu from "./ActionMenu";
import { useWorkspaceSize } from "./WorkspaceChrome";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarDays, ChevronDown, Menu, Search, ChevronLeft, ChevronRight, Download, Plus, Settings2, Upload, X } from "./Coolicons";

import { Pressable } from "@veloradesk/ui";
import { store } from "@veloradesk/core/store";
import { platform } from "@veloradesk/core/platform";
import type { CalendarEvent } from "@veloradesk/core/model";
import {
  addDays,
  dateInZone,
  expandEvents,
  exportIcs,
  importIcs,
  naturalLanguageEvent,
  snapMinutes,
  splitRecurrence,
  validateRecurrence,
  validTimeZone,
  wallTime,
  wallTimeToUtc,
  type CalendarAccount,
  type EventOccurrence,
} from "@veloradesk/integrations";
import {
  calendarTransport,
  disconnectCalendarAccount,
  eventFields,
  flushCalendarChanges,
  pendingCalendarChanges,
  providerEvent,
  queueCalendarChange,
  syncCalendarAccounts,
} from "./calendar-sync";
import "./calendar.css";

type View = "day" | "week" | "month" | "agenda";
type Scope = "this" | "following" | "all";
interface Preferences {
  firstDay: number;
  hour12: boolean;
  zone: string;
  defaultCalendar: string;
}
interface Draft {
  fields: Partial<CalendarEvent>;
  startInput: string;
  endInput: string;
  occurrence?: EventOccurrence<CalendarEvent>;
  scope: Scope;
}
interface UndoAction {
  message: string;
  undo: () => Promise<void>;
}
const DAY = 86_400_000;
const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const colors = ["blue", "green", "purple", "orange", "red"];
function weekday(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}
function dayLabel(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
function inputTime(value: string, zone: string, allDay: boolean) {
  return allDay ? value.slice(0, 10) : wallTime(value, zone).slice(0, 16);
}
function occurrenceDate(
  occurrence: EventOccurrence<CalendarEvent>,
  zone: string,
) {
  return occurrence.event.allDay
    ? occurrence.start
    : dateInZone(occurrence.start, zone);
}
function safeOccurrenceEvents(
  events: CalendarEvent[],
  from: string,
  to: string,
) {
  return events.flatMap((event) => {
    try {
      return expandEvents([event], from, to);
    } catch {
      return [];
    }
  });
}

export default function CalendarModule({
  onOpenPage,
  initialDay,
}: {
  onOpenPage?: (id: string) => void;
  initialDay?: string;
}) {
  const layout = useWorkspaceSize();
  const revision = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
  );
  const [view, setView] = useState<View>(initialDay ? "day" : "month");
  const [sidebar, setSidebar] = useState(false);
  const monthLayout = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [date, setDate] = useState(() => initialDay ?? dateInZone(new Date(), localZone));
  const [preferences, setPreferences] = useState<Preferences>({
    firstDay: 0,
    hour12: false,
    zone: localZone,
    defaultCalendar: "",
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [settings, setSettings] = useState(false);
  const [quick, setQuick] = useState("");
  const [error, setError] = useState("");
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const upload = useRef<HTMLInputElement>(null);
  const changedAccount = useRef("");
  const calendars = store.listCalendars();
  const events = store.listEvents();
  const monthStart = `${date.slice(0, 7)}-01`;
  const monthGridStart = addDays(
    monthStart,
    -((weekday(monthStart) - preferences.firstDay + 7) % 7),
  );
  const weekStart = addDays(
    date,
    -((weekday(date) - preferences.firstDay + 7) % 7),
  );
  const monthOffset = (weekday(monthStart) - preferences.firstDay + 7) % 7;
  const monthDays = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();
  const days =
    view === "month"
      ? Array.from({ length: Math.ceil((monthOffset + monthDays) / 7) * 7 }, (_, index) => addDays(monthGridStart, index))
      : view === "week"
        ? Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
        : view === "agenda"
          ? Array.from({ length: 31 }, (_, index) => addDays(date, index))
          : [date];
  const occurrences = useMemo(
    () =>
      safeOccurrenceEvents(
        events.filter((event) =>
          (event.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()) || event.location.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && calendars.some(
            (calendar) => calendar.id === event.calendarId && calendar.visible,
          ),
        ),
        wallTimeToUtc(`${days[0]}T00:00`, preferences.zone),
        wallTimeToUtc(`${addDays(days.at(-1)!, 1)}T00:00`, preferences.zone),
      ),
    [revision, date, view, preferences.firstDay, preferences.zone, search],
  );
  const time = (instant: string) =>
    new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: preferences.hour12,
      timeZone: preferences.zone,
    }).format(new Date(instant));
  const notify = (message: string) => setError(message);
  useEffect(() => {
    const personal = store.listCalendars().filter(calendar => calendar.source === "local" && !calendar.remoteId && calendar.title.trim() === "Personal");
    if (personal.length > 1) void store.ensurePersonalCalendar().catch(cause => setError(String(cause)));
  }, [revision]);
  async function syncAccounts() {
    if (syncing) return;
    setSyncing(true);
    try {
      setAccounts(await syncCalendarAccounts(notify));
      setPending(await pendingCalendarChanges());
    } catch (cause) {
      notify(
        cause instanceof Error
          ? cause.message
          : "Calendar sync needs attention.",
      );
    } finally {
      setSyncing(false);
    }
  }
  useEffect(() => {
    let active = true;
    void store
      .ready()
      .then(async () => {
        const owner = store.accountId;
        await store.ensurePersonalCalendar();
        if (active) {
          const saved = await store.getSetting<Preferences>(
            "calendar:preferences",
            {
              firstDay: 0,
              hour12: false,
              zone: localZone,
              defaultCalendar: "",
            },
          );
          if (active && owner === store.accountId)
            setPreferences({
              ...saved,
              zone: validTimeZone(saved.zone) ? saved.zone : localZone,
            });
        }
      })
      .catch((cause) =>
        notify(
          cause instanceof Error
            ? cause.message
            : "Calendar storage is unavailable.",
        ),
      );
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (changedAccount.current === store.accountId) return;
    changedAccount.current = store.accountId;
    void syncAccounts();
  }, [revision]);
  useEffect(() => {
    const poll = () => {
      if (!document.hidden) void syncAccounts();
    };
    const timer = setInterval(poll, 60_000);
    window.addEventListener("online", poll);
    window.addEventListener("focus", poll);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", poll);
      window.removeEventListener("focus", poll);
    };
  });
  async function savePreferences(value: Preferences) {
    setPreferences(value);
    await store.setSetting("calendar:preferences", value);
  }
  function newDraft(
    startDate = date,
    startMinutes = 9 * 60,
    endMinutes = startMinutes + 60,
    allDay = false,
  ) {
    const local = (minutes: number) =>
      `${addDays(startDate, Math.floor(minutes / 1440))}T${String(Math.floor((minutes % 1440) / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const availableCalendars = store.listCalendars();
    const calendar =
      availableCalendars.find(
        (item) =>
          item.id === preferences.defaultCalendar && item.source !== "ics",
      ) ??
      availableCalendars.find((item) => item.source === "local") ??
      availableCalendars.find((item) => item.source !== "ics");
    setError("");
    setDraft({
      fields: {
        title: "",
        calendarId: calendar?.id,
        allDay,
        startZone: preferences.zone,
        endZone: preferences.zone,
        busy: true,
        reminderMinutes: 10,
        recurrence: "",
        location: "",
        notes: "",
        url: "",
      },
      startInput: allDay ? startDate : local(startMinutes),
      endInput: allDay ? addDays(startDate, 1) : local(endMinutes),
      scope: "this",
    });
  }
  function openOccurrence(occurrence: EventOccurrence<CalendarEvent>) {
    setError("");
    setDraft({
      fields: { ...occurrence.event },
      occurrence,
      startInput: inputTime(
        occurrence.start,
        occurrence.event.startZone,
        occurrence.event.allDay,
      ),
      endInput: inputTime(
        occurrence.end,
        occurrence.event.endZone,
        occurrence.event.allDay,
      ),
      scope: "this",
    });
  }
  async function savedEvent(
    fields: Partial<CalendarEvent>,
    previous?: CalendarEvent,
  ) {
    const saved = await store.saveEvent(fields);
    await queueCalendarChange(saved, previous);
    void flushCalendarChanges(notify).then(async () =>
      setPending(await pendingCalendarChanges()),
    );
    return saved;
  }
  async function removeEvent(event: CalendarEvent) {
    await store.deleteEvent(event.id);
    await queueCalendarChange(event, event, true);
    void flushCalendarChanges(notify);
  }
  async function applyChange(
    occurrence: EventOccurrence<CalendarEvent> | undefined,
    fields: Partial<CalendarEvent>,
    scope: Scope,
    deleting = false,
  ) {
    const original = occurrence?.event;
    const restore: CalendarEvent[] = original ? [{ ...original }] : [];
    const created: CalendarEvent[] = [];
    if (!original || !original.recurrence || scope === "all") {
      if (deleting && original) await removeEvent(original);
      else {
        const startOffset =
          original && occurrence && fields.start
            ? Date.parse(fields.start) - Date.parse(occurrence.start)
            : 0;
        const seriesFields =
          original?.recurrence && occurrence
            ? {
                ...fields,
                start: original.allDay
                  ? addDays(original.start, startOffset / DAY)
                  : wallTimeToUtc(
                      new Date(
                        Date.parse(
                          wallTime(original.start, original.startZone) + "Z",
                        ) + startOffset,
                      )
                        .toISOString()
                        .slice(0, 19),
                      fields.startZone ?? original.startZone,
                    ),
                end:
                  fields.end && fields.start
                    ? new Date(
                        Date.parse(original.start) +
                          startOffset +
                          Date.parse(fields.end) -
                          Date.parse(fields.start),
                      ).toISOString()
                    : original.end,
              }
            : fields;
        if (original?.allDay && original.recurrence && seriesFields.end)
          seriesFields.end = seriesFields.end.slice(0, 10);
        const result = await savedEvent(
          { ...seriesFields, id: original?.id },
          original,
        );
        if (!original) created.push(result);
      }
    } else if (scope === "this") {
      await savedEvent(
        {
          id: original.id,
          exceptions: [
            ...new Set([...original.exceptions, occurrence!.recurrenceId]),
          ],
        },
        original,
      );
      if (!deleting)
        created.push(
          await savedEvent({
            ...fields,
            id: undefined,
            remoteId: undefined,
            etag: undefined,
            recurrence: "",
            exceptions: [],
          }),
        );
    } else {
      const split = splitRecurrence(original, occurrence!.recurrenceId);
      if (split.before)
        await savedEvent(
          { id: original.id, recurrence: split.before },
          original,
        );
      else await removeEvent(original);
      if (!deleting)
        created.push(
          await savedEvent({
            ...fields,
            id: undefined,
            remoteId: undefined,
            etag: undefined,
            recurrence:
              fields.recurrence === original.recurrence
                ? split.following
                : fields.recurrence,
            exceptions: original.exceptions.filter(
              (value) => value >= occurrence!.recurrenceId,
            ),
          }),
        );
    }
    setUndo({
      message: deleting
        ? "Event deleted"
        : original
          ? "Event updated"
          : "Event created",
      undo: async () => {
        for (const item of created) await removeEvent(item);
        for (const item of restore)
          await savedEvent(
            { ...item, deletedAt: null },
            store.listEvents().find((event) => event.id === item.id),
          );
        setUndo(null);
      },
    });
  }
  async function submitDraft(deleting = false) {
    if (!draft) return;
    try {
      const availableCalendars = store.listCalendars();
      // The first local calendar can finish loading after the draft opens.
      // An explicit selection still has to match; only an empty draft falls back.
      const calendar = draft.fields.calendarId
        ? availableCalendars.find((item) => item.id === draft.fields.calendarId)
        : (availableCalendars.find((item) => item.source === "local") ??
          availableCalendars.find((item) => item.source !== "ics"));
      if (!calendar || calendar.source === "ics")
        throw new Error("Choose an editable calendar.");
      const start = draft.fields.allDay
        ? draft.startInput
        : wallTimeToUtc(
            draft.startInput,
            draft.fields.startZone ?? preferences.zone,
          );
      const end = draft.fields.allDay
        ? draft.endInput
        : wallTimeToUtc(
            draft.endInput,
            draft.fields.endZone ?? preferences.zone,
          );
      if (Date.parse(end) <= Date.parse(start))
        throw new Error("The end must be after the start.");
      const recurrence = validateRecurrence(draft.fields.recurrence ?? "");
      if (draft.fields.url && !/^https?:\/\//i.test(draft.fields.url))
        throw new Error("Event links must use https:// or http://.");
      await applyChange(
        draft.occurrence,
        {
          ...draft.fields,
          title: draft.fields.title?.trim() || "Untitled event",
          start,
          end,
          recurrence,
          source: calendar.source,
          calendarId: calendar.id,
        },
        draft.scope,
        deleting,
      );
      setDraft(null);
      setError("");
    } catch (cause) {
      notify(
        cause instanceof Error
          ? cause.message
          : "The event could not be saved.",
      );
    }
  }
  function moveOccurrence(
    occurrence: EventOccurrence<CalendarEvent>,
    start: string,
    end: string,
  ) {
    if (occurrence.event.source === "ics") return;
    if (occurrence.event.recurrence) {
      openOccurrence(occurrence);
      setDraft({
        fields: { ...occurrence.event },
        occurrence,
        startInput: inputTime(
          start,
          occurrence.event.startZone,
          occurrence.event.allDay,
        ),
        endInput: inputTime(
          end,
          occurrence.event.endZone,
          occurrence.event.allDay,
        ),
        scope: "this",
      });
    } else
      void applyChange(
        occurrence,
        { ...occurrence.event, start, end },
        "all",
      ).catch((cause) =>
        notify(
          cause instanceof Error
            ? cause.message
            : "The event could not be moved.",
        ),
      );
  }
  function shiftDate(direction: number) {
    setDate(
      view === "month"
        ? (() => {
            const value = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
            value.setUTCMonth(value.getUTCMonth() + direction);
            const last = new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+1,0)).getUTCDate();
            value.setUTCDate(Math.min(Number(date.slice(-2)),last));
            return value.toISOString().slice(0, 10);
          })()
        : addDays(
            date,
            direction * (view === "week" ? 7 : view === "agenda" ? 31 : 1),
          ),
    );
  }
  const dayKeys = days.join(",");
  const entriesByDate = useMemo(() => {
    const keys = dayKeys.split(",");
    const result = new Map(keys.map(day => [day, [] as EventOccurrence<CalendarEvent>[]]));
    for (const occurrence of occurrences) {
      if (occurrence.event.allDay) {
        for (const day of keys) if (occurrence.start <= day && occurrence.end > day) result.get(day)?.push(occurrence);
      } else result.get(occurrenceDate(occurrence, preferences.zone))?.push(occurrence);
    }
    for (const entries of result.values()) entries.sort((a, b) => Number(b.event.allDay) - Number(a.event.allDay) || new Date(a.start).getTime() - new Date(b.start).getTime());
    return result;
  }, [dayKeys, occurrences, preferences.zone]);
  const entriesFor = (day: string) => entriesByDate.get(day) ?? [];
  async function importFile(file: File) {
    try {
      const imported = importIcs(await file.text(), preferences.zone);
      const calendar = await store.saveCalendar({
        title: file.name.replace(/\.ics$/i, "") || "Imported calendar",
        color: "purple",
      });
      const created: CalendarEvent[] = [];
      for (const event of imported)
        created.push(
          await store.saveEvent({
            ...eventFields(event),
            remoteId: undefined,
            etag: undefined,
            calendarId: calendar.id,
            source: "local",
          }),
        );
      setUndo({
        message: `${created.length} events imported`,
        undo: async () => {
          for (const event of created) await store.deleteEvent(event.id);
          await store.saveCalendar({
            id: calendar.id,
            deletedAt: new Date().toISOString(),
          });
          setUndo(null);
        },
      });
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Import failed.");
    }
  }
  function toggleAllDay(allDay: boolean) {
    if (!draft) return;
    const day = draft.startInput.slice(0, 10);
    setDraft({
      ...draft,
      fields: { ...draft.fields, allDay },
      startInput: allDay ? day : `${day}T09:00`,
      endInput: allDay ? addDays(day, 1) : `${day}T10:00`,
    });
  }
  const patchDraft = (patch: Partial<CalendarEvent>) =>
    setDraft((value) =>
      value ? { ...value, fields: { ...value.fields, ...patch } } : value,
    );
  useLayoutEffect(() => {
    const month=monthLayout.current,root=document.getElementById("root");
    if (!month || !root) return;
    const update=()=>{
      if (!month.isConnected) return;
      const main=month.closest('.ws-main')!,top=month.getBoundingClientRect().top+main.scrollTop;
      if(root.clientWidth<600){
        month.style.height="auto";
        const grid=month.querySelector<HTMLElement>('.cal-month')!;
        const budget=Math.max(72,Math.min(root.clientHeight*.44,main.getBoundingClientRect().bottom-top-8));
        const row=Math.max(44,Math.floor((budget-28)/(days.length/7)));
        const count=Math.max(1,Math.min(days.length/7,Math.floor((budget-28)/row)));
        grid.style.setProperty('--month-row-height',`${row}px`); grid.style.height=`${28+count*row}px`;
      }else{
        month.style.height=`${Math.max(96,root.getBoundingClientRect().bottom-top-24)}px`;
        month.querySelector<HTMLElement>('.cal-month')?.style.removeProperty('height');
      }
    };
    const observer=new ResizeObserver(update);observer.observe(root);
    const bar=month.closest('.ws-main')?.querySelector('.ws-topbar');if(bar)observer.observe(bar);
    if(month.previousElementSibling)observer.observe(month.previousElementSibling);
    update();void document.fonts.ready.then(update);
    return ()=>observer.disconnect();
  },[view,searchOpen,days.length]);
  useEffect(()=>{const open=()=>setSettings(true);window.addEventListener('kimpor-calendar-settings',open);return()=>window.removeEventListener('kimpor-calendar-settings',open);},[]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],[role="menu"]')) return;
      const target = ({ d:"day", w:"week", m:"month", a:"agenda" } as const)[event.key.toLowerCase() as "d"|"w"|"m"|"a"];
      if (target) { event.preventDefault(); setView(target); }
      if (event.key.toLowerCase() === "t") { event.preventDefault(); setDate(dateInZone(new Date(), preferences.zone)); }
    };
    window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut);
  }, [preferences.zone]);
  function sidebarContent() {
    return <><Pressable className="button cal-create" onClick={() => { newDraft(); setSidebar(false); }}><Plus size={18} />New event</Pressable>
      {["My calendars","Other calendars"].map(group=><section key={group}><h3>{group}</h3>{calendars.filter(calendar=>(calendar.source === "local") === (group === "My calendars")).map(calendar=><label className={`cal-source-row cal-color-${calendar.color}`} key={calendar.id}><input type="checkbox" checked={calendar.visible} onChange={() => void store.saveCalendar({...calendar,visible:!calendar.visible}).catch(cause=>notify(String(cause)))}/><span>{calendar.title}</span></label>)}</section>)}
      <Pressable className="button plain" onClick={() => { setSidebar(false); setSettings(true); }}>Add calendar</Pressable></>;
  }
  return (
    <section className="calendar-module" aria-label="Calendar">
      {layout.phone && <Pressable className="cal-quick-create" aria-label="New event" onClick={() => newDraft()}><Plus size={24}/></Pressable>}
      <Dialog.Root open={sidebar} onOpenChange={setSidebar}><Dialog.Portal><Dialog.Overlay className="cal-overlay"/><Dialog.Content className="cal-sidebar-drawer"><div className="cal-actions cal-dialog-head"><Dialog.Title>Calendars</Dialog.Title><Dialog.Close asChild><Pressable className="icon-button" aria-label="Close calendars"><X size={20}/></Pressable></Dialog.Close></div><Dialog.Description className="ws-sr-only">Choose a day or calendar</Dialog.Description>{sidebarContent()}</Dialog.Content></Dialog.Portal></Dialog.Root>
      <header className="cal-heading">
        <div>
          <div className="cal-title"><Pressable className="icon-button cal-sidebar-toggle" aria-label="Open calendars" onClick={() => setSidebar(true)}><Menu size={20} /></Pressable>{!layout.phone && <h1>Calendar</h1>}</div>
        </div>
        <div className="cal-actions">
          <Pressable
            className="icon-button"
            aria-label="Calendar settings and accounts"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={20} />
          </Pressable>
          {!layout.phone && <Pressable className="button filled" onClick={() => newDraft()}><Plus size={18} />New event</Pressable>}
        </div>
      </header>
      <div className="cal-layout">
        <div className="cal-main">
          <div className="cal-toolbar">
            <div className="cal-actions">
              <Pressable
                className="icon-button"
                aria-label="Previous period"
                onClick={() => shiftDate(-1)}
              >
                <ChevronLeft size={18} />
              </Pressable>
              <Pressable
                className="button outline"
                onClick={() => setDate(dateInZone(now, preferences.zone))}
              >
                Today
              </Pressable>
              <Pressable
                className="icon-button"
                aria-label="Next period"
                onClick={() => shiftDate(1)}
              >
                <ChevronRight size={18} />
              </Pressable>
            </div>
            <h2 className="cal-period-trigger"><span className="cal-period-long">{dayLabel(date, {
                month: "long",
                year: "numeric",
                ...(view === "day" ? { day: "numeric" } : {}),
              })}</span><span className="cal-period-short">{dayLabel(date, { month: "short", year: "numeric", ...(view === "day" ? { day: "numeric" } : {}) })}</span></h2>
            <div className="cal-toolbar-tools">
              {searchOpen && <input type="search" className="cal-search" aria-label="Search events" placeholder="Search events" value={search} onChange={event => setSearch(event.target.value)} autoFocus />}
              <Pressable className="icon-button" aria-label="Search calendar" onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearch(""); }}><Search size={18} /></Pressable>
              <ActionMenu label="Calendar view" className="button outline" items={(["day","week","month","agenda"] as const).map(option=>({label:option.charAt(0).toUpperCase()+option.slice(1),onSelect:()=>setView(option)}))}>{view.charAt(0).toUpperCase()+view.slice(1)} <ChevronDown size={16}/></ActionMenu>
            </div>
          </div>
          {view === "month" ? (
            <div className="cal-month-layout" ref={monthLayout}><aside className="cal-month-sidebar" aria-label="Calendar sidebar">
              {sidebarContent()}
            </aside><CalendarMonth days={days} date={date} now={now} zone={preferences.zone} occurrences={occurrences} calendars={calendars} onSelect={setDate} onDay={day => { setDate(day); setView("day"); }} onCreate={day => newDraft(day)} onOpen={openOccurrence} onMonth={shiftDate} />
            <section className="cal-selected-day" aria-label="Selected day events">
              <header><h2>{dayLabel(date, { month: "long", day: "numeric" })}</h2></header>
              {entriesFor(date).length ? entriesFor(date).map(occurrence => <EventChip key={occurrence.key} occurrence={occurrence}
                color={calendars.find(calendar => calendar.id === occurrence.event.calendarId)?.color ?? "blue"} time={time} onOpen={() => openOccurrence(occurrence)} />)
                : <div className="cal-day-empty"><CalendarDays size={28} /><Pressable className="button plain" onClick={() => newDraft(date)}>Add event</Pressable></div>}
            </section></div>
          ) : view === "agenda" ? (
            <div className="cal-agenda">
              {occurrences.length ? (
                days
                  .filter((day) => entriesFor(day).length)
                  .map((day) => (
                    <section key={day}>
                      <h3>
                        {dayLabel(day, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        })}
                      </h3>
                      {entriesFor(day).map((occurrence) => (
                        <EventChip
                          key={occurrence.key}
                          occurrence={occurrence}
                          color={
                            calendars.find(
                              (calendar) =>
                                calendar.id === occurrence.event.calendarId,
                            )?.color ?? "blue"
                          }
                          time={time}
                          onOpen={() => openOccurrence(occurrence)}
                        />
                      ))}
                    </section>
                  ))
              ) : (
                <div className="cal-empty">
                  <CalendarDays size={36} />
                  <Pressable
                    className="button tinted"
                    onClick={() => newDraft()}
                  >
                    New event
                  </Pressable>
                </div>
              )}
            </div>
          ) : (
            <TimeGrid
              days={layout.phone ? [date] : days}
              occurrences={occurrences}
              zone={preferences.zone}
              hour12={preferences.hour12}
              now={now}
              color={(id) =>
                calendars.find((calendar) => calendar.id === id)?.color ??
                "blue"
              }
              onOpen={openOccurrence}
              onCreate={newDraft}
              onMove={moveOccurrence}
            />
          )}
          <p className="cal-help caption muted">
            {preferences.zone} · {preferences.hour12 ? "12" : "24"}-hour clock
          </p>
        </div>
      </div>
      {error && (
        <div className="cal-notice" role="status">
          <span>{error}</span>
          <Pressable
            className="icon-button"
            aria-label="Dismiss calendar message"
            onClick={() => setError("")}
          >
            <X size={16} />
          </Pressable>
        </div>
      )}
      {undo && (
        <div className="cal-undo" role="status">
          <span>{undo.message}</span>
          <Pressable
            className="button plain"
            onClick={() => {
              void undo
                .undo()
                .catch((cause) =>
                  notify(
                    cause instanceof Error ? cause.message : "Undo failed.",
                  ),
                );
            }}
          >
            Undo
          </Pressable>
          <Pressable
            className="icon-button"
            aria-label="Dismiss undo"
            onClick={() => setUndo(null)}
          >
            <X size={16} />
          </Pressable>
        </div>
      )}
      <input
        hidden
        ref={upload}
        type="file"
        accept=".ics,text/calendar"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
          event.target.value = "";
        }}
      />
      <Dialog.Root
        open={!!draft}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
      >
        <Dialog.Portal container={document.getElementById("root")}>
          <Dialog.Overlay className="cal-overlay" />
          <Dialog.Content className="cal-dialog cal-event-dialog">
            <div className="cal-dialog-head">
              <Dialog.Title>
                {draft?.occurrence ? "Event details" : "New event"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <Pressable className="icon-button" aria-label="Close event">
                  <X size={20} />
                </Pressable>
              </Dialog.Close>
            </div>
            <Dialog.Description className={draft?.fields.source === "ics" ? "caption muted" : "sr-only"}>
              {draft?.fields.source === "ics"
                ? "Subscribed events are read-only."
                : "Event"}
            </Dialog.Description>
            {draft && (
              <form
                className="cal-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitDraft();
                }}
              >
                <label>
                  Title
                  <input
                    autoFocus
                    required
                    value={draft.fields.title ?? ""}
                    onChange={(event) =>
                      patchDraft({ title: event.target.value })
                    }
                  />
                </label>
                <label>
                  Calendar
                  <select
                    value={draft.fields.calendarId ?? ""}
                    disabled={draft.fields.source === "ics"}
                    onChange={(event) =>
                      patchDraft({ calendarId: event.target.value })
                    }
                  >
                    {calendars.map((calendar) => (
                      <option
                        key={calendar.id}
                        value={calendar.id}
                        disabled={calendar.source === "ics"}
                      >
                        {calendar.title}
                        {calendar.source === "ics" ? " (read-only)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="cal-checkbox">
                  <input
                    type="checkbox"
                    checked={!!draft.fields.allDay}
                    onChange={(event) => toggleAllDay(event.target.checked)}
                  />
                  All day
                </label>
                <div className="cal-form-pair">
                  <label>
                    Starts
                    <input
                      required
                      type={draft.fields.allDay ? "date" : "datetime-local"}
                      step={900}
                      value={draft.startInput}
                      onChange={(event) =>
                        setDraft({ ...draft, startInput: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Ends{draft.fields.allDay ? " (exclusive)" : ""}
                    <input
                      required
                      type={draft.fields.allDay ? "date" : "datetime-local"}
                      step={900}
                      value={draft.endInput}
                      onChange={(event) =>
                        setDraft({ ...draft, endInput: event.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Location
                  <input
                    value={draft.fields.location ?? ""}
                    onChange={(event) =>
                      patchDraft({ location: event.target.value })
                    }
                  />
                </label>
                <details className="cal-event-more" open={Boolean(draft.occurrence?.event.recurrence)}><summary>More details</summary>
                {!draft.fields.allDay && (
                  <div className="cal-form-pair">
                    <label>
                      Start time zone
                      <input
                        list="cal-zones"
                        value={draft.fields.startZone}
                        onChange={(event) =>
                          patchDraft({ startZone: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      End time zone
                      <input
                        list="cal-zones"
                        value={draft.fields.endZone}
                        onChange={(event) =>
                          patchDraft({ endZone: event.target.value })
                        }
                      />
                    </label>
                  </div>
                )}
                <label>
                  Notes
                  <textarea
                    rows={3}
                    value={draft.fields.notes ?? ""}
                    onChange={(event) =>
                      patchDraft({ notes: event.target.value })
                    }
                  />
                </label>
                <div className="cal-actions">
                  <Pressable
                    className="button tinted"
                    onClick={() => {
                      void (async () => {
                        let id = draft.fields.pageId;
                        if (id && !store.listPages().some(page => page.id === id)) { notify("This page is no longer available"); return; }
                        if (!id) {
                          const page = await store.createPage(
                            "page",
                            `${draft.fields.title || "Meeting"} notes`,
                          );
                          id = page.id;
                          patchDraft({ pageId: id });
                          if (draft.occurrence)
                            await savedEvent(
                              { id: draft.occurrence.event.id, pageId: id },
                              draft.occurrence.event,
                            );
                        }
                        onOpenPage?.(id);
                        setDraft(null);
                      })().catch((cause) =>
                        notify(
                          cause instanceof Error
                            ? cause.message
                            : "Could not open meeting notes.",
                        ),
                      );
                    }}
                  >
                    {draft.fields.pageId
                      ? "Open meeting notes"
                      : "Create meeting notes"}
                  </Pressable>
                </div>
                <label>
                  Event link
                  <input
                    type="url"
                    value={draft.fields.url ?? ""}
                    placeholder="https://"
                    onChange={(event) =>
                      patchDraft({ url: event.target.value })
                    }
                  />
                </label>
                <div className="cal-form-pair">
                  <label>
                    Reminder
                    <select
                      value={draft.fields.reminderMinutes ?? 0}
                      onChange={(event) =>
                        patchDraft({
                          reminderMinutes: Number(event.target.value),
                        })
                      }
                    >
                      {[0, 5, 10, 15, 30, 60, 1440].map((value) => (
                        <option key={value} value={value}>
                          {value === 0
                            ? "None"
                            : value < 60
                              ? `${value} minutes before`
                              : value === 1440
                                ? "1 day before"
                                : "1 hour before"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Availability
                    <select
                      value={draft.fields.busy === false ? "free" : "busy"}
                      onChange={(event) =>
                        patchDraft({ busy: event.target.value === "busy" })
                      }
                    >
                      <option value="busy">Busy</option>
                      <option value="free">Free</option>
                    </select>
                  </label>
                </div>
                <label>
                  Repeat
                  <select
                    value={
                      [
                        "",
                        "FREQ=DAILY",
                        "FREQ=WEEKLY",
                        "FREQ=MONTHLY",
                        "FREQ=YEARLY",
                      ].includes(draft.fields.recurrence ?? "")
                        ? (draft.fields.recurrence ?? "")
                        : "custom"
                    }
                    onChange={(event) => {
                      if (event.target.value !== "custom")
                        patchDraft({ recurrence: event.target.value });
                    }}
                  >
                    <option value="">Never</option>
                    <option value="FREQ=DAILY">Daily</option>
                    <option value="FREQ=WEEKLY">Weekly</option>
                    <option value="FREQ=MONTHLY">Monthly</option>
                    <option value="FREQ=YEARLY">Yearly</option>
                    <option value="custom">Custom RRULE</option>
                  </select>
                  <input
                    aria-label="Custom recurrence RRULE"
                    value={draft.fields.recurrence ?? ""}
                    placeholder="FREQ=WEEKLY;BYDAY=MO,WE;COUNT=12"
                    onChange={(event) =>
                      patchDraft({ recurrence: event.target.value })
                    }
                  />
                </label>
                {draft.occurrence?.event.recurrence && (
                  <label>
                    Apply changes to
                    <select
                      value={draft.scope}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          scope: event.target.value as Scope,
                        })
                      }
                    >
                      <option value="this">This event</option>
                      <option value="following">This and following</option>
                      <option value="all">All events</option>
                    </select>
                  </label>
                )}
                </details>
                {error && (
                  <p role="alert" className="cal-error">
                    {error}
                  </p>
                )}
                <div className="cal-actions between">
                  {draft.occurrence && draft.fields.source !== "ics" && (
                    <Pressable
                      className="button cal-destructive"
                      onClick={() => {
                        void submitDraft(true);
                      }}
                    >
                      Delete event
                    </Pressable>
                  )}
                  <Pressable
                    className="button filled"
                    type="submit"
                    disabled={draft.fields.source === "ics"}
                  >
                    Done
                  </Pressable>
                </div>
                <p className="caption muted">
                  Reminders run while the app is open. Closed-app reminders need
                  notification permission and a configured reminder service.
                </p>
              </form>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={settings} onOpenChange={setSettings}>
        <Dialog.Portal container={document.getElementById("root")}>
          <Dialog.Overlay className="cal-overlay" />
          <Dialog.Content className="cal-dialog">
            <div className="cal-dialog-head">
              <Dialog.Title>Calendars & accounts</Dialog.Title>
              <Dialog.Close asChild>
                <Pressable
                  className="icon-button"
                  aria-label="Close calendar settings"
                >
                  <X size={20} />
                </Pressable>
              </Dialog.Close>
            </div>
            <Dialog.Description className="caption muted">
              Choose how you see your time and which calendars belong here.
            </Dialog.Description>
            <div className="cal-form">          <div className="cal-sources">
            <h3>Shown calendars</h3>
            {pending > 0 && <p className="caption muted">{pending} {pending === 1 ? "change waiting" : "changes waiting"} to sync.</p>}
            {calendars.map((calendar) => (
              <div className="cal-source-row" key={calendar.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={calendar.visible}
                    onChange={(event) => {
                      void store.saveCalendar({
                        id: calendar.id,
                        visible: event.target.checked,
                      });
                    }}
                  />
                  <span
                    className={`cal-dot cal-color-${colors.includes(calendar.color) ? calendar.color : "blue"}`}
                  />
                  {calendar.title}
                </label>
                <span className="caption muted">
                  {calendar.source === "local"
                    ? "Calendar"
                    : calendar.source === "ics"
                      ? "Read-only"
                      : calendar.source}
                </span>
              </div>
            ))}
          </div>
              <details className="cal-quick-entry"><summary>Quick add</summary>      <form
        className="cal-quick"
        onSubmit={(event) => {
          event.preventDefault();
          const value = naturalLanguageEvent(quick, now, preferences.zone);
          if (!value) {
            setError("Try “lunch with Sam tomorrow 1pm”, or choose New event.");
            return;
          }
          const selected =
            calendars.find(
              (calendar) =>
                calendar.id === preferences.defaultCalendar &&
                calendar.source !== "ics",
            ) ?? calendars.find((calendar) => calendar.source === "local");
          setDraft({
            fields: {
              ...value,
              calendarId: selected?.id,
              startZone: preferences.zone,
              endZone: preferences.zone,
              recurrence: "",
              busy: true,
              reminderMinutes: 10,
            },
            startInput: inputTime(value.start, preferences.zone, value.allDay),
            endInput: inputTime(value.end, preferences.zone, value.allDay),
            scope: "this",
          });
          setQuick("");
          setSettings(false);
        }}
      >
        <input
          aria-label="Quick add event"
          value={quick}
          onChange={(event) => setQuick(event.target.value)}
          placeholder="Lunch with Sam tomorrow 1pm"
        />
        <Pressable
          className="button tinted"
          type="submit"
          disabled={!quick.trim()}
        >
          Add
        </Pressable>
      </form>
              </details>
              <label>
                Default calendar
                <select
                  value={
                    preferences.defaultCalendar ||
                    calendars.find((calendar) => calendar.source === "local")
                      ?.id ||
                    ""
                  }
                  onChange={(event) => {
                    void savePreferences({
                      ...preferences,
                      defaultCalendar: event.target.value,
                    });
                  }}
                >
                  {calendars
                    .filter((calendar) => calendar.source !== "ics")
                    .map((calendar) => (
                      <option key={calendar.id} value={calendar.id}>
                        {calendar.title}
                      </option>
                    ))}
                </select>
              </label>
              <div className="cal-form-pair">
                <label>
                  Week starts on
                  <select
                    value={preferences.firstDay}
                    onChange={(event) => {
                      void savePreferences({
                        ...preferences,
                        firstDay: Number(event.target.value),
                      });
                    }}
                  >
                    <option value={1}>Monday</option>
                    <option value={0}>Sunday</option>
                    <option value={6}>Saturday</option>
                  </select>
                </label>
                <label>
                  Clock
                  <select
                    value={preferences.hour12 ? "12" : "24"}
                    onChange={(event) => {
                      void savePreferences({
                        ...preferences,
                        hour12: event.target.value === "12",
                      });
                    }}
                  >
                    <option value="24">24-hour</option>
                    <option value="12">12-hour</option>
                  </select>
                </label>
              </div>
              <label>
                Display time zone
                <input
                  list="cal-zones"
                  value={preferences.zone}
                  onChange={(event) => {
                    if (validTimeZone(event.target.value))
                      void savePreferences({
                        ...preferences,
                        zone: event.target.value,
                      });
                  }}
                />
              </label>
              <datalist id="cal-zones">
                {[
                  localZone,
                  "UTC",
                  "America/New_York",
                  "America/Los_Angeles",
                  "Europe/London",
                  "Europe/Paris",
                  "Asia/Phnom_Penh",
                  "Asia/Shanghai",
                  "Asia/Tokyo",
                  "Pacific/Auckland",
                ]
                  .filter((value, index, all) => all.indexOf(value) === index)
                  .map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
              </datalist>
              <h3>Your calendars</h3>
              {calendars.map((calendar) => (
                <div className="cal-source-settings" key={calendar.id}>
                  <label>
                    <input
                      aria-label={`Calendar name ${calendar.title}`}
                      defaultValue={calendar.title}
                      onBlur={(event) => {
                        if (event.target.value.trim())
                          void store.saveCalendar({
                            id: calendar.id,
                            title: event.target.value.trim(),
                          });
                      }}
                    />
                  </label>
                  <select
                    aria-label={`Color for ${calendar.title}`}
                    value={calendar.color}
                    onChange={(event) => {
                      void store.saveCalendar({
                        id: calendar.id,
                        color: event.target.value,
                      });
                    }}
                  >
                    {colors.map((color) => (
                      <option value={color} key={color}>
                        {color === "blue" ? "Lime" : color}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <Pressable
                className="button tinted"
                onClick={() => {
                  void store.saveCalendar({
                    title: "New calendar",
                    color: "blue",
                  });
                }}
              >
                <Plus size={16} /> New calendar
              </Pressable>
              <div className="cal-actions">
                <Pressable
                  className="button outline"
                  onClick={() => upload.current?.click()}
                >
                  <Upload size={16} /> Import ICS
                </Pressable>
                <Pressable
                  className="button outline"
                  onClick={() =>
                    platform.download(
                      "Kimpor Workspace.ics",
                      exportIcs(events.map(providerEvent)),
                      "text/calendar",
                    )
                  }
                >
                  <Download size={16} /> Export ICS
                </Pressable>
              </div>
              <CalendarAccounts
                accounts={accounts}
                syncing={syncing}
                onRefresh={syncAccounts}
                onMessage={notify}
              />
              {error && (
                <p className="cal-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

function EventChip({
  occurrence,
  color,
  time,
  onOpen,
}: {
  occurrence: EventOccurrence<CalendarEvent>;
  color: string;
  time: (instant: string) => string;
  onOpen: () => void;
}) {
  return (
    <Pressable
      className={`cal-event-chip ${occurrence.event.allDay ? "all-day" : "timed"} cal-color-${colors.includes(color) ? color : "blue"}`}
      onClick={onOpen}
    >
      <strong>{occurrence.event.title}</strong>
      <span>
        {occurrence.event.allDay ? "All day" : time(occurrence.start)}
      </span>
      {occurrence.event.recurrence && <span aria-label="Recurring">↻</span>}
    </Pressable>
  );
}

function CalendarAccounts({
  accounts,
  syncing,
  onRefresh,
  onMessage,
}: {
  accounts: CalendarAccount[];
  syncing: boolean;
  onRefresh: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [provider, setProvider] = useState<
    "google" | "outlook" | "caldav" | "ics"
  >("google");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState("");
  const [working, setWorking] = useState(false);
  async function connect() {
    setWorking(true);
    try {
      const result = await calendarTransport()({
        action: "connect",
        provider,
        url,
        username,
        password,
        label,
        returnUrl: `${location.origin}${location.pathname}`,
      });
      setPassword("");
      if (typeof result.url === "string")
        await platform.openExternal(result.url);
      else await onRefresh();
    } catch (cause) {
      onMessage(
        cause instanceof Error
          ? cause.message
          : "Account could not be connected.",
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <section className="cal-accounts">
      <div className="cal-actions between">
        <h3>Connected accounts</h3>
        <Pressable
          className="button plain"
          disabled={syncing}
          onClick={() => {
            void onRefresh();
          }}
        >
          {syncing ? "Refreshing…" : "Refresh"}
        </Pressable>
      </div>
      {accounts.length ? (
        accounts.map((account) => (
          <div className="cal-account" key={account.id}>
            <div>
              <strong>{account.label}</strong>
              <p className="caption muted">
                {account.provider} ·{" "}
                {account.status === "connected"
                  ? "Connected"
                  : "Needs attention"}
                {account.lastSyncAt
                  ? ` · ${new Date(account.lastSyncAt).toLocaleString()}`
                  : ""}
              </p>
            </div>
            <Pressable
              className="button cal-destructive"
              disabled={working}
              onClick={() => {
                setWorking(true);
                void disconnectCalendarAccount(account)
                  .then(onRefresh)
                  .catch((cause) =>
                    onMessage(
                      cause instanceof Error
                        ? cause.message
                        : "Disconnect failed.",
                    ),
                  )
                  .finally(() => setWorking(false));
              }}
            >
              Disconnect
            </Pressable>
          </div>
        ))
      ) : (
        <p className="muted">
          No connected accounts yet. You can add several accounts from the same
          provider.
        </p>
      )}
      <label>
        Provider
        <select
          value={provider}
          onChange={(event) => {
            setProvider(event.target.value as typeof provider);
            setPassword("");
          }}
        >
          <option value="google">Google Calendar</option>
          <option value="outlook">Outlook</option>
          <option value="caldav">iCloud / CalDAV</option>
          <option value="ics">Read-only ICS subscription</option>
        </select>
      </label>
      {(provider === "caldav" || provider === "ics") && (
        <>
          <label>
            Calendar URL
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={
                provider === "caldav"
                  ? "https://caldav.icloud.com"
                  : "https://…/calendar.ics"
              }
            />
          </label>
          <label>
            Account label
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={provider === "ics" ? "Holidays" : "Personal iCloud"}
            />
          </label>
        </>
      )}
      {provider === "caldav" && (
        <>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            App-specific password
            <input
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <p className="caption muted">
            Use an app-specific password for iCloud. It is sent to your server
            over HTTPS, encrypted there, and cleared from this form after
            connecting.
          </p>
        </>
      )}
      <Pressable
        className="button tinted"
        disabled={
          working ||
          ((provider === "caldav" || provider === "ics") && !url) ||
          (provider === "caldav" && (!username || !password))
        }
        onClick={() => {
          void connect();
        }}
      >
        {working
          ? "Connecting…"
          : `Connect ${provider === "caldav" ? "CalDAV" : provider === "ics" ? "subscription" : provider === "google" ? "Google" : "Outlook"}`}
      </Pressable>
      <p className="caption muted">
        Provider sign-in opens your browser. Provider credentials stay on the
        server. Subscriptions refresh when this app is open and are read-only.
      </p>
    </section>
  );
}

interface DragState {
  occurrence?: EventOccurrence<CalendarEvent>;
  day: string;
  y: number;
  mode: "move" | "resize" | "create";
  originMinutes: number;
  delta: number;
  active: boolean;
  pointerId: number;
  target: HTMLElement;
}
function TimeGrid({
  days,
  occurrences,
  zone,
  hour12,
  now,
  color,
  onOpen,
  onCreate,
  onMove,
}: {
  days: string[];
  occurrences: EventOccurrence<CalendarEvent>[];
  zone: string;
  hour12: boolean;
  now: Date;
  color: (id: string) => string;
  onOpen: (event: EventOccurrence<CalendarEvent>) => void;
  onCreate: (
    day: string,
    startMinutes: number,
    endMinutes: number,
    allDay?: boolean,
  ) => void;
  onMove: (
    event: EventOccurrence<CalendarEvent>,
    start: string,
    end: string,
  ) => void;
}) {
  const drag = useRef<DragState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const moved = useRef(false);
  const [ghost, setGhost] = useState<DragState | null>(null);
  const [, force] = useState(0);
  const minuteOf = (instant: string) => {
    const wall = wallTime(instant, zone);
    return Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16));
  };
  const clock = (minutes: number) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
      hour12,
    }).format(new Date(Date.UTC(2026, 0, 1, 0, minutes)));
  function cancel() {
    clearTimeout(timer.current);
    drag.current = null;
    setGhost(null);
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  function begin(
    event: ReactPointerEvent<HTMLElement>,
    day: string,
    mode: DragState["mode"],
    occurrence?: EventOccurrence<CalendarEvent>,
  ) {
    if (event.button !== 0 || occurrence?.event.source === "ics") return;
    if (mode !== "create") event.stopPropagation();
    moved.current = false;
    const originMinutes =
      mode === "create"
        ? Math.min(
            1425,
            Math.max(
              0,
              snapMinutes(
                ((event.clientY -
                  event.currentTarget.getBoundingClientRect().top) /
                  48) *
                  60,
              ),
            ),
          )
        : minuteOf(occurrence!.start);
    const state: DragState = {
      occurrence,
      day,
      mode,
      y: event.clientY,
      originMinutes,
      delta: 0,
      active: event.pointerType !== "touch",
      pointerId: event.pointerId,
      target: event.currentTarget,
    };
    drag.current = state;
    const activate = () => {
      if (drag.current === state) {
        state.active = true;
        state.target.setPointerCapture(state.pointerId);
        setGhost({ ...state });
      }
    };
    if (event.pointerType === "touch")
      timer.current = setTimeout(activate, 300);
    else {
      state.target.setPointerCapture(state.pointerId);
      if (mode === "create") setGhost({ ...state });
    }
  }
  function movement(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    if (!current.active) {
      if (Math.abs(event.clientY - current.y) > 8) cancel();
      return;
    }
    const delta = snapMinutes(((event.clientY - current.y) / 48) * 60);
    if (Math.abs(event.clientY - current.y) > 4) moved.current = true;
    current.delta = delta;
    setGhost({ ...current });
  }
  function end(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    if (current.active && (moved.current || current.mode === "create")) {
      moved.current = true;
      if (current.mode === "create") {
        const start = Math.min(
          current.originMinutes,
          current.originMinutes + current.delta,
        );
        const finish = Math.max(
          current.originMinutes + 15,
          current.originMinutes + current.delta + 15,
        );
        onCreate(current.day, Math.max(0, start), Math.min(1440, finish));
      } else if (current.occurrence) {
        const occurrence = current.occurrence;
        const duration =
          Date.parse(occurrence.end) - Date.parse(occurrence.start);
        const minutes = Math.min(
          1425,
          Math.max(0, current.originMinutes + current.delta),
        );
        const start =
          current.mode === "move"
            ? wallTimeToUtc(
                `${current.day}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
                zone,
              )
            : occurrence.start;
        const end =
          current.mode === "move"
            ? new Date(Date.parse(start) + duration).toISOString()
            : new Date(
                Math.max(
                  Date.parse(start) + 15 * 60_000,
                  Date.parse(occurrence.end) + current.delta * 60_000,
                ),
              ).toISOString();
        onMove(occurrence, start, end);
      }
    }
    cancel();
    force((value) => value + 1);
  }
  return (
    <div className={`cal-time-view ${days.length > 1 ? "cal-time-week" : ""}`} data-scroll-x={days.length > 1 || undefined}>
      <div
        className="cal-time-headers"
        style={{ "--cal-columns": days.length } as CSSProperties}
      >
        <span className="caption muted">All day</span>
        {days.map((day) => (
          <div key={day}>
            <h3>{dayLabel(day, { weekday: "short", day: "numeric" })}</h3>
            {occurrences
              .filter(
                (occurrence) =>
                  occurrence.event.allDay &&
                  occurrence.start <= day &&
                  occurrence.end > day,
              )
              .map((occurrence) => (
                <EventChip
                  key={occurrence.key}
                  occurrence={occurrence}
                  color={color(occurrence.event.calendarId)}
                  time={() => ""}
                  onOpen={() => onOpen(occurrence)}
                />
              ))}
            <Pressable
              className="cal-all-day-add"
              aria-label={`New all-day event on ${day}`}
              onClick={() => onCreate(day, 0, 1440, true)}
            >
              <Plus size={16} />
            </Pressable>
          </div>
        ))}
      </div>
      <div className="cal-time-scroll" tabIndex={0} role="region" aria-label="Calendar hours">
        <div
          className="cal-time-grid"
          style={{ "--cal-columns": days.length } as CSSProperties}
        >
          <div className="cal-hours" aria-hidden="true">
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour}>{clock(hour * 60)}</span>
            ))}
          </div>
          {days.map((day) => (
            <div
              className="cal-time-column"
              key={day}
              onPointerDown={(event) => {
                if (event.target === event.currentTarget)
                  begin(event, day, "create");
              }}
              onPointerMove={movement}
              onPointerUp={end}
              onPointerCancel={cancel}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <span
                  className="cal-hour-rule"
                  style={{ top: `${(hour / 24) * 100}%` }}
                  key={hour}
                />
              ))}
              {dateInZone(now, zone) === day && (
                <div
                  className="cal-now"
                  role="img"
                  aria-label={`Current time ${clock(minuteOf(now.toISOString()))}`}
                  style={{
                    top: `${(minuteOf(now.toISOString()) / 1440) * 100}%`,
                  }}
                />
              )}
              {occurrences
                .filter(
                  (occurrence) =>
                    !occurrence.event.allDay &&
                    occurrenceDate(occurrence, zone) === day,
                )
                .map((occurrence) => {
                  const top = minuteOf(occurrence.start);
                  const duration = Math.min(
                    1440 - top,
                    (Date.parse(occurrence.end) -
                      Date.parse(occurrence.start)) /
                      60_000,
                  );
                  return (
                    <div
                      className={`cal-timed-event cal-color-${colors.includes(color(occurrence.event.calendarId)) ? color(occurrence.event.calendarId) : "blue"}`}
                      style={{
                        top: `${(top / 1440) * 100}%`,
                        height: `${(Math.max(duration, 55) / 1440) * 100}%`,
                      }}
                      key={occurrence.key}
                    >
                      <Pressable
                        className="cal-event-body"
                        aria-label={`${occurrence.event.title}, ${clock(top)}. Alt arrow moves, Shift Alt arrow resizes.`}
                        onPointerDown={(event) =>
                          begin(event, day, "move", occurrence)
                        }
                        onPointerMove={movement}
                        onPointerUp={end}
                        onPointerCancel={cancel}
                        onClick={() => {
                          if (!moved.current) onOpen(occurrence);
                          moved.current = false;
                        }}
                        onKeyDown={(event) => {
                          if (
                            event.altKey &&
                            !event.nativeEvent.isComposing &&
                            (event.key === "ArrowUp" ||
                              event.key === "ArrowDown")
                          ) {
                            event.preventDefault();
                            const delta =
                              event.key === "ArrowDown" ? 900_000 : -900_000;
                            const start = event.shiftKey
                              ? occurrence.start
                              : new Date(
                                  Date.parse(occurrence.start) + delta,
                                ).toISOString();
                            const finish = new Date(
                              Math.max(
                                Date.parse(start) + 900_000,
                                Date.parse(occurrence.end) + delta,
                              ),
                            ).toISOString();
                            onMove(occurrence, start, finish);
                          }
                        }}
                      >
                        <strong>{occurrence.event.title}</strong>
                        <span>
                          {clock(top)} – {clock(top + duration)}
                        </span>
                      </Pressable>
                      <Pressable
                        className="cal-resize"
                        aria-label={`Resize ${occurrence.event.title}`}
                        onClick={() => { if (!moved.current) onOpen(occurrence); moved.current = false; }}
                        onPointerDown={(event) =>
                          begin(event, day, "resize", occurrence)
                        }
                        onPointerMove={movement}
                        onPointerUp={end}
                        onPointerCancel={cancel}
                      >
                        <span aria-hidden="true">↕</span>
                      </Pressable>
                    </div>
                  );
                })}
              {ghost?.day === day && (
                <div
                  className="cal-drag-ghost"
                  style={{
                    top: `${(Math.max(0, ghost.originMinutes + (ghost.mode === "resize" ? 0 : ghost.delta)) / 1440) * 100}%`,
                  }}
                >
                  <strong>
                    {ghost.mode === "create"
                      ? "New event"
                      : ghost.occurrence?.event.title}
                  </strong>
                  <span>{clock(ghost.originMinutes + ghost.delta)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {days.length > 1 && (
        <div className="cal-week-compact">
          {days.map((day) => (
            <section key={day}>
              <h3>{dayLabel(day, { weekday: "long", day: "numeric" })}</h3>
              {occurrences
                .filter(
                  (occurrence) => occurrenceDate(occurrence, zone) === day,
                )
                .map((occurrence) => (
                  <EventChip
                    key={occurrence.key}
                    occurrence={occurrence}
                    color={color(occurrence.event.calendarId)}
                    time={(value) => clock(minuteOf(value))}
                    onOpen={() => onOpen(occurrence)}
                  />
                ))}

            </section>
          ))}
        </div>
      )}
    </div>
  );
}
import './calendar-redesign.css';
