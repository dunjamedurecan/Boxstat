//import {jwtDecode} from 'jwt-decode';
import {Link} from 'react-router-dom';
import { useEffect,useState, useMemo, forwardRef } from 'react';
import { onWSMessage, sendWS, closeWS } from '../wsClient';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import "../styles/Home.css";
import QrScannerView from '../components/QrScanner';
import Stopwatch from '../components/Stopwatch';
import { BarChart, Bar, Legend } from 'recharts';
//spajanje data.jsx i home.jsx u jednu stranicu

function median(arr){
    if(arr.length==0)return 0;
    const a=[...arr].sort((a,b)=>a-b);
    const mid=Math.floor(a.length/2);
    return a.length%2 ? a[mid]:(a[mid-1]+a[mid])/2;
}

function mad(arr){
    const m=median(arr);
    const dev=arr.map(x=>Math.abs(x-m));
    return median(dev)||1e-9;
}

function findingPeaks(chart_data,opts={}){
    const{
        refractoryMs=110,
        k=4.5,
        minForceN=5,
        minDtMs=5,
        releaseRatio=0.8,
    }=opts;
    if(Array.isArray(chart_data) || chart_data.length<5)return [];

    const t=chart_data.map(p=>p.time);
    const f=chart_data.map(p=>Math.max(0,p.force));

    const dF=new Array(f.length).fill(0);

    for(let i=1; i<f.length;i++){
        const dt=Math.max(minDtMs,t[i]-t[i-1]);
        dF[i]=(f[i]-f[i-1])/dt;
    }

    const absdF=dF.map(x=>Math.abs(x));

    const thr=median(absdF)+k*mad(absdF);
    const enterThr=Math.max(thr,minForceN);
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
                hits.push({
                    index:chart_data[peak.i].index ?? peak.i,
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
            index:chart_data[peak.i].index ?? peak.i,
            chartIndex:peak.i,
            time:t[peak.i],
            force:peak.force,
            enterThr,
        });
    }
    return hits;
}

function emaTrend(x,alpha){
    const trend=new Array(x.length).fill(0);
    trend[0]=x[0] ?? 0;
    for(let i=1;i<x.length;i++){
        trend[i]=alpha*x[i]+(1-alpha)*trend[i-1];
    }
    return trend;
}

