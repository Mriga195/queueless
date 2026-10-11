import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './store';
import { rupees, useWaking } from './api';
import { Avatar, Loading } from './ui';
import { Login, Signup, ForgotPassword, ResetPassword } from './pages/auth';
import { Menu, MenuItem } from './pages/menu';
import { Cart, MyOrders, OrderDetail, Profile } from './pages/student';
import { Queue, Availability } from './pages/staff';
import { Reports, AdminMenu, Users } from './pages/admin';

const LINKS = {
  student: [['/menu', 'Menu'], ['/orders', 'My orders']],
  staff: [['/staff/queue', 'Queue'], ['/staff/menu', 'Availability'], ['/menu', 'Menu']],
  admin: [['/admin/reports', 'Sales'], ['/admin/menu', 'Menu'], ['/admin/users', 'Users']]
};

function Navbar() {
  const { user, logout } = useApp();
  return (
    <header className="nav">
      <Link to="/" className="brand">Queue<span>Less</span></Link>
      <nav>
        {(user ? LINKS[user.role] : [['/menu', 'Menu']]).map(([to, label]) => (
          <NavLink key={to} to={to}>{label}</NavLink>
        ))}
      </nav>
      <div className="nav-user">
        {user ? (
          <>
            <Link to="/me" className="me" title="Your profile">
              <Avatar user={user} />
              <span>{user.name.split(' ')[0]}</span>
            </Link>
            <button className="link" onClick={logout}>Log out</button>
          </>
        ) : (
          <NavLink to="/login">Log in</NavLink>
        )}
      </div>
    </header>
  );
}

function CartBar() {
  const { user, cart } = useApp();
  const { pathname } = useLocation();
  if (user?.role !== 'student' || !cart.length || pathname === '/cart') return null;
  const count = cart.reduce((n, l) => n + l.quantity, 0);
  const total = cart.reduce((n, l) => n + l.price * l.quantity, 0);
  return (
    <Link to="/cart" className="cartbar">
      <span>{count} item{count > 1 ? 's' : ''} · {rupees(total)}</span>
      <strong>View cart</strong>
    </Link>
  );
}

function Waking() {
  return useWaking() ? (
    <div className="waking" role="status">Waking up the server… the first request can take up to a minute.</div>
  ) : null;
}

function Guard({ roles, children }) {
  const { user, loading } = useApp();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

const only = (roles, el) => <Guard roles={roles}>{el}</Guard>;

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Navbar />
        <Waking />
        <main>
          <Routes>
            <Route path="/" element={<Menu />} />
            <Route path="/menu" element={<Menu />} />
            <Route path="/menu/:id" element={<MenuItem />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
            <Route path="/cart" element={only(['student'], <Cart />)} />
            <Route path="/orders" element={only(['student'], <MyOrders />)} />
            <Route path="/orders/:id" element={only(['student', 'admin'], <OrderDetail />)} />
            <Route path="/me" element={only(null, <Profile />)} />
            <Route path="/staff/queue" element={only(['staff'], <Queue />)} />
            <Route path="/staff/menu" element={only(['staff'], <Availability />)} />
            <Route path="/admin/reports" element={only(['admin'], <Reports />)} />
            <Route path="/admin/menu" element={only(['admin'], <AdminMenu />)} />
            <Route path="/admin/users" element={only(['admin'], <Users />)} />
            <Route path="*" element={<p className="pad">This page doesn't exist. <Link to="/menu">Back to the menu</Link></p>} />
          </Routes>
        </main>
        <CartBar />
      </AppProvider>
    </BrowserRouter>
  );
}
