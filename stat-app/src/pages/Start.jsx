import {Link} from "react-router-dom";

export default function Start(){
    return(
        <div>
            <header>
                <h1>BoxStat</h1>
                <nav>
                    <Link to="/login">Prijava</Link>
                    <Link to="/registration">Registracija</Link>
                </nav>
            </header>
        </div>
    )
}