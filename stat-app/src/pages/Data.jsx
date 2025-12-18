// na zahtjev (šalje poruku serveru) povlači nove podatke o sesijama (treninzima) i ispisuje ih 
// prvi put download data
// kasnije refresh data
import {jwtDecode} from 'jwt-decode';
import {Link} from 'react-router-dom';
import { useEffect,useState } from 'react';
import { connectWebSocket, onWSMessage, sendWS } from '../wsClient'

export default function Data(){
    const [user,setUser]=useState(null);
    const[token,setToken]=useState(null);
    const[practices,setPractices]=useState(()=>{
        const savedPractices=localStorage.getItem("practices");
        return savedPractices ? JSON.parse(savedPractices):[];
    });
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
       // console.log("Primljeno od servera:", msg);
       //console.log(user.userId);
        if(msg.userId!=user.userId)return;
       if(msg.type=="data-msg"){
        console.log("primljeni podaci");
        if (Array.isArray(msg.data)) {
    console.log("Primljeni podaci:", msg.data);
    const recivedData = msg.data;
    if(recivedData){
            setPractices((prevPractices)=>{
                const updatedPractices=[...prevPractices,...recivedData];
                localStorage.setItem("practices",JSON.stringify(updatedPractices));
                return updatedPractices;
            });
        }
}
        
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
            {practices.length== 0 ? (
               <button onClick={RequestData}>Povuci podatke</button> 
            ):(<button onClick={RequestData}>Update podataka</button>)}
            <div>
                <h1>Lista treninga</h1>
                {practices.length==0 ? (
                    <p>Nema dostupnih treninga</p>):
                    (<ol>
                        {practices.map((practice,index)=>(
                            <li key={index}>
                                <p><strong>Vreća ID:</strong>{practice.deviceid}</p>
                                <p><strong>Početak treninga: </strong>{practice.started_at}</p>
                                <p><strong>Kraj trening:</strong>{practice.ended_at}</p>

                                <h4>Udarci:</h4>
                                {practice.sensorData.length===0?(
                                    <p>Nema zabilježenih udaraca</p>
                                ):(
                                    <ul>
                                        {practice.sensorData.map((hit,i)=>(
                                            <li key={i}>
                                                <p>Vrijeme:{hit.timestamp}</p>
                                                <p>Top:({hit.top_x},{hit.top_y},{hit.top_z})</p>
                                                 <p>Bottom: ({hit.bottom_x}, {hit.bottom_y}, {hit.bottom_z})</p>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        ))}
                    </ol>)
                }
            </div>
        </div>
       
       
    )
}
