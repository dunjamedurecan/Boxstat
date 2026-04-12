import React, {useEffect,useRef,useState} from "react";
import QrScannerLib from "qr-scanner";

async function deviceHasCamera() {
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.some((d) => d.kind === "videoinput");
}

export default function QrScannerView({onScanned}){
    const scanner=useRef(null);
    const videoEl=useRef(null);
    const overlayRef=useRef(null);

    const [qrOn,setQrOn]=useState(true);
    const [shutcamera,setShutcamera]=useState(false);
    const [scannedResult,setScannedResult]=useState("");
    const [cameraReady, setCameraReady] = useState(false);
    const [scannedText, setScannedText]=useState("");
    const [idBag,setIdBag]=useState("");
    const [weight,setWeight]=useState("");
    const [elasticity,setElasticity]=useState("");

    function handleSubmit(e){
        e.preventDefault();
        const payload={
            type:"scan",
            id:idBag,
            weight:weight,
            elasticity:elasticity,
        };
        onScanned?.(payload);

    }

     const onScanSucces=async (result)=>{
        console.log(result);
        setScannedResult(result); 
        setScannedText(result?.data ?? "");
        let payload;
        try{
            payload=JSON.parse(result.data);
        }catch(e){
            console.warn("Nije moguće parsirati QR kod");
            return;
        }
        if(payload?.v !==1){
            console.warn("Nepoznat format QR koda");
        }
        onScanned?.(payload);

        try{
            if(scanner.current){
                await scanner.current.stop();
                scanner.current.destroy();
                scanner.current=null;
            }
            setShutcamera(true);
        }catch{}
    };

     const onScanFail=(err)=>{
        console.log(err);
    };

     useEffect(()=>{
        let cancelled=false;
        (async ()=>{
            const hasCamera=await deviceHasCamera();
            if(cancelled)return;
            if(!hasCamera){
                setQrOn(false);
                return;
            }
            if(videoEl?.current && !scanner.current){
            scanner.current=new QrScannerLib(videoEl?.current,onScanSucces,{
                onDecodeError:onScanFail,
                preferredCamera: "environment",
                highlightScanRegion:true,
                highlightCodeOutline:true,
                overlay:overlayRef?.current || undefined,
            });

            try{
                await scanner.current.start();
                if(!cancelled)setQrOn(true);
            }catch(e){
                if(!cancelled)setQrOn(false);
            }
        }})();
        
        return ()=>{
            cancelled=true;
            if(scanner?.current){
                scanner.current.stop();
                scanner.current.destroy();
                scanner.current=null;
            }
        };
    },[]);
    useEffect(()=>{
        if(!qrOn){
            //alert("Nije moguće pristupiti kameri. Provjerite dozvole i pokušajte ponovo.");
        }
        if(shutcamera){
            return;
        }
    },[qrOn,shutcamera]);

    return(
        <div className="qr-reader">
            <video  ref={videoEl}
  onLoadedMetadata={() => setCameraReady(true)} ></video>
            <div ref={overlayRef} className="qr-box">
                {!cameraReady &&<p>Učitavanje kamere...</p>}
            </div>
            
                {!qrOn && (<div><p className="error">Nije moguće pristupiti kameri. Provjerite dozvole i pokušajte ponovo ili unesite podatke za spajanje ručno: </p>
                <form onSubmit={handleSubmit} className="bag-form">
                    <label>Id vreće: </label>
                    <input value={idBag} onChange={(e) => setIdBag(e.target.value)} placeholder="Unesite ID vreće" />
                    <label>Težina: </label>
                    <input  value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Unesite težinu" />
                    <label>Elastičnost: </label>
                    <input  value={elasticity} onChange={(e) => setElasticity(e.target.value)} placeholder="Unesite elastičnost" />
                    <button type="submit">Pošalji</button>
                </form></div>)}
            
            
        </div>
    );
}
