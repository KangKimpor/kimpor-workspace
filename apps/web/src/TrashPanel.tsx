import { useEffect, useState } from "react";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import { Pressable } from "@veloradesk/ui";
import type { Page } from "@veloradesk/core/model";

export default function TrashPanel({ pages, canDelete, onRestore, onDelete }: { pages: Page[]; canDelete: boolean; onRestore:(ids:string[])=>void; onDelete:(pages:Page[])=>void }) {
  const [query,setQuery] = useState(""), [type,setType] = useState("All"), [selection,setSelection] = useState<string[]>([]);
  const types: Record<string,string> = { Notes:"note", Journal:"journal", Projects:"database", Tasks:"row", Pages:"page" };
  const roots = pages.filter(page=>page.deletedAt && !pages.some(parent=>parent.deletedAt && (parent.id === page.parentId || parent.id === page.databaseId)));
  const filtered = roots.filter(page=>(type === "All" || page.type === types[type]) && page.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const selected = roots.filter(page=>selection.includes(page.id));
  useEffect(() => { if (!pages.some(page=>page.deletedAt)) setSelection([]); },[pages]);
  return <div className="ws-trash-panel"><label className="ws-search-field"><Search size={18} /><input type="search" aria-label="Search Trash" placeholder="Search Trash" value={query} onChange={event=>setQuery(event.target.value)} /></label>
    <div className="ws-filter-chips" aria-label="Trash types">{["All",...Object.keys(types)].map(name=><Pressable key={name} aria-pressed={type === name} onClick={()=>setType(name)}>{name}</Pressable>)}</div>
    {!!selected.length && <div className="ws-trash-actions"><span>{selected.length} selected</span><Pressable className="ws-button" onClick={()=>onRestore(selected.map(page=>page.id))}>Restore selected</Pressable><Pressable className="ws-button ws-danger" disabled={!canDelete} onClick={()=>onDelete(selected)}>Delete selection forever</Pressable></div>}
    {filtered.length ? filtered.map(page=>{
      const parent = pages.find(parent=>parent.id === (page.parentId ?? page.databaseId));
      const days = Math.max(0,Math.floor((Date.now()-new Date(page.deletedAt!).getTime())/86400000));
      return <div className="ws-trash-item" key={page.id}><label className="ws-trash-select"><input type="checkbox" aria-label={`Select ${page.title || "Untitled"}`} checked={selection.includes(page.id)} onChange={event=>setSelection(event.target.checked ? [...selection,page.id] : selection.filter(id=>id !== page.id))} /></label><span className="ws-trash-info"><strong>{page.icon || "▣"} {page.title || "Untitled"}</strong><small>{parent ? `in ${parent.title || "Untitled"} · ` : ""}Deleted {days ? `${days} ${days === 1 ? "day" : "days"} ago` : "today"}</small></span><div className="ws-trash-actions"><Pressable className="ws-icon" aria-label="Restore" onClick={()=>onRestore([page.id])}><RotateCcw size={18} /></Pressable><Pressable className="ws-icon ws-danger" aria-label="Delete forever" disabled={!canDelete} onClick={()=>onDelete([page])}><Trash2 size={18} /></Pressable></div></div>;
    }) : <div className="ws-quiet-empty"><Trash2 size={28} /><p>{query || type !== "All" ? "No matching items" : "Trash is empty"}</p></div>}
    <footer className="ws-trash-footer"><Pressable className="ws-button ws-danger" disabled={!roots.length || !canDelete} onClick={()=>onDelete(roots)}>Empty Trash</Pressable><p>Items stay in Trash until you delete them.</p>{!canDelete && <p>Connect to the internet to delete forever.</p>}</footer></div>;
}
