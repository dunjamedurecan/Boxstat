//trening 16.3.2026 u 08:03 nije relevantan nisam napravila usrednjavanje nakon što sam objesila vreću (usrednilo se na podu, pa ne valjaju podaci) -- ljudska greška neće se dogodit (vreća će visit prije nego se netko spoji na nju - tu sam ja samo bila idiot)
import {jwtDecode} from 'jwt-decode';
import {Link} from 'react-router-dom';
import { useEffect,useState,useMemo } from 'react';
import { onWSMessage, sendWS } from '../wsClient'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import "../styles/Data.css";
import { useAuth } from '../auth/AuthProvider';
//formula za force (iz arduino koda) 
//a=sqrt(pow(data_acc1[1], 2) + pow(data_acc1[2], 2) + pow(data_acc1[3], 2)) + sqrt(pow(data_acc2[1], 2) + pow(data_acc2[2], 2) + pow(data_acc2[3], 2))
//data_acc1[1]=top_x; data_acc1[2]=top_y; data_acc1[3]=top_z; data_acc2[1]=bottom_x; data_acc2[2]=bottom_y; data_acc2[3]=bottom_z
//F=(m(vreca)*a)/2 --> izracun jacine; jos treba find peaks funkcija da nadje udarce (nije sve udarac)
const G=9.80655;
export default function Data(){
    //varijable i stanja
    const {user,wsConnected}=useAuth();
    const[practices,setPractices]=useState([]);
    const [selPracticeInd,setSelPracticeInd] = useState(null);
    // [edit, setEdit]=useState(false);
    //const [practiceToDelete,setPracticeToDelete]=useState([]);
    //const [sensorDatatoDelete,setSensorDataToDelete]=useState([]);
    const [basicStats,setBasicStats]=useState(null);
    const [lastAlterationTime,setLastAlterationTime]=useState(null);
    const[refLeft,setRefLeft]=useState(null);
    const[refRight,setRefRight]=useState(null);
   
    const selectedPractice= selPracticeInd !== null ? practices[selPracticeInd] : null;
    const chartData=selectedPractice ? computeForce(selectedPractice.sensorData,20,0.12):[];
    const forceHits = selectedPractice ? findingPeaks(chartData) : []


    
    //dohvat podataka o treninzima i postavljanje listenera za nove podatke sa servera
    useEffect(() => {
        if(!user || !wsConnected)return;
        const savedPractices=localStorage.getItem(`practices_${user.userId}`);//dodaj da za različitog usera je raličito spremanje (npr practices_userid)
        setPractices(savedPractices ? JSON.parse (savedPractices) : []);
        const lastAlteration=localStorage.getItem(`lastAlteration_${user.userId}`);
        setLastAlterationTime(lastAlteration ? new Date(lastAlteration) : null);
        RequestData(savedPractices);
       
        
        const unsubscribe=onWSMessage((msg) => {
            if(msg.userId!=user.userId)return;
            if(msg.type === "data-redo"){
                console.log("Primljeni podaci:", msg.data);
                setPractices(msg.data);
            }
            if(msg.type=="data-msg"){
                if (Array.isArray(msg.data)) {
                    console.log("Primljeni podaci:", msg.data);
                    const recivedData = msg.data;
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
        return ()=>unsubscribe?.();
    }, [user, wsConnected]);

    useEffect(()=>{
        if(!selectedPractice)return;
        const hits = findingPeaks(chartData, {
            refractoryMs: 180,
            k: 6.0,
            minForceN: 5
        });
        console.log(selectedPractice.sensorData);
        console.log("Pronađeni udarci:", hits);
    },[selPracticeInd,chartData]);

//dodatne funkcionalnosti
//povlačenje novih podataka sa servera (ako ima novih treninga od zadnjeg fetchanja) 
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

//brisanje odabranog treninga ili dijela podataka sa servera
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
    }   

    function DeleteSelectedSD(){
        const newSensorData=selectedPractice.sensorData.filter(hit => {
            const t = new Date(hit.timestamp).getTime();
            return t < refLeft;});
            console.log(newSensorData);
            const old_ended_at=selectedPractice.ended_at
            selectedPractice.ended_at=newSensorData[newSensorData.length-1].timestamp;
            const bagId=selectedPractice.deviceid
            practices[selPracticeInd].sensorData=newSensorData;
        const msg={
            type:"delete-sd",
            practiceToDelete:selectedPractice,
            timestamp:newSensorData[newSensorData.length-1].timestamp,
            deleteto:old_ended_at,
            bagId:bagId
        }
        sendWS(msg);
        setRefRight(refLeft);
        setRefLeft(null);

    }

    //helper funkcije za finding peaks
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

    function findingPeaks(chart_data,opts={}){
        const{
            refractoryMs=180,
            k=6.0,
            minForceN=5,
            minDtMs=5,
            releaseRatio=0.5,
        }=opts;
        
        if(!Array.isArray(chart_data) || chart_data.length<5)return [];
        
        const t=chartData.map(p=>p.time);
        const f=chartData.map(p=>Math.max(0,p.force));
        
        const dF=new Array(f.length).fill(0);
        
        for(let i=1; i<f.length;i++){
            const dt=Math.max(minDtMs,t[i]-t[i-1]);
            dF[i]=(f[i]-f[i-1])/dt;
        }
        
        const absdF=dF.map(v=>Math.abs(v));
        
        const thr=median(absdF)+k*mad(absdF);
        const enterThr=Math.max(thr, minForceN);
        const releaseThr=enterThr*releaseRatio;
        
        const hits=[];
        let inHit=false;
        let hitStartTime=-Infinity;
        let peak=null;
        let lastHitTime=-Infinity;
        for(let i=0;i<f.length;i++){
            const time=t[i];
            const force=f[i];
            if(!inHit){
                if(force>=enterThr){
                    const last=hits[hits.length-1];
                    if(last && time-last.time<refractoryMs){
                        continue;
                    }
                    inHit=true;
                    hitStartTime=time;
                    peak={i,force};
                }
            }else{
                if(force>peak.force)peak={i,force};
                if(force<=releaseThr){
                    hits.push({index:chartData[peak.i].index ?? peak.i,
                        chartIndex:peak.i,
                        time:t[peak.i],
                        force:peak.force,
                        enterThr,
                    });
                    inHit=false;
                    peak=null;
                    hitStartTime=-Infinity;
                }
            }
        }
        if(inHit && peak){
            hits.push({
                index: chartData[peak.i].index ?? peak.i,
                chartIndex: peak.i,
                time: t[peak.i],
                forceN: peak.force,
                enterThr,
            });
        }
        return hits;
    }

function avgDurationP(){
    let duration=0
    for(let i=0;i<practices.length;i++){
        let start=new Date(practices[i].started_at).getTime();
        let end= new Date(practices[i].ended_at).getTime();
        duration+=end-start;
    }
    duration=duration/(1000*60);
    duration=duration/practices.length
    return duration;
}

//helper funkcije za jačinu udarca

function emaTrend(x,alpha){
    const trend= new Array(x.length).fill(0);
    trend[0]=x[0]??0;
    for(let i=1;i<x.length;i++){
        trend[i]=alpha*x[i]+(1-alpha)*trend[i-1];
    }
    return trend;
}

function computeForce(sensorData,mKg,alpha=0.12){
    if(!Array.isArray(sensorData)||sensorData.length===0)return[];
   const aComb=sensorData.map(s=>{
    const topAcc=Math.hypot(s.top_x,s.top_y,s.top_z);
    const bottomAcc=Math.hypot(s.bottom_x,s.bottom_y,s.bottom_z);
    return (topAcc+bottomAcc)/2;
   });
   const baseline=emaTrend(aComb,alpha);

   return sensorData.map((s,i)=>{
    const aEffG=Math.max(0,aComb[i]-baseline[i]);
    const force=aEffG*mKg*G;
    return{
        index:i,
        time: new Date(s.timestamp).getTime(),
        force:force,
        aComb:aComb[i],
        baseline:baseline[i],
    };
   });
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
                                        {new Date(practice.started_at).toLocaleString('hr-HR')} - {new Date(practice.ended_at).toLocaleString('hr-HR')}
                                    </option>
                                ))}
                            </select>
                    </div>
                )}
                {!selectedPractice && (
                    <div className='overall-stats'>
                        <p>Ukupno treninga: {practices.length}</p>
                        <p>Prosječno trajanje treninga: {avgDurationP().toFixed(2)} min</p>
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
                            <Line type="monotone" dataKey="force" stroke="red" />
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
                    <h2>Statistika odabranog treninga</h2>
                    
                    <div>
                        <h3>Osnovni podaci</h3>
                        <p><strong>Vreća ID:</strong>{selectedPractice.deviceid}</p>
                        <p><strong>Početak treninga: </strong>{new Date(selectedPractice.started_at).toLocaleString('hr-HR')}</p>
                        <p><strong>Kraj treninga: </strong>{new Date(selectedPractice.ended_at).toLocaleString('hr-HR')}</p>
                        <p><strong>Broj udaraca: </strong> {forceHits.length}</p>
                    </div>

                    <div>
                        <h3>Osnovna statistika</h3>
                        <p><strong>Trajanje: {((new Date(selectedPractice.ended_at).getTime()-new Date(selectedPractice.started_at).getTime())/(1000*60)).toFixed(2)} min </strong></p>
                        <p><strong>Najjači udarac: {Math.max(...forceHits.map((hit)=>hit.force)).toFixed(2)}N</strong></p>
                        <p><strong>Prosječna snaga udaraca: {(forceHits.reduce((acc,hit)=>acc+hit.force,0)/forceHits.length).toFixed(2)} N</strong></p>
                        <p><strong>Udarci u minuti: {Math.round(forceHits.length/((new Date(selectedPractice.ended_at).getTime()-new Date(selectedPractice.started_at).getTime())/(1000*60)))} hit/min</strong></p>
                    </div>
                        <h3>Snaga kroz vrijeme</h3>
                    <div>
                        <h4>Udarci:</h4>
                        {forceHits.length===0?(<p>Nema zabilježenih udaraca</p>):(
                            <ul>
                                {forceHits.map((hit,i)=>(
                                    <li key={i}>
                                        <p>Vrijeme: {new Date(hit.time).toLocaleTimeString('hr-HR')}</p>
                                        <p>Jačina udarca: {Number.isFinite(hit.force) ? hit.force.toFixed(2) : "—"} N</p>
                                    </li>
                                ))}

                            </ul>
                        )}
                        <h4>Podaci sa senzora:</h4>
                        {selectedPractice.sensorData.length===0?(<p>Nema zabilježenih udaraca</p>):(
                            <ul>
                                {selectedPractice.sensorData.map((hit,i)=>(
                                    <li key={i}>
                                        <p>Vrijeme: {hit.timestamp}</p>
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
