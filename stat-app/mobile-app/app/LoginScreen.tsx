import React,{useState} from 'react';
import {View,Text,TextInput,Button,StyleSheet} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

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
}