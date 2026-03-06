// na zahtjev (šalje poruku serveru) povlači nove podatke o sesijama (treninzima) i ispisuje ih 
// prvi put download data
// kasnije refresh data
import {jwtDecode} from 'jwt-decode';
import {Link} from 'react-router-dom';
import { useEffect,useState } from 'react';
import { connectWebSocket, onWSMessage, sendWS } from '../wsClient'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
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
    
    const[refLeft,setRefLeft]=useState(null);
    const[refRight,setRefRight]=useState(null);

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
        if(msg.type=="delete-confirmation"){
            alert("Treninzi uspješno obrisani sa servera");
        }
        if(msg.type=="data-update"){
            alert("Podaci su ažurirani na serveru");
        }
    });
}, [user]);
useEffect(()=>{
    if(!selectedPractice)return;
    const hits=findingPeaks(selectedPractice.sensorData,{refractoryMs:180,k:6.0,requireBoth:true});
    console.log("Pronađeni udarci:", hits);
},[selPracticeInd]);

const selectedPractice= selPracticeInd !== null ? practices[selPracticeInd] : null;
const chartData=selectedPractice ? selectedPractice.sensorData.map((hit,index)=>({
    index: index,
    time: new Date(hit.timestamp).getTime(),
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
            practices:practices,
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
//treba implementirat brisanje tako da se na grafu odabere vremenski interval i obrišu se sensor_data unutar intervala
function deleteSection(){
    if(refLeft===null || refRight===null)return;
    console.log(refLeft,refRight);
}
function DeleteSelectedSD(){
    //brisanje pojedinih udaraca unutar treninga -  promijeni ended_at ako je potrebno
    console.log(sensorDatatoDelete);
    //console.log(practices);
    let chgEnd=false;
    const practicewithD=practices[sensorDatatoDelete[0].practiceIndex];
    if(practicewithD.sensorData.length===sensorDatatoDelete[0].hitIndex+1){
        chgEnd=true;
    }
    const newSD=practicewithD.sensorData.filter((hit,i)=>!(i===sensorDatatoDelete[0].hitIndex));
    const SD=practicewithD.sensorData.filter((hit,i)=>(i===sensorDatatoDelete[0].hitIndex));
    console.log(SD);
    practicewithD.sensorData=newSD;
    if(chgEnd){
        practicewithD.ended_at=newSD[newSD.length-1].timestamp;
    }
    console.log(practicewithD);
    const msg={
        type:"delete-sensordata",
        sensorData:SD,
    }
    sendWS(msg);
    setSensorDataToDelete([]);
    setEdit(false);
}
//finding peaks - pomoćne fumnkcije
function median(arr){
    if(arr.length===0)return 0;
    const a=[...arr].sort((a,b)=>a-b);
    const mid=Math.floor(a.length/2);
    return a.length%2 ? a[mid]:(a[mid-1]+a[mid])/2;
}
function mad(arr){
    const m=median(arr);
    const dev=arr.map(x=>Math.abs(x-m));
    return median(dev) || 1e-9;
}
//vraća polje udaraca [{index,timestamp,score,topMag,bottomMag,jerkTop,jerkBottom}]
//udarac - kratak skok akceleracije visok jerk(derivacija akceleracije)
function findingPeaks(sensor_data,opts={}){
   const{
    refractoryMs=180,
    k=6.0,
    requireBoth=true,
    maxIndexDelta=2,
    minDtMs=5
   }=opts;

   if(!Array.isArray(sensor_data) || sensor_data.length<5)return [];

   const t=sensor_data.map(h=>new Date(h.timestamp).getTime());
   const topMag=sensor_data.map(h=>Math.hypot(h.top_x,h.top_y,h.top_z));
   const bottomMag=sensor_data.map(h=>Math.hypot(h.bottom_x,h.bottom_y,h.bottom_z));

   const jerkTop= new Array(sensor_data.length).fill(0);
   const jerkBottom= new Array(sensor_data.length).fill(0);

   for(let i=1;i<sensor_data.length;i++){
    const dt=Math.max(minDtMs,t[i]-t[i-1]);
    jerkTop[i]=(topMag[i]-topMag[i-1])/dt;
    jerkBottom[i]=(bottomMag[i]-bottomMag[i-1])/dt;
   }

   const absJT= jerkTop.map(v=>Math.abs(v));
   const absJB= jerkBottom.map(v=>Math.abs(v));

   //adaptivni pragovi
   const thrT=median(absJT)+k*mad(absJT);
   const thrB=median(absJB)+k*mad(absJB);

   function pickPeaks(absJ,thr){
    const peaks= [];
    let lastPeakTime=-Infinity;
    
    for(let i=2;i<absJ.length-2;i++){
        const v=absJ[i];
        if(v<thr)continue;
        if(!(v>=absJ[i-1] && v>=absJ[i+1]))continue;

        if(t[i]-lastPeakTime<refractoryMs){
            const last=peaks[peaks.length-1];
            if(last && v>last.value){
                peaks[peaks.length-1]={index:i,time:t[i],value:v};
                lastPeakTime=t[i];
            }
            continue;
        }
        peaks.push({index:i,time:t[i],value:v});
        lastPeakTime=t[i];
    }
    return peaks;
}
const peaksT=pickPeaks(absJT,thrT);
const peaksB=pickPeaks(absJB,thrB);

const hits=[];
if(requireBoth){
    let j=0;
    for(const pt of peaksT){
        while(j<peaksB.length && peaksB[j].index<pt.index-maxIndexDelta)j++;
        let best=null;

        for(let k2=j;k2<peaksB.length;k2++){
            const pb=peaksB[k2];
            if(pb.index>pt.index+maxIndexDelta)break;

            const score=pt.value+pb.value-0.05*Math.abs(pb.index-pt.index);
            if(!best || score>best.score)best={pb,score};
        }
        if(best){
            const i=pt.index;
            hits.push({index:i,
                timestamp:sensor_data[i].timestamp,
                score:best.score,
                topMag:topMag[i],
                bottomMag:bottomMag[i],
                jerkTop:absJT[i],
                jerkBottom:absJB[best.pb.index],
            })
        }
    }
}else{
    for(const pt of peaksT){
        const i=pt.index;
        hits.push({index:i,
            timestamp:sensor_data[i].timestamp,
            score:pt.value,
            topMag:topMag[i],
            bottomMag:bottomMag[i],
            jerkTop:absJT[i],
            jerkBottom:absJB[i],
        });
    }
}
return hits;

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
                        <LineChart data={chartData}
                        onClick={(e)=>{
                            console.log("CLICK EVENT:", e);
                            console.log("activeLabel:", e?.activeLabel);
                            if(!e || !e.activeLabel)return;
                            if(refLeft===null){
                                setRefLeft(e.activeLabel);
                            }else if(refRight===null){
                                setRefRight(e.activeLabel);
                            }
                        }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="time"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(t) =>new Date(t).toLocaleTimeString('hr-HR', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                            })
                            }/>
                            <YAxis />
                            <Tooltip />
                            <Line type="monotone" dataKey="top_magnitude" stroke="red" />
                            <Line type="monotone" dataKey="bottom_magnitude" stroke="black" />
                            {refLeft && refRight &&(
                                <ReferenceArea x1={Math.min(refLeft,refRight)} x2={Math.max(refLeft,refRight)}fill="rgba(0, 123, 255, 0.2)"stroke="rgba(0, 123, 255, 0.6)"/>
                            )}
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
                                    <>
                                    <ul>
                                        {practice.sensorData.map((hit,i)=>(
                                            <li key={i}>
                                                <p>Vrijeme: {hit.timestamp}</p>
                                                <p>Force: {(20 * Math.sqrt(hit.top_x ** 2 + hit.top_y ** 2 + hit.top_z ** 2) + 
                                                Math.sqrt(hit.bottom_x ** 2 + hit.bottom_y ** 2 + hit.bottom_z ** 2)) / 2}
                                                </p>
                                                <p>Top: ({hit.top_x}, {hit.top_y}, {hit.top_z})</p>
                                                <p>Bottom: ({hit.bottom_x}, {hit.bottom_y}, {hit.bottom_z})</p>
                                                {edit && (
                                                    <input type="checkbox" onChange={(e)=>{
                                                        if(e.target.checked){
                                                            setSensorDataToDelete((prev)=>[...prev,{practiceIndex:index,hitIndex:i},]);
                                                        }else{
                                                            setSensorDataToDelete((prev)=>
                                                                prev.filter((obj)=>!(obj.practiceIndex===index && obj.hitIndex===i))
                                                            );
                                                        }
                                                    }}
                                                    />
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                    {edit && (
                                        <button onClick={DeleteSelectedSD}>Delete selected hits</button>
                                    )}
                                    </>
                                
                                )}
                            </li>
                        ))}
                    </ol>)
                }
            </div>
        </div>
       
       
    )
}
