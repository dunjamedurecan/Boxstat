import {Stack} from 'expo-router';

export default function Layout(){
  return(
    <Stack>
      <Stack.Screen name="login"/>
      <Stack.Screen name="home"/>
      <Stack.Screen name="data"/>
    </Stack>
  )
}