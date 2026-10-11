import { useState } from 'react';
import { api, rupees, useApi } from '../api';
import { ErrorMsg, Loading, VegMark, time, useSubmit } from '../ui';

const POLL = 10000;

const COLUMNS = [
  ['paid', 'New', 'preparing', 'Start preparing'],
  ['preparing', 'Preparing', 'ready', 'Mark ready'],
  ['ready', 'Ready for pickup', 'collected', 'Collect']
];

function OrderCard({ order, next, label, onDone }) {
  const move = useSubmit(async body => {
    await api('PATCH', `/orders/${order._id}/status`, { status: next, pickupCode: body.pickupCode });
    onDone();
  });

  return (
    <li className="qcard">
      <div className="row between">
        <strong className="mono">{time(order.createdAt)}</strong>
        <span>{order.user?.name || 'Deleted user'}</span>
      </div>
      <ul>
        {order.items.map(l => <li key={l.menuItem}><strong>{l.quantity} ×</strong> {l.name}</li>)}
      </ul>
      <div className="muted">{rupees(order.totalAmount)}</div>
      <form className="row" onSubmit={move.onSubmit}>
        {next === 'collected' && (
          <input
            name="pickupCode"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            placeholder="Code"
            aria-label="Pickup code from the student"
            className="code-input"
            required
          />
        )}
        <button className="primary grow" disabled={move.busy}>{label}</button>
      </form>
      <ErrorMsg>{move.error}</ErrorMsg>
    </li>
  );
}

export function Queue() {
  const active = useApi('/orders/queue', POLL);
  const ready = useApi('/orders/queue?status=ready', POLL);
  const all = [...(active.data?.data.data || []), ...(ready.data?.data.data || [])];
  const reload = () => { active.reload(); ready.reload(); };

  if (!active.data && !ready.data && !active.error) return <Loading text="Loading the queue…" />;

  return (
    <div className="board-page">
      <div className="row between">
        <h1>Order queue</h1>
        <span className="muted">Oldest first · refreshes every {POLL / 1000} s</span>
      </div>
      <ErrorMsg>{active.error || ready.error}</ErrorMsg>
      <div className="board">
        {COLUMNS.map(([status, title, next, label]) => {
          const orders = all.filter(o => o.status === status);
          return (
            <section key={status} className={`col col-${status}`}>
              <h2>{title} <span className="count">{orders.length}</span></h2>
              {orders.length === 0 ? (
                <p className="empty">Nothing here.</p>
              ) : (
                <ul>
                  {orders.map(o => <OrderCard key={o._id} order={o} next={next} label={label} onDone={reload} />)}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function Availability() {
  const { data, error, reload } = useApi('/menu?sort=category,name&limit=200');
  const [busy, setBusy] = useState(null);
  const [toggleError, setToggleError] = useState('');

  const toggle = async item => {
    setBusy(item._id);
    setToggleError('');
    try {
      await api('PATCH', `/menu/${item._id}`, { isAvailable: !item.isAvailable });
      await reload();
    } catch (e) {
      setToggleError(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (!data) return error ? <ErrorMsg>{error}</ErrorMsg> : <Loading />;
  const items = data.data.data;

  return (
    <div className="page narrow">
      <h1>What's available today</h1>
      <p className="muted">Sold-out items are hidden from students.</p>
      <ErrorMsg>{toggleError}</ErrorMsg>
      <ul className="lines">
        {items.map(item => (
          <li key={item._id} className={item.isAvailable ? '' : 'out'}>
            <VegMark veg={item.isVeg} />
            <span className="grow">{item.name} <span className="muted small">{item.category}</span></span>
            <label className="switch">
              <input type="checkbox" checked={item.isAvailable} disabled={busy === item._id} onChange={() => toggle(item)} />
              <span>{item.isAvailable ? 'Available' : 'Sold out'}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
