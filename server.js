const express = require('express');
const { Pool } = require('pg');
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');
const {v4: uuidv4}=require('uuid');
const bcrypt=require('bcrypt');
const jwt=require('jsonwebtoken');

const app = express();
const PORT = 3001;

app.use(express.json());

app.use(cors({
  origin: 'http://localhost:5173',
}));

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'InteraktivnaVreca',
  password: 'bazepodataka',
  port: 5432,
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const JWT_SECRET=process.env.JWT_SECRET||'super_secret_dev_key';

// Global state
let bagSockets = new Set();
let currentSessionActive = false; // true when a user started a session
let currentSessionUserId = null; // userId of the active session (used when saving bag measurements)
let currentSessionBagId=null;


//ideja za qr kod - ovo za testiranje dodavanja vreće u bazu podataka
app.get('/api/bagdata', async (req, res) => {
  const bagid = req.query.bagid;
  const weight = req.query.weight;
  const elasticty = req.query.elasticty;

  if (!bagid) return res.status(400).json({ error: 'Missing bagid' });

  try {
    const exists= await pool.query("SELECT weight, elasticity FROM bags WHERE deviceid=$1",[bagid]);

    if(exists.rows.length==0){
      const result = await pool.query(
        "INSERT INTO bags(deviceid, weight, elasticity) VALUES ($1, $2, $3) RETURNING *",
        [bagid, weight, elasticty]   
      );
      console.log(`Dodana nova vreća s ID: ${bagid}`);
     // return res.json({
       // success: true,
        //message:"New bag inserted",
        //data: result.rows[0],
      //});
    }else{
      const needupd=exists.rows[0].weight!=weight || exists.rows[0].elasticity!=elasticty;
      if(needupd){
        const update=await pool.query(
          "UPDATE bags SET weight=$1, elasticity=$2 WHERE deviceid=$3 RETURNING *",[weight,elasticty,bagid]
        );
        console.log(`Ažurirana vreća: ${bagid}`);
      //  return res.json({
        //  success:true,
          //message:"Bag updated",
          //data:update.rows[0],
        //});
      }else{
        console.log("Bag already exists in system");
       // return res.json({
         // success:true,
          //message:"Bag already exists",
          //data:exists.rows[0],
       // });
      }
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
  try{
    const userid=currentSessionUserId;
    currentSessionBagId=bagid;
    if(!userid){
      console.log("Nema prijavljenog korisnika, vreća nije s nikim povezana");
      return res.json({
        success:false,
        message:"No active user",
      });
    }else{
      timestamp= new Date()
      const connect=await pool.query(
        "INSERT INTO connection(userid,deviceid,started_at)VALUES($1,$2,$3)RETURNING *",[userid,bagid,timestamp]);
      console.log(`Conected user ${userid} and bag ${bagid}`);
      return res.json({
        success:true,
        message:"Conected",
        data:connect.rows[0],
      });
    }
  }catch(err){
    console.error(err);
    res.status(500).json({ error: "Connect error" });
  }
});

app.post('/api/register',async(req,res)=>{
  const {email,username, password}=req.body||{};
  if(!email||!password||!username)return res.status(400).json({error:'Nedostaju podaci.'});

  try{
    const hashed=await bcrypt.hash(password,10);
    const userId=uuidv4();
    const result=await pool.query('INSERT INTO users (userId,email,username,password) VALUES($1,$2,$3,$4) RETURNING userId,email',[userId,email,username,hashed]);
    res.status(201).json({userId:result.rows[0].userId,email:result.rows[0].email,username:result.rows[0].username});
  }catch (err){
    if(err.code=='23505'){
      res.status(409).json({error:'Korisnik već postoji'});
    }else{
      console.error('Registration error:',err);
      res.status(500).json({error:'Server error'});
    }
  }
});

app.post('/api/login',async(req,res)=>{
  const {email, password}=req.body;
  if(!email||!password)return res.status(400).json({error:'Nedostaju podaci.'});

  try{
    const result=await pool.query('SELECT userId,email,username,password FROM users WHERE email=$1',[email]);
    const user=result.rows[0];
    console.log(user);
    if(!user) return res.status(401).json({error:'Krivi email ili lozinka'});
    const match=await bcrypt.compare(password,user.password);
    if(!match)return res.status(401).json({error:'Krivi email ili lozinka'});

    const token=jwt.sign({userId:user.userid,email:user.email,username:user.username},JWT_SECRET,{expiresIn:'2h'});
    res.json({token,userId:user.userId});
  }catch(err){
    console.error('Login error: ',err);
    res.status(500).json({error: 'Server error'});
  }
})

wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  ws.userId = null;
  ws.isBag = false;

  ws.on('message', (message, isBinary) => {
    if (isBinary) {
      console.log('Received binary data:', message);
      return;
    }

    const msg = message.toString();

    if (msg === 'pong') {
      // heartbeat message from ESP - ignore or log
      console.log('Received pong message from client');
      return;
    }
    try {
      const data = JSON.parse(msg);
      if (data.type === 'identify') { //poslana poruka od user-a da se spojio (login)
      console.log('Identification message from user recived: ',data);
      if (data.token) {
        try {
          const payload = jwt.verify(data.token, JWT_SECRET);
          ws.userId = payload.userId;
          console.log('User identified via token:', ws.userId);
          ws.send(JSON.stringify({ type: 'identified', userId: ws.userId }));
          startSession(ws);
        } catch (err) {
          console.error('Invalid token in identify:', err.message);
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
        }
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'No token or userId provided' }));
      }
      return;
    }

    if (data.type === 'identify-bag') { //uspostavljena veza s vrećom
      console.log('Identification message from bag recived: ',data);
      const timestamp=new Date();
      ws.isBag = true;
      bagSockets.add(ws);
      ws.send(JSON.stringify({ type: 'identified-bag', deviceId: data.deviceId || data.id || null }));
      if (currentSessionActive) {
        ws.send(JSON.stringify({ type: 'start-session' }));
        console.log('Session already started, sending start session message to bag');
      }
      return;
    }

    // Measurement message from a bag
    if (data.type === 'measurement') {
      if (ws.isBag) {
        if (!currentSessionActive) {
          console.log('Measurement received from bag but no active session - ignoring');
          return;
        }
        console.log('Measurement data received:', data);
        // Save measurement to DB using session userId if bag has no userId
        endSession(ws,data);
        return;
      }
    }
    if (data.type === 'scan'){
      const{bagid,weight,elasticty}=data;
      if(!bagid || !weight){
         ws.send(JSON.stringify({
          type: 'scan-result',
          success: false,
          message: 'Missing bag data'
      }));
      }
      (async ()=>{
        try{
          const exists= await pool.query("SELECT weight, elasticity FROM bags WHERE deviceid=$1",[bagid]);

          if(exists.rows.length==0){
            const result= await pool.query("INSERT INTO bags(deviceid, weight, elasticity) VALUES ($1, $2, $3) RETURNING *",[bagid, weight, elasticty]);
            console.log(`Dodana nova vreća s ID: ${bagid}`);
            ws.send(JSON.stringify({
              type:'saving-bag',
              succes:true,
              message:'Inserted new bag'
            }));
          }else{
            const needupd=exists.rows[0].weight!=weight || exists.rows[0].elasticity!=elasticty;
            if(needupd){
              const update=await pool.query("UPDATE bags SET weight=$1, elasticity=$2 WHERE deviceid=$3 RETURNING *",[weight,elasticty,bagid]);
              console.log(`Ažurirana vreća: ${bagid}`);
              ws.send(JSON.stringify({
              type:'saving-bag',
              succes:true,
              message:'updated existing bag'
            }));
            }else{
              console.log("Bag already exists");
              ws.send(JSON.stringify({
              type:'saving-bag',
              succes:true,
              message:'bag exists'
            }));
            }
          }
        }catch(err){
          console.error(err);
          res.status(500).json({ error: "Database error" })
        }
        try{
          const userid=currentSessionUserId;
          currentSessionBagId=bagid;
          if(!userid){
            console.log("Nema prijavljenog korisnika, vreća nije s nikim povezana");
           ws.send(JSON.stringify({
              success:false,
              message:"No active user",
            }));
          }else{
            timestamp= new Date();
            const connect=await pool.query("INSERT INTO connection(userid,deviceid,started_at)VALUES($1,$2,$3)RETURNING *",[userid,bagid,timestamp]);
            console.log(`Conected user ${userid} and bag ${bagid}`);
            ws.send(JSON.stringify({
              success:true,
              message:"Conected",
              data:connect.rows[0],
            }));
          }
        }catch(err){
          console.error(err);
          res.status(500).json({ error: "Connect error" });
        }
      })();
    }
    console.error('Unknown message type:', data.type);
    } catch (err) {
      console.error('Error parsing JSON from ws message:', err.message);
      return;
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
    if (ws.isBag) {
      bagSockets.delete(ws);
      console.log('Bag disconnected. Remaining bags:', bagSockets.size);
    }
    if (!ws.isBag && ws.userId && currentSessionUserId === ws.userId) {
      console.log('Session owner disconnected, ending session for user:', ws.userId);
      endSessionForUser(ws);
    }
  });

  
  function startSession(ws) {
    if (!ws|| !ws.userId) {
      console.log('Nema userId');
      return;
    }
    currentSessionActive = true;
    currentSessionUserId = ws.userId;
    
    try { ws.send(JSON.stringify({ type: 'start-session', userId: ws.userId || null })); } catch (e) {}
    console.log('Session started by user', ws.userId);
    bagSockets.forEach(b => {
      try {
        b.send(JSON.stringify({ type: 'start-session' }));
      } catch (e) {
        console.error('Error sending start-session to bag:', e.message);
      }
    });
  }

  function endSession(ws) {
    currentSessionActive = false;
    currentSessionUserId = null;
    try { if(ws) ws.send(JSON.stringify({ type: 'end-session', userId: ws.userId || null })); } catch (e) {}
    console.log('Session ended', ws ? ws.userId : '(no user ws)');
    bagSockets.forEach(b => {
      try {
        b.send(JSON.stringify({ type: 'end-session' }));
      } catch (e) {
        console.error('Error sending end-session to bag:', e.message);
      }
    });

    saveMeasurementToDatabase(data,ws,timestamp);
  }

  function saveMeasurementToDatabase(data, wsBag,starttime) {
    const { type, top, bottom, timestamp, deviceId } = data;
    const tmstmp = new Date(starttime.getTime() + (timestamp || 0));
    const top_x = top?.x ?? null;
    const top_y = top?.y ?? null;
    const top_z = top?.z ?? null;
    const bottom_x = bottom?.x ?? null;
    const bottom_y = bottom?.y ?? null;
    const bottom_z = bottom?.z ?? null;
    const device = deviceId ?? null;

    // Determine which userId to save: bag may carry userId, otherwise use currentSessionUserId
    //const userIdToSave = currentSessionUserId;

   // if (!userIdToSave) {
     // console.warn('No userId available for saving measurement — skipping DB insert. data:', JSON.stringify(data));
      //return;
   // }

    pool.query(
      'INSERT INTO sensor_data(deviceId,type, top_x, top_y, top_z, bottom_x, bottom_y, bottom_z, timestamp) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [ device, type, top_x, top_y, top_z, bottom_x, bottom_y, bottom_z, tmstmp],
      (err, res) => {
        if (err) {
          console.error('Error saving measurement to database:', err.message);
        } else {
          console.log('Measurement saved to database. userId=', userIdToSave);
        }
      }
    );
  }
});


app.get('/data', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT 10');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching data from database:', err.message);
    res.status(500).send('Server Error');
  }
});


//start servera
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});