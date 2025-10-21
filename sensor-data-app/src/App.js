import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto'; // Registrira sve potrebne komponente
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

function App() {
  const [sensorData, setSensorData] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('http://localhost:3001/data');
        const data = await response.json();
        console.log('Fetched data:', data); 
        setSensorData(data);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, []);

  const chartData = {
    labels: sensorData.map(data => data.timestamp),
    datasets: [
      {
        label: 'Top X',
        data: sensorData.map(data => data.top_x),
        borderColor: 'rgba(75, 192, 192, 1)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        fill: true,
      },
      {
        label: 'Bottom X',
        data: sensorData.map(data => data.bottom_x),
        borderColor: 'rgba(153, 102, 255, 1)',
        backgroundColor: 'rgba(153, 102, 255, 0.2)',
        fill: true,
      },
    ],
  };

  return (
    <div className="App">
      <h1>Sensor Data</h1>
      <div className="chart-container">
        <Line data={chartData} />
      </div>
      <div className="sensor-data">
        {sensorData.map((data, index) => (
          <div key={index} className="data-item">
            <p>Type: {data.type}</p>
            <p>Top X: {data.top_x}, Top Y: {data.top_y}, Top Z: {data.top_z}</p>
            <p>Bottom X: {data.bottom_x}, Bottom Y: {data.bottom_y}, Bottom Z: {data.bottom_z}</p>
            <p>Timestamp: {data.timestamp}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
