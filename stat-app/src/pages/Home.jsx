import {jwtDecode} from 'jwt-decode';
import {Link} from 'react-router-dom';
import { useEffect,useState } from 'react';
import { connectWebSocket, onWSMessage, sendWS, closeWS } from '../wsClient';
import { useNavigate } from 'react-router-dom';
import "../styles/Home.css";

export default function Home(){
    const[ sessionStarted,setSessionStarted]=useState(null);
    const [user,setUser]=useState(null);
    const[token,setToken]=useState(null)
    const navigate=useNavigate();

    useEffect(()=>{ 
        setSessionStarted(false);
        const token1=localStorage.getItem('token');
        if(!token1){
            navigate("/login");
            return;
        }
        setToken(token1)
        try{
            const payload=jwtDecode(token1);
            setUser(payload);
            console.log(user);
        }catch(e){
            console.warn("Ne mogu dekodirati token");
        }
        
        connectWebSocket(token1);
        
    },[]);
    useEffect(() => {
    console.log(user);
    if (!user) return;   // wait for user to load
        setSessionStarted(false);
    
    onWSMessage((msg) => {
        //console.log("Primljeno od servera:", msg);
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

    
    function handleLogout(){
        localStorage.removeItem("token");
        setUser(null);
        setToken(null);
        setSessionStarted(false);
        closeWS()
        navigate("/login");
        
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
            </div>
              <div className={`status-card ${sessionStarted ? "active" : ""}`}>
            {sessionStarted
                ? "Sesija je aktivna"
                : "Nema aktivne sesije"}
        </div>
           
        </div>
       
    )
}