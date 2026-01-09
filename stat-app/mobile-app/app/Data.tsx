// na zahtjev (šalje poruku serveru) povlači nove podatke o sesijama (treninzima) i ispisuje ih 
// prvi put download data
// kasnije refresh data
import {jwtDecode} from 'jwt-decode';
import { useEffect,useState } from 'react';
import { connectWebSocket, onWSMessage, sendWS } from '../services/wsClient';
import { WSMessage } from '@/services/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {router} from 'expo-router';
import {View,Text,TextInput,Button,StyleSheet,FlatList} from 'react-native';


interface SensorData {
  timestamp: string;
  top_x: number | null;
  top_y: number | null;
  top_z: number | null;
  bottom_x: number | null;
  bottom_y: number | null;
  bottom_z: number | null;
}

interface Practice {
  deviceid: string;
  started_at: string;
  ended_at: string;
  sensorData: SensorData[];
}


export default function Data(){
    const [user,setUser]=useState<any>(null);
    const[token,setToken]=useState<string | null>(null);
    const[practices,setPractices]=useState<Practice[]>([]);
    
    
 useEffect(()=>{ 
    const init=async()=>{
        const token=await AsyncStorage.getItem('token');
        if(!token){
            router.replace("/login");
            return;
        }
        try{
            const payload=jwtDecode(token);
            setUser(payload);
            console.log(user);
        }catch(e){
            console.warn("Ne mogu dekodirati token");
        }
        connectWebSocket(token);

        const storedPractices=await AsyncStorage.getItem('practices');
        if(storedPractices){
            setPractices(JSON.parse(storedPractices));
        }
    };
    init();
    
        
    },[]);
    useEffect(() => {
        if(!user)return;
    onWSMessage((msg: WSMessage) => {
       // console.log("Primljeno od servera:", msg);
       //console.log(user.userId);
        if(msg.userId!=user.userId)return;
       if(msg.type=="data-msg"){
        console.log("primljeni podaci");
        if (Array.isArray(msg.data)) {
    console.log("Primljeni podaci:", msg.data);
    setPractices((prevPractices)=>{const updatedPractices=[...prevPractices,...msg.data];
    AsyncStorage.setItem('practices',JSON.stringify(updatedPractices));
    return updatedPractices;
    });
}
        
       }
    });
}, [user]);
function RequestData() {
  const msg: WSMessage = {
    type: 'data-req', 
  };
  sendWS(msg);
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
