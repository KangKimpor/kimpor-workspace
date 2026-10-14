import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import type { Page } from "./model";
import { completeProjectTask, inferProjectTypes, projectDefinition, projectPreset, projectPresets, projectType, projectViews, taskDone, taskDue, visibleProjectFields, weekNumber } from "./projects";
import { WorkspaceStore } from "./store";
const page: Page = { id: "fixture-project", userId: "fixture-owner", title: "Project", type: "database", parentId: null,
  favorite: false, tags: [], icon: "", cover: "", fullWidth: false, date: null, databaseId: null, properties: {},
  createdAt: "2026-10-12T00:00:00Z", updatedAt: "2026-10-12T00:00:00Z", deletedAt: null };
it("creates all project defaults with task-first fields and a usable initial view", () => {
  for (const preset of projectPresets) {
    const definition = projectDefinition(page, preset.type);
    expect(definition.views[0]?.type).toBe(preset.view);
    const fields = visibleProjectFields(definition, preset.type);
    expect(fields[0]?.type).toBe("title");
    expect(fields.length).toBeGreaterThanOrEqual(2);
    expect(fields.length).toBeLessThanOrEqual(4);
  }
  expect(projectPreset("missing")).toBeUndefined();
  expect(projectType(page, { [page.id]: "app" })).toBe("app");
  expect(projectType({ ...page, properties: { __projectType: "model" } }, {})).toBe("model");
  expect(projectType(undefined, {})).toBeUndefined();
});
it("completes a weekly task and creates the next week without losing its extra fields", async () => {
  const store = new WorkspaceStore(`project-${crypto.randomUUID()}`, "fixture-owner");
  try {
    await store.ready();
    const project = await store.createPage("database", "Weekly report");
    const definition = projectDefinition(project, "weekly");
    const task = await store.createPage("row", "Update report", { databaseId: project.id, parentId: project.id,
      properties: { due: "2026-10-12", week: 42, completed: false, __weekly: true, extra: "Preserve" } });
    await completeProjectTask(store, task, definition);
    expect(taskDone(store.listPages().find(page => page.id === task.id)!, definition)).toBe(true);
    const next = store.listPages().find(page => page.type === "row" && page.id !== task.id)!;
    expect(next).toMatchObject({ title: "Update report", databaseId: project.id, properties: { due: "2026-10-19", week: 43, completed: false, extra: "Preserve" } });
    const plain = await store.createPage("row", "Build", { properties: { status: "Building" } });
    await completeProjectTask(store, plain, projectDefinition(project, "app"));
    expect(store.listPages().find(page => page.id === plain.id)?.properties.status).toBe("Shipped");
  } finally { await store.close(); await store.db.delete(); }
});
it("uses migrated field IDs without mutating schemas or task values", () => {
  const definition = projectDefinition(page, "coursework");
  definition.properties = [{ id: "old-title", name: "Name", type: "title" }, { id: "old-date", name: "Date", type: "date" },
    { id: "old-status", name: "Status", type: "status", options: ["Open", "Done"] }];
  const original = structuredClone(definition);
  expect(visibleProjectFields(definition, "weekly").map(field => field.id)).toEqual(["old-title", "old-date", "old-status"]);
  expect(definition).toEqual(original);
  const task = { ...page, type: "row" as const, properties: { "old-date": "2026-10-15", "old-status": "Done" } };
  expect(taskDue(task, definition)).toBe("2026-10-15");
  expect(taskDone(task, definition)).toBe(true);
  expect(taskDone({ ...task, properties: {} }, definition)).toBe(false);
  expect(taskDone({ ...task, properties: { completed: true } })).toBe(true);
  expect(taskDue({ ...task, properties: {} })).toBeNull();
  expect(weekNumber(new Date("2026-01-01T12:00:00Z"))).toBe(1);
  expect(weekNumber(new Date("2026-10-12T12:00:00Z"))).toBe(42);
});

it("infers presentation types for imported databases without modifying source records", () => {
  const inputs = ["Carpentry", "Weekly progress report", "Coursework", "Football predictions", "App build"];
  const pages = inputs.map((title,index) => ({ ...page, id: `fixture-${index}`, title }));
  const databases = pages.map(page => projectDefinition(page, "app"));
  const original = structuredClone({ pages, databases });
  expect(Object.values(inferProjectTypes(pages, databases))).toEqual(["rework", "weekly", "coursework", "model", "app"]);
  expect({ pages, databases }).toEqual(original);
  const generic = { ...page, title: "Project" };
  expect(inferProjectTypes([generic, { ...page, id: "fixture-task", type: "row", title: "Rework item", databaseId: generic.id }], [projectDefinition(generic, "app")])[generic.id]).toBe("rework");
  expect(inferProjectTypes([generic], [projectDefinition(generic, "app")])[generic.id]).toBe("app");
});

it("supplies migrated default views and photo/item fields without rewriting schemas", () => {
  const definition = projectDefinition(page, "app");
  definition.views = [{ id: "source-table", name: "Source", type: "table" }];
  definition.properties = [
    { id: "source-name", name: "Name", type: "title" },
    { id: "source-number", name: "Item number", type: "number" },
    { id: "source-photos", name: "Images", type: "files" },
    { id: "source-status", name: "Status", type: "status", options: ["Open", "Redo", "Done"] },
  ];
  const original = structuredClone(definition);
  expect(projectViews(definition, "rework").map(view => view.type)).toEqual(["table", "list"]);
  expect(visibleProjectFields(definition, "rework").map(field => field.id)).toEqual(["source-name", "source-number", "source-photos", "source-status"]);
  expect(projectViews(definition)).toBe(definition.views);
  expect(projectViews(projectDefinition(page, "weekly"), "weekly")[0]?.type).toBe("list");
  expect(definition).toEqual(original);
  const listOnly = { ...definition, views: [{ id: "source-list", name: "List", type: "list" as const }] };
  expect(projectViews(listOnly).map(view => view.type)).toEqual(["list", "table"]);
  expect(listOnly.views).toHaveLength(1);
});
