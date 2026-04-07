import React,{useEffect,useState} from 'react';
import { View, Text, Button, Alert, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectWebSocket, onWSMessage, sendWS,closeWS } from '../services/wsClient';
import {jwtDecode} from 'jwt-decode';
import { WSMessage } from '../services/types';
import {router} from 'expo-router';
import QrScanner from  "../components/QrScanner";


export default function HomeScreen(){
    const [sessionStarted, setSessionStarted]=useState(false);
    const [user,setUser]=useState<any>(null);
    const [token,setToken]=useState<string | null>(null);

    const [qrOn, setQrOn]=useState(false);

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
        }
    };
    return(
        <View style={styles.container}>
            <Text style={styles.text}>
                Ulogiran korisnik: <Text style={styles.bold}>{user?.username||'user'}</Text>
            </Text>
            <Button title="Odjava" onPress={HandleLogout}/>
            <Button title="Simuliraj QR kod" onPress={handleScanSimulation}/>
            {sessionStarted && <Button title="stop" onPress={endSession}/>}
            <Button title="prikaz podataka" onPress={()=>router.push('/Data')}/>
                {!qrOn ?(
                    <Button title="Otvori QR skener" onPress={()=>setQrOn(true)}/>
                ):(
                    <Button title="Zatvori QR skener" onPress={()=>setQrOn(false)}/>
                )}
                {qrOn && <QrScanner onScanned={handleScan} onClose={()=>setQrOn(false)}/>}
        </View>
    );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center' },
  text: { fontSize: 18, marginBottom: 10 },
  bold: { fontWeight: 'bold' },
});