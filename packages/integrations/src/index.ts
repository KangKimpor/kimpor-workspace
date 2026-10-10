export interface ProviderEvent { id: string; title: string; startsAt: string; endsAt: string; timeZone: string; etag?: string }
export interface CalendarProvider {
  listCalendars(): Promise<Array<{ id: string; title: string }>>;
  listEvents(range: { from: string; to: string }, syncToken?: string): Promise<{ events: ProviderEvent[]; syncToken?: string }>;
  createEvent(calendarId: string, event: Omit<ProviderEvent, 'id'>): Promise<ProviderEvent>;
  updateEvent(calendarId: string, event: ProviderEvent, etag: string): Promise<ProviderEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}
