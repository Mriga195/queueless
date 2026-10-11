import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { HOME, useApp } from '../store';
import { ErrorMsg, useSubmit } from '../ui';

const SAMPLES = ['student', 'staff', 'admin'];

export function Login() {
  const { login } = useApp();
  const navigate = useNavigate();
  const from = useLocation().state?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, onSubmit } = useSubmit(async body => {
    const user = login(await api('POST', '/users/login', body));
    navigate(from || HOME[user.role], { replace: true });
  });

  return (
    <form className="card form narrow" onSubmit={onSubmit}>
      <h1>Log in</h1>
      <label>Email<input name="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <ErrorMsg>{error}</ErrorMsg>
      <button className="primary" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      <p className="muted small">
        <Link to="/forgot-password">Forgot your password?</Link> · New here? <Link to="/signup">Sign up</Link>
      </p>
      <p className="muted small">
        Demo accounts:{' '}
        {SAMPLES.map(r => (
          <button key={r} type="button" className="link" onClick={() => { setEmail(`${r}@queueless.dev`); setPassword('test1234'); }}>
            {r}
          </button>
        ))}
      </p>
    </form>
  );
}

export function Signup() {
  const { login } = useApp();
  const navigate = useNavigate();
  const { busy, error, onSubmit } = useSubmit(async body => {
    if (body.password !== body.passwordConfirm) throw new Error('The two passwords are not the same.');
    login(await api('POST', '/users/signup', body));
    navigate('/menu', { replace: true });
  });

  return (
    <form className="card form narrow" onSubmit={onSubmit}>
      <h1>Sign up</h1>
      <p className="muted">Order from the canteen and pick up when it's ready.</p>
      <label>Name<input name="name" autoComplete="name" required /></label>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
      <label>Confirm password<input name="passwordConfirm" type="password" minLength={8} autoComplete="new-password" required /></label>
      <ErrorMsg>{error}</ErrorMsg>
      <button className="primary" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      <p className="muted small">Already have an account? <Link to="/login">Log in</Link></p>
    </form>
  );
}

export function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const { busy, error, onSubmit } = useSubmit(async body => {
    await api('POST', '/users/forgotPassword', body);
    setSent(true);
  });

  if (sent) return <div className="card narrow"><h1>Check your email</h1><p>We sent a reset link. Look in spam too. The link works for 10 minutes.</p></div>;
  return (
    <form className="card form narrow" onSubmit={onSubmit}>
      <h1>Reset your password</h1>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <ErrorMsg>{error}</ErrorMsg>
      <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
    </form>
  );
}

export function ResetPassword() {
  const { token } = useParams();
  const { login } = useApp();
  const navigate = useNavigate();
  const { busy, error, onSubmit } = useSubmit(async body => {
    if (body.password !== body.passwordConfirm) throw new Error('The two passwords are not the same.');
    const user = login(await api('PATCH', `/users/resetPassword/${token}`, body));
    navigate(HOME[user.role], { replace: true });
  });

  return (
    <form className="card form narrow" onSubmit={onSubmit}>
      <h1>Choose a new password</h1>
      <label>New password<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
      <label>Confirm password<input name="passwordConfirm" type="password" minLength={8} autoComplete="new-password" required /></label>
      <ErrorMsg>{error}</ErrorMsg>
      {error && <p className="small"><Link to="/forgot-password">Send a new link</Link></p>}
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save and log in'}</button>
    </form>
  );
}
