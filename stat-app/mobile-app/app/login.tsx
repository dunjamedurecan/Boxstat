import React,{useState} from 'react';
import {View,Text,TextInput,Button,StyleSheet} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import {connectWebSocket} from '../services/wsClient';

export default function LoginScreen(){
    const [email, setEmail]=useState('');
    const[password, setPassword]=useState('');
    const [error, setError]=useState('');
    const navigation=useNavigation();

    async function handleSubmit(){
        setError('');
    try{
        const res=await fetch('http://ipadresa:3001/api/login',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({email:email.trim(),password}),
        });
        const data=await res.json();
        if(!res.ok){
            setError(data.error||"Greška pri prijavi");
            return;
        }
        const token=data.token;
        if(!token){
            setError("Server nije vratio token.");
            return;
        }
        await AsyncStorage.setItem('token',token);

        connectWebSocket(token,(msg)=>{
            console.log('WS message (login-level):', msg);
        });

        navigation.navigate('Home');
    }catch(err){
        console.error(err);
        setError('Ne mogu se spojiti na server.');
    }
}
    return(
        <View style={styles.container}>
            <Text style={styles.title}>Prijava</Text>
            <TextInput style={styles.input} placeholder='Email' value={email} onChangeText={setEmail} autoCapitalize='none' keyboardType='email-address'/>
            <TextInput style={styles.input} placeholder='lozinka' value={password} onChangeText={setPassword} secureTextEntry/>
            {error ? <Text style={styles.error}>{error}</Text>:null}
            <Button title="Prijavi se" onPress={handleSubmit}></Button>
        </View>
    )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 15, borderRadius: 5 },
  error: { color: 'red', marginBottom: 15, textAlign: 'center' },
});