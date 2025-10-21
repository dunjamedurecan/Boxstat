#include "LED_Display.h"

// PUBLIC FUNCTIONS:
// === Initialization function -> constructor === 
void LED_Display::init(){
  // Display pins initialization
  pinMode(pin_A, OUTPUT);
  pinMode(pin_B, OUTPUT);
  pinMode(OE, OUTPUT);
  pinMode(R1, OUTPUT);
  pinMode(CLK, OUTPUT);
  pinMode(STB, OUTPUT);
  SPI.begin();
  delay(300);

  // Initialization up and down buffer
  for(int i = 0; i < BUFFER_LEN; i++){
    buffer_up[i] = " ";
    buffer_down[i] = " ";
  }
}

// This function we can use for print print text on up side of display
void LED_Display::print_UP(String text, bool newWord){
  int len = text.length();
  if(len > BUFFER_LEN){
    if(counter_up >= len || newWord)
      counter_up = 0;
    char s1 = text[counter_up];
    counter_up++;
    append_buffer(String(s1), &buffer_up[0]); 
  }else{
    for(int i = 0; i < BUFFER_LEN; i++)
      append_buffer(String(text[i]), &buffer_up[0]);
  }
}

// This function we can use for print print text on down side of display
void LED_Display::print_DOWN(String text, bool newWord){
  int len = text.length();
  if(len > BUFFER_LEN){
    if(counter_down >= len || newWord)
      counter_down = 0;
    char s1 = text[counter_down];
    counter_down++;
    append_buffer(String(s1), &buffer_down[0]); 
  }else{
    for(int i = 0; i < BUFFER_LEN; i++)
      append_buffer(String(text[i]), &buffer_down[0]);
  }
}

// This function we can use for show our text on LED display
void LED_Display::show(){
  for(int row = 0; row < 4; row++){
    for(int i = 0; i < BUFFER_LEN; i = i + 2){
      display_character(print(buffer_down[i]), row);
      display_character(print(buffer_down[i + 1]), row);
      display_character(print(buffer_up[i]), row);
      display_character(print(buffer_up[i + 1]), row); 
    }
    scan_row(row);
  }
}

// PRIVATE FUNCTIONS:
// This function we use for append data into buffer
void LED_Display::append_buffer(String str, String *buffer){
  for(int i = 0; i < 3; i++)
    *(buffer + i) = *(buffer + i + 1);
  *(buffer + 3) = str;
}

// Display data
void LED_Display::scan_row(int r){
  digitalWrite(STB,LOW);
  digitalWrite(STB,HIGH);
  
  if(r==0){
    digitalWrite(pin_A,0);
    digitalWrite(pin_B,0);
  }
  else if(r==1){
    digitalWrite(pin_A,1);
    digitalWrite(pin_B,0);
  }
  else if(r==2){
    digitalWrite(pin_A,0);
    digitalWrite(pin_B,1);
  }
  else if(r==3){
    digitalWrite(pin_A,1);
    digitalWrite(pin_B,1);
  }

  digitalWrite(OE,HIGH);
  delayMicroseconds(BRIGHTNES);
  digitalWrite(OE,LOW);
  delayMicroseconds(900);
}

// SPI transfer data
void LED_Display::display_character(byte *character, int row){
  SPI.transfer(*(character + row + 4));
  SPI.transfer(*(character + row));
}

// LookUp table for ASCII character
byte* LED_Display::print(String s){
  //Numbers
  if(s == "0")return &_0[0];
  if(s == "1")return &_1[0];
  if(s == "2")return &_2[0];
  if(s == "3")return &_3[0];
  if(s == "4")return &_4[0];
  if(s == "5")return &_5[0];
  if(s == "6")return &_6[0];
  if(s == "7")return &_7[0];
  if(s == "8")return &_8[0];
  if(s == "9")return &_9[0];

  // Large letters
  if(s == "A")return &slovo_A[0];
  if(s == "B")return &slovo_B[0];
  if(s == "C")return &slovo_C[0];
  if(s == "D")return &slovo_D[0];
  if(s == "E")return &slovo_E[0];
  if(s == "F")return &slovo_F[0];
  if(s == "G")return &slovo_G[0];
  if(s == "H")return &slovo_H[0];
  if(s == "I")return &slovo_I[0];
  if(s == "J")return &slovo_J[0];
  if(s == "K")return &slovo_K[0];
  if(s == "L")return &slovo_L[0];
  if(s == "M")return &slovo_M[0];
  if(s == "N")return &slovo_N[0];
  if(s == "O")return &slovo_O[0];
  if(s == "P")return &slovo_P[0];
  if(s == "Q")return &slovo_Q[0];
  if(s == "R")return &slovo_R[0];
  if(s == "S")return &slovo_S[0];
  if(s == "T")return &slovo_T[0];
  if(s == "U")return &slovo_U[0];
  if(s == "V")return &slovo_V[0];
  if(s == "W")return &slovo_W[0];
  if(s == "X")return &slovo_X[0];
  if(s == "Y")return &slovo_Y[0];
  if(s == "Z")return &slovo_Z[0];

  // Little letters
  if(s == "a")return &slovo_a[0];
  if(s == "b")return &slovo_b[0];
  if(s == "c")return &slovo_c[0];
  if(s == "d")return &slovo_d[0];
  if(s == "e")return &slovo_e[0];
  if(s == "f")return &slovo_f[0];
  if(s == "g")return &slovo_g[0];
  if(s == "h")return &slovo_h[0];
  if(s == "i")return &slovo_i[0];
  if(s == "j")return &slovo_j[0];
  if(s == "k")return &slovo_k[0];
  if(s == "l")return &slovo_l[0];
  if(s == "m")return &slovo_m[0];
  if(s == "n")return &slovo_n[0];
  if(s == "o")return &slovo_o[0];
  if(s == "p")return &slovo_p[0];
  if(s == "q")return &slovo_q[0];
  if(s == "r")return &slovo_r[0];
  if(s == "s")return &slovo_s[0];
  if(s == "t")return &slovo_t[0];
  if(s == "u")return &slovo_u[0];
  if(s == "v")return &slovo_v[0];
  if(s == "w")return &slovo_w[0];
  if(s == "x")return &slovo_x[0];
  if(s == "y")return &slovo_y[0];
  if(s == "z")return &slovo_z[0];

  // Interpunction characters
  if(s == " ")return &_space[0];
  if(s == "/")return &_slesh[0];
  if(s == ".")return &_tocka[0];
  if(s == ",")return &_zarez[0];
  if(s == ";")return &_tockaZarez[0];
  if(s == "?")return &_upitnik[0];
  if(s == "!")return &_usklicnik[0];
  if(s == "#")return &_hashtag[0];
  if(s == "+")return &_plus[0];
  if(s == "-")return &_minus[0];
  if(s == "*")return &_puta[0];
  if(s == "=")return &_jednako[0];
  if(s == "<")return &_manje[0];
  if(s == ">")return &_vece[0];
  if(s == "@")return &_et[0];

  // Brakets
  if(s == "(")return &_oblaOtvoreno[0];
  if(s == ")")return &_oblaZatvoreno[0];
  if(s == "[")return &_kockaOtvoreno[0];
  if(s == "]")return &_kockaZatvoreno[0];
  if(s == "{")return &_vitiOtvoreno[0];
  if(s == "}")return &_vitiZatvoreno[0];

  // Error character
  return &_error[0];
}
