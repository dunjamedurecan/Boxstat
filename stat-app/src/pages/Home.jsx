import {jwtDecode} from 'jwt-decode';
import {Link} from 'react-router-dom';
import { useEffect,useState } from 'react';

export default function Home(){
    const [user,setUser]=useState(null);

    useEffect(()=>{
        const token=localStorage.getItem('token');
        try{
            const payload=jwtDecode(token);
            setUser(payload);
        }catch(e){
            console.warn("Ne mogu dekodirati token");
        }
    },[]);
    
    return(
        <div className="container">
            <p>Ulogiran korisnik: <b id="korisnik">{user ? user.username:"user"}</b></p>
            <Link to="/login">odjava</Link>
        </div>
    )
}