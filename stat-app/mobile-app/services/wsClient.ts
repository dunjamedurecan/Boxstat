import AsyncStorage from '@react-native-async-storage/async-storage';

let ws: WebSocket|null=null;
let reconnectTimeout: NodeJS.Timeout|null=null;
let messageListeners:((msg:any)=>void)[]=[];

const SERVER_IP='ipadresa'; 
const SERVER_PORT=3001;

function getWsUrl(){
    return `ws://${SERVER_IP}:${SERVER_PORT}`;
}

export function connectWebSocket(
    token: string,
    onOpen?:()=>void,
    onMessage?:(msg:any)=>void,
    onClose?:(ev:any)=>void,
    onError?:(err:any)=>void
){
    if(!token){
        console.warn("Nema tokena");
        return;
    }

    if(ws && (ws.readyState===WebSocket.OPEN || ws.readyState===WebSocket.CONNECTING)){
        console.log("WebSocket is already connected or connecting.");
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
            const obj =JSON.parse(event.data);
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