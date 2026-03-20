const express = require('express');
const { Pool } = require('pg');
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');
const {v4: uuidv4}=require('uuid');
const bcrypt=require('bcrypt');
const jwt=require('jsonwebtoken');
const { timeStamp } = require('console');

const app = express();
const PORT = 3001;

app.use(express.json());

app.use(cors({
  origin:'*' ,
}));

//postavljanje baze podataka
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
const bags = new Map();
const users=new Map();
let currentSessionBagId=null;


//ideja za qr kod - ovo za testiranje dodavanja vreće u bazu podataka - ovo više ne treba!
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
    }else{
      const needupd=exists.rows[0].weight!=weight || exists.rows[0].elasticity!=elasticty;
      if(needupd){
        const update=await pool.query(
          "UPDATE bags SET weight=$1, elasticity=$2 WHERE deviceid=$3 RETURNING *",[weight,elasticty,bagid]
        );
        console.log(`Ažurirana vreća: ${bagid}`);
      }else{
        console.log("Bag already exists in system");
      }
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
  try{
    const userid=ws.id;
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
//registracija korisnika
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
//login korisnika
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

   const token = jwt.sign(
    { userId: user.userid, email: user.email, username: user.username },
    JWT_SECRET,
    { expiresIn: '2h' }
);

    res.json({token,userId:user.userId});
  }catch(err){
    console.error('Login error: ',err);
    res.status(500).json({error: 'Server error'});
  }
})