export default function Home(){
    //konstante za home - pokretanje sesije, qr skener
    const [sessionStarted,setSessionStarted]=useState(false);
    const navigate=useNavigate();
    const [qrOn,setQrOn]=useState(false);
    const {user,wsConnected,logout}=useAuth();
    const {showData,setShowData}=useState(false);

    //konstante za prikaz podataka
    const [practices,setPractices]=useState([]);
    const [selPracticeInd,setSelPracticeInd]=useState(null);
    const [compPracticeInd,setCompPracticeInd]=useState(null);
    const [basicStats,setBasicStats]=useState(null);
    const [lastAlterationTime, setLastAlterationTime]=useState(null);
    const [refLeft,setRefLeft]=useState(null);
    const [refRight,setRefRight]=useState(null);

    const selectedPractice=selPracticeInd!==null ? practices[selPracticeInd]:null;
    const charData=selectedPractice ? computeForce(selectedPractice.sensorData,20,0.12):[];
    const forceHits=selectedPractice ? findingPeaks(charData):[];

    const total=forceHits.length;
    const streak=longestStreak(forceHits,1500);

    const fat=fatigueDrop(forceHits);
    const dist=forceDistribution(forceHits,10);

    const compPractice=compPracticeInd!==null ? practices[compPracticeInd]:null;
    const compCharData=compPractice ? computeForce(compPractice.sensorData,20,0.12):[];
    const compForceHits=compPractice ? findingPeaks(compCharData):[];

    const currM=practiceMetrics(selectedPractice,forceHits);
    const compM=practiceMetrics(compPractice,compForceHits);
    const progress=compareMetrics(currM,compM);
    const histData=dist.bins.map((b)=>({
        range=`${b.from}-${b.to}`,
        count:b.n,
        from:b.from,
        to:b.to,
    }));

    useEffect(() => {
    console.log(user);
    if (!user || !wsConnected) return;   // wait for user to load
    const savedPractices=localStorage.getItem(`practices_${user.userId}`);
    const parsed=savedPractices ? JSON.parse(savedPractices):[];
    const sortedPr=parsed.slice().sort((a,b)=>new Date(a.started_at).getTime()-new Date(b.started_at).getTime());
    setPractices(sortedPr);
    const lastAlteration=localStorage.getItem(`lastAlteration_${user.userId}`);
    setLastAlterationTime(lastAlteration ? new Date(lastAlteration):null);
    RequestData(savedPractices);


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
        if(msg.type==="data-redo"){
            console.log("Primljeni podaci:",msg.data);
            setPractices(msg.data);
        }
        if(msg.type==="data-msg"){
            if(Array.isArray(msg.data)){
                console.log("Primljeni podaci:",msg.data);
                const recivedData=msg.data;
                if(recivedData.length!=0){
                    const sorted=recivedData.slice().sort((a,b)=>new Date(a.started_at).getTime()-new Date(b.started_at).getTime());
                    setPractices((prev)=>{
                        const update=[...prev,...sorted];
                        localStorage.setItem(`practices_${user.userId}`,JSON.stringify(update));
                        return update;
                    });
                }else{
                    console.log("Nema novih podataka");
                }
            }
        }
        if(msg.type==="delete.result"){
            alert("Treninzi uspješno obrisani sa servera");
            overallStats();
        }
        if(msg.type=="data-update"){
            alert("Podaci uspješno ažurirani na serveru");
        }
    });
    return ()=>unsubscribe?.();
}, [user, wsConnected]);

    useEffect(()=>{
        if(!selectedPractice)return;
        const hits=findingPeaks(chartDataReducer,{
            refractoryMs:130,
            k:4.5,
            minForceN:5,
        });
    },[selPracticeInd,charData]);

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
    function RequestData(savedPractices){
        const parsed=savedPractices ? JSON.parse(savedPractices):[];
        if(parsed.length==0){
            console.log("Nema spremljenih treninga, tražim sa servera...");
            const msg={
                type:"data-req",
            };
            sendWS(msg);
        }else{
            const lastP=parsed[parsed.length-1];
            const timestamp=lastP.ended_at;
            const msg={
                type:"data-req",
                practices:savedPractices,
                timestamp:timestamp,
                alteration:lastAlterationTime?lastAlterationTime.toISOString():null,
            };
            sendWS(msg);
        }
    }

    function DeleteSelectedP(){
        const newP=practices.filter((p,i)=>i!=selPracticeInd);
        setPractices(newP);
        localStorage.setItem(`practices_${user.userId}`,JSON.stringify(newP));
        const msg={
            type:"delete-practices",
            practices:selectedPractice,
            userId:user.userId,
        };
        sendWS(msg);
        selPracticeInd(null);
        setLastAlterationTime(new Date());
        localStorage.setItem(`lastAlteration_${user.userId}`,new Date().toISOString());
    }

    function DeleteSelectedSD(){
        const newSD=selectedPractice.sensorData.filter(hit=>{
            const t=newDate(hit.timestamp).getTime();
            return t<refLeft});
        const old_ended_at=selectedPractice.ended_at;
        selectedPractice.ended_at=newSD[newSD.length-1].timestamp;
        const bagId=selectedPractice.deviceid;
        practices[selPracticeInd].sensorData=newSD;
        const msg={
            type:"delete-sd",
            practiceToDelete:selectedPractice,
            timestamp:newSD[newSD.length-1].timestamp,
            deleteto:old_ended_at,
            bagId:bagId,
        }
        sendWS(msg);
        setRefRight(refLeft);
        setRefLeft(null);
        setLastAlterationTime(new Date());
        localStorage.setItem(`lastAlteration_${user.userId}`,new Date().toISOString());     
    }

    function avgDurationP(){
        let duration=0;
        for(let i=0;i<practices.length;i++){
            let start=new Date(practices[i].started_at).getTime();
            let end=new Date(practices[i].ended_at).getTime();
            duration+=(end-start);
        }
        duration=duration/(1000*60);
        duration=duration/practices.length;
        return duration;
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
            <button onClick={()=>setShowData(true)}>Prikaz podataka</button>

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