import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Registration from './pages/Registration';
import { connectWebSocket } from './wsClient';
import { useEffect } from 'react';

import Home from './pages/Home';
export default function App() {
  

  return (
    <div className="app">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/registration" element={<Registration />} />
        <Route path="/" element={<Navigate to="/login" replace/>}/>
        <Route path="/home" element={<Home/>}/>
        <Route path="*" element={<div>Stranica nije pronađena (404)</div>} />
      </Routes>
    </div>
  );
}