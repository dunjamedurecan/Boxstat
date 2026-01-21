import {View,Text,TextInput,Button,StyleSheet,TouchableOpacity} from 'react-native';
import {router} from 'expo-router';
export default function Index(){
    return(
        <View>
            <Text>BoxStat</Text>
            <TouchableOpacity onPress={() => router.push('/login')}>
                    <Text >Prijava</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/Registration')}>
                    <Text >Registracija</Text>
            </TouchableOpacity>
        </View>
    )
}