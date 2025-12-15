// na zahtjev (šalje poruku serveru) povlači nove podatke o sesijama (treninzima) i ispisuje ih 
// prvi put download data
// kasnije refresh data
import {jwtDecode} from 'jwt-decode';
import {Link} from 'react-router-dom';
import { useEffect,useState } from 'react';
import { connectWebSocket, onWSMessage, sendWS } from '../wsClient';

export default function Data(){
    const [user,setUser]=useState(null);
    const[token,setToken]=useState(null);
 useEffect(()=>{ 
        const token1=localStorage.getItem('token');
        if(!token1){
            navigate("/login");
            return;
        }
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
        if(!user)return;
    onWSMessage((msg) => {
        console.log("Primljeno od servera:", msg);
        if(msg.userId!=user.userId)return;
       
       if(msg.type=="data-msg"){
        console.log("primljeni podaci");
       }
    });
}, [user]);
function RequestData(){
    const msg={
        type: "data-req"
    }
    sendWS(msg);
}
    return(
        <div className="container">
            <button onClick={RequestData}>Povuci podatke</button>
        </div>
       
    )
}
