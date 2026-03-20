// na zahtjev (šalje poruku serveru) povlači nove podatke o sesijama (treninzima) i ispisuje ih 
// prvi put download data
// kasnije refresh data
import {jwtDecode} from 'jwt-decode';
import {Link} from 'react-router-dom';
import { useEffect,useState } from 'react';
import { connectWebSocket, onWSMessage, sendWS } from '../wsClient'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import "../styles/Data.css";
import { hitStrengthPeakAccel } from '../components/hitStrengthPeakAccel';
//formula za force (iz arduino koda) 
//a=sqrt(pow(data_acc1[1], 2) + pow(data_acc1[2], 2) + pow(data_acc1[3], 2)) + sqrt(pow(data_acc2[1], 2) + pow(data_acc2[2], 2) + pow(data_acc2[3], 2))
//data_acc1[1]=top_x; data_acc1[2]=top_y; data_acc1[3]=top_z; data_acc2[1]=bottom_x; data_acc2[2]=bottom_y; data_acc2[3]=bottom_z
//F=(m(vreca)*a)/2 --> izracun jacine; jos treba find peaks funkcija da nadje udarce (nije sve udarac)
//dovrši brisanje sensor-data na backend strani 
//statistika udaraca (probati sa finding peaks dok su već izračunate jačine udaraca)+chat predložio koje statistike je fora gledati
export default function Data(){
    const [user,setUser]=useState(null);
    const[token,setToken]=useState(null);
    const[practices,setPractices]=useState([]);
    const [selPracticeInd,setSelPracticeInd] = useState(null);
    const [edit, setEdit]=useState(false);
    const [practiceToDelete,setPracticeToDelete]=useState([]);
    const [sensorDatatoDelete,setSensorDataToDelete]=useState([]);
    const [basicStats,setBasicStats]=useState(null);
    const [websocketConnected,setWebsocketConnected]=useState(false);
    const [lastAlterationTime,setLastAlterationTime]=useState(null);
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
            console.log(payload);
        }catch(e){
            console.warn("Ne mogu dekodirati token");
        }
        connectWebSocket(token1,()=>{
            setWebsocketConnected(true);
        });
        
    },[]);

    
    
    useEffect(() => {
        if(!user || !websocketConnected)return;
        console.log(user.userId);
        const savedPractices=localStorage.getItem(`practices_${user.userId}`);//dodaj da za različitog usera je raličito spremanje (npr practices_userid)
        setPractices(savedPractices ? JSON.parse (savedPractices) : []);
        const lastAlteration=localStorage.getItem(`lastAlteration_${user.userId}`);
        setLastAlterationTime(lastAlteration ? new Date(lastAlteration) : null);
        RequestData(savedPractices);
        overallStats();
        
        onWSMessage((msg) => {
        // console.log("Primljeno od servera:", msg);
        // //console.log(user.userId);
            if(msg.userId!=user.userId)return;
            if(msg.type === "data-redo"){
                console.log("Primljeni podaci:", msg.data);
                setPractices(msg.data);
            }
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
            if(msg.type=="delete-result"){
                alert("Treninzi uspješno obrisani sa servera");
                overallStats()
            }
            if(msg.type=="data-update"){
                alert("Podaci su ažurirani na serveru");
            }
        });
    }, [user, websocketConnected]);

    useEffect(()=>{
        if(!selectedPractice)return;
        const hits=findingPeaks(selectedPractice.sensorData,{refractoryMs:180,k:6.0,requireBoth:true});
        console.log(selectedPractice.sensorData);
        console.log("Pronađeni udarci:", hits);
        const hitsWithStrength = hits.map(h => ({
  ...h,
  strength: hitStrengthPeakAccel(selectedPractice.sensorData, h.index, 80).strength
  // ili: hitStrengthImpulse(...).strength
}));
    console.log("Udarci sa jačinom:", hitsWithStrength);
    },[selPracticeInd]);

    const selectedPractice= selPracticeInd !== null ? practices[selPracticeInd] : null;
    const chartData=selectedPractice ? selectedPractice.sensorData.map((hit,index)=>({
        index: index,
        time: new Date(hit.timestamp).getTime(),
        top_magnitude: Math.sqrt(hit.top_x**2 + hit.top_y**2 + hit.top_z**2),
        bottom_magnitude: Math.sqrt(hit.bottom_x**2 + hit.bottom_y**2 + hit.bottom_z**2)
    })):[];
