import React,{useEffect,useRef,useState,useMemo, DO_NOT_USE_OR_YOU_WILL_BE_FIRED_EXPERIMENTAL_IMG_SRC_TYPES} from 'react';
import { View, Text, Button, Alert, Pressable, ScrollView,FlatList,TouchableOpacity,LayoutChangeEvent } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectWebSocket, onWSMessage, sendWS,closeWS } from '../services/wsClient';
import {jwtDecode} from 'jwt-decode';
import { WSMessage } from '../services/types';
import {router} from 'expo-router';
import QrScanner from  "../components/QrScanner";
import {styles} from "./styles/homeStyles"
import Stopwatch from '@/components/Stopwatch';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import { Line } from 'react-native-svg';
import { opacity } from 'react-native-reanimated/lib/typescript/Colors';

type SensorHit={
    deviceid:number;
    type:string;
    top_x:number;
    top_y:number;
    top_z:number;
    bottom_x:number;
    bottom_y:number;
    bottom_z:number;
    timestamp:string;
}

type Practice={
    userid:string;
    deviceid:number;
    started_at:string;
    ended_at:string;
    sensorData:SensorHit[];
}

const G=9.80655;

function formatTime(ms:number){
    const s=Math.floor(ms/1000);
    const min=Math.floor(s/60);
    const sec=s%60;
    return `${min}:${sec.toString().padStart(2,'0')}`;
}

function emaTrend(x:number[],alpha:number){
    const trend=new Array(x.length).fill(0);
    trend[0]=x[0] ?? 0;
    for(let i=1;i<x.length;i++){
        trend[i]=alpha*x[i]+(1-alpha)*trend[i-1]
    }
    return trend;
}

function computeForce(sensorData:SensorHit[],mKg:number,alpha=0.12){
    if(!Array.isArray(sensorData)||sensorData.length==0)return [];
    const sorted=sensorData.slice().sort((a,b)=>new Date(a.timestamp).getTime()-new Date(b.timestamp).getTime());
    const t0= new Date(sorted[0].timestamp).getTime();
    const aComb=sorted.map((s)=>{
        const topAcc=Math.hypot(s.top_x,s.top_y,s.top_z);
        const bottomAcc=Math.hypot(s.bottom_x,s.bottom_y,s.bottom_z);
        return(topAcc+bottomAcc)/2;
    });
    const baseline=emaTrend(aComb,alpha);

    return sorted.map((s,i)=>{
        const aEffG=Math.max(0,aComb[i]-baseline[i]);
        const force=aEffG*mKg*G;
        return{
            index:i,
            time:new Date(s.timestamp).getTime() - t0,
            force,
        };
    });
}

function median(arr:number[]){
    if(arr.length===0)return 0;
    const a=[...arr].sort((x,y)=>x-y);
    const mid=Math.floor(a.length/2);
    return a.length%2 ? a[mid]:(a[mid-1]+a[mid])/2;
}

function mad(arr:number[]){
    const m=median(arr);
    const dev=arr.map((x)=>Math.abs(x-m));
    return median(dev) || 1e-9;
}

function findingPeaks(chartData:{time:number;force:number;index:number}[],opts:{refractoryMs?:number;
    k?:number;
    minForceN?:number;
    minDTMS?:number;
    releaseRatio?:number;
}={}){
    const {
        refractoryMs=110,
        k=4.5,
        minForceN=5,
        minDTMS=5,
        releaseRatio=0.8,
    }=opts;
    if(!Array.isArray(chartData)||chartData.length<5)return[];
    const t=chartData.map((p)=>p.time);
    const f=chartData.map((p)=>Math.max(0,p.force));

    const dF=new Array(f.length).fill(0);
    for(let i=1;i<f.length;i++){
        const dt=Math.max(minDTMS,t[i]-t[i-1]);
        dF[i]=(f[i]-f[i-1])/dt;
    }

    const absdF=dF.map((v)=>Math.abs(v));
    const thr=median(absdF)+k*mad(absdF);

    const enterThr=Math.max(thr,minForceN);
    const releaseThr=enterThr*releaseRatio;

    const hits:{time:number;force:number;chartIndex:number}[]=[];
    let inHit=false;
    let peak:{i:number;force:number}|null=null;

    for(let i=0;i<f.length;i++){
        const time=t[i];
        const force=f[i];

        if(!inHit){
            if(force>=enterThr){
                const last=hits[hits.length-1];
                if(last && time-last.time<refractoryMs)continue;

                inHit=true;
                peak={i,force};
            }
        }else{
            if(peak && force>peak.force)peak={i,force};
            if(force<=releaseThr && peak){
                hits.push({
                    chartIndex:peak.i,
                    time:t[peak.i],
                    force:peak.force,
                });
                inHit=false;
                peak=null;
            }
        }
    }
    if(inHit && peak){
        hits.push({
            chartIndex:peak.i,
            time:t[peak.i],
            force:peak.force
        });
    }
    return hits;
}

