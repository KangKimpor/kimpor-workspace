import type { DatabaseDefinition, DatabaseView, Page, PropertyDefinition } from "./model";
import type { WorkspaceStore } from "./store";

export type ProjectType = "weekly" | "rework" | "app" | "coursework" | "model";
export type ProjectTypes = Record<string, ProjectType>;
export interface ProjectPreset {
  type: ProjectType; label: string; view: DatabaseView["type"];
  fields: PropertyDefinition[]; visible: string[]; group?: string;
  checklist?: string[];
}
const status = (options: string[]): PropertyDefinition => ({ id: "status", name: "Status", type: "status", options });
const field = (id: string, name: string, type: PropertyDefinition["type"]): PropertyDefinition => ({ id, name, type });
export const projectPresets: ProjectPreset[] = [
  { type: "weekly", label: "Weekly report", view: "list", group: "week", visible: ["week", "due", "completed"],
    fields: [field("week", "Week", "number"), field("due", "Due", "date"), field("completed", "Done", "checkbox")],
    checklist: ["Update report number and dates", "Refresh Excel links", "Update photos", "Export PDF"] },
  { type: "rework", label: "Rework list", view: "list", group: "area", visible: ["item", "photo", "status"],
    fields: [field("area", "Area", "text"), field("item", "Item", "number"), status(["Open", "Redo", "Done"]), field("photo", "Photo", "files")] },
  { type: "app", label: "App build", view: "board", group: "status", visible: ["repo", "deploy", "version"],
    fields: [status(["Idea", "Building", "Testing", "Shipped"]), field("repo", "Repo", "url"), field("deploy", "Deploy", "url"), field("version", "Version", "text")] },
  { type: "coursework", label: "Coursework", view: "list", visible: ["due", "course", "completed"],
    fields: [field("due", "Due", "date"), field("course", "Course", "text"), field("completed", "Done", "checkbox")] },
  { type: "model", label: "Model tracking", view: "list", visible: ["due", "status", "cadence"],
    fields: [field("due", "Due", "date"), status(["To do", "Done"]), field("cadence", "Cadence", "text")],
    checklist: ["Recalibrate model", "Review matchday"] },
];
export function projectPreset(type: unknown): ProjectPreset | undefined {
  return projectPresets.find(preset => preset.type === type);
}
export function projectType(page: Page | undefined, mapping: ProjectTypes): ProjectType | undefined {
  return projectPreset(page && (mapping[page.id] ?? page.properties.__projectType))?.type;
}
export function inferProjectTypes(pages: Page[], databases: DatabaseDefinition[]): ProjectTypes {
  const classify = (text: string): ProjectType | undefined =>
    /rework|rectification|carpentry/i.test(text) ? "rework" :
    /report|progress|excel|penthouse/i.test(text) ? "weekly" :
    /course|math|stat|assignment|homework/i.test(text) ? "coursework" :
    /predict|football|matchday|recalibr|world.?cup/i.test(text) ? "model" :
    /tracker|workspace|\bapp\b|deploy|build|code|drive/i.test(text) ? "app" : undefined;
  return Object.fromEntries(databases.map(database => {
    const page = pages.find(page => page.id === database.id);
    const counts = new Map<ProjectType, number>();
    for (const row of pages.filter(page => page.databaseId === database.id && page.type === "row")) {
      const type = classify(row.title);
      if (type) counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    const type = projectType(page, {}) ?? classify(page?.title ?? "") ?? [...counts].sort((a,b) => b[1] - a[1])[0]?.[0] ?? "app";
    return [database.id, type];
  }));
}
export function taskDone(page: Page, definition?: DatabaseDefinition): boolean {
  if (page.properties.completed === true) return true;
  return definition?.properties.some(property => property.type === "checkbox" && /done|complete|finish/i.test(property.name) && page.properties[property.id] === true) === true ||
    definition?.properties.some(property => property.type === "status" && /^(done|shipped|complete|completed)$/i.test(String(page.properties[property.id] ?? ""))) === true;
}
export function taskDue(page: Page, definition?: DatabaseDefinition): string | null {
  const date = definition?.properties.find(property => property.type === "date");
  const due = page.properties.due ?? (date && page.properties[date.id]);
  return typeof due === "string" && /^\d{4}-\d{2}-\d{2}/.test(due) ? due.slice(0, 10) : null;
}
export function weekNumber(date: Date): number {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const first = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  return Math.ceil(((day.getTime() - first.getTime()) / 86400000 + 1) / 7);
}
export function projectDefinition(page: Page, type: ProjectType): DatabaseDefinition {
  const preset = projectPreset(type)!;
  const order: DatabaseView["type"][] = [...new Set<DatabaseView["type"]>(["table", preset.view, "list", "board", "calendar", "gallery"])];
  return {
    id: page.id, userId: page.userId,
    properties: [field("title", "Task name", "title"), ...preset.fields],
    views: order.map(view => ({ id: crypto.randomUUID(), name: view === "table" ? "All tasks" : view === "board" ? "By status" : view[0]!.toUpperCase() + view.slice(1), type: view,
      groupBy: preset.group, sort: preset.fields.some(field => field.id === "due") ? [{ property: "due", direction: "asc" }] : undefined })),
    createdAt: page.createdAt, updatedAt: page.updatedAt, deletedAt: null,
  };
}
/** Use source field IDs; presentation mapping never renames source properties. */
export function visibleProjectFields(definition: DatabaseDefinition, type?: ProjectType): PropertyDefinition[] {
  const preset = projectPreset(type);
  const title = definition.properties.filter(property => property.type === "title");
  if (!preset) return [...title, ...definition.properties.filter(property => property.type !== "title").slice(0, 3)];
  const semantic = (id: string) => definition.properties.find(property =>
    id === "due" ? property.type === "date" :
    id === "week" ? /week/i.test(property.name) :
    id === "item" ? property.type === "number" && /item|number|no\b/i.test(property.name) :
    id === "photo" ? property.type === "files" || /photo|image|picture/i.test(property.name) :
    id === "completed" ? property.type === "checkbox" && /done|complete|finish/i.test(property.name) : false);
  const selected = preset.visible.map(id => definition.properties.find(property => property.id === id || property.name.toLowerCase() === id) ?? semantic(id) ?? (id === "completed" ? definition.properties.find(property => property.type === "status") : undefined));
  const matching = selected.filter((property): property is PropertyDefinition => !!property);
  return [...title, ...(matching.length ? matching : definition.properties.filter(property => property.type !== "title").slice(0, 3))];
}
/** Supply a missing default view for display without writing the source schema. */
export function projectViews(definition: DatabaseDefinition, type?: ProjectType): DatabaseView[] {
  const preset = projectPreset(type);
  const views: DatabaseView[] = definition.views.some(view => view.type === "table") ? definition.views :
    [...definition.views, { id: "presentation:all-tasks", name: "All tasks", type: "table" }];
  if (!preset || views.some(view => view.type === preset.view)) return views;
  const date = definition.properties.find(property => property.type === "date");
  return [...views, { id: `presentation:${type}`, name: preset.view[0]!.toUpperCase() + preset.view.slice(1), type: preset.view,
    groupBy: preset.group, sort: date ? [{ property: date.id, direction: "asc" }] : undefined }];
}
export async function completeProjectTask(workspace: Pick<WorkspaceStore, "patchPage" | "createPage">, task: Page, definition?: DatabaseDefinition) {
  const checkbox = definition?.properties.find(property => property.type === "checkbox" && /done|complete|finish/i.test(property.name));
  const status = definition?.properties.find(property => property.type === "status");
  await workspace.patchPage(task.id, { properties: { ...task.properties,
    ...(checkbox ? { [checkbox.id]: true } : { completed: true }),
    ...(status ? { [status.id]: status.options?.find(value => /^(done|shipped|complete|completed)$/i.test(value)) ?? "Done" } : {}) } });
  if (!task.properties.__weekly) return;
  const due = taskDue(task, definition) ?? new Date().toISOString().slice(0,10);
  const next = new Date(`${due.slice(0,10)}T12:00:00`); next.setDate(next.getDate() + 7);
  const date = definition?.properties.find(property => property.type === "date");
  await workspace.createPage("row", task.title, { databaseId: task.databaseId, parentId: task.parentId,
    properties: { ...task.properties, completed: false, ...(checkbox ? { [checkbox.id]: false } : {}),
      ...(status ? { [status.id]: status.options?.[0] ?? "To do" } : {}),
      [date?.id ?? "due"]: `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}-${String(next.getDate()).padStart(2,"0")}`, week: weekNumber(next) } });
}
