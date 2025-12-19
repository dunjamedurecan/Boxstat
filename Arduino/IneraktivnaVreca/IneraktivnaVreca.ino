

#include <WiFi.h>
#include <Wire.h>
#include <EEPROM.h>
#include <HTTPClient.h>
#include <Arduino_JSON.h>
#include <HTTPUpdate.h>
#include <WebSocketsClient.h>
#include "SparkFunLIS3DH.h"
#include "LED_Display.h"


// =============== Parameters for LED display!
TaskHandle_t Task0;                 // Function for Core0 use
LED_Display display;                // Create object LED_Display
unsigned long int prev_up = 0L;     // Help for millis up
unsigned long int prev_down = 0L;   // Help for millis down
int step_up = 0;                   
int step_down = 0;
String up_text = "    ";
String down_text = "    ";
int short_period = 10;
int long_period = 300;
bool newWord_up = false;
bool newWord_down = false;

// =============== Button parameters
int tipka = 39; // Button pin
int tipka_brojac = 0;
bool long_state = false;
int kratki_pritisak = 500;
int dugi_pritisak = 3000;

// =============== AccessPoint parameters
#define EEPROM_SIZE 600
const char* esp_name = "ESP32S3_boks";
const char* esp_pwd  = "vreca_za_boks";
WiFiServer server(80);
String header;
bool ap_state = false;

// =============== WiFi parameters
bool wifi_state = false;
int wifi_counter = 0;
const char* ssid = "TCL-W9FQHX";//"HUAWEI-B535-2F86";
const char* pwd = "Vrabac12";//"TEREH0DB7MH";
const char* path = "/";
const char* host = "192.168.1.11";//"192.168.8.107"; // ili "127.0.0.1"
int masa = 0;
const int port = 3001;
bool webSocketConnected = false;


// =============== Accelerometar parameters
#define ACC_1 0x19
#define ACC_2 0x18
#define num_usred 100

// Stvaranje objekta oba akcelerometra
LIS3DH acc1(I2C_MODE, ACC_1);
LIS3DH acc2(I2C_MODE, ACC_2);

// Detekcija prisutnosti akcelerometra
bool acc1_state = false;
bool acc2_state = false;

// Podaci o mjerenju akcelerometra i odstupanju od nule {id, x, y, z, dx, dy, dz}
static float data_acc1[7] = {1, 0, 0, 0, 0, 0, 0};
static float data_acc2[7] = {2, 0, 0, 0, 0, 0, 0};

// Varijable za rad sa millisom
unsigned long currentTime = millis();
unsigned long previousTime = 0;
int interval = 30000;

// Varijabla za OTA update
String url = "";

// Podaci opće namjene
bool mjerenje = false;
int force = 0;
int deviceId=1111;
String data = "";
String radna_varijabla = "";
int reconnect = 0;
JSONVar myObject_receive;
JSONVar myObject_send;
JSONVar topData;
JSONVar bottomData;

// Podaci za stvaranje WiFi clienta i WebSocket clienta
WebSocketsClient webSocketClient;
WiFiClient client;

// Funkcije za povezivanje sa WebSocket serverom
void connectToWiFi() {
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, pwd);  // Pokreni povezivanje na Wi-Fi
  print_up("WiFi");
  print_down("...");

  int attempts = 0;  // Brojač pokušaja
  while (WiFi.status() != WL_CONNECTED && attempts < 30) { // Povećaj broj pokušaja ako je potrebno
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    wifi_state = false;
    print_up("WiFi");
    print_down("Err!");
    Serial.println("WiFi NOT connected");  
  } else {
    wifi_state = true;
    print_up("WiFi");
    print_down("Success!");
    Serial.println("WiFi connected");  
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  }
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  Serial.print("WebSocket Event Type: ");
  Serial.println(type);
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("WebSocket disconnected");
      Serial.println(type);
      webSocketConnected = false;
      break;
    case WStype_CONNECTED:
      Serial.println(type);
      Serial.println("WebSocket connected");
      webSocketConnected = true;
      // Uspostavljanje veze sa serverom
      {
      JSONVar myObject;
      myObject["type"] = "identify-bag";
      myObject["entity"] = "bag";
      myObject["deviceId"] = deviceId;

      String message = JSON.stringify(myObject);    

      webSocketClient.sendTXT(message);
      }
      break;
    case WStype_TEXT:
      data = (char*)payload;
      myObject_receive = JSON.parse(data);
      // START - END SESION
      if(myObject_receive.hasOwnProperty("type")){
        radna_varijabla = (const char*)myObject_receive["type"];
        if(radna_varijabla == "start-session")
          mjerenje = true;
        if(radna_varijabla == "end-session")
          mjerenje = false;
        if(radna_varijabla == "update"){
          if(myObject_receive.hasOwnProperty("url")){
            radna_varijabla = (const char*)myObject_receive["url"];
            url = radna_varijabla;
            OTAUpdate();
          }
        }
        radna_varijabla = "";
      }
      break;
  }
}


