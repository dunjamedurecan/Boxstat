import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Registration from './pages/Registration';
import { connectWebSocket } from './wsClient';
import { useEffect } from 'react';
import Start from './pages/Start';
import Data from './pages/Data';
import Home from './pages/Home';
import BagQRGenerator from './pages/BagQRGenerator';
export default function App() {
  

  return (
    <div className="app">
      <Routes>
        <Route path="/start" element={<Start/>}/>
        <Route path="/login" element={<Login />} />
        <Route path="/registration" element={<Registration />} />
        <Route path="/" element={<Navigate to="/start" replace/>}/>
        <Route path="/home" element={<Home/>}/>
        <Route path="/data" element={<Data/>}/>
        <Route path="/bag-qr" element={<BagQRGenerator/>}/>
        <Route path="*" element={<div>Stranica nije pronađena (404)</div>} />
      </Routes>
    </div>
  );
}