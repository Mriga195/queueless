import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, rupees, useApi } from '../api';
import { useApp } from '../store';
import { DishPhoto, ErrorMsg, Loading, VegMark, date, useSubmit } from '../ui';

const ymd = d => d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

function Bars({ rows, label, value, fmt = String }) {
  const max = Math.max(1, ...rows.map(value));
  return (
    <div className="bars">
      {rows.map(r => (
        <div key={label(r)} className="bar" title={`${label(r)}: ${fmt(value(r))}`}>
          <span className="bar-val">{fmt(value(r))}</span>
          <span className="bar-fill" style={{ height: `${(value(r) / max) * 100}%` }} />
          <span className="bar-label">{label(r)}</span>
        </div>
      ))}
    </div>
  );
}

export function Reports() {
  const [range, setRange] = useState(() => ({
    from: ymd(new Date(Date.now() - 7 * 864e5)),
    to: ymd(new Date())
  }));
  const { data, error, loading } = useApi(`/reports/sales?from=${range.from}&to=${range.to}`);
  const r = data?.data;

  return (
    <div className="page">
      <h1>Sales</h1>
      <div className="filters">
        <label>From <input type="date" value={range.from} max={range.to} onChange={e => e.target.value && setRange(x => ({ ...x, from: e.target.value }))} /></label>
        <label>To <input type="date" value={range.to} min={range.from} onChange={e => e.target.value && setRange(x => ({ ...x, to: e.target.value }))} /></label>
      </div>
      <ErrorMsg>{error}</ErrorMsg>
      {!r ? (
        <Loading />
      ) : (
        <div className={loading ? 'dim' : ''}>
          <div className="tiles">
            <div className="tile"><span>Revenue</span><strong>{rupees(r.totalRevenue)}</strong></div>
            <div className="tile"><span>Orders</span><strong>{r.totalOrders}</strong></div>
          </div>

          {r.totalOrders === 0 ? (
            <p className="empty">No orders in these dates.</p>
          ) : (
            <>
              <section className="card">
                <h2>Revenue by day</h2>
                <Bars rows={r.byDay} label={d => date(d.date)} value={d => d.revenue} fmt={rupees} />
              </section>

              <section className="card">
                <h2>Rush hours</h2>
                <p className="muted small">Orders placed in each hour of the day.</p>
                <Bars rows={r.byHour} label={h => `${String(h.hour).padStart(2, '0')}:00`} value={h => h.orders} />
              </section>

              <section className="card">
                <h2>Top items</h2>
                <table>
                  <thead><tr><th>Item</th><th className="num">Sold</th><th className="num">Revenue</th></tr></thead>
                  <tbody>
                    {r.topItems.map(t => (
                      <tr key={t.name}><td>{t.name}</td><td className="num">{t.quantity}</td><td className="num">{rupees(t.revenue)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const CATEGORIES = ['snacks', 'meals', 'beverages', 'desserts'];

function ItemForm({ item, onDone }) {
  const save = useSubmit(async (body, form) => {
    await api(item ? 'PATCH' : 'POST', item ? `/menu/${item._id}` : '/menu', body);
    form.reset();
    onDone();
  });

  return (
    <form className="card form" onSubmit={save.onSubmit}>
      <h2>{item ? `Edit ${item.name}` : 'Add a dish'}</h2>
      <div className="form-grid">
        <label>Name<input name="name" defaultValue={item?.name} maxLength={40} required /></label>
        <label>
          Category
          <select name="category" defaultValue={item?.category || 'snacks'}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Price (₹)<input name="price" type="number" min="1" defaultValue={item?.price} required /></label>
        <label>Prep time (min)<input name="prepTimeMinutes" type="number" min="1" defaultValue={item?.prepTimeMinutes ?? 10} required /></label>
        <label>
          Type
          <select name="isVeg" defaultValue={String(item?.isVeg ?? true)}>
            <option value="true">Veg</option>
            <option value="false">Non-veg</option>
          </select>
        </label>
        {item && (
          <label>
            Availability
            <select name="isAvailable" defaultValue={String(item.isAvailable)}>
              <option value="true">Available</option>
              <option value="false">Sold out</option>
            </select>
          </label>
        )}
      </div>
      <ErrorMsg>{save.error}</ErrorMsg>
      <div className="row">
        <button className="primary" disabled={save.busy}>{item ? 'Save changes' : 'Add dish'}</button>
        {item && <button type="button" onClick={() => onDone()}>Cancel</button>}
      </div>
    </form>
  );
}

export function AdminMenu() {
  const { data, error, reload } = useApi('/menu?sort=category,name&limit=200');
  const [editing, setEditing] = useState(null);
  const [delError, setDelError] = useState('');

  const remove = async item => {
    if (!confirm(`Delete ${item.name} from the menu?`)) return;
    try { await api('DELETE', `/menu/${item._id}`); reload(); } catch (e) { setDelError(e.message); }
  };

  return (
    <div className="page">
      <h1>Menu</h1>
      <ItemForm key={editing?._id || 'new'} item={editing} onDone={() => { setEditing(null); reload(); }} />
      <ErrorMsg>{error || delError}</ErrorMsg>
      {!data ? (
        <Loading />
      ) : (
        <ul className="lines">
          {data.data.data.map(item => (
            <li key={item._id} className={item.isAvailable ? '' : 'out'}>
              <DishPhoto item={item} className="thumb" />
              <VegMark veg={item.isVeg} />
              <Link to={`/menu/${item._id}`} className="grow">{item.name}</Link>
              <span className="muted small">{item.category}</span>
              <span className="price">{rupees(item.price)}</span>
              <button className="link" onClick={() => { setEditing(item); window.scrollTo(0, 0); }}>Edit</button>
              <button className="link danger" onClick={() => remove(item)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Users() {
  const { user: me } = useApp();
  const { data, error, reload } = useApi('/users?sort=name&limit=500');
  const [actionError, setActionError] = useState('');

  const run = async (fn, ...args) => {
    setActionError('');
    try { await fn(...args); reload(); } catch (e) { setActionError(e.message); }
  };
  const setRole = (u, role) => run(api, 'PATCH', `/users/${u._id}`, { role });
  const remove = u => confirm(`Delete ${u.name}'s account?`) && run(api, 'DELETE', `/users/${u._id}`);

  if (!data) return error ? <ErrorMsg>{error}</ErrorMsg> : <Loading />;

  return (
    <div className="page">
      <h1>Users</h1>
      <p className="muted">Everyone signs up as a student. Change the role here to make a staff account.</p>
      <ErrorMsg>{actionError}</ErrorMsg>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead>
        <tbody>
          {data.data.data.map(u => (
            <tr key={u._id}>
              <td>{u.name}</td>
              <td className="small">{u.email}</td>
              <td>
                <select value={u.role} disabled={u._id === me._id} onChange={e => setRole(u, e.target.value)} aria-label={`Role for ${u.name}`}>
                  <option>student</option><option>staff</option><option>admin</option>
                </select>
              </td>
              <td>{u._id !== me._id && <button className="link danger" onClick={() => remove(u)}>Delete</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
