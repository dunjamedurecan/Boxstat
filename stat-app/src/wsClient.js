// Simple browser WebSocket helper
let ws = null;
let reconnectTimeout = null;
let messageListeners=[];
let manualClose=false;

function getWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.hostname;
  const port = (window.location.protocol === 'https:') ? '' : ':3001';
  return `${protocol}://${host}${port}/`;
}

export function connectWebSocket(token, onOpen, onClose, onError) {
  if(!token){
    console.warn("Nema tokena");
    return null;
  }

  if(ws && (ws.readyState==WebSocket.OPEN || ws.readyState===WebSocket.CONNECTING)){
    console.log("WebSocket is already connected or connecting.");
    return ws;
  }
  const url = getWsUrl();
  ws = new WebSocket(url);
  manualClose=false;

  ws.onopen = () => {
    console.log('WS connected to', url);
    if (token) {
      const identifyMsg = { type: 'identify', token };
      ws.send(JSON.stringify(identifyMsg));
      console.log('Sent identify with token');
    }
    
    if (onOpen) onOpen();
  };

  ws.onmessage = (event) => {
    try {
      const obj = JSON.parse(event.data);
      if(obj.type==='identified'){
        console.log("identified as user",obj.userId);
      }
      messageListeners.forEach(cb=>cb(obj));
      //if (onMessage) onMessage(obj);
    } catch (err) {
      messageListeners.forEach(cb=>cb(event.data));
      //if (onMessage) onMessage(event.data);
    }
  };

  ws.onclose = (ev) => {
    console.log("WebSocket closed:", ev);
    if (onClose) onClose(ev);

    if (reconnectTimeout) clearTimeout(reconnectTimeout);
   if(!manualClose){
    reconnectTimeout=setTimeout(
      ()=>connectWebSocket(localStorage.getItem("token"),onOpen,onClose,onError),
    3000);
   }
  };

  ws.onerror = (err) => {
    console.error('WS error', err);
    if (onError) onError(err);
  };

  return ws;
}

export function sendWS(obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('WebSocket is not open. Cannot send.');
    return false;
  }
  ws.send(JSON.stringify(obj));
  return true;
}

export function closeWS() {
  manualClose=true;
   if (reconnectTimeout) clearTimeout(reconnectTimeout);
  if (ws) {
    ws.close();
    ws = null;
  }
}

export function onWSMessage(callback){
  if(typeof callback=='function'){
    messageListeners.push(callback);
  }
  return ()=>{
    messageListeners=messageListeners.filter((cb)=>cb!==callback)
  }
}

