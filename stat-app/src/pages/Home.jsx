//import {jwtDecode} from 'jwt-decode';
import {Link} from 'react-router-dom';
import { useEffect,useState, useMemo, forwardRef } from 'react';
import { onWSMessage, sendWS, closeWS } from '../wsClient';
import { ComposedChart,LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import "../styles/Home.css";
import QrScannerView from '../components/QrScanner';
import Stopwatch from '../components/Stopwatch';
import { BarChart, Bar, Legend } from 'recharts';
//spajanje data.jsx i home.jsx u jednu stranicu
const G=9.80655;
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
    if(!Array.isArray(chart_data) || chart_data.length<5)return [];

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

function percentile(sortedArr,p){
    if(!sortedArr.length)return 0;
    const idx=(sortedArr.length-1)*p;
    const lo=Math.floor(idx);
    const hi=Math.ceil(idx);
    if(lo==hi)return sortedArr[lo];
    return sortedArr[lo]+(sortedArr[hi]-sortedArr[lo])*(idx-lo);
}

export default function Home(){
    //konstante za home - pokretanje sesije, qr skener
    const [sessionStarted,setSessionStarted]=useState(false);
    const navigate=useNavigate();
    const [qrOn,setQrOn]=useState(false);
    const {user,wsConnected,logout}=useAuth();
    const [showData,setShowData]=useState(false);
    const [startPractice,setStartPractice]=useState(false);

    //konstante za prikaz podataka
    const [practices,setPractices]=useState([]);
    const [selPracticeInd,setSelPracticeInd]=useState(null);
    const [compPracticeInd,setCompPracticeInd]=useState(null);
    const [basicStats,setBasicStats]=useState(null);
    const [lastAlterationTime, setLastAlterationTime]=useState(null);
    const [refLeft,setRefLeft]=useState(null);
    const [refRight,setRefRight]=useState(null);

    const selectedPractice=selPracticeInd!==null ? practices[selPracticeInd]:null;
    const chartData=selectedPractice ? computeForce(selectedPractice.sensorData,20,0.12):[];
    const forceHits=selectedPractice ? findingPeaks(chartData):[];

    const total=forceHits.length;
    const streak=longestStreak(forceHits,1500);

    const fat=fatigueDrop(forceHits);
    const dist=forceDistribution(forceHits,10);

    const compPractice=compPracticeInd!==null ? practices[compPracticeInd]:null;
    const compChartData=compPractice ? computeForce(compPractice.sensorData,20,0.12):[];
    const compForceHits=compPractice ? findingPeaks(compChartData):[];
    //const mergedChartData=compChartData.length>0 ? mergeChartData(chartData,compChartData):chartData;

    const currM=practiceMetrics(selectedPractice,forceHits);
    const compM=practiceMetrics(compPractice,compForceHits);
    const progress=compareMetrics(currM,compM);
    const histData=dist.bins.map((b)=>({
        range:`${b.from}-${b.to}`,
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
        const hits=findingPeaks(chartData,{
            refractoryMs:130,
            k:4.5,
            minForceN:5,
        });
    },[selPracticeInd,chartData]);

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
            const t=new Date(hit.timestamp).getTime();
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
    
    function computeForce(sensorData,mKg,alpha=0.12){
        if(!Array.isArray(sensorData) || sensorData.length==0)return [];
        const sorted=sensorData.slice().sort((a,b)=>new Date(a.timestamp).getTime()-new Date(b.timestamp).getTime());
        const t0= new Date(sorted[0].timestamp).getTime();
        const aComb=sorted.map(s=>{
            const topAcc=Math.hypot(s.top_x,s.top_y,s.top_z);
            const botAcc=Math.hypot(s.bottom_x,s.bottom_y,s.bottom_z);
            return (topAcc+botAcc)/2;
        });
        const baseline=emaTrend(aComb,alpha);

        return sorted.map((s,i)=>{
            const aEffG=Math.max(0,aComb[i]-baseline[i]);
            const force=aEffG*mKg*G;
            return{
                index: i,
                time: new Date(s.timestamp).getTime()-t0,
                force,
                aComb:aComb[i],
                baseline:baseline[i],
            };
        });
    }
    function sortHitsByTime(hits){
        return [...hits].sort((a,b)=>a.time-b.time);
    }

    function longestStreak(hits, gapMs=1500){
        const h=sortHitsByTime(hits);
        if(h.length==0)return {length:0, startTime:null, endTime:null};

        let bestLen=1;
        let bestStart=0;
        let currLen=1;
        let currStart=0;

        for(let i=1;i<h.length;i++){
            const dt=h[i].time-h[i-1].time;
            if(dt<=gapMs){
                currLen++;
            }else{
                if(currLen>bestLen){
                    bestLen=currLen;
                    bestStart=currStart;
                }
                currLen=1;
                currStart=i;
            }
        }
        if(currLen>bestLen){
            bestLen=currLen;
            bestStart=currStart;
        }
        const startTime=h[bestStart].time??null;
        const endTime=h[bestStart+bestLen-1].time??null;

        return {length:bestLen, startTime, endTime};
    }

    function fatigueDrop(hits,startFrac=0.3,endFrac=0.3){
        const h=sortHitsByTime(hits);
        if(h.length<4){
            return{startAvg:0,endAvg:0,dropAbs:0,dropPct:0};
        }
        const t0=h[0].time;
        const t1=h[h.length-1].time;
        const dur=Math.max(t1-t0,1);

        const startEnd=t0+dur*startFrac;
        const endStart=t1-dur*endFrac;
        const startHits=h.filter(hit=>hit.time<=startEnd);
        const endHits=h.filter(hit=>hit.time>=endStart);

        const avg=(arr)=>arr.length ? arr.reduce((a,x)=>a+x.force,0)/arr.length:0;
        const startAvg=avg(startHits);
        const endAvg=avg(endHits);

        const dropAbs=startAvg-endAvg;
        const dropPct=startAvg ? dropAbs/startAvg*100:0;

        return{startAvg,endAvg,dropAbs,dropPct};
    }

    function forceDistribution(hits,binSizeN=10){
        const forces=hits.map(h=>h.force).filter(Number.isFinite).sort((a,b)=>a-b);
        if(forces.length==0){
            return{count:0, p50:0, p75:0, p90:0, min:0, max:0, bins:[]};
        }
        const min=forces[0];
        const max=forces[forces.length-1];
        const p50=percentile(forces,0.5);
        const p75=percentile(forces,0.75);
        const p90=percentile(forces,0.9);

        const start=Math.floor(min/binSizeN)*binSizeN;
        const end=Math.ceil(max/binSizeN)*binSizeN;
        const binCount=Math.max(1,Math.round((end-start)/binSizeN));
        const bins= Array.from({length:binCount},(_,i)=>({
            from:start+i*binSizeN,
            to:start+(i+1)*binSizeN,
            n:0,
        }));
        for(const f of forces){
            let idx=Math.floor((f-start)/binSizeN);
            if(idx<0)idx=0;
            if(idx>=bins.length)idx=bins.length-1;
            bins[idx].n++;
        }
        return{count:forces.length, p50, p75, p90, min, max, bins};
    }

    function practiceMetrics(practice,hits){
        if(!practice)return null;
        const start=new Date(practice.started_at).getTime();
        const end=new Date(practice.ended_at).getTime();
        const duration=Math.max(1e-9,(end-start)/(1000*60));

        const count=hits.length;
        const maxForce=count ? Math.max(...hits.map(h=>h.force)) : 0;
        const avgForce=count ? hits.reduce((a,h)=>a+h.force,0)/count : 0;
        const hitsPerMin=count/duration;

        const fat=fatigueDrop(hits);
        return{
            count,
            maxForce,
            avgForce,
            hitsPerMin,
            fatigueDropPct:fat.dropPct,
        };
    }

    function compareMetrics(curr,comp){
        if(!curr || !comp)return null;
        const diff=(a,b)=>a-b;
        const pct=(a,b)=>(b!=0 ? ((a-b)/b)*100 : 0);
         return{
            count:{curr: curr.count, comp:comp.count, diff: diff(curr.count,comp.count),pct:pct(curr.count,comp.count)},
            maxForce:{curr:curr.maxForce,comp:comp.maxForce,diff:diff(curr.maxForce,comp.maxForce),pct:pct(curr.maxForce,comp.maxForce)},
            avgForce:{curr:curr.avgForce,comp:comp.avgForce,diff:diff(curr.avgForce,comp.avgForce),pct:pct(curr.avgForce,comp.avgForce)},
            hitsPerMin:{curr:curr.hitsPerMin,comp:comp.hitsPerMin,diff:diff(curr.hitsPerMin,comp.hitsPerMin),pct:pct(curr.hitsPerMin,comp.hitsPerMin)},
            fatigueDropPct:{curr:curr.fatigueDropPct,comp:comp.fatigueDropPct,diff:diff(curr.fatigueDropPct,comp.fatigueDropPct),pct:pct(curr.fatigueDropPct,comp.fatigueDropPct)},
        };
    }

    function formatPct(x){
        if(!Number.isFinite(x))return "-";
        const sign=x>0 ? "+":"";
        return `${sign}${x.toFixed(1)}%`;
    }
    function resampleSeries(series,key="force",interval=100,maxTime=null){
        if(!series.length)return[];
        const seriesMax=Math.max(...series.map(p=>p.time));
        const tmax = maxTime !==null ? maxTime:seriesMax;

        const valueMap=Object.fromEntries(series.map(d=>[d.time,d[key]]));
        let resampled=[];
        let lastVal=null;
        for(let t=0; t<=tmax;t+=interval){
            const exact=valueMap[t];
            if(exact!==undefined){
                lastVal=exact;
                resampled.push({time:t,val:lastVal});
            }else{
                const past=series.filter(d=>d.time<=t);
                if(past.length>0){
                    lastVal=past[past.length-1][key];
                    resampled.push({time:t,val:lastVal});
                }else{
                    resampled.push({time: t, val:null})
                }
            }
        }
        return resampled;
    }

    function mergeChartData(chartData,compChartData,interval=100){
        if(!chartData)return [];
        if(!compChartData || compChartData.length===0)return chartData;
        const maxTime=Math.max(chartData.length?Math.max(...chartData.map(d=>d.time)):0,
    compChartData.length?Math.max(...compChartData.map(d=>d.time)):0);
    const mainR=resampleSeries(chartData,"force",interval,maxTime);
    const compR=resampleSeries(compChartData,"force",interval,maxTime);

    return mainR.map((p,i)=>({
        time:p.time,
        force:p.val,
        compForce:compR[i]?compR[i].val:null
    }))
    }

    return(
        <div className="container">
            <p>Ulogiran korisnik: <b id="korisnik">{user ? user.username:"user"}</b></p>
            <div className="button-group">
                <Link to="/" onClick={handleLogout} style={{marginLeft: 8, textDecoration: "underline"}}>Odjava</Link>
                <button onClick={handleScansimulation}>
                    simuliray qr kod
                </button>
                {!showData && !sessionStarted && <button onClick={()=>{
                    setShowData(true);setStartPractice(false)}}>Prikaži podatke</button>}
                {!startPractice && !sessionStarted && <button onClick={()=>{
                    setStartPractice(true);setShowData(false)}}>Započni trening</button>}
                 {sessionStarted && ( <button onClick={endSession}>Stop</button>)
            }
            </div>
            {startPractice && (
                <>
                {!sessionStarted && <button onClick={()=>setQrOn(true)}>Otvori qr skener</button>}
                {qrOn &&<button onClick={()=>setQrOn(false)}>Zatvori qr skener</button> }
              <div className={`status-card ${sessionStarted ? "active" : ""}`}>
            {sessionStarted
                ? (<div><Stopwatch running={true} resetKey={0}></Stopwatch></div>)
                : ("Nema aktivne sesije")}
        </div>
           {qrOn && <QrScannerView onScanned={handleScan}/>}
                </>
            )}
            {showData && !startPractice && (
                <>
                {selectedPractice && (<div><button onClick={DeleteSelectedP}>Obriši trening</button>
                <button onClick={()=>setSelPracticeInd(null)}>Ukupna statistika</button></div>
                )}
                {practices.length==0 && (
                    <p>Nema dostupnih treninga.</p>
                )}
                <div>
                    {practices.length>0 && (
                        <div>
                            <select value={selPracticeInd ?? ""}
                            onChange={(e)=>setSelPracticeInd(Number(e.target.value))}>
                                <option value=""disabled>Odaberite trening</option>
                                {practices.map((p,i)=>(
                                    <option key={i} value={i}>
                                        {new Date(p.started_at).toLocaleDateString("hr-HR")}-{new Date(p.ended_at).toLocaleTimeString("hr-HR")}
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
                    {selectedPractice && chartData.length>0 && (
                        <div className='chart-card' style={{width:"100%", height:400,marginTop:30}}>
                            {refLeft!==null && refRight!==null && (<div><button onClick={DeleteSelectedSD}>Obriši odabrane podatke</button> <button onClick={()=>setRefLeft(null)}>Odznači</button></div>)}
                            <ResponsiveContainer>
                                <ComposedChart>
                                    <CartesianGrid strokeDasharray="3 3"/>
                                    <XAxis
                                    dataKey="time"
                                    type="number"
                                    allowDuplicatedCategory={false}
                                    domain={['auto', 'auto']}
                                    tickFormatter={ms =>{
                                        const s=Math.floor(ms/1000);
                                        const min=Math.floor(s/60);
                                        const sec=s%60;
                                        return `${min}:${sec.toString().padStart(2,"0")}`;
                                    }}
                                    label={{value: "Trajanje(mm:ss)",position: "insideBottom", offset:-5}}/>
                                    <YAxis label={{value:"Snaga udarca (N)", angle:-90,position:"insideLeft"}}/>
                                    <Tooltip
                                    labelFormatter={ms => {
                                        const s = Math.floor(ms / 1000);
                                        const min = Math.floor(s / 60);
                                        const sec = s % 60;
                                        return `${min}:${sec.toString().padStart(2, "0")} (mm:ss)`;
                                    }}/>
                                    <Legend/>
                                    <Line
                                    data={chartData.sort((a,b)=>a.time-b.time)}
                                    dataKey="force"
                                    stroke="red"
                                    name="Trening"
                                    dot={false}
                                    isAnimationActive={false}
                                    />
                                    <Line
                                    data={forceHits}
                                    dataKey="force"
                                    stroke="red"
                                    name="Udarci"
                                    dot={{r: 5, stroke: "black", strokeWidth: 2, fill: "red"}}
                                    legendType='none'
                                    connectNulls={false}
                                    isAnimationActive={false}
                                    strokeOpacity={0}
                                    />
                                    {compChartData.length > 0 && (
                                        <Line
                                        data={compChartData.sort((a, b) => a.time - b.time)}
                                        dataKey="force"
                                        stroke="blue"
                                        name="Usporedni trening"
                                        dot={false}
                                        isAnimationActive={false}
                                        />
                                    )}
                                    {compForceHits.length>0 && (
                                        <Line
                                    data={compForceHits}
                                    dataKey="force"
                                    stroke="blue"
                                    name="Udarci"
                                    dot={{r: 5, stroke: "black", strokeWidth: 2, fill: "blue"}}
                                    legendType='none'
                                    connectNulls={false}
                                    isAnimationActive={false}
                                    strokeOpacity={0}
                                    />
                                    )}
                                    {refLeft && refRight && (
                                        <ReferenceArea
                                        x1={Math.min(refLeft, refRight)}
                                        x2={Math.max(refLeft, refRight)}
                                        fill="rgba(0, 123, 255, 0.2)"
                                        stroke="rgba(0, 123, 255, 0.6)"
                                        />
                                        )}
                                </ComposedChart>
                            </ResponsiveContainer>
                            </div>
                    )}
                    {selectedPractice && (
                        <div>
                            <div>
                                <p>Usporedi s:</p>
                            {practices.length>0 && (
                        <div>
                            <select value={compPracticeInd ?? ""}
                            onChange={(e)=>setCompPracticeInd(Number(e.target.value))}>
                                <option value=""disabled>Odaberite trening</option>
                                {practices.map((p,i)=>(
                                    <option key={i} value={i}>
                                        {new Date(p.started_at).toLocaleDateString("hr-HR")}-{new Date(p.ended_at).toLocaleTimeString("hr-HR")}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                            </div>
                            <h2>Statistika odabranog treninga</h2>
                            <div>
                                <h3>Osnovni podaci</h3>
                                <p><strong>Vreća ID: </strong>{selectedPractice.deviceid}</p>
                                <p><strong>Početak treninga: </strong>{new Date(selectedPractice.started_at).toLocaleString("hr-HR")}</p>
                                <p><strong>Kraj treninga: </strong>{new Date(selectedPractice.ended_at).toLocaleString("hr-HR")}</p>
                                <p><strong>Broj udaraca: </strong>{forceHits.length}</p>
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
                                <h4>Udarci</h4>
                                {forceHits.length==0 && <p>Nema zabilježenih udaraca</p>}
                                {forceHits.length>0 && (
                                    <p>
                                    {forceHits.map((hit,i)=>
                                       `${new Date(hit.time).toLocaleTimeString("hr-HR",{hour: "2-digit",minute:"2-digit",second:"2-digit"})}, Snaga: ${hit.force.toFixed(2)} N`).join(" | ")
                                    }
                                    </p>
                                )}
                                <h3>Napredne statistike</h3>
                                <p><strong>Najduža serija: </strong>{streak.length} udaraca {streak.startTime && (<>({new Date(streak.startTime).toLocaleTimeString("hr-HR")}-{new Date(streak.endTime).toLocaleTimeString("hr-HR")})</>)}</p>
                                <p><strong>Pad snage (fatigue):</strong>{" "} {fat.dropPct.toFixed(1)}% ({fat.startAvg.toFixed(1)}N → {fat.endAvg.toFixed(1)} N)</p>
                                <p><strong>Distribucija snage</strong></p>
                                <ul>
                                    <li>P50 (medijan): {dist.p50.toFixed(1)} N</li>
                                    <li>P75: {dist.p75.toFixed(1)} N</li>
                                    <li>P90: {dist.p90.toFixed(1)} N</li>
                                    <li>Min/Max: {dist.min.toFixed(1)} N / {dist.max.toFixed(1)} N</li>
                                </ul>
                                {dist.bins.length>0 && (
                                    <div style={{width:"100%",height: 260, marginTop: 12}}>
                                        <ResponsiveContainer>
                                            <BarChart data={histData} margin={{top:10, right: 20, left:0, bottom:40}}>
                                                <CartesianGrid strokeDasharray="3 3"/>
                                                <XAxis
                                                dataKey="range"
                                                interval={0}
                                                angle={-35}
                                                textAnchor='end'
                                                height={60}
                                                />
                                                <YAxis allowDecimals={false}/>
                                                <Tooltip/>
                                                <Bar dataKey="count" fill="red" name="Broj udaraca"/>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                                {compPracticeInd && progress && (
                                    <div style={{marginTop: 10}}>
                                        <p><strong>Progres vs odabrani trening: </strong></p>
                                        <ul>
                                            <li>
                                                Udarci: {progress.count.curr} vs {progress.count.comp} ({formatPct(progress.count.pct)})
                                            </li>
                                            <li>
                                                Max udarac: {Number.isFinite(progress.maxForce.curr)?progress.maxForce.curr.toFixed(1):"-"} N vs {Number.isFinite(progress.maxForce.comp)?progress.maxForce.comp.toFixed(1):"-"}N ({formatPct(progress.maxForce.pct)})
                                            </li>
                                            <li>
                                                Prosjek: {progress.avgForce.curr.toFixed(1)} N vs {progress.avgForce.comp.toFixed(1)} N ({formatPct(progress.avgForce.pct)})
                                            </li>
                                            <li>
                                                Udarci/min: {progress.hitsPerMin.curr.toFixed(2)} vs {progress.hitsPerMin.comp.toFixed(2)} ({formatPct(progress.hitsPerMin.pct)})
                                            </li>
                                            <li>
                                                Fatigue drop: {progress.fatigueDropPct.curr.toFixed(1)}% vs {progress.fatigueDropPct.comp.toFixed(1)}% ({formatPct(progress.fatigueDropPct.pct)})
                                            </li>
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                </>
            )}
            </div>
    )
}