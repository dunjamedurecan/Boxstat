import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export default function ProtectedRoute({requireWs=false}){
    const {authReady,isAuthed, wsConnected}=useAuth();
    const loc=useLocation()
    if(!authReady){
        return <div>Učitavanje...</div>;
    }
    if(!isAuthed){
        return <Navigate to="/start" replace state={{from: loc.pathname}}/>;
    }
    if(requireWs && !wsConnected){
        return <div>Spajanje na server...</div>;
    }
    return <Outlet/>
}