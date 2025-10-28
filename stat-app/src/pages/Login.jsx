import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { connectWebSocket } from '../wsClient';
import {jwtDecode} from 'jwt-decode';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('http://localhost:3001/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Greška pri prijavi');
        return;
      }

      const token = data.token;
      if (!token) {
        setError('Server nije vratio token.');
        return;
      }

      // Spremi token (za razvoj). U produkciji koristi HttpOnly cookie.
      localStorage.setItem('token', token);

      // Opcionalno dekodiranje payloada za UI
      try {
        const payload = jwtDecode(token);
        console.log('JWT payload:', payload);
      } catch (e) {
        console.warn('Ne mogu dekodirati token:', e);
      }

      // Poveži WebSocket i pošalji identify (connectWebSocket šalje identify odmah)
      connectWebSocket(token, (msg) => {
        console.log('WS message (login-level):', msg);
      });

      navigate('/');
    } catch (err) {
      console.error(err);
      setError('Ne mogu se spojiti na server.');
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>Prijava</h2>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ime@primjer.com"
              required
            />
          </label>
          <label>
            Lozinka
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="lozinka"
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button type="submit">Prijavi se</button>
          <p>
            Nemaš račun, <Link to="/registration">registriraj se</Link>
          </p>
        </form>
      </div>
    </div>
  );
}