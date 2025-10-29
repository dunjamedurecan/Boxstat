// Simple browser WebSocket helper
let ws = null;
let reconnectTimeout = null;

function getWsUrl() {
  
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  
  const host = window.location.hostname;
  const port = (window.location.protocol === 'https:') ? '' : ':3001';
  return `${protocol}://${host}${port}/`;
}

export function connectWebSocket(token, onMessage, onOpen, onClose, onError) {
  if(!token){
    console.warn("Nema tokena");
    return null;
  }
  const url = getWsUrl();
  if (ws && ws.readyState !== WebSocket.CLOSED) {
    try { ws.close(); } catch (e) {}
    ws = null;
  }

  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('WS connected to', url);
    // send identify with token immediately after open
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
      if (onMessage) onMessage(obj);
    } catch (err) {
      if (onMessage) onMessage(event.data);
    }
  };

  ws.onclose = (ev) => {
    console.log('WS closed', ev);
    if (onClose) onClose(ev);
    // try reconnect after short delay
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(() => {
      const storedToken = localStorage.getItem('token');
      connectWebSocket(storedToken, onMessage, onOpen, onClose, onError);
    }, 3000);
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
  if (ws) {
    ws.close();
    ws = null;
  }
}