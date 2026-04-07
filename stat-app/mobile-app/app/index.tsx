import {View, Text, Pressable} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {router} from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {styles} from "./styles/indexStyles";

export default function Index(){
    return(
        <LinearGradient colors={["#ffffff", "#fff1f2"]} style={styles.bg}>
            <SafeAreaView style={styles.safe}>
                <View style={styles.header}>
                    <Text style={styles.logo}>BoxStat</Text>
                </View>

                <View style={styles.hero}>
                    <View style={styles.card}>
                        <View style={styles.cardTopBorder}/>
                        <Text style={styles.title}>Statistika boksačkih treninga</Text>
                        <Text style={styles.subtitle}>Prati udarce, jačinu i statistiku treninga u stvarnom
                        vremenu. BoxStat ti pomaže trenirati pametnije i jače.</Text>
                        <View style={styles.actions}>
                            <Pressable
                            onPress={()=>router.push("/login")}
                            style={({pressed})=>[styles.primaryBtn,pressed && styles.btnPressed]}>
                                <Text style={styles.primaryBtnTetx}>Prijava</Text>
                            </Pressable>

                            <Pressable
                            onPress={()=>router.push("/Registration")}
                            style={({pressed})=>[styles.secondaryBtn, pressed && styles.btnPressedSecondary,]}>
                                <Text style={styles.secondaryBtnText}>Registracija</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </SafeAreaView>
        </LinearGradient>
    )
}