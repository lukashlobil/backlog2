import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, ArrowUpRight, BookOpen, Check, Film, Gamepad2, GripVertical, Layers3, LoaderCircle, Plus, Search, Trash2, X } from 'lucide-react';
import { identity, moveVisible, type Entry, type Media, type MediaType, type Snapshot } from '../../../shared/domain';
import { ApiError, request } from './api';

const types = { game: { label: 'Games', singular: 'Game', icon: Gamepad2 }, book: { label: 'Books', singular: 'Book', icon: BookOpen }, movie: { label: 'Movies', singular: 'Movie', icon: Film } };
type Filter = 'all' | MediaType;
type Providers = Record<MediaType, { available: boolean; name: string }>;
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

function Cover({ media }: { media: Media }) {
  const [failed, setFailed] = useState(false);
  const Icon = types[media.type].icon;
  return <div className={`cover cover-${media.type}`}>
    {media.coverUrl && !failed ? <img src={media.coverUrl} onError={() => setFailed(true)} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <><Icon size={26} strokeWidth={1.3} /><span>{media.title.slice(0, 1)}</span></>}
  </div>;
}

function BacklogRow({ entry, index, count, busy, move, remove }: {
  entry: Entry; index: number; count: number; busy: boolean;
  move: (id: string, direction: number) => void; remove: (entry: Entry) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id, disabled: busy });
  const Icon = types[entry.type].icon;
  return <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`backlog-row ${isDragging ? 'dragging' : ''}`}>
    <button ref={setActivatorNodeRef} {...attributes} {...listeners} className="icon-button drag-handle" disabled={busy} aria-label={`Drag ${entry.title} to reorder`}><GripVertical size={19} /></button>
    <span className="rank">{String(index + 1).padStart(2, '0')}</span>
    <Cover media={entry} />
    <div className="row-info"><h3>{entry.title}</h3><p>{[entry.subtitle, entry.year].filter(Boolean).join(' · ') || 'Ready when you are'}</p><span className={`type-tag tag-${entry.type}`}><Icon size={12} />{types[entry.type].singular}</span></div>
    <div className="row-actions">
      <button className="icon-button" disabled={busy || index === 0} onClick={() => move(entry.id, -1)} aria-label={`Move ${entry.title} up`} title="Move up"><ArrowUp size={17} /></button>
      <button className="icon-button" disabled={busy || index === count - 1} onClick={() => move(entry.id, 1)} aria-label={`Move ${entry.title} down`} title="Move down"><ArrowDown size={17} /></button>
      <button className="icon-button remove-button" disabled={busy} onClick={() => remove(entry)} aria-label={`Remove ${entry.title}`} title="Remove"><Trash2 size={16} /></button>
    </div>
  </li>;
}

