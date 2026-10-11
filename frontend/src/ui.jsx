import { useState } from 'react';
import { img } from './api';

export const VegMark = ({ veg }) => (
  <span className={`mark ${veg ? 'veg' : 'nonveg'}`} role="img" aria-label={veg ? 'Veg' : 'Non-veg'} title={veg ? 'Veg' : 'Non-veg'} />
);

export const Loading = ({ text = 'Loading…' }) => <p className="muted pad">{text}</p>;

export const ErrorMsg = ({ children }) => (children ? <p className="error" role="alert">{children}</p> : null);

export const Status = ({ s }) => <span className={`badge s-${s}`}>{s}</span>;

export const time = d => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const date = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

// Pull { field: value } out of a form submit event
export const formData = e => {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget));
};

// Form submit with busy/error state; fn gets the fields and the form element
export function useSubmit(fn) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onSubmit = async e => {
    const form = e.currentTarget;
    const body = formData(e);
    setBusy(true);
    setError('');
    try { await fn(body, form); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return { busy, error, setError, onSubmit };
}

const initials = name => name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export const DishPhoto = ({ item, className = '' }) => (
  <div className={`dish-ph ph-${item.category} ${className}`} role="img" aria-label={item.name}>{initials(item.name)}</div>
);

export const Avatar = ({ user, className = '' }) =>
  user.photo && user.photo !== 'default.jpg' ? (
    <img src={img('users', user.photo)} alt="" className={className} />
  ) : (
    <span className={`avatar-ph ${className}`} aria-hidden="true">{initials(user.name)}</span>
  );
