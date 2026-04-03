import React, {useEffect,useRef,useState} from "react";
import QrScannerLib from "qr-scanner";

async function deviceHasCamera() {
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.some((d) => d.kind === "videoinput");
}

export default function QrScannerView(){
    const scanner=useRef(null);
    const videoEl=useRef(null);
    const overlayRef=useRef(null);

    const [qrOn,setQrOn]=useState(true);
    const [scannedResult,setScannedResult]=useState("");
    const [cameraReady, setCameraReady] = useState(false);
    const [scannedText, setScannedText]=useState("");

     const onScanSucces=(result)=>{
        console.log(result);
        setScannedResult(result); 
        setScannedText(result?.data ?? "");
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
            alert("Nije moguće pristupiti kameri. Provjerite dozvole i pokušajte ponovo.");
        }
    },[qrOn]);

    return(
        <div className="qr-reader">
            <video  ref={videoEl}
  onLoadedMetadata={() => setCameraReady(true)} ></video>
            <div ref={overlayRef} className="qr-box">
                {!cameraReady &&<p>Učitavanje kamere...</p>}
            </div>
            {scannedText && <p>Skener pročitao: {scannedText}</p>}
        </div>
    );
}
