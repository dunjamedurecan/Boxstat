import React, { useEffect, useState} from 'react';
import {View, Text, StyleSheet, Button} from "react-native";
import {CameraView, useCameraPermissions,BarcodeScanningResult} from "expo-camera";

type Props={
    onScanned:(payload:any)=>void;
    onClose:()=>void;
};

export default function QrScanner({onScanned, onClose}:Props){
    const [permission, requestPermission]=useCameraPermissions();
    const [active,setActive]=useState(true);

    useEffect(()=>{
        (async ()=>{
            if(!permission) return;
            if(!permission.granted){
                await requestPermission();
            }
        })();
    },[permission]);

    const handleBarcode=(result: BarcodeScanningResult)=>{
        if (!active)return;

        const raw=result.data;
        let payload:any;
        try{
            payload=JSON.parse(raw);
        }catch(e){
            setActive(false);
            onClose();
            return;
        }

        if (payload?.v!==1){
            setActive(false);
            onClose();
            return;
        }
        setActive(false);
        onScanned(payload);
        onClose();
    };

    if(!permission){
        return(
            <View style={styles.center}>
                <Text>Učitavanje dozvola kamere...</Text>
            </View>
        );
    }
    if(!permission.granted){
        return(
            <View style={styles.center}>
                <Text>Nije dopušten pristup kameri.</Text>
                <Button title="Dopusti kameru" onPress={requestPermission}></Button>
                <Button title="Zatvori" onPress={onClose}></Button>
            </View>
        );
    }
    return(
        <View style={styles.container}>
            <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={handleBarcode}
            barcodeScannerSettings={{barcodeTypes:["qr"],}}
            />
            <View style={styles.overlay}>
                <Text style={styles.overlaytext}>Skeniraj QR kod...</Text>
                <Button title="Zatvori" onPress={onClose}/>
            </View>
        </View>
    );
}

const styles=StyleSheet.create({
    container:{height: 380, borderRadius: 12, overflow:"hidden"},
    camera:{flex:1},
    overlay:{
        position:"absolute",
        left: 0,
        right: 0,
        bottom: 0,
        padding: 12,
        backgroundColor: "rgba(0,0,0,0.45)",
        gap: 8,
    },
    overlaytext: {color: "white", fontSize: 16, fontWeight: "600"},
    center: {padding: 16, gap:10},
});