function AddDialog({ initialType, entries, onClose, onAdd, busy, saveError }: {
  initialType: MediaType; entries: Entry[]; onClose: () => void; onAdd: (media: Media) => Promise<boolean>; busy: boolean; saveError: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [type, setType] = useState(initialType);
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Media[]>([]);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [year, setYear] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    request<Providers>('/providers', { signal: controller.signal }).then(setProviders).catch(error => { if (!controller.signal.aborted) setError(message(error)); });
    return () => { controller.abort(); dialog.current?.close(); };
  }, []);
  useEffect(() => {
    setResults([]); setError('');
    if (manual || query.trim().length < 2 || !providers?.[type].available) { setSearching(false); return; }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      request<{ results: Media[] }>(`/search?type=${type}&q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) setResults(data.results); })
        .catch(error => { if (!controller.signal.aborted) setError(message(error)); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, type, manual, providers, retry]);
  const existing = new Set(entries.map(identity));
  async function add(media: Media) { if (await onAdd(media)) onClose(); }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    void add({ type, title: title.trim(), subtitle: subtitle.trim(), year, coverUrl: '', source: 'manual', sourceId: crypto.randomUUID() });
  }
  return <dialog ref={dialog} className="add-dialog" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} aria-labelledby="add-title">
    <header className="dialog-header"><div><span className="eyebrow">MAKE ROOM FOR SOMETHING GOOD</span><h2 id="add-title">Add to your backlog</h2></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close add item"><X size={21} /></button></header>
    <div className="media-tabs" aria-label="Media type">{(Object.keys(types) as MediaType[]).map(key => { const Icon = types[key].icon; return <button key={key} aria-pressed={type === key} className={type === key ? 'selected' : ''} onClick={() => setType(key)} disabled={busy}><Icon size={17} />{types[key].label}</button>; })}</div>
    <div className="entry-mode"><button className={!manual ? 'active' : ''} onClick={() => setManual(false)} disabled={busy}>Search catalog</button><button className={manual ? 'active' : ''} onClick={() => { setManual(true); if (!title) setTitle(query); }} disabled={busy}>Add manually</button></div>
    {saveError && <p className="error-banner" role="alert">{saveError}</p>}
    {manual ? <form className="manual-form" onSubmit={submit}>
      <p className="muted">Something off the beaten path? Give it a place on your list.</p>
      <label>Title <span>*</span><input autoFocus required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder={type === 'game' ? 'e.g. Hollow Knight' : type === 'book' ? 'e.g. The Hobbit' : 'e.g. Perfect Days'} /></label>
      <div className="form-grid"><label>{type === 'book' ? 'Author' : type === 'game' ? 'Platform' : 'Director'}<input maxLength={200} value={subtitle} onChange={event => setSubtitle(event.target.value)} placeholder="Optional" /></label><label>Year<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={year} onChange={event => setYear(event.target.value)} placeholder="Optional" /></label></div>
      <button className="primary-button wide" disabled={busy || !title.trim()} type="submit">{busy ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />}Add to backlog</button>
    </form> : <>
      <div className="search-input"><Search size={19} /><input autoFocus value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder={`Search ${types[type].label.toLowerCase()} by title…`} aria-label="Search catalog" disabled={providers !== null && !providers[type].available} />{searching && <LoaderCircle size={18} className="spin" />}</div>
      <div className="search-results" aria-live="polite" aria-busy={searching}>
        {providers && !providers[type].available ? <div className="search-state"><Search size={30} strokeWidth={1.3} /><p><strong>{providers[type].name} search isn’t connected yet</strong></p><p>You can still add any title manually.</p><button className="secondary-button" onClick={() => setManual(true)}>Add manually <ArrowUpRight size={16} /></button></div> : error ? <div className="search-state"><p role="alert">{error}</p><button className="secondary-button" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : searching ? <div className="search-state"><p>Looking for your next good thing…</p></div> : query.trim().length < 2 ? <div className="search-state"><Search size={30} strokeWidth={1.3} /><p>What’s on your mind?</p><p>Type at least two characters to find your next {types[type].singular.toLowerCase()}.</p></div> : results.length === 0 ? <div className="search-state"><p>No matches this time.</p><button className="secondary-button" onClick={() => { setTitle(query); setManual(true); }}>Add “{query}” manually</button></div> : results.map(media => <div className="search-result" key={`${media.source}:${media.sourceId}`}><Cover media={media} /><div><h3>{media.title}</h3><p>{[media.subtitle, media.year].filter(Boolean).join(' · ')}</p></div><button className="result-add" disabled={busy || existing.has(identity(media))} onClick={() => void add(media)} aria-label={existing.has(identity(media)) ? `${media.title} already added` : `Add ${media.title}`}>{existing.has(identity(media)) ? <Check size={19} /> : <Plus size={19} />}</button></div>)}
      </div>
      <p className="catalog-credit">{type === 'book' ? <a href="https://openlibrary.org" target="_blank" rel="noreferrer">Book data & covers from Open Library ↗</a> : type === 'game' ? <a href="https://www.igdb.com" target="_blank" rel="noreferrer">Game data & covers from IGDB ↗</a> : <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">Movie data & images from TMDB ↗</a>}</p>
    </>}
  </dialog>;
}

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ revision: 0, entries: [] });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  async function load() {
    setLoading(true); setError('');
    try { setSnapshot(await request<Snapshot>('/backlog')); setLoadFailed(false); }
    catch (error) { setError(message(error)); setLoadFailed(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function mutate(path: string, method: string, body: unknown, success: string) {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    try {
      setSnapshot(await request<Snapshot>(path, { method, body: JSON.stringify(body) }));
      setNotice(success); return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try { setSnapshot(await request<Snapshot>('/backlog')); } catch { setLoadFailed(true); }
      }
      setError(message(error)); return false;
    } finally { locked.current = false; setBusy(false); }
  }
  const visible = snapshot.entries.filter(entry => filter === 'all' || entry.type === filter);
  const visibleIds = visible.map(entry => entry.id);
  function reorder(activeId: string, overId: string) {
    if (activeId === overId) return;
    const reordered = moveVisible(snapshot.entries, visibleIds, activeId, overId);
    void mutate('/backlog/order', 'PUT', { revision: snapshot.revision, ids: reordered.map(entry => entry.id) }, 'Order saved.');
  }
  function onDragEnd({ active, over }: DragEndEvent) { if (over) reorder(String(active.id), String(over.id)); }
  function move(id: string, direction: number) { const target = visibleIds[visibleIds.indexOf(id) + direction]; if (target) reorder(id, target); }
  function remove(entry: Entry) {
    if (window.confirm(`Remove “${entry.title}” from your backlog?`)) void mutate(`/backlog/${entry.id}`, 'DELETE', { revision: snapshot.revision }, `${entry.title} removed.`);
  }
  const disabled = loading || loadFailed || busy;
  return <div className="app-shell">
    <aside className="sidebar">
      <a href="/" className="brand" aria-label="Backlog home"><span className="brand-mark"><Layers3 size={23} /></span>backlog<span className="brand-dot">.</span></a>
      <div className="sidebar-section"><span className="eyebrow">YOUR SPACE</span><nav aria-label="Backlog filters">
        <button className={`nav-item ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}><Layers3 size={19} /><span>All items</span><span className="nav-count">{snapshot.entries.length}</span></button>
        {(Object.keys(types) as MediaType[]).map(type => { const Icon = types[type].icon; return <button key={type} className={`nav-item ${filter === type ? 'active' : ''}`} onClick={() => setFilter(type)}><Icon size={19} /><span>{types[type].label}</span><span className="nav-count">{snapshot.entries.filter(entry => entry.type === type).length}</span></button>; })}
      </nav></div>
      <div className="sidebar-note"><div className="little-star">✳</div><h3>A little less scrolling.<br />A little more doing.</h3><p>Keep the good stuff in one place.<br />Get to it at your own pace.</p></div>
      <div className="local-status"><span />Personal backlog <span className="version">v0.1</span></div>
    </aside>
    <main>
      <div className="topbar"><span>Your collection / <strong>{filter === 'all' ? 'All items' : types[filter].label}</strong></span><span className="storage-note"><span className="status-dot" />Saved on this computer</span></div>
      <div className="main-content">
        <header className="page-header"><div><span className="eyebrow">GOOD THINGS AHEAD</span><h1>{filter === 'all' ? 'Your backlog' : `Your ${types[filter].label.toLowerCase()}`}<span className="heading-dot">.</span></h1><p>A home for everything you want to play, read, and watch.</p></div><button className="primary-button" onClick={() => setAdding(true)} disabled={disabled}><Plus size={19} />Add an item</button></header>
        <div className="intro-strip"><div className="strip-icon"><Layers3 size={22} strokeWidth={1.5} /></div><div><strong>Your next favorite is waiting.</strong><p>Add what catches your eye. Move what excites you to the top.</p></div><span className="strip-decoration" aria-hidden="true">✳</span></div>
        {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => void load()} disabled={busy}>Reload list</button></div>}
        <section aria-labelledby="list-title" className="list-section">
          <div className="list-heading"><div><h2 id="list-title">{filter === 'all' ? 'Up next' : types[filter].label}</h2><span className="count-badge">{visible.length}</span></div><span className="order-hint"><GripVertical size={15} />Your order, your pace</span></div>
          {loading ? <div className="empty-state"><LoaderCircle className="spin" size={28} /><h3>Opening your backlog…</h3></div> : loadFailed ? <div className="empty-state"><h3>Your list couldn’t be loaded</h3><p>Try reloading to reconnect to the local server.</p><button className="secondary-button" onClick={() => void load()}>Try again</button></div> : visible.length === 0 ? <div className="empty-state"><div className="empty-art" aria-hidden="true"><span className="art-card art-book"><BookOpen size={29} strokeWidth={1.2} /></span><span className="art-card art-game"><Gamepad2 size={32} strokeWidth={1.2} /></span><span className="art-card art-movie"><Film size={28} strokeWidth={1.2} /></span></div><span className="eyebrow">A FRESH PAGE</span><h3>{filter === 'all' ? 'Make a little room for inspiration.' : `Your ${types[filter].label.toLowerCase()} start here.`}</h3><p>That game everyone’s talking about. The book on your mind.<br className="desktop-break" /> The movie you keep meaning to watch. Save it here.</p><button className="primary-button" onClick={() => setAdding(true)}><Plus size={18} />Add your first {filter === 'all' ? 'item' : types[filter].singular.toLowerCase()}</button><span className="empty-footnote">No rush. It’s a backlog, not a to-do list.</span></div> : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}><SortableContext items={visibleIds} strategy={verticalListSortingStrategy}><ol className="backlog-list">{visible.map((entry, index) => <BacklogRow key={entry.id} entry={entry} index={index} count={visible.length} busy={disabled} move={move} remove={remove} />)}</ol></SortableContext></DndContext>}
          {visible.length > 0 && <button className="add-another" onClick={() => setAdding(true)} disabled={disabled}><Plus size={17} />There’s always room for one more</button>}
        </section>
        <footer className="page-footer"><span>{busy ? 'Saving…' : 'A small collection of things to look forward to.'}</span><span role="status" className="save-notice">{notice && <><Check size={14} />{notice}</>}</span></footer>
        {snapshot.entries.some(entry => entry.source === 'tmdb') && <p className="attribution">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>}
      </div>
    </main>
    {adding && <AddDialog initialType={filter === 'all' ? 'game' : filter} entries={snapshot.entries} onClose={() => setAdding(false)} busy={busy} saveError={error} onAdd={media => mutate('/backlog', 'POST', media, `${media.title} added.`)} />}
  </div>;
}
