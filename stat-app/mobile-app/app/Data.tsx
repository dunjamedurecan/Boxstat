// na zahtjev (šalje poruku serveru) povlači nove podatke o sesijama (treninzima) i ispisuje ih 
// prvi put download data
// kasnije refresh data
import {jwtDecode} from 'jwt-decode';
import { useEffect,useState,useMemo } from 'react';
import { connectWebSocket, onWSMessage, sendWS } from '../services/wsClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {router} from 'expo-router';
import {View,Text,TextInput,Button,StyleSheet,FlatList} from 'react-native';
import {LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,ReferenceArea}from 'recharts';
import { normalizeAnimationKeyframes } from 'react-native-reanimated/lib/typescript/css/native';

type JwtPayload={
  userId:string|number;

  [key:string]:unknown;
}
type SensorData={
  timestamp: string;
  top_x: number | null;
  top_y: number | null;
  top_z: number | null;
  bottom_x: number | null;
  bottom_y: number | null;
  bottom_z: number | null;
}

type Practice= {
  deviceid: string;
  started_at: string;
  ended_at: string;
  sensorData: SensorData[];
}

type ChartPoint={
  index:number;
  time:number;
  force:number;
  aComb:number;
  baseline: number;
};

type PeakHit={
  index:number;
  chartIndex: number;
  time: number;
  force: number;
  enterThr: number;
};

type WSMessage =
  | { type: "data-req"; practices?: string; timestamp?: string; alteration?: string | null }
  | { type: "data-redo"; userId: JwtPayload["userId"]; data: Practice[] }
  | { type: "data-msg"; userId: JwtPayload["userId"]; data: Practice[] }
  | { type: "delete-result"; userId?: JwtPayload["userId"] }
  | { type: "data-update"; userId?: JwtPayload["userId"] }
  | { type: "delete-practices"; practices: Practice; userId: JwtPayload["userId"] }
  | { type: "delete-sd"; practiceToDelete: Practice; timestamp: string }
  | { type: string; [key: string]: any };

  type FindingPeaksOpts={
    refractoryMs?:number;
    k?:number;
    minForceN?:number;
    minDtMs?:number;
    releaseRatio?:number;
  };

  const G=9.80655;



