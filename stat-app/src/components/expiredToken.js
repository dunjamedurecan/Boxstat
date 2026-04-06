import { jwtDecode } from "jwt-decode";

export default function ExpiredToken(token){
    try{
        const payload=jwtDecode(token);
        if(!payload.exp)return true;

        const now=Date.now()/1000;
        return payload.exp<now;
    }catch(e){
        return true;
    }

} 