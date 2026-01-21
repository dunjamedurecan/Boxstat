import {Stack} from 'expo-router';

export default function Layout(){
  return(
    <Stack>
      <Stack.Screen name="login"/>
      <Stack.Screen name="Home"/>
      <Stack.Screen name="Data"/>
      <Stack.Screen name="Registration"/>
    </Stack>
  )
}