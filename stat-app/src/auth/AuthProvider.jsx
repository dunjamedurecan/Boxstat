import React, {createContext, useContext, useEffect, useMemo, useState} from "react";
import { jwtDecode } from "jwt-decode";
import { closeWS, connectWebSocket } from "../wsClient";

const AuthCtx=createContext(null);

export function AuthProvider({children}){
    const [token,setToken]=useState(()=>localStorage.getItem("token"));
    const [user,setUser]=useState(null);
    const [wsConnected, setWsConnected]=useState(false);

    const [authReady, setAuthReady]=useState(false)

    useEffect(()=>{
        if(!token){
            setUser(null);
            setAuthReady(true);
            return;
        }
        try{
            setUser(jwtDecode(token));
        }catch{
            setUser(null);
            localStorage.removeItem("token");
            setToken(null);
            setUser(null);
        }finally{
            setAuthReady(true);
        }
    },[token]);

    useEffect(()=>{
        if(!token){
            closeWS()
            setWsConnected(false);
            return;
        }
        connectWebSocket(token,
            ()=>setWsConnected(true),
        ()=>setWsConnected(false),
    ()=>setWsConnected(false));

    return ()=>{
        closeWS();
    };
},[token]);

    const value=useMemo(()=>({
        token,
        user,
        wsConnected,
        authReady,
        isAuthed: !!user,
        setToken: (t)=>{
            if(!t)localStorage.removeItem("token");
            else localStorage.setItem("token",t);
            setToken(t);
            setAuthReady(false);
        },
        logout:()=>{
            closeWS();
            localStorage.removeItem("token");
            setToken(null);
            setWsConnected(false);
            setAuthReady(true);
            setUser(null);
        }
    }),[token,user,wsConnected]);
    return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth(){
    const ctx=useContext(AuthCtx);
    if(!ctx)throw new Error("useAUth must be used inside AuthProvider");
    return ctx;
}