void connectToWebSocket() {
  if (!webSocketConnected) {
  webSocketClient.begin("192.168.1.11", 3001, "/");
  webSocketClient.onEvent(webSocketEvent);
  webSocketClient.setReconnectInterval(10000);
  }
}
// Setup funkcija:
// - čita parametre iz EEPROMa (flash memorije)
// - na temelju njih pokuša se spojiti na WiFi
// - isključeno: dalje se proba spojit na WS server

void setup () {
  Serial.begin(9600);
  EEPROM.begin(EEPROM_SIZE);
  Serial.println("Starting setup...");  // Number of parameters * 100
  display.init();     // Initialize LED_Display
  Wire.begin(17, 18);

  // Create function for Core0
  xTaskCreatePinnedToCore(Task0Code, "Task0", 20000, NULL, 1, &Task0, 0);
  delay(500);
  Serial.println("Reading EEPROM..."); 
  readEEPROM();
  Serial.println("SSID: " + String(ssid));
  Serial.println("PWD: " + String(pwd));
  Serial.println("HOST: " + String(host));
  Serial.println("PATH: " + String(path));
  Serial.println("PORT: " + String(port));
  Serial.println("MASA: " + String(masa));

  // Initialization
  pinMode(tipka, INPUT_PULLUP);
  Serial.println("Connecting to WiFi...");
  // Povezivanje na mrežu
  connectToWiFi();


  if(wifi_state){
     delay(1000);
     Serial.println("Connecting to WebSocket..."); 
     connectToWebSocket();
  }else{
    print_up("WiFi");
    print_down("Err!");
    Serial.println("WiFi NOT connected");  
    delay(4000);
  }
  checkSensors(true);

  //Usrednjavanje
  usrednjavanje();
}

// Main funkcija
// - provjerava je li tipka pritisnuta dugo (pa se aktivira server na IP adresi ESP32S3 preko kojeg se može u EEPROM/flash memoriju postaviti mrežu, WS server i masu vreće)
// - provjerava je li tipka pritisnuta kratko
// - obnavlja i održava komunikaciju s WS serverom i šalje preko nje podatke s akcelerometra u JSON formatu
void loop(){
  
  // ==========> BUTTON
  // Tipka pritisnuta
  while(digitalRead(tipka) == LOW){
    tipka_brojac = tipka_brojac + 100;
    delay(100);
    if(!long_state && tipka_brojac >= dugi_pritisak){
      long_state = true;
      longPress();
    }
  }
  // Tipka spustena
  if(tipka_brojac != 0 && digitalRead(tipka) == HIGH){
    if(tipka_brojac <= kratki_pritisak){
      shortPress();
    }
    if(tipka_brojac >= dugi_pritisak){
      long_state = false;
    }
    tipka_brojac = 0;
  }

  // ==========> ACCESS POINT
  if(ap_state)accessPoint();
   else{
    // ==========> ACCELEROMETER
    // Primanje podataka
    webSocketClient.loop();

    //if (!webSocketConnected) {
      //Serial.println("Not connected, attempting to reconnect...");
      //connectToWebSocket();
      //delay(5000);  // Pauziraj pre ponovnog pokušaja povezivanja
      //return;  // Izađi iz petlje dok se ne poveže
    //}

    
    // Slanje podataka
    
    if(mjerenje){
      // Ovo treba sredit kada bude radila websocket komunikacija
        // Citanje Akcelerometra
        ocitavanjeAcc(acc1, data_acc1);
        ocitavanjeAcc(acc2, data_acc2);
        force = findPeaks();
        print_up("BOKS");
        print_down(String(force));
  
        ispisAcc(data_acc1);
        ispisAcc(data_acc2);
        Serial.println();
      
        // Slanje podataka na WebSocket 
        // Priprema TOP podataka
        topData["x"] = data_acc1[1];
        topData["y"] = data_acc1[2];
        topData["z"] = data_acc1[3];
  
        // Priprema BOTTOM podataka
        bottomData["x"] = data_acc2[1];
        bottomData["y"] = data_acc2[2];
        bottomData["z"] = data_acc2[3];
  
        myObject_send["type"] = "measurement";
        myObject_send["top"] = topData;
        myObject_send["bottom"] = bottomData;
        myObject_send["timestamp"] = millis();
        myObject_send["deviceId"]=deviceId;
        String message = JSON.stringify(myObject_send);
        webSocketClient.sendTXT(message);
        Serial.println(message);
      }
    
  
    
  
    // Slanje PONG naredbe svakih 5 sekundi za održavanje komunikacije. Vrati kad bude postojao socket server
    
      currentTime = millis();
      if(currentTime - previousTime >= interval){
        previousTime = currentTime;
        webSocketClient.sendTXT("pong");
    }
   

    
    delay(100);
   }
}