function formatDuration(ms:number){
    const s=Math.floor(ms/1000);
    const min=Math.floor(s/60);
    const sec=s%60;
    return `${min}:${sec.toString().padStart(2,'0')}`;
}

function minutesBetween(aIso:string, bIso:string){
    return(new Date(bIso).getTime()-new Date(aIso).getTime())/60000;
}

function formatHrTime(ms:number){
    return new Date(ms).toLocaleTimeString("hr-HR",{
        hour:"2-digit",
        minute:"2-digit",
        second:"2-digit",
    });
}

function percentile(sortedArr:number[],p:number){
    if(!sortedArr.length)return 0;
    const idx=(sortedArr.length-1)*p;
    const lo=Math.floor(idx);
    const hi=Math.floor(idx);

    if(lo===hi)return sortedArr[lo];
    return sortedArr[lo]+(sortedArr[hi]-sortedArr[lo])*(idx-lo);
}
function sortHitsByTime(hits:any[]){
    return [...hits].sort((a,b)=>a.time-b.time);
}

function longestStreak(hits:any[],gapMs=1500){
    const h=sortHitsByTime(hits);
    if(h.length===0) return {length:0, startTime:null, endTime:null};
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
                bestStart=currStart
            }
            currLen=1;
            currStart=i;
        }
    }
    if(currLen>bestLen){
        bestLen=currLen;
        bestStart=currStart;
    }
    const startTime=h[bestStart]?.time ?? null;
    const endTime=h[bestStart+bestLen-1]?.time ?? null;
    return{length:bestLen,startTime,endTime};
}

function fatigueDrop(hits:any[],startFrac=0.3,endFrac=0.3){
    const h=sortHitsByTime(hits);
    if(h.length<4){
        return {startAvg:0, endAvg:0, dropAbs:0, dropPct:0};
    }
    const t0=h[0].time;
    const t1=h[h.length-1].time;
    const dur=Math.max(t1-t0,1);
    const startEnd=t0+dur*startFrac;
    const endStart=t1-dur*endFrac;
    const startHits=h.filter(x=>x.time<=startEnd);
    const endHits=h.filter(x=>x.time>=endStart);
    const avg=(arr:any[])=>arr.length ? arr.reduce((a,x)=>a+x.force,0)/arr.length:0;
    const startAvg=avg(startHits);
    const endAvg=avg(endHits);
    const dropAbs=startAvg-endAvg;
    const dropPct=startAvg>0 ? (dropAbs/startAvg)*100:0;
    return {startAvg,endAvg,dropAbs,dropPct}
}