//omogući brisanje odabranih podataka (udaraca ili cijelog treninga)
    function RequestData(savedPractices){
        const parsed = savedPractices ? JSON.parse(savedPractices) : [];
        if(parsed.length==0){
            console.log("Tražim sve podatke");
            const msg={
                type: "data-req"
            };
            sendWS(msg);
        }else{
            //pošalji timestamp kraja zadnjeg treninga --> traži treninge nakon tog
            const lastpractice=parsed[parsed.length - 1];
            console.log(parsed)
            console.log("Zadnji spremljeni trening:", lastpractice);
            const timestamp=lastpractice.ended_at;
            console.log("Tražim podatke nakon timestamp:", timestamp);
            const msg={
                type:"data-req",
                practices:savedPractices,
                timestamp:timestamp,
                alteration:lastAlterationTime ? lastAlterationTime.toISOString() : null,
            };
            sendWS(msg);
        }
    }

    function DeleteSelectedP(){
        const newPractices=practices.filter((p,i)=>i!==selPracticeInd);
        setPractices(newPractices);
        localStorage.setItem(`practices_${user.userId}`,JSON.stringify(newPractices));
        console.log(selectedPractice);
        const msg={
            type:"delete-practices",
            practices:selectedPractice,
            userId:user.userId
        };
        sendWS(msg);
        setSelPracticeInd(null);
        setLastAlterationTime(new Date());
        localStorage.setItem(`lastAlteration_${user.userId}`,new Date().toISOString());
       // setEdit(false);
    }   
    function DeleteSelectedSD(){
        const newSensorData=selectedPractice.sensorData.filter(hit => {
    const t = new Date(hit.timestamp).getTime();
    return t < refLeft;});
        console.log(newSensorData);
       // practices[selPracticeInd].sensorData=newSensorData;
        const msg={
            type:"delete-sd",
            practiceToDelete:selectedPractice,
            timestamp:newSensorData[newSensorData.length-1].timestamp
        }
        sendWS(msg);
        //setRefRight(refLeft);
        setRefLeft(null);

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

function overallStats(){
    //avg duration
    let totalDuration=0;
    console.log(practices);
    for(const p of practices){
        const start=new Date(p.started_at).getTime();
        const end=new Date(p.ended_at).getTime();
        totalDuration+=end-start;
    }
    console.log("Ukupno trajanje svih treninga:", totalDuration, "ms");
    const avgDuration=practices.length>0 ? totalDuration/practices.length : 0;
    let stats={
        totalPractices: practices.length,
        avgDuration: avgDuration,
        maxHitStrength:0,
        avgHitStrength:0,
        avgHitsPerPractice:0,
    };
    setBasicStats(stats);


}
    return(
       <div className="container">
        <Link to="/home"> <button>Odradi trening</button></Link>
       {selectedPractice && (<div><button onClick={DeleteSelectedP}>Obriši trening</button> <button onClick={()=>setSelPracticeInd(null)}>Ukupna statistika</button></div>) }

        {practices.length == 0 ? (
            <p>Nema dostupnih treninga, odradite vaš prvi trening</p>
        ) : (
            <>

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
                {!selectedPractice && (
                    <div className='overall-stats'>
                        <p>Ukupno treninga: {practices.length}</p>
                        <p>Prosječno trajanje treninga: {basicStats?.avgDuration || 0} ms</p>
                    </div>
                )}
                {selectedPractice && chartData.length>0 &&(
                    <div className="chart-card" style={{width:"100%", height:400,marginTop:30}}>
                        {refLeft!==null && refRight!==null && (<div><button onClick={DeleteSelectedSD}>Obriši odabrane podatke</button> <button onClick={()=>setRefLeft(null)}>Odznači</button> </div>)}
                        <ResponsiveContainer>
                        <LineChart data={chartData}
                        onClick={(e)=>{
                            console.log("CLICK EVENT:", e);
                            console.log("activeLabel:", e?.activeLabel);
                            if(!e || !e.activeLabel)return;
                            setRefLeft(e.activeLabel);
                            setRefRight(new Date(selectedPractice.sensorData[selectedPractice.sensorData.length-1].timestamp).getTime());
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
                {selectedPractice && (
                    <div>
                    <h1>Podaci sa senzora</h1>
                    
                    <div>
                        <p><strong>Vreća ID:</strong>{selectedPractice.deviceid}</p>
                        <p><strong>Početak treninga: </strong>{selectedPractice.started_at}</p>
                        <p><strong>Kraj trening:</strong>{selectedPractice.ended_at}</p>
                        <p><strong>Udarci:</strong> {findingPeaks(selectedPractice.sensorData).length}</p>
                    </div>
                    <div>
                        <h4>Udarci:</h4>
                        {selectedPractice.sensorData.length===0?(<p>Nema zabilježenih udaraca</p>):(
                            <ul>
                                {selectedPractice.sensorData.map((hit,i)=>(
                                    <li key={i}>
                                        <p>Vrijeme: {hit.timestamp}</p>
                                        <p>Akceleracija: {((Math.sqrt(hit.top_x**2+hit.top_y**2+hit.top_z**2)+Math.sqrt(hit.bottom_x**2+hit.bottom_y**2+hit.bottom_z**2))/2)*9.81}m/s²
                                        </p>
                                        <p>Top: ({hit.top_x}, {hit.top_y}, {hit.top_z})</p>
                                        <p>Bottom: ({hit.bottom_x}, {hit.bottom_y}, {hit.bottom_z})</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    </div>
                    
                )}
                </div>
        </div>
    )
}