// ========================= ACCELEROMETAR FUNCTIONS ==========================

// Funkcija vraća jačinu udarca
int findPeaks(){
    float a = 0;
    int force = 0;
    a = sqrt(pow(data_acc1[1], 2) + pow(data_acc1[2], 2) + pow(data_acc1[3], 2)) + sqrt(pow(data_acc2[1], 2) + pow(data_acc2[2], 2) + pow(data_acc2[3], 2));
    force = (masa*a)/2;
    return force;
}

// FUnkcija koja se poziva na početku rada uz pretpostavku da je vreća mirna
// Očitane vrijednosti akcelerometara u mirnom stanju oduzet će se od svih budućih stanja da se dobije prava akceleracija
void usrednjavanje(){
  Serial.println(" >>>> USREDNJAVANJE <<<< ");
  print_up("AVERAGING");
  print_down("");
  int trajanje = 5000 / num_usred;
  
  for(int i = 0; i < num_usred; i++){
    citajAcc(acc1, data_acc1);
    citajAcc(acc2, data_acc2);

    for(int j = 4; j < 7; j++){
      data_acc1[j] += data_acc1[j-3];
      data_acc2[j] += data_acc2[j-3]; 
    }
    delay(trajanje);
  }

  for(int i = 4; i < 7; i++){
      data_acc1[i] /= num_usred;
      data_acc2[i] /= num_usred; 
  }

  ispisAccDelta(data_acc1);
  ispisAccDelta(data_acc2);
  Serial.println(" >>>> USREDNJAVANJE ZAVRSENO <<<< ");
  Serial.println();
  print_up("BOKS");
  print_down("0");
}

void citajAcc(LIS3DH acc, float *data){
   *(data + 1) = acc.readFloatAccelX();
   *(data + 2) = acc.readFloatAccelY();
   *(data + 3) = acc.readFloatAccelZ();
}

void ocitavanjeAcc(LIS3DH acc, float *data){
  citajAcc(acc, data);
  for(int i = 1; i <= 3; i++)
    *(data + i) -= *(data + i + 3);
  checkSensors(false);
}

// Header za detekciju prisutnosti senzora
void checkSensors(bool ispis){
  acc1_state = check(acc1, ACC_1, acc1_state, ispis);
  acc2_state = check(acc2, ACC_2, acc2_state, ispis);
}

