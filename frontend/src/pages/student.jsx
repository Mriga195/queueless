import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, rupees, useApi } from '../api';
import { useApp } from '../store';
import { Avatar, ErrorMsg, Loading, Status, date, time, useSubmit } from '../ui';
import { HoursBanner } from './menu';

const total = lines => lines.reduce((n, l) => n + l.price * l.quantity, 0);

export function Cart() {
  const { cart, setCart, setQty } = useApp();
  const navigate = useNavigate();
  const checkout = useSubmit(async () => {
    const res = await api('POST', '/orders/checkout-session', {
      items: cart.map(({ menuItem, quantity }) => ({ menuItem, quantity }))
    });
    setCart([]);
    const order = res.data?.data;
    if (order) navigate(`/orders/${order._id}`); // demo mode: order exists already
    else window.location = res.session.url; // Razorpay
  });

  if (!cart.length)
    return (
      <div className="page narrow">
        <h1>Your cart is empty</h1>
        <p><Link to="/menu">Pick something from the menu</Link></p>
      </div>
    );

  return (
    <div className="page narrow">
      <h1>Your cart</h1>
      <HoursBanner />
      <section className="card receipt">
      <ul className="lines">
        {cart.map(l => (
          <li key={l.menuItem}>
            <Link to={`/menu/${l.menuItem}`} className="grow">{l.name}</Link>
            <div className="qty">
              <button onClick={() => setQty(l.menuItem, l.quantity - 1)} aria-label={`One less ${l.name}`}>−</button>
              <span>{l.quantity}</span>
              <button onClick={() => setQty(l.menuItem, l.quantity + 1)} aria-label={`One more ${l.name}`}>+</button>
            </div>
            <span className="price">{rupees(l.price * l.quantity)}</span>
            <button className="link danger" onClick={() => setQty(l.menuItem, 0)}>Remove</button>
          </li>
        ))}
      </ul>
      <p className="total">Total <strong>{rupees(total(cart))}</strong></p>
      </section>
      <p className="muted small">Prices are checked again when you pay.</p>
      <form onSubmit={checkout.onSubmit}>
        <ErrorMsg>{checkout.error}</ErrorMsg>
        <button className="primary wide" disabled={checkout.busy}>{checkout.busy ? 'Placing order…' : `Pay ${rupees(total(cart))}`}</button>
      </form>
    </div>
  );
}

