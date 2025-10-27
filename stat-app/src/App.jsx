import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Registration from "./pages/Registration";

export default function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/registration" element={<Registration />} />
        {/* Preusmjeri root na /login */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        {/* Opcionalno: 404 */}
        <Route path="*" element={<div>Stranica nije pronađena (404)</div>} />
      </Routes>
    </div>
  );
}