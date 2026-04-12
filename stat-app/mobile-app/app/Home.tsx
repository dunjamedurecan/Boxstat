import React,{useEffect,useRef,useState} from 'react';
import { View, Text, Button, Alert, Pressable, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectWebSocket, onWSMessage, sendWS,closeWS } from '../services/wsClient';
import {jwtDecode} from 'jwt-decode';
import { WSMessage } from '../services/types';
import {router} from 'expo-router';
import QrScanner from  "../components/QrScanner";
import {styles} from "./styles/homeStyles"
import Stopwatch from '@/components/Stopwatch';

export default function HomeScreen(){
    const [sessionStarted, setSessionStarted]=useState(false);
    const [user,setUser]=useState<any>(null);
    const [token,setToken]=useState<string | null>(null);

    const [qrOn, setQrOn]=useState(false);
    const scanLockRef=useRef(false);

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
            connectWebSocket(token1);
        };
        init();
    },[]);

    useEffect(()=>{
        if(!user)return;

        const unsubscribe=onWSMessage((msg:WSMessage)=>{
            if(msg.userId!==user.userId)return;

            switch (msg.type) {
        case 'scan-ok':
          setSessionStarted(true);
          console.log('Scan successful:', msg);
          break;

        case 'session-end':
          Alert.alert('Info', 'Prijavljen novi korisnik');
          setSessionStarted(false);
          break;

        case 'identified':
          console.log('User identified:', msg.userId);
          break;

        case 'data-msg':
          console.log('Data received:', msg.data);
          break;

        case 'error':
          Alert.alert('Error', msg.message || 'Unknown error');
          break;

        default:
          console.warn('Unhandled message type:', msg.type, msg);
      }
        });
        return ()=>unsubscribe();
    },[user])

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
                <Pressable style={({pressed})=>[styles.btn, pressed && styles.btnPressed]}
                onPress={handleScanSimulation}>
                    <Text style={styles.btnText}>Simuliraj QR kod</Text>
                </Pressable>

                {sessionStarted ? (<Pressable
                    style={({pressed})=>[styles.btn,styles.btnStop,pressed && styles.btnPressed]}
                    onPress={endSession}>
                        <Text style={styles.btnText}>Stop</Text>
                    </Pressable>
                ):null}

                <Pressable style={({pressed})=>[styles.btn,pressed && styles.btnPressed]}
                onPress={()=>router.push("/Data")}>
                    <Text style={styles.btnText}>Prikaz podataka</Text>
                </Pressable>

                {!qrOn ? (
                    <Pressable style={({pressed})=>[styles.btn,pressed && styles.btnPressed]}
                    onPress={()=>setQrOn(true)}>
                        <Text style={styles.btnText}>Otvori QR skener</Text>
                    </Pressable>
                ): (
                    <Pressable style={({pressed})=>[styles.btn,pressed && styles.btnPressed]}
                    onPress={()=>setQrOn(false)}>
                        <Text style={styles.btnText}>Zatvori QR skener</Text>
                    </Pressable>
                )}
            </View>
            <View style={[styles.statusCard, sessionStarted && styles.statusCardActive]}>
                {sessionStarted ? <Stopwatch running={sessionStarted===true} resetKey={0}></Stopwatch> :  <Text style={styles.statusText}>Nema aktivne sesije</Text>}
            </View>
            {qrOn && (
                <View style={styles.qrWrap}>
                    <QrScanner onScanned={handleScan} onClose={()=>setQrOn(false)}/>
                </View>
            )}
        </ScrollView>
    );
}
