import { Link } from "react-router-dom";
import "../styles/Start.css";

export default function Start() {
    return (
        <div className="start-container">
            <header className="start-header">
                <h1>BoxStat</h1>
                <nav className="start-nav">
                    <Link to="/login">Prijava</Link>
                    <Link to="/registration">Registracija</Link>
                </nav>
            </header>

            <main className="hero">
                <div className="hero-card">
                    <h2>Statistika boksačkih treninga</h2>
                    <p>
                        Prati udarce, jačinu i statistiku treninga u stvarnom
                        vremenu. BoxStat ti pomaže trenirati pametnije i jače.
                    </p>

                    
                </div>
            </main>
        </div>
    );
}
