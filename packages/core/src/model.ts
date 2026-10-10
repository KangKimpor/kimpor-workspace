export type PageType = "page" | "note" | "journal" | "database" | "row";
export type PropertyValue = string | number | boolean | string[] | null;
export interface Page {
  id: string;
  userId: string;
  type: PageType;
  title: string;
  parentId: string | null;
  favorite: boolean;
  tags: string[];
  icon: string;
  cover: string;
  fullWidth: boolean;
  date: string | null;
  databaseId: string | null;
  properties: Record<string, PropertyValue>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface Calendar {
  id: string;
  userId: string;
  title: string;
  color: string;
  visible: boolean;
  source: "local" | "google" | "caldav" | "outlook" | "ics";
  remoteId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface CalendarEvent {
  id: string;
  userId: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  startZone: string;
  endZone: string;
  location: string;
  notes: string;
  url: string;
  busy: boolean;
  reminderMinutes: number;
  recurrence: string;
  exceptions: string[];
  pageId: string | null;
  source: Calendar["source"];
  remoteId?: string;
  etag?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export type PropertyType =
  | "title"
  | "text"
  | "number"
  | "select"
  | "multi-select"
  | "status"
  | "date"
  | "checkbox"
  | "url"
  | "email"
  | "phone"
  | "files"
  | "relation"
  | "rollup";
export interface PropertyDefinition {
  id: string;
  name: string;
  type: PropertyType;
  options?: string[];
  relationDatabaseId?: string;
  rollupProperty?: string;
}
export interface Filter {
  property: string;
  operator: "contains" | "equals" | "before" | "after" | "empty";
  value: PropertyValue;
}
export interface FilterGroup {
  operator: "and" | "or";
  children: (Filter | FilterGroup)[];
}
export interface DatabaseView {
  id: string;
  name: string;
  type: "table" | "list" | "board" | "calendar" | "gallery";
  filter?: FilterGroup;
  sort?: { property: string; direction: "asc" | "desc" }[];
  groupBy?: string;
}
export interface DatabaseDefinition {
  id: string;
  userId: string;
  properties: PropertyDefinition[];
  views: DatabaseView[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface PageVersion {
  id: string;
  pageId: string;
  createdAt: string;
  update: Uint8Array;
}
export type WorkspaceEntity =
  | Page
  | Calendar
  | CalendarEvent
  | DatabaseDefinition;
export type EntityTable = "pages" | "calendars" | "events" | "databases";