export default function Data(){
    const [user,setUser]=useState<JwtPayload|null>(null);
    const[token,setToken]=useState<string | null>(null);
    const[practices,setPractices]=useState<Practice[]>([]);
    const [selPracticeInd,setSelPracticeInd]=useState<number|null>(null);

    const [webSocketConnected,setWebSocketConnected]=useState(false);
    const [lastAlterationTime,setLastAlterationTime]=useState<Date | null>(null);
    const [refLeft,setRefLeft]=useState<number |null>(null);
    const [refRight,setRefRight]=useState<number | null>(null);
    const selectedPractice:Practice|null=selPracticeInd !==null ? practices[selPracticeInd]??null:null;
    const chartData: ChartPoint[]=useMemo(()=>{
      return selectedPractice ? computeForce(selectedPractice.sensorData, 20, 0.12):[];

    },[selectedPractice]);

    const forceHits:PeakHit[]=useMemo(()=>{
      return selectedPractice ? findingPeaks(chartData):[];
    },[selectedPractice,chartData]);
    
    
    
 useEffect(()=>{ 
    const init=async()=>{
        const token=await AsyncStorage.getItem('token');
        if(!token){
            router.replace("/login");
            return;
        }
        try{
            const payload=jwtDecode<JwtPayload>(token);
            setUser(payload);
            console.log(user);
        }catch(e){
            console.warn("Ne mogu dekodirati token");
        }
        connectWebSocket(token,()=>{
          setWebSocketConnected(true);
        });
    };
    init();
    },[]);

  useEffect(() => {
    if (!user?.userId || !webSocketConnected) return;
    const loadPractices = async () => {
      const stored = await AsyncStorage.getItem(`practices_${user.userId}`);
      if (stored) {
        setPractices(JSON.parse(stored));
      }
    };
    loadPractices();

    const loadAlteration=async()=>{
      const altTime= await AsyncStorage.getItem(`lastAlteration_${user.userId}`);
      if(altTime){
        setLastAlterationTime(altTime ? new Date(altTime):null);
      }
    }
    loadAlteration();
    RequestData();

    onWSMessage((msg:WSMessage)=>{
      if(msg.userId!=user.userId)return;
      if(msg.type==="data-redo"){
        console.log("Primljeni podaci: ",msg.data);
        setPractices(msg.data);
      }
      if(msg.type==="data-msg"){
        if(Array.isArray(msg.data)){
          const recivedData=msg.data;
          if(recivedData.length!=0){
            setPractices((prevPractices)=>{
              const updatedP=[...prevPractices,...recivedData];
              AsyncStorage.setItem(`practices_${user.userId}`,JSON.stringify(updatedP));
              return updatedP;
            });
            alert("Treninzi uspješno preneseni");
          }else{
            alert("Svi treninzi su već preneseni");
          }
        }
      }
      if(msg.type==="delete-result"){
        alert("Treninzi uspješno obrisani sa servera");
      }
      if(msg.type="data-update"){
        alert("Podaci su ažurirani na serveru");
      }
    });
  }, [user,webSocketConnected]);

  useEffect(()=>{
    if(!selectedPractice)return;
    const hits=findingPeaks(chartData,{
      refractoryMs: 180,
      k:6.0,
      minForceN:5
    });
  },[selPracticeInd,chartData]);

  function RequestData(){
    //const parsed=savedPractices?JSON.parse(savedPractices):[]
    if(practices.length==0){
      sendWS({type:'data-req'});
    }else{
      const lastP=practices[practices.length-1];
      const timestamp=lastP.ended_at;
      sendWS({
        type:'data-req',
        timestamp:timestamp,
        alteration:lastAlterationTime ? lastAlterationTime.toISOString():null,
      });
    }
  }
  function DeleteSelectedP(){
    const newPractices=practices.filter((p,i)=>i!==selPracticeInd);
    setPractices(newPractices);
    AsyncStorage.setItem(`practices_${user.userId}`,JSON.stringify(newPractices));
    sendWS({
      type:'delete-practices',
      practices:selectedPractice,
      userId:user.userId
    });
    setSelPracticeInd(null);
    setLastAlterationTime(new Date());
    AsyncStorage.setItem(`lastAlteration_${user.userId}`,new Date().toISOString());
  }

  function DeleteSelectedSD(){
    const newSensorData=selectedPractice?.sensorData.filter(hit=>{
      const t=new Date(hit.timestamp).getTime();
      return t<refLeft;
    });
    sendWS({type:'delete-sd',
      practiceToDelete:selectedPractice,
      timestamp:newSensorData? newSensorData[newSensorData.length-1].timestamp:null
    });
    setRefLeft(null);
  }

  function median(arr){
    if(arr.length===0)return 0;
    const a=[...arr].sort((a,b)=>a-b);
    const mid=Math.floor(a.length/2);
    return a.length%2 ? a[mid]:(a[mid-1]+a[mid])/2;
  }
  function mad(arr){
    const m=median(arr);
    const dev=arr.map(x=>Math.abs(x-m));
    return median(dev)||1e-9;
  }

  function findingPeaks(chart_data:Practice,opts={}){
    const{
      refractoryMs=180,
      k=6.0,
      minForceN=5,
      minDtMs=5,
      releaseRatio=0.5,
    }=opts;
    if(!Array.isArray(chart_data)||chart_data.length<5)return [];
    const t=chartData.map(p=>p.time);
    const f=chartData.map(p=>Math.max(0,p.force));

    const dF=new Array(f.length).fill(0);

    for(let i=1;i<f.length;i++){
      const dt=Math.max(minDtMs,t[i]-t[i-1]);

    }
  }
    return(
        <View style={styles.container}>
            <Button title={practices.length==0 ? "Povuci podatke":"Update podataka"} onPress={RequestData}/>
            <Text style={styles.header}>Lista Treninga</Text>
            {practices.length==0 ? (
            <Text>Nema dostupnih treninga</Text>
            ):(<FlatList data={practices} keyExtractor={(item,index)=>`${item.deviceid}-${index}`} renderItem={({item})=>(
                <View style ={styles.practice}>
               <Text>
                <Text style={styles.label}>Vreća ID:</Text> {item.deviceid}
              </Text>
              <Text>
                <Text style={styles.label}>Početak treninga:</Text> {item.started_at}
              </Text>
              <Text>
                <Text style={styles.label}>Kraj treninga:</Text> {item.ended_at}
              </Text>

              <Text>Udarci:</Text>
              {item.sensorData.length === 0 ? (
                <Text>Nema zabilježenih udaraca</Text>
              ) : (
                item.sensorData.map((hit, i) => (
                  <View key={i} style={styles.hit}>
                    <Text>Vrijeme: {hit.timestamp}</Text>
                    <Text>Top: ({hit.top_x}, {hit.top_y}, {hit.top_z})</Text>
                    <Text>Bottom: ({hit.bottom_x}, {hit.bottom_y}, {hit.bottom_z})</Text>
                  </View>
                ))
              )}
            </View>
          )}/>

           )}
        </View>
       
    );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    fontSize: 18,
    fontWeight: 'bold',
    marginVertical: 10,
  },
  practice: {
    marginBottom: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
  },
  label: {
    fontWeight: 'bold',
  },
  hit: {
    marginTop: 5,
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 5,
  },
});