export function MyOrders() {
  const [params] = useSearchParams();
  const paid = params.get('payment') === 'success';
  const [since] = useState(() => Date.now() - 2 * 60 * 1000);
  const { addToCart } = useApp();
  const navigate = useNavigate();
  const [againError, setAgainError] = useState('');

  // Razorpay's webhook creates the order a few seconds after payment; poll until it shows
  const [waiting, setWaiting] = useState(paid);
  const res = useApi('/orders/my-orders?sort=-createdAt', waiting ? 4000 : undefined);
  const orders = res.data?.data.data || [];
  if (waiting && orders.some(o => new Date(o.createdAt) > since)) setWaiting(false);

  const orderAgain = o => {
    for (const l of o.items) {
      const err = addToCart({ _id: l.menuItem, name: l.name, price: l.price }, l.quantity);
      if (err) return setAgainError(err);
    }
    navigate('/cart');
  };

  return (
    <div className="page narrow">
      <h1>My orders</h1>
      {waiting && <p className="notice">Payment received. Your order will appear here in a moment.</p>}
      <ErrorMsg>{res.error || againError}</ErrorMsg>
      {res.loading && !res.data ? (
        <Loading />
      ) : orders.length === 0 ? (
        <p className="empty">No orders yet. <Link to="/menu">See what's on the menu</Link></p>
      ) : (
        <ul className="orders">
          {orders.map(o => (
            <li key={o._id} className="card">
              <Link to={`/orders/${o._id}`} className="order-head">
                <span>{date(o.createdAt)}, {time(o.createdAt)}</span>
                <Status s={o.status} />
              </Link>
              <p>{o.items.map(l => `${l.quantity} × ${l.name}`).join(', ')}</p>
              <div className="row between">
                <strong>{rupees(o.totalAmount)}</strong>
                <span>
                  {['paid', 'preparing', 'ready'].includes(o.status) && <Link to={`/orders/${o._id}`}>Show pickup code</Link>}
                  {['collected', 'cancelled'].includes(o.status) && <button className="link" onClick={() => orderAgain(o)}>Order again</button>}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const STEPS = [
  ['paid', 'Order received'],
  ['preparing', 'Kitchen started'],
  ['ready', 'Ready to collect'],
  ['collected', 'Collected']
];

const MESSAGE = {
  paid: 'The kitchen has your order. You can still cancel until they start.',
  preparing: 'The kitchen started your order.',
  ready: 'Your order is ready. Show this code at the counter.',
  collected: 'Collected. Enjoy your food.',
  cancelled: 'This order was cancelled and the payment refunded.'
};

export function OrderDetail() {
  const { id } = useParams();
  const { user } = useApp();
  const [status, setStatus] = useState(null);
  const live = !status || ['paid', 'preparing'].includes(status);
  const { data, error, reload } = useApi(`/orders/${id}`, live ? 12000 : undefined);
  const order = data?.data.data;
  if (order && order.status !== status) setStatus(order.status);

  const cancel = useSubmit(async () => {
    if (!confirm('Cancel this order? Your payment will be refunded.')) return;
    await api('PATCH', `/orders/${id}/cancel`);
    reload();
  });

  if (error && !order) return <div className="page"><ErrorMsg>{error}</ErrorMsg></div>;
  if (!order) return <Loading />;
  const step = STEPS.findIndex(([s]) => s === order.status);

  return (
    <div className="page narrow">
      {user.role === 'student' && <Link to="/orders" className="back">← My orders</Link>}

      {order.pickupCode && order.status !== 'cancelled' && (
        <div className={`ticket ${order.status}`}>
          <div className="ticket-top">
            <span>QueueLess token</span>
            <span className="mono">{date(order.createdAt)} · {time(order.createdAt)}</span>
          </div>
          <div className="ticket-main">
            <span>Pickup code</span>
            <div className="code" aria-label={`Pickup code ${order.pickupCode.split('').join(' ')}`}>{order.pickupCode}</div>
          </div>
          <div className="perf" aria-hidden="true" />
          <div className="ticket-bottom">
            <span>Show this at the counter</span>
            <strong className="mono">{rupees(order.totalAmount)}</strong>
          </div>
        </div>
      )}

      <section className="card">
        <p className={`status-msg s-${order.status}`} aria-live="polite">{MESSAGE[order.status]}</p>
        {order.status !== 'cancelled' && (
          <ol className="steps">
            {STEPS.map(([s, label], i) => (
              <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>{label}</li>
            ))}
          </ol>
        )}
      </section>

      <section className="card receipt">
        <h2>Your order</h2>
        <ul className="lines">
          {order.items.map(l => (
            <li key={l.menuItem}>
              <span className="grow"><strong className="mono">{l.quantity} ×</strong> {l.name}</span>
              <span className="price">{rupees(l.price * l.quantity)}</span>
              {order.status === 'collected' && user.role === 'student' && <Link to={`/menu/${l.menuItem}#rate`}>Rate</Link>}
            </li>
          ))}
        </ul>
        <p className="total">Total <strong>{rupees(order.totalAmount)}</strong></p>
      </section>
      {user.role === 'admin' && <p className="muted">Ordered by {order.user?.name}</p>}

      {order.status === 'paid' && (
        <form onSubmit={cancel.onSubmit}>
          <ErrorMsg>{cancel.error}</ErrorMsg>
          <button className="danger-btn" disabled={cancel.busy}>{cancel.busy ? 'Cancelling…' : 'Cancel order'}</button>
        </form>
      )}
    </div>
  );
}

export function Profile() {
  const { user, setUser, login } = useApp();
  const [saved, setSaved] = useState('');
  const details = useSubmit(async (_, form) => {
    const body = new FormData(form);
    if (!body.get('photo')?.size) body.delete('photo');
    const res = await api('PATCH', '/users/updateMe', body);
    setUser(res.data.user);
    setSaved('Profile saved.');
  });
  const password = useSubmit(async (body, form) => {
    if (body.password !== body.passwordConfirm) throw new Error('The two new passwords are not the same.');
    login(await api('PATCH', '/users/updateMyPassword', body));
    form.reset();
    setSaved('Password changed.');
  });

  return (
    <div className="page narrow">
      <h1>Your profile</h1>
      {saved && <p className="notice">{saved}</p>}
      <form className="card form" onSubmit={details.onSubmit}>
        <div className="row">
          <Avatar user={user} className="avatar" />
          <label className="grow">Photo<input name="photo" type="file" accept="image/*" /></label>
        </div>
        <label>Name<input name="name" defaultValue={user.name} required /></label>
        <label>Email<input name="email" type="email" defaultValue={user.email} required /></label>
        <ErrorMsg>{details.error}</ErrorMsg>
        <button className="primary" disabled={details.busy}>Save</button>
      </form>

      <form className="card form" onSubmit={password.onSubmit}>
        <h2>Change password</h2>
        <label>Current password<input name="passwordCurrent" type="password" autoComplete="current-password" required /></label>
        <label>New password<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
        <label>Confirm new password<input name="passwordConfirm" type="password" minLength={8} autoComplete="new-password" required /></label>
        <ErrorMsg>{password.error}</ErrorMsg>
        <button className="primary" disabled={password.busy}>Change password</button>
      </form>
    </div>
  );
}