function forceDistribution(hits: any[],binSizeN=10){
    const forces=hits.map(h=>h.force).filter((x:number)=>Number.isFinite(x)).sort((a:number,b:number)=>a-b);
    if(forces.length===0){
        return{count:0,p50: 0, p75: 0, p90: 0, min: 0, max: 0, bins: []};
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
    return{count:forces.length,p50,p75,p90,min,max,bins};
}



const SCREEN_WIDTH=Dimensions.get("window").width-28;

export default function HomeScreen(){
    const [sessionStarted, setSessionStarted]=useState(false);
    const [user,setUser]=useState<any>(null);
    const [token,setToken]=useState<string | null>(null);

    const [qrOn, setQrOn]=useState(false);
    const scanLockRef=useRef(false);

    const [practices, setPractices]=useState<Practice[]>([]);
    const [selPracticeInd, setSelPracticeInd]=useState<number|null>(null);
    const [compPracticeInd, setCompPracticeInd]=useState<number|null>(null);
    const [websocketConnected, setWebsocketConnected]=useState<boolean>(false);
    const [lastAlterationTime, setLastAlterationTime]=useState<Date|null>(null);

    const [refLeft, setRefLeft]=useState<number|null>(null);
    const [refRight, setRefRight]=useState<number|null>(null);
    const [liveData,setLivedata]=useState<SensorHit[]>([]);
    const [showData, setShowData]=useState(false);
    const [startPractice,setStartPractice]=useState(false);

    const selectedPractice=selPracticeInd!==null ? practices[selPracticeInd]:null;
    const compPractice=compPracticeInd!==null ? practices[compPracticeInd]:null;
    const chartData=useMemo(()=>{
        if(!selectedPractice)return[];
        return computeForce(selectedPractice.sensorData||[],20,0.12);
    },[selectedPractice]);
    const compChartData=useMemo(()=>{
        if(!compPractice)return[];
        return computeForce(compPractice.sensorData||[],20,0.12);
    },[compPractice]);
    const chartKitData=useMemo(()=>{
        if(!chartData.length)return null;

        const n=chartData.length;
        const label=6;
        const labels=new Array(n).fill("")
        for (let i=0;i<label;i++){
            const idx=Math.floor((i*(n-1))/(label-1));
            labels[idx]=formatTime(chartData[idx].time);
        }
        return{
            labels,
            datasets:[
                {
                    data:chartData.map((p)=>p.force),
                    color: ()=>"rgba(255,0,0,1)",
                    strokeWidth:2,
                },
                ...(compChartData.length>0 ? [{
                    data:compChartData.map((p)=>p.force),
                    color:()=>"rgba(38,90,255,1)",
                    strokeWidth:2,
                }]:[])
            ],
        };
    },[chartData,compChartData]);
    
    const forceHits=useMemo(()=>{
        if(!selectedPractice)return[];
        return findingPeaks(chartData,{refractoryMs:110,k:4.5,minForceN:5});
    },[selectedPractice,chartData]);
    const compForceHits=useMemo(()=>{
        if(!compPractice)return [];
        return findingPeaks(compChartData,{refractoryMs:110,k:4.5,minForceN:5});
    },[compPractice,compChartData]);

    const total=useMemo(()=>{
        return forceHits.length
    },[forceHits]);

    const streak=useMemo(()=>{
        return longestStreak(forceHits,1500);
    },[forceHits]);

    const fat=useMemo(()=>{
        return fatigueDrop(forceHits);
    },[forceHits]);

    const dist=useMemo(()=>{
        return forceDistribution(forceHits,10);
    },[forceHits]);

    const currM=useMemo(()=>practiceMetrics(selectedPractice,forceHits),[selectedPractice]);
    const compM=useMemo(()=>practiceMetrics(compPractice,compForceHits),[compPractice]);
    const progress=useMemo(()=>compareMetrics(currM,compM),[currM,compM]);
    const histData=dist.bins.map((b)=>({
        range:`${b.from}-${b.to}`,
        count:b.n,
        from:b.from,
        to:b.to,
    }));

    useEffect(()=>{
    if(!user)return;
    const loadCache=async()=>{
      const practicesKey = `practices_${user.userId}`;
      const altKey = `lastAlteration_${user.userId}`;
      
      const savedPracticesStr = await AsyncStorage.getItem(practicesKey);
      const savedAltStr = await AsyncStorage.getItem(altKey);
      
      const parsed = savedPracticesStr ? JSON.parse(savedPracticesStr) : [];
      setPractices(parsed);

      const altDate = savedAltStr ? new Date(savedAltStr) : null;
      setLastAlterationTime(altDate);
    };
    loadCache();
  },[user])

    

    useEffect(()=>{
        if(!user || !websocketConnected)return;
        const loadandRequest=async()=>{
            const practicesKey=`practices_${user.userId}`;
            const altKey=`lastAlteration_${user.userId}`;

            const savedPracticesStr=await AsyncStorage.getItem(practicesKey);
            const savedAltStr=await AsyncStorage.getItem(altKey);

            const parsed=savedPracticesStr ? JSON.parse(savedPracticesStr):[];
            //setPractices(parsed);

            const altDate=savedAltStr ? new Date(savedAltStr):null;
            //setLastAlterationTime(altDate);

            requestData(parsed,altDate);
        };
        loadandRequest();

        const unsubscribe=onWSMessage(async(msg:WSMessage)=>{
            if(msg.userId!==user.userId)return;
            if(msg.type==="data-redo"){
                const all: Practice[]=Array.isArray(msg.data) ? msg.data:[];
                setPractices(all);
                await AsyncStorage.setItem(`practices_${user.userId}`,JSON.stringify(all));
                return;
            }
            if(msg.type==="data-msg"){
                const incoming:Practice[]=Array.isArray(msg.data)?msg.data:[];
                if(incoming.length===0){
                    return;
                }
                setPractices((prev)=>{
                    const upd=[...prev,...incoming];
                    AsyncStorage.setItem(`practices_${user.userId}`,JSON.stringify(upd));
                    return upd;
                });
                return;
            }
            if(msg.type==="scan-ok"){
                setSessionStarted(true);
            }
            if(msg.type==="no-active-bag"){
                console.log("Nema aktivne vreće");
            }
            if(msg.type="delete-result"){
                //overallStats();
            }
        });
        return ()=>unsubscribe?.();  
    },[user,websocketConnected]);

    useEffect(()=>{
        if(!sessionStarted)return;
        setLivedata([]);
        const unsubscribe=onWSMessage((msg:WSMessage)=>{
            if(msg.userId!=user.userId)return;
            if(msg.type==="live-data"){
                setLivedata((prev)=>[...prev,msg.data]);
            }
        });
        return ()=>unsubscribe?.();
    },[sessionStarted]);

    const liveChartData=useMemo(()=>{
        if(!liveData.length)return[];
        return computeForce(liveData,20,0.12);
    },[liveData]);
    const liveChartKitData=useMemo(()=>{
        if(!liveChartData.length)return null;
        const n=liveChartData.length;
        const labels= new Array(n).fill("")
        for(let i=0; i<6;i++){
            const idx=Math.floor((i*(n-1))/5);
            labels[idx]=formatHrTime(liveChartData[idx].time);
        }
        return{
            labels,
            datasets:[
                {
                    data:liveChartData.map((p)=>p.force),
                    color:()=>"rgba(255,0,0,1)",
                    strokeWidth:2,
                },
                
            ],
        };
    },[liveChartData])

    function requestData(localPractices:Practice[],alt:Date|null){
        if(!token)return;
        if(!localPractices||localPractices.length===0){
            sendWS({type:"data-req"}as WSMessage);
            return;
        }
        const last=localPractices[localPractices.length-1];
        const timestamp=last.ended_at;

        sendWS({type:"data-req",timestamp,alteration:alt?alt.toISOString():null,practices:JSON.stringify(localPractices),}as WSMessage);
        console.log("Poslan zahtjev za podatke:",{timestamp,alteration:alt?alt.toISOString():null});
    }
    async function deleteSelectedPractice(){
        if(selPracticeInd==null || !selectedPractice || !user)return;
        const updated=practices.filter((_,i)=>i!==selPracticeInd);
        setPractices(updated);
        setSelPracticeInd(null);

        await AsyncStorage.setItem(`practices_${user.userId}`,JSON.stringify(updated));

        const now=new Date();
        setLastAlterationTime(now);
        await AsyncStorage.setItem(`lastAlteration_${user.userId}`,now.toISOString());

        sendWS({
            type:"delete-practices",
            practices:selectedPractice,
            userId:user.userId,
        }as WSMessage);
    }
    
    async function deleteSelectedSD(){
        if(!selectedPractice || refLeft===null || !user)return;
        //const tLeft=refLeft;
        const t0= new Date(selectedPractice.sensorData[0].timestamp).getTime();
        const absLeft=t0+refLeft

        const newSD=selectedPractice.sensorData.filter((s)=>{
            const t=new Date(s.timestamp).getTime();
            return t<absLeft;
        });
        const oldEndedAt=selectedPractice.ended_at;
        const newEndedAt=newSD[newSD.length-1].timestamp;
        const bagId=selectedPractice.deviceid;

        const updP:Practice={
            ...selectedPractice,
            ended_at:newEndedAt,
            sensorData: newSD,
        };
        const updPs=practices.map((p,i)=>i===selPracticeInd ? updP:p);
        setPractices(updPs);
        await AsyncStorage.setItem(`practices_${user.userId}`,JSON.stringify(updPs));
        sendWS({
            type:"delete-sd",
            practiceToDelete:updP,
            timestamp:newEndedAt,
            deleteto:oldEndedAt,
            bagid:bagId,
        }as WSMessage);

        setRefRight(refLeft);
        setRefLeft(null);
        setLastAlterationTime(new Date());
        await AsyncStorage.setItem(`lastAlteration_${user.userId}`,new Date().toISOString());
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

    function formatPct(x:number){
        if(!Number.isFinite(x))return "-";
        const sign=x>0 ? "+":"";
        return `${sign}${x.toFixed(1)}%`;
    }
    const alertLockRef=useRef(false);
    function safeAlert(title:string, message:string){
        if(alertLockRef.current)return;
        alertLockRef.current=true;
        Alert.alert(title,message,[{
            text:"OK",
            onPress:()=>{alertLockRef.current=false;}
        }]);
    }
    useEffect(()=>{
        const init=async()=>{
            const token1=await AsyncStorage.getItem('token');
            if(!token1){
                router.replace("/login");
                return;
            }
            setToken(token1);
            try{
                const payload:any=jwtDecode(token1);
                setUser(payload);
            }catch(e){
                console.warn("Ne mogu dekodirati token");
            }
             connectWebSocket(token1,()=>setWebsocketConnected(true),undefined,undefined,(err:any)=>console.error("WS error",err));
        };
        init();
    },[]);


    const handleScanSimulation = ()=>{
         const payload: WSMessage = {
    type: 'scan', // This matches the allowed `type` values
    bagid: 1111,
    weight: 20,
    elasticity: 0.88,
  };
        sendWS(payload);
        console.log('Poslano na WS:',payload);
    };

    const endSession=()=>{
        sendWS({type: 'end-session'});
        console.log('Poslano na WS: end-session');
        setSessionStarted(false);
    }

    const logout=async()=>{
        await AsyncStorage.removeItem('token');
        router.replace('/login');
    };

    const HandleLogout=()=>{
      AsyncStorage.removeItem('token');
      closeWS();
      router.replace('/login');
    }

    const handleScan=(payload:any)=>{
        if(scanLockRef.current) return;
        scanLockRef.current=true;
        setQrOn(false);
        
        const scanMsg: WSMessage={
            type: "scan",
            bagid: payload.id,
            weight: payload.weight,
            elasticity: payload.elasticity,
        };

        const ok=sendWS(scanMsg);
        if(!ok){
            Alert.alert("Greška", "WebSocket nije spojen. Pokušaj ponovno.");
            scanLockRef.current=false;
        }
    };

    function practiceMetrics(practice:Practice|null,hits:{time:number;force:number;chartIndex:number}[]){
        if(!practice)return null;
        const start=new Date(practice.started_at).getTime();
        const end=new Date(practice.ended_at).getTime();
        const duration=Math.max(1e-9,(end-start)/(1000*60));

        const count=hits.length;
        const maxForce=count ? Math.max(...hits.map(h=>h.force)):0;
        const avgForce=count ? hits.reduce((a,h)=>a+h.force,0)/count:0;
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

    function compareMetrics(curr:{count:number,maxForce:number,avgForce:number,hitsPerMin:number,fatigueDropPct:number}|null,comp:{count:number,maxForce:number,avgForce:number,hitsPerMin:number,fatigueDropPct:number}|null){
        if(!curr || !comp)return null;
        const dif=(a:number,b:number)=>a-b;
        const pct=(a:number,b:number)=>(b!=0 ? ((a-b)/b)*100:0);
        return{
            count:{curr:curr.count,comp:comp.count,diff:dif(curr.count,comp.count),pct:pct(curr.count,comp.count)},
            maxForce:{curr:curr.maxForce,comp:comp.maxForce,diff:dif(curr.maxForce,comp.maxForce),pct:pct(curr.maxForce,comp.maxForce)},
            avgForce:{curr:curr.avgForce,comp:comp.avgForce,diff:dif(curr.avgForce,comp.avgForce),pct:pct(curr.avgForce,comp.avgForce)},
            hitsPerMin:{curr:curr.hitsPerMin,comp:comp.hitsPerMin,diff:dif(curr.hitsPerMin,comp.hitsPerMin),pct:pct(curr.hitsPerMin,comp.hitsPerMin)},
            fatigueDropPct:{curr:curr.fatigueDropPct,comp:comp.fatigueDropPct,diff:dif(curr.fatigueDropPct,comp.fatigueDropPct),pct:pct(curr.fatigueDropPct,comp.fatigueDropPct)},
        };
    }
    //funckije za graf
    const chartWidth=useRef(0);
    const chartHeight=useRef(0);
    function nearestIndexFromX(x:number,width:number,count:number){
        if(count<=1)return 0;
        const ratio=Math.max(0, Math.min(1,x/width));
        return Math.round(ratio*(count-1));
    }
    const xDomain=useMemo(()=>{
        if(chartData.length===0)return null;
        return{
            min:chartData[0].time,
            max:chartData[chartData.length-1].time,
        }
    },[chartData]);
    function onChartPress(evt:any){
        if(!selectedPractice || chartData.length<2)return;

        const pressX=evt?.nativeEvent?.locationX;
        if(typeof pressX !== "number")return;

        const w=chartWidth.current||0;
        if(w<=0)return;

        const idx=nearestIndexFromX(pressX,w,chartData.length);
        const snappedTime=chartData[idx].time;

        setRefLeft(snappedTime);
        const end=new Date(chartData[chartData.length-1].time).getTime();
        setRefRight(end);
    }
    function onChartLayout(evt:LayoutChangeEvent){
        chartWidth.current=evt.nativeEvent.layout.width;
        chartHeight.current=evt.nativeEvent.layout.height;
    }
    const selectionOverlay=useMemo(()=>{
        if(refLeft===null || refRight===null || !xDomain)return null;
        const w=chartWidth.current||0;
        if(w<=0)return null;
        const x1=Math.min(refLeft,refRight);
        const x2=Math.max(refLeft,refRight);
        const px1=((x1-xDomain.min)/(xDomain.max-xDomain.min))*w;
        const px2=((x2-xDomain.min)/(xDomain.max-xDomain.min))*w;

        const left=Math.max(0,Math.min(w,px1));
        const width=Math.max(0,Math.min(px2,w)-left);
       return <View pointerEvents="none" style={[styles.selectionOverlay, { left, width }]} />;
    },[refLeft,refRight,xDomain]);
    return(
        <ScrollView style={styles.page}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        >
            <Text style={styles.userText}>
                Ulogiran korisnik: <Text style={styles.userBold}>{user?.username||'user'}</Text>
            </Text>
            <View style={styles.buttonGroup}>
                <Pressable style={({pressed})=>[styles.btn, pressed && styles.btnPressed]}
                onPress={HandleLogout}>
                    <Text style={styles.btnText}>Odjava</Text>
                </Pressable>
                
                {!showData && !sessionStarted && <Pressable style={({pressed})=>[styles.btn, pressed && styles.btnPressed]}
                onPress={()=>{setShowData(true);setStartPractice(false)}}>
                    <Text style={styles.btnText}>Prikaži podatke</Text>
                </Pressable>}

                {!startPractice && !sessionStarted && <Pressable style={({pressed})=>[styles.btn, pressed && styles.btnPressed]}
                onPress={()=>{
                    setStartPractice(true); setShowData(false)
                }}><Text style={styles.btnText}>Započni trening</Text>
                </Pressable>}

                {sessionStarted ? (<Pressable
                    style={({pressed})=>[styles.btn,styles.btnStop,pressed && styles.btnPressed]}
                    onPress={endSession}>
                        <Text style={styles.btnText}>Stop</Text>
                    </Pressable>
                ):null}

                

            </View>
            {startPractice && (
                <>
                {!sessionStarted && <Pressable style={({pressed})=>[styles.btn, pressed && styles.btnPressed]}
                onPress={()=>setQrOn(true)}><Text style={styles.btnText}>Otvori qr skener</Text></Pressable>}
                {qrOn && <Pressable style={({pressed})=>[styles.btn, pressed && styles.btnPressed]} 
                onPress={()=>setQrOn(false)}><Text style={styles.btnText}>Zatvori qr skener</Text></Pressable>}
                <View style={[styles.statusCard, sessionStarted && styles.statusCardActive]}>
                    {sessionStarted ? (<View>
                        <Stopwatch running={true} resetKey={0}></Stopwatch>
                        {liveChartKitData && <LineChart
                        data={liveChartKitData}
                        width={SCREEN_WIDTH-40}
                        height={320}
                        withDots={false}
                        withInnerLines={true}
                        withOuterLines={true}
                        bezier
                        chartConfig={{backgroundColor:"#fff",backgroundGradientFrom:"#fff",
                            backgroundGradientTo:"#fff",
                            decimalPlaces: 0,
                            color: ()=> "rgba(0,0,0,1)",
                            labelColor: ()=>"rgba(0,0,0,0.8)",
                            propsForBackgroundLines:{stroke:"#eee"},
                        }}
                        style={{borderRadius:10}}/>}
                    </View>):(<Text>Nema aktivne sesije</Text>)}
                </View>
                {qrOn && <QrScanner onScanned={handleScan} onClose={()=>setQrOn(false)}/>}
                </>
            )}
            {showData && !startPractice &&(
                <>
                {selectedPractice && (
                    <View style={styles.row}>
                      <Pressable style={({pressed})=>[styles.btn,pressed && styles.btnPressed]} onPress={deleteSelectedPractice}>
                        <Text style={styles.btnText}>Obriši trening</Text>
                        </Pressable>
                        <Pressable style={({pressed})=>[styles.btn,pressed && styles.btnPressed]} onPress={()=>setSelPracticeInd(null)}><Text style={styles.btnText}>Ukupna statistika</Text></Pressable>
                    </View>
                )}
                {practices.length===0 && (
                    <Text style={styles.empty}>Nema dostupnih treninga.</Text>
                )}
                <View>
                    {practices.length>0 &&(
                        <>
                        <Text style={styles.sectionTitle}>Odaberi trening</Text>
                        <FlatList
                        data={practices}
                        style={styles.practiceList}
                        keyExtractor={(_,idx)=>String(idx)}
                        renderItem={({item,index})=>{
                            const selected=index===selPracticeInd;
                            return(
                                <TouchableOpacity
                                style={[styles.practiceItem, selected && styles.practiceItemSelected]}
                                onPress={()=>{
                                    setSelPracticeInd(index);
                                    setCompPracticeInd(null);
                                    setRefLeft(null);
                                    setRefRight(null);
                                }}>
                                    <Text style={styles.practiceText}>{new Date(item.started_at).toLocaleString("hr-HR")}-{" "}{new Date(item.ended_at).toLocaleString("hr-HR")}</Text>
                                </TouchableOpacity>
                            );
                        }}
                        />
                    </>)}
                    {!selectedPractice && (
                        <View style={styles.card}>
                            <Text style={styles.text}>Ukupno treninga: {practices.length}</Text>
                            <Text style={styles.text}>Prosječno trajanje treninga: {avgDurationP().toFixed(2)} min</Text>
                        </View>
                    )}
                    {selectedPractice && chartKitData &&(
                        <View style={styles.chartCard}>
                            <View style={styles.row}>
                                {refLeft !==null && refRight!==null &&(
                                    <>
                                    <Pressable style={({pressed})=>[styles.btn,pressed && styles.btnPressed]}
                                    onPress={deleteSelectedSD}>
                                        <Text style={styles.btnText}>Obriši odabrane podatke</Text>
                                    </Pressable>
                                    <Pressable style={({pressed})=>[styles.btn,pressed && styles.btnPressed]}
                                    onPress={()=>setRefLeft(null)}>
                                        <Text style={styles.btnText}>Odznači</Text>
                                    </Pressable>
                                    </>
                                )}
                            </View>
                            <View style={styles.chartWrap} onLayout={onChartLayout} onStartShouldSetResponder={()=>true} onResponderRelease={onChartPress}>
                                {selectionOverlay}
                                <LineChart
                                data={chartKitData}
                                width={SCREEN_WIDTH-40}
                                height={320}
                                withDots={false}
                                withInnerLines={true}
                                withOuterLines={true}
                                bezier
                                segments={3}
                                chartConfig={{
                                    
                                    backgroundColor:"#fff",
                                    backgroundGradientFrom:"#fff",
                                    backgroundGradientTo:"#fff",
                                    decimalPlaces:2,
                                    color: ()=>"rgba(0,0,0,1)",
                                    labelColor:()=>"rgba(0,0,0,0.8)",
                                    propsForBackgroundLines:{stroke:"#eee"},
                                }}style={{borderRadius:10}}/>
                            </View>
                            <Text>Usporedi s:</Text>
                            <View style={styles.compareSelectorRow}>
                            <FlatList
                            horizontal
                            data={practices.filter((_,idx)=>idx!=selPracticeInd)}
                            keyExtractor={(_,idx)=>"cmp"+idx}
                            renderItem={({item,index})=>{
                                const trueIndex=practices.findIndex(x=>x.started_at===item.started_at && x.ended_at===item.ended_at);
                                return(
                                    <TouchableOpacity
                                    onPress={()=>setCompPracticeInd(trueIndex)}
                                    style={[
                                        styles.compareSelectorItem, trueIndex===compPracticeInd && styles.compareSelectorItemActive
                                    ]}
                                    >
                                        <Text style={[styles.compareSelectorText, trueIndex===compPracticeInd && styles.compareSelectorTextActive]}>
                                            {new Date(item.started_at).toLocaleString("hr-HR")}-{new Date(item.ended_at).toLocaleTimeString("hr-HR")}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            }}
                            />
                            </View>
                            {compPracticeInd!==null && <Pressable style={styles.removeCompareBtn} onPress={()=>setCompPracticeInd(null)}>
                                <Text style={styles.removeCompareBtnText}>Makni usporedbu</Text></Pressable>}
                                <View style={styles.card}>
                                    <Text style={styles.sectionTitle}>Statistika odabranog treninga</Text>
                                    <View >
                                        <Text style={styles.subTitle}>Osnovni podaci</Text>
                                        <Text><Text style={styles.bold}>Vreća ID:</Text> {selectedPractice.deviceid}</Text>
                                        <Text><Text style={styles.bold}>Početak treninga:</Text>{new Date(selectedPractice.started_at).toLocaleString("hr-HR")}</Text>
                                        <Text><Text style={styles.bold}>Kraj treninga: </Text> {new Date(selectedPractice.ended_at).toLocaleString("hr-HR")}</Text>
                                        <Text><Text style={styles.bold}>Broj udaraca: </Text> {forceHits.length}</Text>
                                    </View>
                                </View>
                                    <View style={styles.basicStatsCard}>
                                        <Text style={styles.basicStatsTitle}>Osnovna statistika</Text>
                                        <Text style={styles.basicStatsLabel}>Trajanje:{((new Date(selectedPractice.ended_at).getTime()-new Date(selectedPractice.started_at).getTime())/(1000*60)).toFixed(2)} min</Text>
                                        <Text style={styles.basicStatsLabel}>Najjači udarac: {Math.max(...forceHits.map((h)=>h.force)).toFixed(2)} N</Text>
                                        <Text style={styles.basicStatsLabel}>Prosječna snaga udarca {(forceHits.reduce((acc,h)=>acc+h.force,0)/forceHits.length).toFixed(2)}N</Text>
                                        <Text style={styles.basicStatsLabel}>Udarci u minuti: {Math.round(forceHits.length/minutesBetween(selectedPractice.started_at,selectedPractice.ended_at))} hit/min</Text>
                                    </View>
                                    <View style={styles.powerTimelineCard}>
                                    <Text style={styles.powerTimelineTitle}>Snaga kroz vrijeme</Text>
                                    
                                        <Text style={styles.powerTimelineLabel}>Udarci</Text>
                                        {forceHits.length===0 && <Text style={styles.powerTimelineLabel}>Nema zabilježenih udaraca</Text>}
                            {forceHits.length > 0 && (
    <Text style={styles.powerTimelineLabel}>
      {forceHits.map((hit,i) =>
        <Text key={i}>
          <Text style={styles.powerTimelineHighlight}>
            {new Date(hit.time).toLocaleTimeString("hr-HR", {hour: "2-digit",minute:"2-digit",second:"2-digit"})}
          </Text>
          {`, Snaga: `}
          <Text style={styles.powerTimelineHighlight}>
            {hit.force.toFixed(2)} N
          </Text>
          {" | "}
        </Text>
      )}
    </Text>
                                        )}</View>
                                        <View style={styles.advancedStatsCard}>
                                        <Text style={styles.advancedStatsTitle}>Napredne statistike</Text>
                                        <Text style={styles.advancedStatsLabel}>Najduža serija: {streak.length} udaraca {streak.startTime && (<>({new Date(streak.startTime).toLocaleTimeString("hr-HR")}-{new Date(streak.endTime).toLocaleTimeString("hr-HR")})</>)}</Text>
                                        <Text style={styles.advancedStatsLabel}>Pad snage (fatigue): {fat.dropPct.toFixed(1)}% ({fat.startAvg.toFixed(1)}N → {fat.endAvg.toFixed(1)} N)</Text>
                                        <Text style={styles.advancedStatsTitle}>Distribucija snage</Text>
                                        <Text style={styles.advancedStatsLabel}>P50 (medijan): {dist.p50.toFixed(1)} N</Text>
                                        <Text style={styles.advancedStatsLabel}>P75: {dist.p75.toFixed(1)} N</Text>
                                        <Text style={styles.advancedStatsLabel}>P90: {dist.p90.toFixed(1)} N</Text>
                                        <Text style={styles.advancedStatsLabel}>Min/Max: {dist.min.toFixed(1)} N/ {dist.max.toFixed(1)} N</Text>
                                    </View>
                                        <View style={styles.chartWrap}>
                                            <Text style={styles.barChartTitle}>Distribucija snage</Text>
                                        {dist.bins.length>0 && (
                                            <BarChart
                                            data={{labels: dist.bins.map(b=>`${b.from}`),
                                            datasets:[{data:dist.bins.map(b=>b.n)}]
                                        }}
                                        width={SCREEN_WIDTH-700}
                                height={300}
                                        fromZero
                                        yAxisLabel=''
                                        yAxisSuffix=''
                                        chartConfig={{
                                            backgroundColor:"#fff",
                                            backgroundGradientFrom:"#fff",
                                            backgroundGradientTo:"#fff",
                                            decimalPlaces:2,
                                            color:(opacity=1)=>`rgba(59,130,246,${opacity})`,
                                            labelColor:(opacity=1)=>`rgba(0,0,0,${opacity})`,
                                        }}
                                        style={styles.barChart}
                                        withInnerLines={false}
                                        />
                                        )}
                                        </View>
                                        
                                        {compPracticeInd && progress && (
                                            <View style={styles.card}>
                                                <Text style={styles.basicStatsTitle}>Progress vs odabrani trening:</Text>
                                                <Text>Udarci: {progress.count.curr} vs {progress.count.comp} ({formatPct(progress.count.pct)})</Text>
                                                <Text>Max udarac: {Number.isFinite(progress.maxForce.curr)?progress.maxForce.curr.toFixed(1):"-"} N vs {Number.isFinite(progress.maxForce.comp)?progress.maxForce.comp.toFixed(1):"-"}N ({formatPct(progress.maxForce.pct)})</Text>
                                                <Text>Prosjek: {progress.avgForce.curr.toFixed(1)} vs {progress.avgForce.comp.toFixed(1)} ({formatPct(progress.avgForce.pct)})</Text>
                                                <Text>Udarci/min: {progress.hitsPerMin.curr.toFixed(1)} vs {progress.hitsPerMin.comp.toFixed(1)} ({formatPct(progress.hitsPerMin.pct)})</Text>
                                            </View>
                                        )}
                                    </View>
                                
                        
                    )}
                    
                </View>
                </>
            )}
            
        </ScrollView>
    );
}
