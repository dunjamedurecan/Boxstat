import React,{useEffect, useMemo, useState,useRef} from "react";
import {ScrollView,View, Text, Alert, FlatList, TouchableOpacity,LayoutChangeEvent,Pressable} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {jwtDecode} from "jwt-decode";
import {router} from "expo-router";
import {connectWebSocket, onWSMessage,sendWS} from "../services/wsClient";
import {WSMessage} from "../services/types";
import {LineChart} from "react-native-chart-kit";
import { Dimensions } from "react-native";
import {styles} from "./styles/dataStyles"


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
};

const G=9.80655;

function emaTrend(x:number[],alpha:number){
  const trend=new Array(x.length).fill(0);
  trend[0]=x[0] ?? 0;
  for(let i=1;i<x.length;i++){
    trend[i]=alpha*x[i]+(1-alpha)*trend[i-1];
  }
  return trend;
}

function computeForce(sensorData:SensorHit[],mKg:number,alpha=0.12){
  if(!Array.isArray(sensorData) || sensorData.length===0)return [];

  const aComb=sensorData.map((s)=>{
    const topAcc=Math.hypot(s.top_x,s.top_y,s.top_z);
    const bottomAcc=Math.hypot(s.bottom_x,s.bottom_y,s.bottom_z);
    return (topAcc+bottomAcc)/2;
  });

  const baseline=emaTrend(aComb,alpha);

  return sensorData.map((s,i)=>{
    const aEffG=Math.max(0,aComb[i]-baseline[i]);
    const force=aEffG*mKg*G;
    return {
      index:i,
      time:new Date(s.timestamp).getTime(),
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
  return median(dev)||1e-9;
}

function findingPeaks(chartData:{time:number;force:number;index:number}[],opts:{refractoryMs?:number;
  k?:number;
  minForceN?:number;
  minDTMS?:number;
  releaseRatio?:number;}={}
){
  const{
    refractoryMs=180,
    k=6.0,
    minForceN=5,
    minDTMS=100,
    releaseRatio=0.5,
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

  const hits: {time:number;force:number;chartIndex:number}[]=[];
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
  if (inHit && peak){
    hits.push({
      chartIndex:peak.i,
      time:t[peak.i],
      force:peak.force,
    });
  }
  return hits;
}

function minutesBetween(aIso:string, bIso:string){
  return (new Date(bIso).getTime()-new Date(aIso).getTime())/60000;
}

function formatHrTime(ms: number) {
  return new Date(ms).toLocaleTimeString("hr-HR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function Data(){
  const [user, setUser]=useState<any>(null);
  const [token, setToken]=useState<string|null>(null);

  const [practices, setPractices]=useState<Practice[]>([]);
  const [selPracticeInd, setSelPracticeInd]=useState<number|null>(null);

  const [websocketConnected, setWebsocketConnected]=useState<boolean>(false);
  const [lastAlterationTime, setLastAlterationTime]=useState<Date|null>(null);

  const [refLeft, setRefLeft]=useState<number|null>(null);
  const [refRight, setRefRight]=useState<number|null>(null);

  const selectedPractice=selPracticeInd!==null ? practices[selPracticeInd]:null;

  const alertLockRef=useRef(false);
  function safeAlert(title:string, message:string){
    if(alertLockRef.current)return;
    alertLockRef.current=true;
    Alert.alert(title,message,[{
      text:"OK",
      onPress:()=>{alertLockRef.current=false;}
    }
    ]);
  }
  const chartData=useMemo(()=>{
    if(!selectedPractice)return[];
    return computeForce(selectedPractice.sensorData || [],20,0.12);
  },[selectedPractice]);

  const forceHits=useMemo(()=>{
    if(!selectedPractice)return[];
    return findingPeaks(chartData,{refractoryMs:180,k:6.0,minForceN:5});
  },[selectedPractice,chartData]);

  const chartWidth=useRef(0);
  const chartHeight=useRef(0);

  const screenWidth=Dimensions.get("window").width;

  const chartKitData= useMemo(()=>{
    if (!chartData.length)return null;

    const n=chartData.length;
    const labelCount=6;
    const labels=new Array(n).fill("")

    for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor((i * (n - 1)) / (labelCount - 1));
    labels[idx] = formatHrTime(chartData[idx].time);
  }
   return {
    labels,
    datasets: [
      {
        data: chartData.map((p) => p.force),
        color: () => "rgba(255,0,0,1)",
        strokeWidth: 2,
      },
    ],
  };
  }
  , [chartData]);
  function nearestIndexFromX(x: number, width: number, count: number) {
  if (count <= 1) return 0;
  const ratio = Math.max(0, Math.min(1, x / width));
  return Math.round(ratio * (count - 1));
}
  const xDomain=useMemo(()=>{
    if(chartData.length===0)return null;
    return{
      min:chartData[0].time,
      max:chartData[chartData.length-1].time,
    }
  },[chartData]);

  useEffect(()=>{
    const init=async()=>{
      const t=await AsyncStorage.getItem("token");
      if(!t){
        router.replace("/login");
        return;
      }
      setToken(t);

      try{
        const payload:any=jwtDecode(t);
        setUser(payload);
      }catch{
        safeAlert("Greška","Ne mogu dekodirati token.");
        router.replace("/login");
        return;
      }
      connectWebSocket(t,()=>setWebsocketConnected(true),undefined,undefined,(err:any)=>console.error("WS error",err));
    };
    init();
  },[]);
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
    if(!user || !websocketConnected) return;

    const loadandRequest=async()=>{
      const savedPracticesStr=await AsyncStorage.getItem(`practices_${user.userId}`);
      const savedAltStr=await AsyncStorage.getItem(`lastAlteration_${user.userId}`);
      const alt=savedAltStr ? new Date(savedAltStr):null;

      requestData(savedPracticesStr ? JSON.parse(savedPracticesStr):[],alt);
    };
    loadandRequest();

    const unsubscribe=onWSMessage(async(msg:WSMessage)=>{
      if(msg.userId!==user.userId)return;

      if(msg.type==="data-redo"){
        const all:Practice[]=Array.isArray(msg.data) ? msg.data:[];
        setPractices(all);
        await AsyncStorage.setItem(`practices_${user.userId}`,JSON.stringify(all));
        //safeAlert("Sync","podaci su osvježeni");
        return;
      }
      if(msg.type==="data-msg"){
        const incoming:Practice[]=Array.isArray(msg.data) ? msg.data:[];
        if(incoming.length===0){
          //safeAlert("Info","Svi treninzi su već preneseni");
          return;
        }
        setPractices((prev)=>{
          const updated=[...prev,...incoming];
          AsyncStorage.setItem(`practices_${user.userId}`,JSON.stringify(updated));
          return updated;
        });
        //safeAlert("Info","Treninzi uspješno preneseni.");
        return;
      }
      if(msg.type==="delete-result"){
        //safeAlert("Info", "Trening uspješno obrisan sa servera.");
        return;
      }
      if(msg.type==="data-update"){
         //safeAlert("Info", "Podaci su ažurirani na serveru.");
         return;
      }
    });
    return ()=>unsubscribe();
  },[user,websocketConnected]);

  function requestData(localPractices:Practice[],alt:Date|null){
    if(!token)return;
    if(!localPractices || localPractices.length===0){
      sendWS({type:"data-req"}as WSMessage);
      return;
    }
    const last=localPractices[localPractices.length-1];
    const timestamp=last.ended_at;

    sendWS({type:"data-req",timestamp,alteration:alt?alt.toISOString():null,practices:JSON.stringify(localPractices),}as WSMessage);
  }

  async function refreshNow(){
    requestData(practices,lastAlterationTime);
  }

  async function deleteSelectedPractice(){
    if(selPracticeInd===null || !selectedPractice || !user)return;

    const updated=practices.filter((_,i)=> i!==selPracticeInd);
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
    if(!selectedPractice || refLeft===null ||!user)return;
    const tLeft=refLeft;

    const newSensordata=selectedPractice.sensorData.filter((s)=>{
      const t=new Date(s.timestamp).getTime();
      return t<tLeft;
    });

    const oldEndedAt=selectedPractice.ended_at;
    const newEndedAt=newSensordata[newSensordata.length-1].timestamp;

    const updatedPractice: Practice = {
      ...selectedPractice,
      ended_at: newEndedAt,
      sensorData: newSensordata,
    };
    const updatedPractices=practices.map((p,i)=> i===selPracticeInd ? updatedPractice:p);
    setPractices(updatedPractices);
    await AsyncStorage.setItem(`practices_${user.userId}`,JSON.stringify(updatedPractices));
    sendWS({
      type:"delete-sd",
      practiceToDelete: updatedPractice,
      timestamp: newEndedAt,
      deleteto: oldEndedAt,
      bagid: selectedPractice.deviceid,
    }as WSMessage);

    setRefRight(tLeft);
    setRefLeft(null);
  }

  const overallAvgDurationMin=useMemo(()=>{
    if(practices.length===0)return 0;
    const total=practices.reduce((acc,p)=>acc+minutesBetween(p.started_at,p.ended_at),0);
    return total/practices.length;
  },[practices]);

  function onChartPress(evt:any){
    if (!selectedPractice || chartData.length < 2) return;

  const pressX = evt?.nativeEvent?.locationX;
  if (typeof pressX !== "number") return;

  const w = chartWidth.current || 0;
  if (w <= 0) return;

  const idx = nearestIndexFromX(pressX, w, chartData.length);
  const snappedTime = chartData[idx].time;

  setRefLeft(snappedTime);

  const end = new Date(
    selectedPractice.sensorData[selectedPractice.sensorData.length - 1].timestamp
  ).getTime();
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
  },[refLeft ,refRight,xDomain]);

  function deleteAsyncData(){
    AsyncStorage.clear().then(()=>{
      setPractices([]);
      safeAlert("Obrisano","Lokalni podaci su obrisani.");
    });
  }

  function sortHitsByTime(hits:any){
    return [...hits].sort((a,b)=>a.time-b.time);
  }

  function percentile(sortedArr:any,p:number){
    if(!sortedArr.length)return 0;
    const idx=(sortedArr.length-1)*p;
    const lo=Math.floor(idx);
    const hi=Math.floor(idx);
    if(lo===hi)return sortedArr[lo];
    return sortedArr[lo]+(sortedArr[hi]-sortedArr[lo])*(idx-lo);
  }

  function longestStreak(hits:any,gapMs=1500){
    const h=sortHitsByTime(hits);
    if(h.length===0)return{length:0,startTime:null,endTime:null};

    let bestLen=1;
    let bestStart=0;
    let curLen=1;
    let curStart=0;

    for(let i=0;i<h.length;i++){
      const dt=h[i].time - h[i-1].time;
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

    const startTime=h[bestStart].time ?? null;
    const endTime=h[bestStart+bestLen-1]?.time ?? null;
    return{length:bestLen,startTime,endTime};
  }

  function fatigueDrop(hits:any,startFrac=0.3,endFrac=0.3){
    const h=sortHitsByTime(hits);
    if(h.length<4){
      return {startAvg:0,endAvg:0,dropAbs:0,dropPct:0};
    }

    const t0=h[0].time;
    const t1=h[h.length-1].time;
    const dur=Math.max(1,t1-t0);

    const startEnd=t0+dur*startFrac;
    const endStart=t1-dur*endFrac;

    const startHits=h.filter(x=>x.time<=startEnd);
    const endHits=h.filter(x=>x.time>=endStart);

    const avg=(arr:any)=>arr.length ? arr.reduce((a:any,x:any)=>a+x.force,0)/arr.length:0;

    const startAvg=avg(startHits);
    const endAvg=avg(endHits);

    const dropAbs=startAvg-endAvg;

    const dropPct=startAvg>0 ? (dropAbs/startAvg)*100:0;

    return {startAvg,endAvg,dropAbs,dropPct};
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Podaci</Text>
      </View>

      <View style={styles.row}>
        <Pressable style={({pressed})=>[styles.btn,pressed && styles.btnPressed]}
        onPress={refreshNow}>
          <Text style={styles.btnText}>Refresh Data</Text>
        </Pressable>
        <Pressable style={({pressed})=>[styles.btn, pressed && styles.btnPressed]}
        onPress={()=>router.push("/Home")}>
          <Text style={styles.btnText}>Odradi trening</Text>
        </Pressable>
      </View>

      {selectedPractice && (
        <View style={styles.row}>
          <Pressable style={({pressed})=>[styles.btn,pressed && styles.btnPressed]}
          onPress={deleteSelectedPractice}>
            <Text style={styles.btnText}>Obriši trening</Text>
          </Pressable>
          <Pressable style={({pressed})=>[styles.btn,pressed && styles.btnPressed]}
          onPress={()=>setSelPracticeInd(null)}>
            <Text style={styles.btnText}>Ukupna statistika</Text>
          </Pressable>
        </View>
      )}

      {practices.length === 0 ? (
        <Text style={styles.empty}>Nema dostupnih treninga, odradite vaš prvi trening</Text>
      ) : null}

      <Text style={styles.sectionTitle}>Odaberi trening</Text>
      {practices.length > 0 && (
        <FlatList
          style={styles.practiceList}
          data={practices}
          keyExtractor={(_, idx) => String(idx)}
          renderItem={({ item, index }) => {
            const selected = index === selPracticeInd;
            return (
              <TouchableOpacity
                style={[styles.practiceItem, selected && styles.practiceItemSelected]}
                onPress={() => {
                  setSelPracticeInd(index);
                  setRefLeft(null);
                  setRefRight(null);
                }}
              >
                <Text style={styles.practiceText}>
                  {new Date(item.started_at).toLocaleString("hr-HR")} -{" "}
                  {new Date(item.ended_at).toLocaleString("hr-HR")}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {!selectedPractice && practices.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.text}>Ukupno treninga: {practices.length}</Text>
          <Text style={styles.text}>Prosječno trajanje treninga: {overallAvgDurationMin.toFixed(2)} min</Text>
        </View>
      )}

      {selectedPractice && chartKitData && (
        <View style={styles.chartCard}>
          <View style={styles.row}>
            {refLeft !== null && refRight !== null ? (
              <>
              <Pressable style={({pressed})=>[styles.btn, pressed && styles.btnPressed]}
              onPress={deleteSelectedSD}>
                <Text style={styles.btnText}>Obriši odabrane podatke</Text>
              </Pressable>
                <Pressable style={({pressed})=>[styles.btn, pressed && styles.btnPressed]}
                onPress={()=>setRefLeft(null)}>
                  <Text style={styles.btnText}>Odzanči</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.text}>Tap na graf = odabir brisanja od tog vremena do kraja</Text>
            )}
          </View>

          <View style={styles.chartWrap} onLayout={onChartLayout} onStartShouldSetResponder={() => true} onResponderRelease={onChartPress}>
            {selectionOverlay}

            <LineChart
              data={chartKitData}
              width={screenWidth - 40}
              height={320}
              withDots={false}
              withInnerLines={true}
              withOuterLines={true}
              bezier
              chartConfig={{
                backgroundColor: "#fff",
          backgroundGradientFrom: "#fff",
          backgroundGradientTo: "#fff",
          decimalPlaces: 0,
          color: () => "rgba(0,0,0,1)",
          labelColor: () => "rgba(0,0,0,0.8)",
          propsForBackgroundLines: { stroke: "#eee" },
              }}
              style={{borderRadius:10}}/>
          </View>
        </View>
      )}

      {selectedPractice && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Statistika odabranog treninga</Text>

          <Text style={styles.subTitle}>Osnovni podaci</Text>
          <Text>
            <Text style={styles.bold}>Vreća ID: </Text>
            {selectedPractice.deviceid}
          </Text>
          <Text>
            <Text style={styles.bold}>Početak: </Text>
            {new Date(selectedPractice.started_at).toLocaleString("hr-HR")}
          </Text>
          <Text>
            <Text style={styles.bold}>Kraj: </Text>
            {new Date(selectedPractice.ended_at).toLocaleString("hr-HR")}
          </Text>
          <Text>
            <Text style={styles.bold}>Broj udaraca: </Text>
            {forceHits.length}
          </Text>

          <Text style={styles.subTitle}>Osnovna statistika</Text>
          <Text>
            <Text style={styles.bold}>Trajanje: </Text>
            {minutesBetween(selectedPractice.started_at, selectedPractice.ended_at).toFixed(2)} min
          </Text>

          {forceHits.length > 0 ? (
            <>
              <Text>
                <Text style={styles.bold}>Najjači udarac: </Text>
                {Math.max(...forceHits.map((h) => h.force)).toFixed(2)} N
              </Text>
              <Text>
                <Text style={styles.bold}>Prosječna snaga udaraca: </Text>
                {(forceHits.reduce((acc, h) => acc + h.force, 0) / forceHits.length).toFixed(2)} N
              </Text>
              <Text>
                <Text style={styles.bold}>Udarci u minuti: </Text>
                {Math.round(
                  forceHits.length /
                    minutesBetween(selectedPractice.started_at, selectedPractice.ended_at)
                )}{" "}
                hit/min
              </Text>
            </>
          ) : (
            <Text>Nema zabilježenih udaraca</Text>
          )}

          <Text style={styles.subTitle}>Udarci</Text>
          {forceHits.length === 0 ? (
            <Text>Nema zabilježenih udaraca</Text>
          ) : (
            <View style={styles.listBlock}>
              {forceHits.map((h, idx) => (
                <View key={idx} style={styles.listRow}>
                   <Text>Vrijeme: {formatHrTime(h.time)}</Text>
        <Text>Jačina udarca: {Number.isFinite(h.force) ? h.force.toFixed(2) : "—"} N</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.subTitle}>Podaci sa senzora</Text>
          {selectedPractice.sensorData.length === 0 ? (
            <Text>Nema zabilježenih podataka</Text>
          ) : (
            <View style={styles.listBlock}>
              {selectedPractice.sensorData.map((s, idx) => (
                <View key={idx} style={styles.listRow}>
                  <Text>Vrijeme: {new Date(s.timestamp).toLocaleString("hr-HR")}</Text>
                  <Text>
                    Top: ({s.top_x}, {s.top_y}, {s.top_z})
                  </Text>
                  <Text>
                    Bottom: ({s.bottom_x}, {s.bottom_y}, {s.bottom_z})
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

