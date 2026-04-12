//trening 16.3.2026 u 08:03 nije relevantan nisam napravila usrednjavanje nakon što sam objesila vreću (usrednilo se na podu, pa ne valjaju podaci) -- ljudska greška neće se dogodit (vreća će visit prije nego se netko spoji na nju - tu sam ja samo bila idiot)
import {Link} from 'react-router-dom';
import { useEffect,useState,useMemo, forwardRef } from 'react';
import { onWSMessage, sendWS } from '../wsClient'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import "../styles/Data.css";
import { useAuth } from '../auth/AuthProvider';
import { BarChart, Bar, Legend } from 'recharts';
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
    const [basicStats,setBasicStats]=useState(null);
    const [lastAlterationTime,setLastAlterationTime]=useState(null);
    const[refLeft,setRefLeft]=useState(null);
    const[refRight,setRefRight]=useState(null);
   
    const selectedPractice= selPracticeInd !== null ? practices[selPracticeInd] : null;
    const chartData=selectedPractice ? computeForce(selectedPractice.sensorData,20,0.12):[];
    const forceHits = selectedPractice ? findingPeaks(chartData) : []

    const total=forceHits.length;
    const streak=longestStreak(forceHits,1500);

    const fat=fatigueDrop(forceHits);
    const dist=forceDistribution(forceHits,10);

    const prevPractice=selPracticeInd>0 ? practices[selPracticeInd-1]:null;
    const prevChart=prevPractice?computeForce(prevPractice.sensorData,20,0.12):[];
    const prevHits=prevPractice?findingPeaks(prevChart):[];

    const currM=practiceMetrics(selectedPractice,forceHits);
    const prevM=practiceMetrics(prevPractice,prevHits);
    const progress=compareMetrics(currM,prevM);

    const histData=dist.bins.map((b)=>({
        range: `${b.from}-${b.to}`,
        count:b.n,
        from: b.from,
        to: b.to,
    }));

    
    //dohvat podataka o treninzima i postavljanje listenera za nove podatke sa servera
    useEffect(() => {
        if(!user || !wsConnected)return;
        const savedPractices=localStorage.getItem(`practices_${user.userId}`);//dodaj da za različitog usera je raličito spremanje (npr practices_userid)
        const parsed=savedPractices ? JSON.parse(savedPractices) : [];
        const sortedPr=parsed.slice().sort((a,b)=>new Date(a.started_at).getTime()-new Date(b.started_at).getTime)
        setPractices(sortedPr);
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

    function sortHitsByTime(hits){
        return [...hits].sort((a,b)=>a.time-b.time);
    }

    function percentile(sortedArr,p){
        if(!sortedArr.length)return 0;
        const idx=(sortedArr.length-1)*p;
        const lo=Math.floor(idx);
        const hi=Math.ceil(idx);
        if(lo==hi)return sortedArr[lo];
        return sortedArr[lo]+(sortedArr[hi]-sortedArr[lo])*(idx-lo);
    }

    function longestStreak(hits, gapMs=1500){
        const h=sortHitsByTime(hits);
        if(h.length===0)return {length:0,startTime:null,endTime:null};

        let bestLen=1;
        let bestStart=0;
        let curLen=1;
        let curStart=0;

        for (let i=1;i<h.length;i++){
            const dt=h[i].time-h[i-1].time;
            if(dt<=gapMs){
                curLen++;
            }else{
                if(curLen>bestLen){
                    bestLen=curLen;
                    bestStart=curStart;
                }
                curLen=1;
                curStart=i;
            }
        }
        if(curLen>bestLen){
            bestLen=curLen;
            bestStart=curStart;
        }
        const startTime=h[bestStart].time??null;
        const endTime=h[bestStart+bestLen-1]?.time ?? null;

        return {length:bestLen,startTime,endTime};
    }

    function fatigueDrop(hits, startFrac=0.3,endFrac=0.3){
        const h=sortHitsByTime(hits);
        if(h.length<4){
            return {startAvg:0, endAvg:0, dropAbs:0, dropPct:0};
        }

        const t0=h[0].time;
        const t1=h[h.length-1].time;
        const dur=Math.max(1,t1-t0);

        const startEnd=t0+dur*startFrac;
        const endStart=t1-dur*endFrac;

        const startHits=h.filter(x=>x.time<=startEnd);
        const endHits=h.filter(x=>x.time>=endStart);

        const avg=(arr)=>arr.length ? arr.reduce((a,x)=>a+x.force,0)/arr.length:0;
        const startAvg=avg(startHits);
        const endAvg=avg(endHits);

        const dropAbs=startAvg-endAvg;
        const dropPct=startAvg>0 ? (dropAbs/startAvg)*100:0;

        return {startAvg,endAvg,dropAbs,dropPct};
    }

    function forceDistribution(hits, binSizeN=10){
        const forces=hits.map(h=>h.force).filter(Number.isFinite).sort((a,b)=>a-b);
        if(!forces.length){
            return {count:0, p50:0, p75: 0, p90: 0, min: 0, max: 0, bins: []};
        }
        const min=forces[0];
        const max=forces[forces.length-1];

        const p50=percentile(forces,0.50);
        const p75=percentile(forces,0.75);
        const p90=percentile(forces,0.90);

        const start=Math.floor(min/binSizeN)*binSizeN;
        const end=Math.ceil(max/binSizeN)*binSizeN;

        const binCount=Math.max(1,Math.round((end-start)/binSizeN));
        const bins=Array.from({length:binCount},(_,i)=>({
            from: start+i*binSizeN,
            to: start+(i+1)*binSizeN,
            n:0,
        }));

        for (const f of forces){
            let idx=Math.floor((f-start)/binSizeN);
            if(idx<0)idx=0;
            if(idx>=bins.length)idx=bins.length-1;
            bins[idx].n++;
        }
        return{count:forces.length,p50,p75,p90,min,max,bins};
    }

    function practiceMetrics(practice, hits){
        if(!practice)return null;

        const start=new Date(practice.started_at).getTime();
        const end=new Date(practice.ended_at).getTime();
        const duration=Math.max(1e-9,(end-start)/(1000*60));

        const count=hits.length;
        const maxForce=count ? Math.max(...hits.map(h=>h.force)):0;
        const avgForce=count ? hits.reduce((a,h)=>a+h.force,0)/count:0;
        const hitsPerMin=count/durationMin;

        const fat=fatigueDrop(hits);

        return{
            count,
            maxForce,
            avgForce,
            hitsPerMin,
            fatigueDropPct:fat.dropPct,
        };
    }

    function compareMetrics(curr,prev){
        if(!curr || !prev)return null;

        const diff=(a,b)=>a-b;
        const pct=(a,b)=>(b!==0 ? ((a-b)/b)*100:0);

        return{
            count:{curr: curr.count, prev:prev.count, diff: diff(curr.count,prev.count),pct:pct(curr.count,prev.count)},
            maxForce:{curr:curr.maxForce,prev:prev.maxForce,diff:diff(curr.maxForce,prev.maxForce),pct:pct(curr.maxForce,prev.maxForce)},
            avgForce:{curr:curr.avgForce,prev:prev.avgForce,diff:diff(curr.avgForce,prev.avgForce),pct:pct(curr.avgForce,prev.avgForce)},
            hitsPerMin:{curr:curr.hitsPerMin,prev:prev.hitsPerMin,diff:diff(curr.hitsPerMin,prev.hitsPerMin),pct:pct(curr.hitsPerMin,prev.hitsPerMin)},
            fatigueDropPct:{curr:curr.fatigueDropPct,prev:prev.fatigueDropPct,diff:diff(curr.fatigueDropPct,prev.fatigueDropPct),pct:pct(curr.fatigueDropPct,prev.fatigueDropPct)},
        };
    }

    function formatPct(x){
        if(!Number.isFinite(x))return "-";
        const sign=x>0 ? "+":"";
        return `${sign}${x.toFixed(1)}%`;
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
                        <h3>Napredne statistike</h3>
                        <p><strong>Najduža serija: </strong>{streak.length} udaraca {streak.startTime && (<>({new Date(streak.startTime).toLocaleTimeString("hr-HR")}-{new Date(streak.endTime).toLocaleTimeString("hr-HR")})</>)}</p>
                        <p><strong>Pad snage (fatigue):</strong>{" "}
                        {fat.dropPct.toFixed(1)}% ({fat.startAvg.toFixed(1)} N → {fat.endAvg.toFixed(1)} N)</p>

                        <p><strong>Distribucija snage</strong></p>
                        <ul>
                            <li>P50 (medijan): {dist.p50.toFixed(1)} N</li>
                            <li>P75: {dist.p75.toFixed(1)} N</li>
                            <li>P90: {dist.p90.toFixed(1)} N</li>
                            <li>Min/Max: {dist.min.toFixed(1)} N / {dist.max.toFixed(1)} N</li>
                        </ul>
                        {dist.bins.length>0 && (
                            <div style={{width:"100%", height: 260, marginTop: 12}}>
                                <ResponsiveContainer>
                                    <BarChart data={histData} margin={{top: 10, right:20, left: 0, bottom: 40}}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                        dataKey="range"
                                        interval={0}
                                        angle={-35}
                                        textAnchor="end"
                                        height={60}
                                        />
                                        <YAxis allowDecimals={false}/>
                                        <Tooltip />
                                        <Bar dataKey="count" fill="#3b82f6"  name="Broj udaraca"/>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        <div style={{marginTop: 10}}>
                            <p><strong>Progres vs prethodni trening: </strong></p>
                            {!prevPractice || !progress ? (<p>Nema prethodnog treninga za usporedbu.</p>):
                            (
                                <ul>
                                    <li>
                                        Udarci: {progress.count.curr} vs {progress.count.prev} ({formatPct(progress.count.pct)})
                                    </li>
                                    <li>
                                        Max udarac: {progress.maxForce.curr.toFixed(1)} N vs {progress.maxForce.prev.toFixed(1)} N ({formatPct(progress.maxForce.pct)})
                                    </li>
                                    <li>
                                        Prosjek: {progress.avgForce.curr.toFixed(1)} N vs {progress.avgForce.prev.toFixed(1)} N ({formatPct(progress.avgForce.pct)})
                                    </li>
                                    <li>
                                        Udarci/min: {progress.hitsPerMin.curr.toFixed(2)} vs {progress.hitsPerMin.prev.toFixed(2)} N ({formatPct(progress.hitsPerMin.pct)})
                                    </li>
                                    <li>
                                        Fatigue drop: {progress.fatigueDropPct.curr.toFixed(1)}% vs {progress.fatigueDropPct.prev.toFixed(1)}% ({formatPct(progress.fatigueDropPct.pct)})
                                    </li>
                                </ul>
                            )}
                        </div>




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
