import {Routes, Route} from "react-router-dom";
import Login from "./pages/Login";
export default function App(){
  return(
    <div className="app">
      <Routes>
        <Route path="/login" element={<Login/>}/> 
      </Routes>
    </div>
  )
}