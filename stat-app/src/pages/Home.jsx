import {jwtDecode} from 'jwt-decode';
import {Link} from 'react-router-dom';
import { useEffect,useState } from 'react';
import { connectWebSocket, onWSMessage, sendWS } from '../wsClient';

export default function Home(){
    const[ sessionStarted,setSessionStarted]=useState(null);
    const [user,setUser]=useState(null);
    const[token,setToken]=useState(null)
    useEffect(()=>{ 
        setSessionStarted(false);
        const token1=localStorage.getItem('token');
        setToken(token1)
        try{
            const payload=jwtDecode(token1);
            setUser(payload);
            console.log(user);
        }catch(e){
            console.warn("Ne mogu dekodirati token");
        }
        
        
    },[]);
    useEffect(() => {
    console.log(user);
    if (!user) return;   // wait for user to load
        setSessionStarted(false);
    onWSMessage((msg) => {
        console.log("Primljeno od servera:", msg);
        if(msg.userId!=user.userId)return;
        if (msg.type === "scan-ok") {
            setSessionStarted(true);
        }

        if (msg.type === "session-end") {
            alert("Prijavljen novi korisnik");
            setSessionStarted(false);
        }
    });
}, [user]);

    function handleScansimulation(){
        const payload={
            type:"scan",
            bagid:1111,
            weight:20,
            elasticity:0.88,
        };
        sendWS(payload);
        console.log("Poslano na ws: ",payload);
       // setSessionStarted(true)
       // console.log(sessionStarted);
    }

    function endSession(){
        const payload={
            type:"end-session",
        };
        sendWS(payload);
        console.log("Poslano na ws: ",payload);
        setSessionStarted(false);
    }
    
    return(
        <div className="container">
            <p>Ulogiran korisnik: <b id="korisnik">{user ? user.username:"user"}</b></p>
            <Link to="/login">odjava</Link>
            <button onClick={handleScansimulation}>
                simuliray qr kod
            </button>
            {sessionStarted && ( <button onClick={endSession}>Stop</button>)
            }
        </div>
    )
}