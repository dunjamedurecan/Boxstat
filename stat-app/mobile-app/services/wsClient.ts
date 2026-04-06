import AsyncStorage from '@react-native-async-storage/async-storage';
import { WSMessage } from './types';

let ws: WebSocket|null=null;
let reconnectTimeout: ReturnType<typeof setTimeout>|null=null;
let messageListeners:((msg:any)=>void)[]=[];
let manuallyClosed = false;

const SERVER_IP='192.168.1.12'; 
const SERVER_PORT=3001;


function getWsUrl(){
    return `ws://${SERVER_IP}:${SERVER_PORT}`;
}

export function connectWebSocket(
    token: string,
    onOpen?:()=>void,
    onMessage?:(msg:WSMessage)=>void,
    onClose?:(ev:any)=>void,
    onError?:(err:any)=>void
){
    if(!token){
        console.warn("Nema tokena");
        return;
    }

    if(ws && (ws.readyState===WebSocket.OPEN || ws.readyState===WebSocket.CONNECTING)){
        console.log("WebSocket is already connected or connecting.");

        if(ws.readyState===WebSocket.OPEN && onOpen){
            onOpen();
        }
        return ws;
    }

    const url=getWsUrl();
    ws=new WebSocket(url);

    ws.onopen=()=>{
        console.log('WS connected to',url);
        if(token){
            const identifyMsg={type:'identify',token};
            ws?.send(JSON.stringify(identifyMsg));
            console.log('Sent identify with token');
        }
        if(onOpen)onOpen();
    };

    ws.onmessage=(event)=>{
        try{
            const obj: WSMessage =JSON.parse(event.data);
            if(obj.type==='identified'){
                console.log("identified as user",obj.userId);
            }
            messageListeners.forEach(cb=>cb(obj));
            if(onMessage)onMessage(obj);
        }catch(err){
            messageListeners.forEach(cb=>cb(event.data));
            if(onMessage)onMessage(event.data);
        }
    };

    ws.onclose=(ev)=>{
        console.log("Websocket closed:",ev);
        if(onClose)onClose(ev);

        if(manuallyClosed){
          manuallyClosed=false;
          return;
        }

        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(async () => {
      const savedToken = await AsyncStorage.getItem('token');
      connectWebSocket(savedToken || '', onOpen, onMessage, onClose, onError);
    }, 3000);
    };
    ws.onerror=(err)=>{
        console.error('Ws error',err);
        if(onError)onError(err);
    };
    return ws;
}

export function sendWS(obj:WSMessage) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('WebSocket is not open. Cannot send.');
    return false;
  }
  ws.send(JSON.stringify(obj));
  return true;
}

export function closeWS() {
   if (reconnectTimeout) clearTimeout(reconnectTimeout);
  if (ws) {
    manuallyClosed = true;
    ws.close();
    ws = null;
  }
}

export function onWSMessage(callback:(msg:WSMessage)=>void){
  if(typeof callback=='function'){
    messageListeners.push(callback);
    return ()=>{
        messageListeners=messageListeners.filter(cb=>cb!==callback);
    };
  }
  return ()=>{};
}