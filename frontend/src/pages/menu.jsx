import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, rupees, useApi } from '../api';
import { useApp } from '../store';
import { DishPhoto, ErrorMsg, Loading, VegMark, date, useSubmit } from '../ui';

const CATEGORIES = ['snacks', 'meals', 'beverages', 'desserts'];
const LIMIT = 12;
const HOURS = ['08:00', '18:00'];

const canteenOpen = () => {
  const now = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return now >= HOURS[0] && now < HOURS[1];
};

export function HoursBanner() {
  const open = canteenOpen();
  return (
    <p className={`hours ${open ? 'open' : 'closed'}`}>
      Canteen open {HOURS[0]}–{HOURS[1]} · <strong>{open ? 'Open now' : 'Closed now, orders open at ' + HOURS[0]}</strong>
    </p>
  );
}

function AddButton({ item, quantity = 1 }) {
  const { addToCart } = useApp();
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 1500);
    return () => clearTimeout(t);
  }, [msg]);
  if (!item.isAvailable) return <span className="soldout">Sold out</span>;
  return (
    <>
      <button
        className={`primary add ${msg === 'added' ? 'pop' : ''}`}
        onClick={() => setMsg(addToCart(item, quantity) || 'added')}
      >
        {msg === 'added' ? 'Added' : 'Add to cart'}
      </button>
      {msg && msg !== 'added' && <ErrorMsg>{msg}</ErrorMsg>}
    </>
  );
}

const Stars = ({ item }) =>
  item.ratingsQuantity ? (
    <span className="stars">★ {item.ratingsAverage} <span className="muted">({item.ratingsQuantity})</span></span>
  ) : (
    <span className="muted">No ratings yet</span>
  );

export function Menu() {
  const { user } = useApp();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page')) || 1;

  const query = new URLSearchParams(params);
  query.set('limit', LIMIT);
  const { data, loading, error } = useApi(`/menu?${query}`);
  const items = data?.data.data || [];

  // Any filter change goes back to page 1
  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  return (
    <div className="page">
      <h1>Skip the lunch queue.</h1>
      <p className="lead">Order now, pick up when it's ready.</p>
      <HoursBanner />

      <div className="tabs" role="tablist">
        {['', ...CATEGORIES].map(c => (
          <button key={c} role="tab" aria-selected={(params.get('category') || '') === c} onClick={() => set('category', c)}>
            {c || 'All'}
          </button>
        ))}
      </div>

      <div className="filters">
        <form onSubmit={e => { e.preventDefault(); set('search', e.currentTarget.search.value.trim()); }}>
          <input name="search" type="search" placeholder="Search dosa, chai…" defaultValue={params.get('search') || ''} aria-label="Search the menu" />
        </form>
        <label className="check">
          <input type="checkbox" checked={params.get('isVeg') === 'true'} onChange={e => set('isVeg', e.target.checked && 'true')} />
          Veg only
        </label>
        <select aria-label="Maximum price" value={params.get('price[lte]') || ''} onChange={e => set('price[lte]', e.target.value)}>
          <option value="">Any price</option>
          {[30, 60, 100].map(p => <option key={p} value={p}>Up to {rupees(p)}</option>)}
        </select>
        <select aria-label="Sort" value={params.get('sort') || ''} onChange={e => set('sort', e.target.value)}>
          <option value="">Sort: default</option>
          <option value="price">Price: low to high</option>
          <option value="-price">Price: high to low</option>
          <option value="-ratingsAverage">Top rated</option>
        </select>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      {loading && !data ? (
        <Loading text="Loading the menu…" />
      ) : items.length === 0 ? (
        <p className="empty">Nothing matches. Try another category or clear the search.</p>
      ) : (
        <div className={`grid ${loading ? 'dim' : ''}`}>
          {items.map(item => (
            <article key={item._id} className={`item ${item.isAvailable ? '' : 'out'}`}>
              <Link to={`/menu/${item._id}`}><DishPhoto item={item} /></Link>
              <div className="item-body">
                <h3><VegMark veg={item.isVeg} /> <Link to={`/menu/${item._id}`}>{item.name}</Link></h3>
                <p className="meta"><span className="cap">{item.category}</span> · {item.prepTimeMinutes} min · <Stars item={item} /></p>
                <div className="item-foot">
                  <span className="price">{rupees(item.price)}</span>
                  {user?.role === 'student' ? <AddButton item={item} /> : !item.isAvailable && <span className="soldout">Sold out</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="pager">
        <button disabled={page <= 1} onClick={() => set('page', page - 1)}>Previous</button>
        <span>Page {page}</span>
        <button disabled={items.length < LIMIT} onClick={() => set('page', page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function MenuItem() {
  const { id } = useParams();
  const { user } = useApp();
  const { data, error, reload } = useApi(`/menu/${id}`);
  const [qty, setQty] = useState(1);
  const [deleteError, setDeleteError] = useState('');
  const rate = useSubmit(async (body, form) => {
    await api('POST', `/menu/${id}/ratings`, { rating: Number(body.rating), comment: body.comment || undefined });
    form.reset();
    reload();
  });

  if (error) return <div className="page"><ErrorMsg>{error}</ErrorMsg><Link to="/menu">Back to the menu</Link></div>;
  if (!data) return <Loading />;
  const item = data.data.data;
  const ratings = item.ratings || [];

  const removeRating = async rid => {
    if (!confirm('Delete this rating?')) return;
    try { await api('DELETE', `/ratings/${rid}`); reload(); } catch (e) { setDeleteError(e.message); }
  };

  return (
    <div className="page">
      <Link to="/menu" className="back">← Menu</Link>
      <div className="detail">
        <DishPhoto item={item} className="hero" />
        <div>
          <h1><VegMark veg={item.isVeg} /> {item.name}</h1>
          <p className="meta"><span className="cap">{item.category}</span> · ready in about {item.prepTimeMinutes} min · <Stars item={item} /></p>
          <p className="price big">{rupees(item.price)}</p>
          {user?.role === 'student' && (
            <div className="row">
              {item.isAvailable && (
                <div className="qty">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Less">−</button>
                  <span>{qty}</span>
                  <button onClick={() => setQty(q => q + 1)} aria-label="More">+</button>
                </div>
              )}
              <AddButton item={item} quantity={qty} />
            </div>
          )}
        </div>
      </div>

      <section id="rate">
        <h2>Ratings</h2>
        {user?.role === 'student' && (
          <form className="card form" onSubmit={rate.onSubmit}>
            <h3>Rate this item</h3>
            <p className="muted small">You can rate an item once, after you've collected it.</p>
            <label>
              Rating
              <select name="rating" defaultValue="5">
                {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{'★'.repeat(n)} ({n})</option>)}
              </select>
            </label>
            <label>Comment (optional)<textarea name="comment" maxLength={300} rows={2} /></label>
            <ErrorMsg>{rate.error}</ErrorMsg>
            <button className="primary" disabled={rate.busy}>Post rating</button>
          </form>
        )}
        <ErrorMsg>{deleteError}</ErrorMsg>
        {ratings.length === 0 ? (
          <p className="empty">No ratings yet.</p>
        ) : (
          <ul className="ratings">
            {ratings.map(r => (
              <li key={r._id}>
                <strong>{'★'.repeat(r.rating)}</strong> <span className="muted">{r.user?.name} · {date(r.createdAt)}</span>
                {r.comment && <p>{r.comment}</p>}
                {user?.role === 'admin' && <button className="link danger" onClick={() => removeRating(r._id)}>Delete</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
