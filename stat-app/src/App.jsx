import { Routes, Route, Navigate,BrowserRouter } from 'react-router-dom';
import Login from './pages/Login';
import Registration from './pages/Registration';
import Start from './pages/Start';
import Data from './pages/Data';
import Home from './pages/Home';
import BagQRGenerator from './pages/BagQRGenerator';
import { AuthProvider } from './auth/AuthProvider';
import ProtectedRoute from './auth/ProtectedRoute';
export default function App() {
  

  return (
    <div className="app">
        <AuthProvider>
          <Routes>
            <Route path="/bag-qr" element={<BagQRGenerator/>}/>
            <Route path="/start" element={<Start/>}/>
             <Route path="*" element={<div>Stranica nije pronađena (404)</div>} />
            <Route path="/login" element={<Login />} />
            <Route path="/registration" element={<Registration />} />
            <Route path="/" element={<Navigate to="/start" replace/>}/>
            <Route element={<ProtectedRoute requireWs={true}/>}>
            <Route path="/home" element={<Home/>}/>
            <Route path="/data" element={<Data/>}/>
          </Route>
          </Routes>
          
        </AuthProvider>
    </div>
  );
}