//web socket
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket'); //kad se spoji korisnik/vreća ispisuje

  ws.on('message', (message, isBinary) => {
    if (isBinary) {
      console.log('Received binary data:', message); //binarna poruka
      return;
    }

    const msg = message.toString();

    if (msg === 'pong') { //ne treba nuzno 
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
          users.set(payload.userId,ws);
          ws.type="user";
          ws.id = payload.userId;
          ws.userId = payload.userId;
          console.log('User identified via token:', ws.id);
          ws.send(JSON.stringify({ type: 'identified', userId: ws.id }));
          startSession(ws);
        } catch (err) {
          console.error('Invalid token in identify:', err.message);
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid token'}));
        }
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'No token or userId provided' }));
      }
      return;
    }

    if (data.type === 'identify-bag') { 
      console.log('Identification message from bag recived: ',data);
      const timestamp=new Date();
      bags.set(data.deviceId,ws);
      ws.type = "bag";
      ws.id=data.deviceId;
      ws.started=timestamp;
      ws.send(JSON.stringify({ type: 'identified-bag', deviceId: data.deviceId || data.id || null }));
      ws.send(JSON.stringify({ type: 'start-session' }));
      return;
    }

    // Measurement message from a bag
    if (data.type === 'measurement') {
      if (ws.type=="bag") {
        
        bagid=ws.id
        console.log(bagid);
        
        (async ()=>{
          try{
            const exists=await pool.query("SELECT deviceid FROM connection WHERE deviceid=$1 AND ended_at IS NULL",[bagid]);
            if(exists.rows.length==0){
              console.log("No active session with bag ignoring");
              return;
          }else{
            console.log("Postoji sesija")
             console.log('Measurement data received:', data);
        // Save measurement to DB using session userId if bag has no userId
        saveMeasurementToDatabase(data,ws,ws.started);
          }
          }catch(e){
            console.log("Error with checking if there is an active session with the bag.");
            console.log(e);
           
          }
        })();
        return;
      }
    }
    if (data.type === 'scan'){ //skeniranje qr koda vrece (spajanje vreca-korinsik)
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
          const userid=ws.id;
          console.log(ws.id)
          currentSessionBagId=bagid;
          console.log(bags);
          if(!bags.has(bagid)){
            console.log("Vreća nije aktivna");
            ws.send(JSON.stringify({
              userId:userid,
              type:'no-active-bag'
            }));
            return;
          }
          if(!userid){
            console.log("Nema prijavljenog korisnika, vreća nije s nikim povezana");
           ws.send(JSON.stringify({
              success:false,
              message:"No active user",
            }));
            return;
            
          }else{
            const alreadyused=await pool.query("SELECT userid,deviceid FROM connection WHERE deviceid=$1 AND ended_at IS NULL",[bagid]);
            if(alreadyused.rows.length!=0){
              const enduserid=alreadyused.rows[0].userid;
              const endt=new Date();
              const endses=await pool.query("UPDATE connection SET ended_at=$1 WHERE ended_at IS NULL AND deviceid=$2 AND userid=$3 RETURNING *",[endt,bagid,enduserid]);
              ws.send(JSON.stringify({
                success:false,
                type:"session-end",
                userId:enduserid,
              }));
            }
            const timestamp= new Date();
            const connect=await pool.query("INSERT INTO connection(userid,deviceid,started_at)VALUES($1,$2,$3)RETURNING *",[userid,bagid,timestamp]);
            console.log(`Conected user ${userid} and bag ${bagid}`);
            ws.send(JSON.stringify({
              success:true,
              type:"scan-ok",
              data:connect.rows[0],
              userId:userid,
            }));
          }
        }catch(err){
          console.error(err);
          res.status(500).json({ error: "Connect error" });
        }
      })();
      return;
    }
    if(data.type=="end-session"){ //odspajanje vreće i korisnika pritiskom guba stop (kraj treninga --> vreća se može spojiti s novim korisnikom)
      let bagid=currentSessionBagId;
      let userId=ws.id;
      console.log(bagid,userId);
      (async()=>{
        try{
          const exists=await pool.query("SELECT userid, deviceid from connection WHERE userid=$1 AND deviceid=$2 AND ended_at IS NULL",[userId,bagid]);
          console.log(exists);
          if(exists.rows.length!=0){
            const end=new Date();
            try{
              const update=await pool.query("UPDATE connection SET ended_at=$1 WHERE userid=$2 AND deviceid=$3 AND ended_at IS NULL RETURNING *",[end,userId,bagid]);
              console.log("session ended");
            }catch(err){
              console.error(err);
              res.status(500).json({error: "Update error"})
            }
            
          }
        }catch(err){
          console.error(err);
          res.status(500).json({ error: "Database error" })
        }
      })();
      return;
    }
    if(data.type=="data-req"){ //slanje podataka o treninzima 
      let userid=ws.id;
      console.log(data);
      console.log("Data request received for user:", userid);
      if(data.timestamp){ // ako je poslan timestamp to je refresh podataka, pa mora provjeriti i koji su treninzi u meduvremenu obrisani (npr na drugom uređaju)
        let time=data.timestamp;
        console.log(time);
        console.log(data.alteration);
        (async ()=>{
          try{
            const exists=await pool.query("SELECT userid,deviceid,started_at,ended_at FROM connection WHERE userid=$1 AND started_at>$2 AND ended_at IS NOT NULL",[userid,time]);
            let practices=[]
            for(let i=0;i<exists.rows.length;i++){
              const s=exists.rows[i]
              const sensorRes=await pool.query(
                `SELECT deviceid, type, top_x, top_y, top_z, bottom_x, bottom_y, bottom_z, timestamp
                FROM sensor_data WHERE deviceid=$1
                AND timestamp>$2 AND timestamp<$3 `,
                [s.deviceid,s.started_at,s.ended_at]
              );
              practices.push({...s,sensorData:sensorRes.rows,});
            }
            if(practices.length==0){
              //provjera je li bilo uređivanja podataka (brisanje treninga ili sensor_data) nakon zadnjeg timestampa
              const deleted=await pool.query("SELECT userid,timestamp FROM alterations WHERE userid=$1 AND timestamp>$2",[userid,time]);
              console.log(deleted);
              if(deleted.rows.length>0){
                const exists = await pool.query(
                  "SELECT userid, deviceid, started_at, ended_at FROM connection WHERE userid=$1 AND ended_at IS NOT NULL",[userid]
                );
                let practices=[];
                for(let i=0;i<exists.rows.length;i++){
                  const s=exists.rows[i]
                  const sensorRes=await pool.query(
                    `SELECT deviceid, type, top_x, top_y, top_z, bottom_x, bottom_y, bottom_z, timestamp
                    FROM sensor_data
                    WHERE deviceid = $1
                    AND timestamp >$2 AND timestamp<$3`,
                    [s.deviceid,s.started_at,s.ended_at]);
                  practices.push({...s,sensorData:sensorRes.rows,});
                  //console.log(practices);
              
                }
                ws.send(JSON.stringify({
              type: "data-redo",
              userId: userid,
              data: practices,
            }));
            return;
              }
            }
            ws.send(JSON.stringify({
              type: "data-msg",
              userId: userid,
              data: practices,
            }));
          }catch (err) {
            console.error("Greška kod upita:", err.message);
          }
        })();
        return;
      }
      (async () => {
  try {
    const exists = await pool.query(
      "SELECT userid, deviceid, started_at, ended_at FROM connection WHERE userid=$1 AND ended_at IS NOT NULL",
      [userid]
    );
    let practices=[];
    for(let i=0;i<exists.rows.length;i++){
      const s=exists.rows[i]
      const sensorRes=await pool.query(
        `SELECT deviceid, type, top_x, top_y, top_z,
                bottom_x, bottom_y, bottom_z, timestamp
         FROM sensor_data
         WHERE deviceid = $1
         AND timestamp >$2 AND timestamp<$3`,
        [s.deviceid,s.started_at,s.ended_at]
      );
    practices.push({
      ...s,sensorData:sensorRes.rows,
    });
    }
    ws.send(
      JSON.stringify({
        type: "data-msg",
        userId: userid,
        data: practices,
      })
    );
  } catch (err) {
    console.error("Greška kod upita:", err.message);
  }
})();
       
      return
    }
    if (data.type==="delete-practices"){
      console.log("Brisanje treninga:",data.practices);
      (async()=>{
        try{
            const p=data.practices;
            console.log("Brisanje treninga:",p);
            const deletePractice=await pool.query("DELETE FROM connection WHERE userid=$1 AND deviceid=$2 AND started_at=$3 AND ended_at=$4 RETURNING *",[p.userid,p.deviceid,p.started_at,p.ended_at]);
            console.log("Obrisan trening:",deletePractice.rows);
            if (p.sensorData.length>0){
              for(let j=0;j<p.sensorData.length;j++){
                const hit=p.sensorData[j];
                const deleteHit=await pool.query("DELETE FROM sensor_data WHERE deviceid=$1 AND timestamp=$2 RETURNING *",[hit.deviceid,hit.timestamp]);
                console.log("Obrisan udarac:",deleteHit.rows);
              }
            }
          
          ws.send(JSON.stringify({
            type:"delete-result",
            userId:p.userid,
            success:true,
          }));
          const timestamp=new Date();
          const alteration=await pool.query("INSERT INTO alterations(userid,timestamp) VALUES($1,$2) RETURNING *",[p.userid,timestamp]);
          console.log("Zabilježeno uređivanje podataka:",alteration.rows[0]);
        }catch(err){
          console.error("Greška kod brisanja podataka:",err.message);
        }
      })();
      return;

    }
    if(data.type==="delete-sensordata"){
      console.log(data.sensorData);
      return;
    }
    console.error('Unknown message type:', data.type);
    } catch (err) {
      console.error('Error parsing JSON from ws message:', err.message);
      return;
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
   // if (ws.isBag) {
     // bagSockets.delete(ws);
      //console.log('Bag disconnected. Remaining bags:', bagSockets.size);
    //}
    //if (!ws.isBag && ws.userId && currentSessionUserId === ws.userId) {
      //console.log('Session owner disconnected, ending session for user:', ws.userId);
      //endSession(ws);
    //}
    if(ws.type=="bag"){
      bags.delete(ws.id);
      console.log('Bag disconnected. Remaining bags:', bags.size);
    }
    if(ws.type=="user"){
      users.delete(ws.id)
    }
  });

  
  function startSession(ws) {
    if (!ws|| !ws.id) {
      console.log('Nema userId');
      return;
    }
    currentSessionActive = true;
    currentSessionUserId = ws.id;
    
    try { ws.send(JSON.stringify({ type: 'start-session', userId: ws.id || null })); } catch (e) {}
    console.log('Session started by user', ws.id);
    bags.forEach(b => {
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
    try { if(ws) ws.send(JSON.stringify({ type: 'end-session', userId: ws.id || null })); } catch (e) {}
    console.log('Session ended', ws ? ws.id : '(no user ws)');
    bagSockets.forEach(b => {
      try {
        b.send(JSON.stringify({ type: 'end-session' }));
      } catch (e) {
        console.error('Error sending end-session to bag:', e.message);
      }
    });

   // saveMeasurementToDatabase(data,ws,timestamp);
  }

  function saveMeasurementToDatabase(data, wsBag,starttime) {
    let save=true;
    (async()=>{
      bagconected= await pool.query("SELECT deviceid, userid FROM connection WHERE ended_at IS NULL and deviceid=$1",[wsBag.id]);
      if(bagconected.rows.length==0){
        save=false;
        return; //vreća nije spojena ni s jednim korisnikom izlazi van
      }
    })();
    
    const { type, top, bottom, timestamp, deviceId } = data;
    const tmstmp = new Date();
    const top_x = top?.x ?? null;
    const top_y = top?.y ?? null;
    const top_z = top?.z ?? null;
    const bottom_x = bottom?.x ?? null;
    const bottom_y = bottom?.y ?? null;
    const bottom_z = bottom?.z ?? null;
    const device = deviceId ?? null;
    
    if(save){
      pool.query(
      'INSERT INTO sensor_data(deviceId,type, top_x, top_y, top_z, bottom_x, bottom_y, bottom_z, timestamp) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [ device, type, top_x, top_y, top_z, bottom_x, bottom_y, bottom_z, tmstmp],
      (err, res) => {
        if (err) {
          console.error('Error saving measurement to database:', err.message);
        } else {
          console.log('Measurement saved to database.');
        }
      }
    );
    } 
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
server.listen(PORT,'0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});