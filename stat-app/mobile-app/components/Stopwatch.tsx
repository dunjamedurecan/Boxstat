import { useEffect,useMemo,useState } from "react";
import { Text } from "react-native";

function pad2(n:number){
    return n.toString().padStart(2,'0');
}

export default function Stopwatch({running,resetKey}:{running:boolean,resetKey:any}){
    const [ms, setMs]=useState(0);

    useEffect(()=>{
        setMs(0);
    },[resetKey]);

    useEffect(()=>{
        if(!running)return;

        const id=setInterval(()=>{
            setMs((prev)=>prev+100);
        },100);
        return ()=>clearInterval(id);
    },[running]);

    const text=useMemo(()=>{
        const totalSeconds=Math.floor(ms/1000);
        const minutes=Math.floor(totalSeconds/60);
        const seconds=totalSeconds%60;
        const cs=Math.floor((ms%1000)/10);
        return`${pad2(minutes)}:${pad2(seconds)}:${pad2(cs)}`;
    },[ms]);

    return <Text>{text}</Text>

}