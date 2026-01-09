import React,{useState} from 'react';
import {router} from 'expo-router';
import {View,Text,TextInput,Button,StyleSheet, TouchableOpacity} from 'react-native';

export default function Registration(){
    const [email, setEmail]=useState<string>('');
    const[password,setPassword]=useState<string>('');
    const[username,setUsername]=useState<string>('');
    const [error,setError]=useState<string>('');

    async function handleSubmit(e:any){
        setError('');
        try{
            const res=await fetch('http://10.129.139.99:3001/api/register',{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({email,username,password}),
               
            });

            const data=await res.json();
            if(!res.ok){
                setError(data.error || 'Greška pri prijavi');
                return;
            }
            router.replace('/');
        }catch(err){
            console.error(err);
            setError('Ne mogu se spojiti na server.');
        }
    }
     
    return (
    <View style={styles.container}>
      <Text style={styles.title}>Registracija</Text>
        <TextInput style={styles.input} placeholder='Email' value={email} onChangeText={setEmail} autoCapitalize='none' keyboardType='email-address'/>
        <TextInput style={styles.input} placeholder='Username' value={username} onChangeText={setUsername} autoCapitalize='none'/>
        <TextInput style={styles.input} placeholder='Lozinka' value={password} onChangeText={setPassword} secureTextEntry/>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Prijavi se" onPress={handleSubmit}></Button>
       <TouchableOpacity onPress={() => router.push('/login')}>
        <Text style={styles.link}>
          Već imate račun? Prijavite se ovdje
        </Text>
      </TouchableOpacity>
   </View>
    );
  };

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 15, borderRadius: 5 },
  error: { color: 'red', marginBottom: 15, textAlign: 'center' },
  link: { color: 'blue', textAlign: 'center', marginTop: 15 },
});