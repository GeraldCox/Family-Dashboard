import { useState, useEffect } from 'react';
import { api } from '../api';
import Icon from './Icon';

const LIST_COLORS = ['#2563eb', '#059669', '#db2777', '#d97706', '#7c3aed', '#0891b2'];

export default function Tasks({ compact = false }) {
  const [data, setData] = useState(null);
  const [newListName, setNewListName] = useState('');
  const [draft, setDraft] = useState({});

  useEffect(() => { refresh(); }, []);

  function refresh() {
    api.tasks().then(setData).catch(console.error);
  }

  async function addList() {
    const name = newListName.trim();
    if (!name) return;
    const color = LIST_COLORS[(data?.lists.length || 0) % LIST_COLORS.length];
    await api.addTaskList(name, color);
    setNewListName('');
    refresh();
  }

  async function deleteList(listId) {
    await api.deleteTaskList(listId);
    setData(prev => ({ lists: prev.lists.filter(l => l.id !== listId) }));
  }

  async function addTask(listId) {
    const text = (draft[listId] || '').trim();
    if (!text) return;
    const res = await api.addTask(listId, text);
    setDraft(prev => ({ ...prev, [listId]: '' }));
    setData(prev => ({
      lists: prev.lists.map(l => l.id !== listId ? l : { ...l, tasks: [...l.tasks, res.task] })
    }));
  }

  async function toggleTask(listId, taskId) {
    await api.toggleTask(listId, taskId);
    setData(prev => ({
      lists: prev.lists.map(l => l.id !== listId ? l : {
        ...l, tasks: l.tasks.map(t => t.id !== taskId ? t : { ...t, done: !t.done })
      })
    }));
  }

  async function deleteTask(listId, taskId) {
    await api.deleteTask(listId, taskId);
    setData(prev => ({
      lists: prev.lists.map(l => l.id !== listId ? l : { ...l, tasks: l.tasks.filter(t => t.id !== taskId) })
    }));
  }

  if (!data) return <div style={s.empty}>Loading tasks…</div>;

  if (compact) {
    return (
      <div style={s.compactWrap}>
        {data.lists.length === 0 && <div style={s.empty}>No task lists yet.</div>}
        {data.lists.map(list => {
          const active = list.tasks.filter(t => !t.done);
          return (
            <div key={list.id} style={{ ...s.compactList, borderLeft: `3px solid ${list.color}` }}>
              <div style={{ ...s.compactTitle, color: list.color }}>
                {list.name} <span style={s.compactCount}>{active.length}</span>
              </div>
              {active.length === 0 ? (
                <div style={s.compactDone}>All done 🎉</div>
              ) : (
                active.slice(0, 4).map(t => (
                  <div key={t.id} style={s.compactItem} onClick={() => toggleTask(list.id, t.id)}>
                    <span style={s.compactDot} />
                    {t.text}
                  </div>
                ))
              )}
              {active.length > 4 && <div style={s.compactMore}>+{active.length - 4} more</div>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.addListRow}>
        <input
          style={s.addListInput}
          placeholder="New list name…"
          value={newListName}
          onChange={e => setNewListName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addList()}
        />
        <button style={s.addListBtn} onClick={addList}>+ Add List</button>
      </div>

      {data.lists.length === 0 && <div style={s.empty}>No task lists yet. Create one above.</div>}

      <div style={s.lists}>
        {data.lists.map(list => {
          const done = list.tasks.filter(t => t.done).length;
          return (
            <div key={list.id} style={{ ...s.list, borderTop: `4px solid ${list.color}` }}>
              <div style={s.listHead}>
                <div style={{ ...s.listTitle, color: list.color }}>{list.name}</div>
                <div style={s.listCount}>{done}/{list.tasks.length}</div>
                <button style={s.deleteListBtn} onClick={() => deleteList(list.id)} aria-label="Delete list"><Icon name="x" size={16} /></button>
              </div>

              <div style={s.taskList}>
                {list.tasks.map(t => (
                  <div key={t.id} style={s.taskRow}>
                    <label style={s.taskLabel}>
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={() => toggleTask(list.id, t.id)}
                        style={{ accentColor: list.color }}
                      />
                      <span style={{ ...s.taskText, ...(t.done ? s.taskDone : {}) }}>{t.text}</span>
                    </label>
                    <button style={s.deleteTaskBtn} onClick={() => deleteTask(list.id, t.id)} aria-label="Delete task"><Icon name="x" size={14} /></button>
                  </div>
                ))}
              </div>

              <div style={s.addTaskRow}>
                <input
                  style={s.addTaskInput}
                  placeholder="Add a task…"
                  value={draft[list.id] || ''}
                  onChange={e => setDraft(prev => ({ ...prev, [list.id]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addTask(list.id)}
                />
                <button style={s.addTaskBtn} onClick={() => addTask(list.id)}>+</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16, padding: 16, overflowY: 'auto', height: '100%' },
  empty: { padding: 20, color: 'var(--text-3)' },
  addListRow: { display: 'flex', gap: 8 },
  addListInput: {
    flex: 1, padding: '10px 12px', borderRadius: 10, border: '0.5px solid var(--border-md)',
    background: 'var(--surface)', fontSize: 15,
  },
  addListBtn: {
    padding: '10px 16px', borderRadius: 10, background: 'var(--blue)', color: 'white',
    fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap',
  },
  lists: { display: 'flex', flexDirection: 'column', gap: 14 },
  list: {
    background: 'var(--surface)', borderRadius: 16, padding: 16,
    boxShadow: 'var(--shadow-sm)', border: '0.5px solid var(--border)',
  },
  listHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
  listTitle: { fontSize: 17, fontWeight: 700, flex: 1 },
  listCount: { fontSize: 14, color: 'var(--text-3)', fontWeight: 600 },
  deleteListBtn: { color: 'var(--text-3)', padding: 4, display: 'flex', alignItems: 'center' },
  taskList: { display: 'flex', flexDirection: 'column', gap: 6 },
  taskRow: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
    borderRadius: 8, background: 'var(--bg)',
  },
  taskLabel: { display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' },
  taskText: { fontSize: 15, color: 'var(--text-1)' },
  taskDone: { textDecoration: 'line-through', color: 'var(--text-3)' },
  deleteTaskBtn: { color: 'var(--text-3)', padding: 4, display: 'flex', alignItems: 'center' },
  addTaskRow: { display: 'flex', gap: 6, marginTop: 10 },
  addTaskInput: {
    flex: 1, padding: '7px 10px', borderRadius: 8, border: '0.5px solid var(--border-md)',
    background: 'var(--bg)', fontSize: 14,
  },
  addTaskBtn: {
    width: 30, borderRadius: 8, background: 'var(--bg)', border: '0.5px solid var(--border-md)',
    fontSize: 17, fontWeight: 600, color: 'var(--text-2)',
  },

  compactWrap: { display: 'flex', flexDirection: 'column', gap: 10, padding: 14, overflowY: 'auto', height: '100%' },
  compactList: { background: 'var(--bg)', borderRadius: 10, padding: '10px 12px' },
  compactTitle: { fontSize: 14, fontWeight: 700, marginBottom: 6 },
  compactCount: { fontSize: 12, fontWeight: 600, opacity: 0.7 },
  compactItem: {
    fontSize: 14, color: 'var(--text-1)', padding: '3px 0', display: 'flex',
    alignItems: 'center', gap: 6, cursor: 'pointer',
  },
  compactDot: { width: 5, height: 5, borderRadius: '50%', background: 'var(--text-3)', flexShrink: 0 },
  compactDone: { fontSize: 14, color: 'var(--text-3)' },
  compactMore: { fontSize: 13, color: 'var(--text-3)', marginTop: 2 },
};
