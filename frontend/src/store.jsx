import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

const Ctx = createContext();
export const useApp = () => useContext(Ctx);

export const HOME = { student: '/menu', staff: '/staff/queue', admin: '/admin/reports' };
export const MAX_LINES = 15;

const readCart = () => {
  try { return JSON.parse(localStorage.getItem('cart')) || []; } catch { return []; }
};

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => !!localStorage.getItem('jwt'));
  const [cart, setCart] = useState(readCart);

  useEffect(() => { localStorage.setItem('cart', JSON.stringify(cart)); }, [cart]);

  useEffect(() => {
    if (localStorage.getItem('jwt')) {
      api('GET', '/users/me')
        .then(d => setUser(d.data.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    const out = () => setUser(null);
    window.addEventListener('ql-logout', out);
    return () => window.removeEventListener('ql-logout', out);
  }, []);

  const login = res => {
    localStorage.setItem('jwt', res.token);
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = () => {
    api('GET', '/users/logout').catch(() => {});
    localStorage.removeItem('jwt');
    setUser(null);
  };

  // Returns an error message, or null when added
  const addToCart = (item, quantity = 1) => {
    const line = cart.find(l => l.menuItem === item._id);
    if (!line && cart.length >= MAX_LINES) return `You can order at most ${MAX_LINES} different items at once.`;
    setCart(c =>
      line
        ? c.map(l => (l.menuItem === item._id ? { ...l, quantity: l.quantity + quantity } : l))
        : [...c, { menuItem: item._id, name: item.name, price: item.price, quantity }]
    );
    return null;
  };

  const setQty = (id, quantity) =>
    setCart(c => (quantity < 1 ? c.filter(l => l.menuItem !== id) : c.map(l => (l.menuItem === id ? { ...l, quantity } : l))));

  return (
    <Ctx.Provider value={{ user, setUser, loading, login, logout, cart, setCart, addToCart, setQty }}>
      {children}
    </Ctx.Provider>
  );
}
