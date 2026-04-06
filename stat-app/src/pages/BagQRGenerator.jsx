import {useMemo, useState} from "react";
import {QRCodeCanvas} from "qrcode.react";

export default function BagQRGenerator() {
    const [bagId, setBagId] = useState("1111");
    const [massKg, setMassKg] = useState(20);
    const [elasticity, setElasticity]=useState(0);

    const payload = useMemo(() => ({
        v:1,
        type:"bag",
        id: bagId,
        weight: massKg,
        elasticity: elasticity
    }),[bagId, massKg, elasticity]);

    const qrValue = JSON.stringify(payload);
    return (
        <div>
            <h3>Bag QR Code Generator</h3>
            <label>ID vreće</label>
            <input  value={bagId} onChange={(e) => setBagId(e.target.value)} />
            <label>Težina (kg)</label>
            <input  value={massKg} onChange={(e) => setMassKg(e.target.value)} />
            <label>Elastičnost</label>
            <input  value={elasticity} onChange={(e) => setElasticity(e.target.value)} />

            <div>
                <QRCodeCanvas value={qrValue} size={220}/>
            </div>
            <pre>{qrValue}</pre>
        </div>
    )
}