// na zahtjev (šalje poruku serveru) povlači nove podatke o sesijama (treninzima) i ispisuje ih 
// prvi put download data
// kasnije refresh data
import {jwtDecode} from 'jwt-decode';
import {Link} from 'react-router-dom';
import { useEffect,useState } from 'react';
import { connectWebSocket, onWSMessage, sendWS } from '../wsClient'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import "../styles/Data.css";
//formula za force (iz arduino koda) 
//a=sqrt(pow(data_acc1[1], 2) + pow(data_acc1[2], 2) + pow(data_acc1[3], 2)) + sqrt(pow(data_acc2[1], 2) + pow(data_acc2[2], 2) + pow(data_acc2[3], 2))
//data_acc1[1]=top_x; data_acc1[2]=top_y; data_acc1[3]=top_z; data_acc2[1]=bottom_x; data_acc2[2]=bottom_y; data_acc2[3]=bottom_z
//F=(m(vreca)*a)/2 --> izracun jacine; jos treba find peaks funkcija da nadje udarce (nije sve udarac)

export default function Data(){
    const [user,setUser]=useState(null);
    const[token,setToken]=useState(null);
    const[practices,setPractices]=useState([]);
    const [selPracticeInd,setSelPracticeInd] = useState(null);
    const [edit, setEdit]=useState(false);
    const [practiceToDelete,setPracticeToDelete]=useState([]);
    const [sensorDatatoDelete,setSensorDataToDelete]=useState([]);

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
        console.log(user.userId);
        const savedPractices=localStorage.getItem(`practices_${user.userId}`);//dodaj da za različitog usera je raličito spremanje (npr practices_userid)
        setPractices(savedPractices ? JSON.parse (savedPractices) : []);
    onWSMessage((msg) => {
        // console.log("Primljeno od servera:", msg);
        // //console.log(user.userId);
        if(msg.userId!=user.userId)return;
        if(msg.type=="data-msg"){
            //console.log("primljeni podaci");
            if (Array.isArray(msg.data)) {
                console.log("Primljeni podaci:", msg.data);
                const recivedData = msg.data;
                //console.log(recivedData.length())
                if(recivedData.length!=0){
                    console.log("tuuu sam")
                    setPractices((prevPractices)=>{
                        const updatedPractices=[...prevPractices,...recivedData];
                        localStorage.setItem(`practices_${user.userId}`,JSON.stringify(updatedPractices));
                        return updatedPractices;
                    });
                    alert("Treninzi uspješno preneseni");
                }else{
                    console.log("praznooo");
                    alert("Svi treninzi su već preneseni");
                }
            }
        }
    });
}, [user]);

const selectedPractice= selPracticeInd !== null ? practices[selPracticeInd] : null;
const chartData=selectedPractice ? selectedPractice.sensorData.map((hit)=>({
    time: new Date(hit.timestamp).toLocaleTimeString(),
    top_magnitude: Math.sqrt(hit.top_x**2 + hit.top_y**2 + hit.top_z**2),
    bottom_magnitude: Math.sqrt(hit.bottom_x**2 + hit.bottom_y**2 + hit.bottom_z**2)
})):[];
//omogući brisanje odabranih podataka (udaraca ili cijelog treninga)
function RequestData(){
    if(practices.length==0){
        const msg={
        type: "data-req"
        }
        sendWS(msg);
    }else{
        //pošalji timestamp kraja zadnjeg treninga --> traži treninge nakon tog
        const lastpractice=practices[practices.length - 1];
        const timestamp=lastpractice.ended_at;
        console.log(timestamp)
        const msg={
            type:"data-req",
            timestamp:timestamp
        }
        sendWS(msg)
    }
    
}
function DeleteSelectedP(){
    const newPractices=practices.filter((practice,index)=>!practiceToDelete.includes(index));
    
    const practiceToDeleteArr=practiceToDelete.map((ind)=>practices[ind]);
    setPractices(newPractices);
    localStorage.setItem(`practices_${user.userId}`,JSON.stringify(newPractices));
    console.log(practiceToDeleteArr);
    const msg={
        type:"delete-practices",
        practices:practiceToDeleteArr,
        userId:user.userId
    }
    sendWS(msg);
    setPracticeToDelete([]);
    setEdit(false);
}
    return(
       <div className="container">
        {practices.length == 0 ? (
            <button onClick={RequestData}>Povuci podatke</button> 
        ) : (
            <>
                <button onClick={RequestData}>Update podataka</button>
                {edit==true ?(<button onClick={DeleteSelectedP}>Delete selected</button>):(<button onClick={() => setEdit(true)}>Edit podataka</button>)}   
            </>
        )}
            <div>
                {practices.length>0 && (
                    <div>
                        <select value={selPracticeInd ?? ""}
                            onChange={(e)=>setSelPracticeInd(Number(e.target.value))}>
                                <option value=""disabled>Odaberite trening</option>
                                {practices.map((practice,index)=>(
                                    <option key={index} value={index}>
                                        {practice.started_at}-{practice.ended_at}
                                    </option>
                                ))}
                            </select>
                    </div>
                )}
                {selectedPractice && chartData.length>0 &&(
                    <div className="chart-card" style={{width:"100%", height:400,marginTop:30}}>
                        <ResponsiveContainer>
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="time" />
                            <YAxis />
                            <Tooltip />
                            <Line type="monotone" dataKey="top_magnitude" stroke="red" />
                            <Line type="monotone" dataKey="bottom_magnitude" stroke="black" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                    
                )}
                <h1>Lista treninga</h1>
                {practices.length==0 ? (
                    <p>Nema dostupnih treninga</p>):
                    (<ol>
                        {practices.map((practice,index)=>(
                            <li key={index}>
                                {edit && (
                                    <div>
                                        <input type="checkbox" onChange={(e)=>{if(e.target.checked){
                                            setPracticeToDelete((prev)=>[...prev,index]);
                                        }else{
                                            setPracticeToDelete((prev)=>prev.filter((i)=>i!==index));
                                        }   
                                        }}></input>
                                    </div>
                                )}
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
                                                <p>Force:{(20*Math.sqrt(Math.pow(hit.top_x, 2) + Math.pow(hit.top_y, 2) + Math.pow(hit.top_z, 2)) + Math.sqrt(Math.pow(hit.bottom_x, 2) + Math.pow(hit.bottom_y, 2) + Math.pow(hit.bottom_z, 2)))/2}</p>
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
