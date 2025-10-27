const express = require('express');
const { Pool } = require('pg');
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');
const {v4: uuidv4}=require('uuid');
const bcrypt=require('bcrypts');
const jwt=require('jsonwebtoken');
const { error } = require('console');

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

app.post('/api/register',async(req,res)=>{
  const {email, password}=req.body;
  if(!email||password)return res.status(400).json({error:'Nedostaju podaci.'});

  try{
    const hashed=await bcrypt.hash(password,10);

    const result=await pool.query('INSERT INTO users (email,password) VALUES($1,$2) RETURNING id,email',[email,hashed]);
    res.status(201).json({id:result.rows[0].id,email:result.rows[0].email});
  }catch (err){
    if(err.code='23505'){
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
    const result=await pool.query('SELECT id,email,password FROM users WHERE email=$1',[email]);
    const user=result.rows[0];
    if(!user) return res.status(401).json({error:'Krivi email ili lozinka'});
  }catch(err){
    console.error('Login error: ',err);
    res.status(500).json({error: 'Server error'});
  }
})

wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');

  let sessionActive = true;
  let userId=uuidv4();
  const timestamp=new Date();

  ws.on('message', (message, isBinary) => {
    if (isBinary) {
      console.log('Received binary data:', message);
      return;
    }

    const msg = message.toString();

    if (msg === 'pong') {
      console.log('Received pong message, ignoring.');
      return;
    }

    try {
      const data = JSON.parse(msg);

      if (data.type === 'identify') {
        console.log('Identification message received:', data);
        startSession(ws);
      } else if (data.type === 'measurement' && sessionActive) {
        console.log('Measurement data received:', data);
        // Započni s procesom završavanja sesije
        endSession(ws, data,timestamp);
      } else {
        console.error('Unknown message type:', data);
      }
    } catch (error) {
      console.error('Error parsing JSON:', error.message);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
  });

  function startSession(ws) {
    sessionActive = true;
    ws.send(JSON.stringify({ type: 'start-session' ,userId}));
    console.log(`Session started for ${userId}`);
  }

  function endSession(ws, data,timestamp) {
    sessionActive = false;
    ws.send(JSON.stringify({ type: 'end-session' ,userId}));
    console.log(`Session ended for ${userId}`);

    // Spremi podatke u bazu, pa nakon toga ponovno pokreni sesiju
    saveMeasurementToDatabase(data, ws,timestamp);
  }

  function saveMeasurementToDatabase(data, ws,starttime) {
    // Ispravno izvlačenje podataka iz objekta
    const { type, top, bottom, timestamp,deviceId } = data;
    //const { type, top, bottom } = data;
    const tmstmp=new Date(starttime.getTime()+(timestamp));
    // Provjerava se da li objekti 'top' i 'bottom' imaju potrebne atribute
    const top_x = top.x;
    const top_y = top.y;
    const top_z = top.z;
    const bottom_x = bottom.x;
    const bottom_y = bottom.y;
    const bottom_z = bottom.z;
    const device=deviceId;
    pool.query(
      'INSERT INTO sensor_data(userId,deviceId,type, top_x, top_y, top_z, bottom_x, bottom_y, bottom_z, timestamp) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [userId,device,type, top_x, top_y, top_z, bottom_x, bottom_y, bottom_z, tmstmp],
      (err, res) => {
        if (err) {
          console.error('Error saving measurement to database:', err.message);
        } else {
          console.log('Measurement saved to database.');

          setTimeout(() => {
            startSession(ws);
          }, 5000); // 5 sekundi pauze prije novog pokretanja sesije
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

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
