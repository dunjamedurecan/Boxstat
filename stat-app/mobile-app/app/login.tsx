import React,{useState} from 'react';
import {View,Text,TextInput,Pressable,KeyboardAvoidingView,Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {connectWebSocket} from '../services/wsClient';
import { WSMessage } from '../services/types';
import {router} from 'expo-router';
import {styles} from "./styles/loginStyles"
import {LinearGradient} from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';


export default function LoginScreen(){
    const [email, setEmail]=useState('');
    const[password, setPassword]=useState('');
    const [error, setError]=useState('');

    const [emailFocused, setEmailFocused]=useState(false);
    const [passFocused, setPassFocused]=useState(false);
   

    async function handleSubmit(){
        setError('');
    try{
        const res=await fetch('http://192.168.1.12:3001/api/login',{
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

        connectWebSocket(
        token,
        () => console.log('WebSocket connected'), // onOpen callback
        (msg: WSMessage) => {
          console.log('WS message (login-level):', msg); // onMessage to handle messages
        },
        (err) => console.error('WebSocket closed due to error:', err) // onError callback
      );

        router.replace('/Home');
    }catch(err){
        console.error(err);
        setError('Ne mogu se spojiti na server.');
    }
}
    return(
         <LinearGradient colors={["#fff5f5", "#ffffff"]} style={styles.bg}>
            
    <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.card}>
            <Text style={styles.title}>Prijava</Text>

            <View style={styles.form}>
              <View>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={[styles.input, emailFocused && styles.inputFocused]}
                  placeholder="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                />
              </View>

              <View>
                <Text style={styles.label}>Lozinka</Text>
                <TextInput
                  style={[styles.input, passFocused && styles.inputFocused]}
                  placeholder="Lozinka"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  onFocus={() => setPassFocused(true)}
                  onBlur={() => setPassFocused(false)}
                />
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={handleSubmit}
                style={({ pressed }) => [
                  styles.btn,
                  pressed && styles.btnPressed,
                ]}
              >
                <Text style={styles.btnText}>Prijavi se</Text>
              </Pressable>

              <View style={styles.linkRow}>
                <Text style={styles.linkText}>
                  Nemaš račun?{" "}
                  <Text
                    style={styles.link}
                    onPress={() => router.push("/Registration")}
                  >
                    Registriraj se
                  </Text>
                </Text>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
   
    </LinearGradient>
    )
}