// Detekcija prisutnosti senzora
bool check(LIS3DH acc, uint8_t address, bool state, bool ispis){
  byte error = 0;
  Wire.beginTransmission(address);
  error = Wire.endTransmission();
  if(error == 0){
    if(!state){
      acc.begin();
      delay(50);
      state = true;
    }
  }else{
    state = false;
  }

  if(!state){
    //Ako je prvi
    if(address == 25)
      print_up("ACC1");
    //Ako je drugi
    if(address == 24)
      print_up("ACC2");
    print_down("Err!");
    delay(2000);
  }

  if(ispis){
    Serial.print("Detekcija Acc 0x");
    Serial.print(address, HEX);
    Serial.println(": " + String(state)); 
    //Ako je prvi
    if(address == 25)
      print_up("ACC1");
    //Ako je drugi
    if(address == 24)
      print_up("ACC2");
    if(state)print_down("OK  ");
    else print_down("Err!");
    delay(2000);
  }
  return state;
}

void ispisAcc(float *data){
   int num = *(data + 0);
   Serial.print("Acc" + String(num));
   Serial.print(": x=");
   Serial.print(*(data + 1), 4);
   Serial.print(", y=");
   Serial.print(*(data + 2), 4);
   Serial.print(", z=");
   Serial.print(*(data + 3), 4);
   Serial.print("\t");
}

void ispisAccDelta(float *data){
   int num = *(data + 0);
   Serial.println("Acc" + String(num) + " delta:");
   Serial.print("\tdx = ");
   Serial.println(*(data + 4), 4);
   Serial.print("\tdy = ");
   Serial.println(*(data + 5), 4);
   Serial.print("\tdz = ");
   Serial.println(*(data + 6), 4);
   Serial.println();
}


// -----------------------> OVER THE AIR UPDATE <-----------------------
void OTAUpdate(){
  Serial.println("== OTA UPDATE ==");
  if((WiFi.status() == WL_CONNECTED)) {
        HTTPClient httpClient;
        httpClient.begin(url);  // URL za OTA update
        t_httpUpdate_return ret = httpUpdate.update(httpClient);

        switch(ret) {
            case HTTP_UPDATE_FAILED:
                Serial.printf("HTTP_UPDATE_FAILD Error (%d): %s", httpUpdate.getLastError(), httpUpdate.getLastErrorString().c_str());
                break;

            case HTTP_UPDATE_NO_UPDATES:
                Serial.println("HTTP_UPDATE_NO_UPDATES");
                break;

            case HTTP_UPDATE_OK:
                Serial.println("HTTP_UPDATE_OK");
                break;
        }
    }
  ESP.restart();
}

// ========================= BUTTON FUNCTIONS ==========================
void shortPress(){
  Serial.println("SHORT");
  usrednjavanje();
}

void longPress(){
  Serial.println("LONG");
  // IZAĐI IZ AP MODA
  if(ap_state == true){
    ap_state = false;
    print_up("ESP");
    print_down("Down");
    delay(4000);
    WiFi.disconnect();
    ESP.restart();
  }

  // UĐI U AP_MOD
  if(ap_state == false){
    ap_state = true;
    print_up("WiFi");
    print_down("Connect your phone and go to ESP's local IP address (stored in WiFi.localIP()).");
    Serial.println("Connect your phone and go to ESP's local IP address (stored in WiFi.localIP()).");
    WiFi.softAP(esp_name, esp_pwd);
    server.begin();
  }
}

// ========================= ACCESS POINT FUNCTIONS ==========================
void readEEPROM(){
  String s_ssid = "";
  String s_pwd = "";
  String s_masa = "";
  String s_host = "";
  String s_path = "";
  String s_port = "";
  
  char c;
  // SSID
  for(int i = 0; i < 100; i++){
    c = char(EEPROM.read(i));
    if(c != '#')
      s_ssid += c;
  }
  //PWD
  for(int i = 100; i < 200; i++){
    c = char(EEPROM.read(i));
    if(c != '#')
      s_pwd += c;
  }
  //MASA
  for(int i = 200; i < 300; i++){
    c = char(EEPROM.read(i));
    if(c != '#')
      s_masa += c;
  }
  //HOST
  for(int i = 300; i < 400; i++){
    c = char(EEPROM.read(i));
    if(c != '#')
      s_host += c;
  }
  //PATH
  for(int i = 400; i < 500; i++){
    c = char(EEPROM.read(i));
    if(c != '#')
      s_path += c;
  }
  //PORT
  for(int i = 500; i < 600; i++){
    c = char(EEPROM.read(i));
    if(c != '#')
      s_port += c;
  }

  //for(int i = 0; i < s_ssid.length(); i++)ssid[i] = s_ssid[i];
  //for(int i = 0; i < s_pwd.length(); i++)pwd[i] = s_pwd[i];
  //for(int i = 0; i < s_host.length(); i++)host[i] = s_host[i];
  //for(int i = 0; i < s_path.length(); i++)path[i] = s_path[i];
  masa = s_masa.toInt();
  //port = s_port.toInt();
}

