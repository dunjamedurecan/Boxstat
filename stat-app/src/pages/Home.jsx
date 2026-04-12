//import {jwtDecode} from 'jwt-decode';
import {Link} from 'react-router-dom';
import { useEffect,useState } from 'react';
import { onWSMessage, sendWS, closeWS } from '../wsClient';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import "../styles/Home.css";
import QrScannerView from '../components/QrScanner';
import ExpiredToken from '../components/expiredToken';
import Stopwatch from '../components/Stopwatch';

export default function Home(){
    const[ sessionStarted,setSessionStarted]=useState(null);
    const navigate=useNavigate();
    const [qrOn,setQrOn]=useState(false);
    const {user,wsConnected,logout}=useAuth();

    useEffect(() => {
    console.log(user);
    if (!user) return;   // wait for user to load
        setSessionStarted(false);
    
    const unsubscribe=onWSMessage((msg) => {
        if(msg.userId!=user.userId)return;
        if (msg.type === "scan-ok") {
            setSessionStarted(true);
        }

        if (msg.type === "session-end") {
            alert("Prijavljen novi korisnik");
            setSessionStarted(false);
        }
        if (msg.type === "no-active-bag") {
            console.log("Nema aktivne vreće");
            alert("Nema aktivne vreće. Povežite vreću sa serverom i pokušajte ponovo.");
        }
    });
    return ()=>unsubscribe?.();
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

    
    function handleLogout(){
      logout();
    }
    const  handleScan=(payload)=>{ //RADIIIIII
        console.log(payload); 
        setQrOn(false);
        const scan={
            type:"scan",
            bagid:payload.id,
            weight:payload.weight,
            elasticity:payload.elasticity,
        };
        console.log(scan);
        sendWS(scan);
    }
    return(
        <div className="container">
            <p>Ulogiran korisnik: <b id="korisnik">{user ? user.username:"user"}</b></p>
            <div className="button-group">
                <button onClick={handleLogout}>odjava</button>
                <button onClick={handleScansimulation}>
                    simuliray qr kod
                </button>
                 {sessionStarted && ( <button onClick={endSession}>Stop</button>)
            }
             <Link to="/data">
            <button>Prikaz podataka</button>
        </Link>

           {qrOn ? <button onClick={()=>setQrOn(false)}>Zatvori qr skener</button> : <button onClick={()=>setQrOn(true)}>Otvori qr skener</button>}
            </div>
              <div className={`status-card ${sessionStarted ? "active" : ""}`}>
            {sessionStarted
                ? (<div><Stopwatch running={true} resetKey={0}></Stopwatch></div>)
                : ("Nema aktivne sesije")}
        </div>
           {qrOn && <QrScannerView onScanned={handleScan}/>}
        </div>
        
       
       
    )
}