void accessPoint(){
  WiFiClient client = server.available();

  if (client) {
    String currentLine = "";
    while (client.connected()) {
      if (client.available()) {
        char c = client.read();
        header += c;
        if (c == '\n') {
          if (currentLine.length() == 0) {

            //====================================================
            client.println("HTTP/1.1 200 OK");
            client.println("Content-type:text/html");
            client.println("Connection: close");
            client.println();

            // Povratna informacija
            //Serial.println("Header: " + header);
            parsirajURL(header);
            
            // Display the HTML web page
            client.println("<!DOCTYPE html>");
            client.println("<html>");
            client.println("<head>");
            client.println("  <title>Boks konfiguracija</title>");
            client.println("</head>");
            client.println("<style>");
            client.println("  .forma{");
            client.println("    width: 300px;");
            client.println("    margin: 0 auto;");
            client.println("    text-align: center;");
            client.println("  }");
            client.println("</style>");
            client.println("<body>");
            client.println("  <div class=\"forma\">");
            client.println("    <h1>Interaktivna vreca za boks</h1>");
            client.println("    <h2>WiFi POSTAVKE:</h2>");
            client.println("    <form method=\"GET\">");
            client.println("      <input style=\"width:200px;\" type=\"text\" name=\"ssid\" required maxlength=\"90\" placeholder=\"Unesi SSID\">");
            client.println("      <br><br>");
            client.println("      <input style=\"width:200px;\" type=\"text\" name=\"pwd\" required maxlength=\"90\" placeholder=\"Unesi Lozinku\">");
            client.println("      <br><br>");
            client.println("      <input style=\"width:200px;\" type=\"text\" name=\"host\" required maxlength=\"90\" placeholder=\"Unesi host\">");
            client.println("      <br><br>");
            client.println("      <input style=\"width:200px;\" type=\"text\" name=\"path\" required maxlength=\"90\" placeholder=\"Unesi path\">");
            client.println("      <br><br>");
            client.println("      <input style=\"width:200px;\" type=\"number\" name=\"port\" required maxlength=\"90\" placeholder=\"Unesi port\">");
            client.println("      <br><br>");
            client.println("      <input style=\"width:200px;\" type=\"number\" name=\"masa\" required maxlength=\"90\" min=\"20\" max=\"40\" placeholder=\"Unesi masu vrece u kg\">");
            client.println("      <br><br>");
            client.println("      <input type=\"hidden\" name=\"tmp\">");
            client.println("      <button>SPREMI</button>");
            client.println("    </form>");
            client.println("  </div>");
            client.println("</body>");
            client.println("</html>");
            client.println();
            break;
            //====================================================

            
          } else {
            currentLine = "";
          }
        } else if (c != '\r') {
          currentLine += c;
        }
      }
    }
    header = "";
    client.stop();
  }
}

void parsirajURL(String url){
  if(url[5] != '?')
    return;
    
  String ssid = "";
  String pwd = "";
  String masa = "";
  String host = "";
  String path = "";
  String port = "";

  bool state = false;
  int i = 0;

  // Citanje ssid-a
  state = false;
  i = 0;
  for(i; i < url.length(); i++){
    if(url[i] == '&')break;
    if(state){
      ssid = ssid + url[i];
    }
    if(url[i] == '=')state = true;
  }

  // Citanje lozinke
  state = false;
  i++;
  for(i; i < url.length(); i++){
    if(url[i] == '&')break;
    if(state){
      pwd = pwd + url[i];
    }
    if(url[i] == '=')state = true;
  }

  // Citanje hosta
  state = false;
  i++;
  for(i; i < url.length(); i++){
    if(url[i] == '&')break;
    if(state){
      host = host + url[i];
    }
    if(url[i] == '=')state = true;
  }

  // Citanje path-a
  state = false;
  i++;
  for(i; i < url.length(); i++){
    if(url[i] == '&')break;
    if(state){
      if(url[i] == '%'){
        path = path + '/';
        i = i + 2;
      }else
        path = path + url[i];
    }
    if(url[i] == '=')state = true;
  }

  // Citanje port-a
  state = false;
  i++;
  for(i; i < url.length(); i++){
    if(url[i] == '&')break;
    if(state){
      port = port + url[i];
    }
    if(url[i] == '=')state = true;
  }

  // Citanje mase
  state = false;
  i++;
  for(i; i < url.length(); i++){
    if(url[i] == '&')break;
    if(state){
      masa = masa + url[i];
    }
    if(url[i] == '=')state = true;
  }

  //ISPRAZNITI EEPROM
  for(int i = 0; i <= EEPROM_SIZE; i++){
    EEPROM.write(i, '#');
  }
  EEPROM.commit();
  
  //Spremanje u EEPROM SSID-a
  for(int i = 0, t = 0; t < ssid.length(); i++, t++){
    EEPROM.write(i, ssid[t]);
  }
  EEPROM.commit();

  //Spremanje u EEPROM PWD-a
  for(int i = 100, t = 0; t < pwd.length(); i++, t++){
    EEPROM.write(i, pwd[t]);
  }
  EEPROM.commit();

  //Spremanje u EEPROM masu
  for(int i = 200, t = 0; t < masa.length(); i++, t++){
    EEPROM.write(i, masa[t]);
  }
  EEPROM.commit();

  //Spremanje u EEPROM host-a
  for(int i = 300, t = 0; t < host.length(); i++, t++){
    EEPROM.write(i, host[t]);
  }
  EEPROM.commit();

  //Spremanje u EEPROM path
  for(int i = 400, t = 0; t < path.length(); i++, t++){
    EEPROM.write(i, path[t]);
  }
  EEPROM.commit();

  //Spremanje u EEPROM port
  for(int i = 500, t = 0; t < port.length(); i++, t++){
    EEPROM.write(i, port[t]);
  }
  EEPROM.commit();

  // KRAJ
  print_up("WiFi");
  print_down("Done");
  delay(4000);

  WiFi.disconnect();
  ESP.restart();
}

// ========================= LED DISPLAY FUNCTIONS ==========================
// Funkcija za ispis teksta na gornji i donji dio LED displaya na Core0
void Task0Code(void * pvParameters){
  while(1){
    if(millis() - prev_up >= step_up){
      prev_up = millis();
      display.print_UP(up_text, newWord_up);
      newWord_up = false;
    }

    if(millis() - prev_down >= step_down){
      prev_down = millis();
      display.print_DOWN(down_text, newWord_down);
      newWord_down = false;
    }
    display.show(); 
    delay(10);
  }
}

// Pomoćna funkcija za ispis na gornji dio LED displaya
void print_up(String text){
  int len = text.length();
  if(len <= 4){
    if(len == 0)text = "    " + text;
    if(len == 1)text = "   " + text;
    if(len == 2)text = "  " + text;
    if(len == 3)text = " " + text;

    if(up_text != text)newWord_up = true;
    up_text = text;
    step_up = short_period;
  }else{
    text = "    " + text;

    if(up_text != text)newWord_up = true;
    up_text = text;
    step_up = long_period;
  }
}

// Pomoćna funkcija za ispis na donji dio LED displaya
void print_down(String text){
  int len = text.length();
  if(len <= 4){
    if(len == 0)text = "    " + text;
    if(len == 1)text = "   " + text;
    if(len == 2)text = "  " + text;
    if(len == 3)text = " " + text;

    if(down_text != text)newWord_down = true;
    down_text = text;
    step_down = short_period;
  }else{
    text = "    " + text;

    if(down_text != text)newWord_down = true;
    down_text = text;
    step_down = long_period;
  }
}
