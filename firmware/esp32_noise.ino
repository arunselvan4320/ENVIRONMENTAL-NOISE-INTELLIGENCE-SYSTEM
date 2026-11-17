/* Kaanam sensor node. ESP32 + INMP441. Arduino-ESP32 2.x legacy I2S API. Verify pins/alignment.
   Unitless RMS-derived index; not SPL or LAeq. 32-message RAM retry buffer.
   Buffer survives network outages, not power loss. HTTPS needs a trusted CA. */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <driver/i2s.h>
#include <time.h>
#include <math.h>
#include <esp_system.h>
const char* WIFI_SSID="YOUR_WIFI";
const char* WIFI_PASS="YOUR_WIFI_PASSWORD";
const char* ENDPOINT="https://YOUR_SERVER/api/observations";
const char* DEVICE_ID="node_01";
const char* DEVICE_TOKEN="PASTE_ONE_TIME_DEVICE_TOKEN";
const char* ROOT_CA=R"CERT(-----BEGIN CERTIFICATE-----
PASTE_YOUR_SERVER_ROOT_CA_CERTIFICATE_HERE
-----END CERTIFICATE-----)CERT";
// Opt in only where recording/transmitting short audio is permitted.
const bool ENABLE_AUDIO_AI=false;
const char* AUDIO_ENDPOINT="https://YOUR_SERVER/api/devices/node_01/audio";
const int BCLK=26, WS=25, DIN=33;
int16_t pcmAudio[16000];size_t pcmCount=0;String captureId;
unsigned long lastAudioUpload=0;
void little16(uint8_t* p,uint16_t v){p[0]=v&255;p[1]=(v>>8)&255;}
void little32(uint8_t* p,uint32_t v){for(int j=0;j<4;j++)p[j]=(v>>(8*j))&255;}
void uploadAudio(const String &messageId){
 if(!ENABLE_AUDIO_AI || pcmCount<1600)return;
 if(lastAudioUpload && millis()-lastAudioUpload<60000)return;
 size_t dataSize=pcmCount*2;uint8_t *wav=(uint8_t*)malloc(44+dataSize);
 if(!wav){Serial.println("Not enough RAM for audio upload");return;}
 memset(wav,0,44);memcpy(wav,"RIFF",4);little32(wav+4,36+dataSize);memcpy(wav+8,"WAVEfmt ",8);
 little32(wav+16,16);little16(wav+20,1);little16(wav+22,1);little32(wav+24,16000);
 little32(wav+28,32000);little16(wav+32,2);little16(wav+34,16);memcpy(wav+36,"data",4);little32(wav+40,dataSize);
 for(size_t j=0;j<pcmCount;j++)little16(wav+44+2*j,(uint16_t)pcmAudio[j]);
 WiFiClientSecure secure;secure.setCACert(ROOT_CA);HTTPClient aiHttp;aiHttp.setConnectTimeout(5000);aiHttp.setTimeout(30000);
 if(aiHttp.begin(secure,String(AUDIO_ENDPOINT)+"?message_id="+messageId)){
  aiHttp.addHeader("Content-Type","audio/wav");aiHttp.addHeader("X-Device-Token",DEVICE_TOKEN);
  int code=aiHttp.POST(wav,44+dataSize);Serial.printf("Audio AI response: %d\n",code);
  if(code>=200 && code<300)lastAudioUpload=millis();
  aiHttp.end();
 }
 free(wav);
}
struct Message { String id,ts; float value; bool clipping; bool gap; };
Message queueBuffer[32];int head=0,used=0;uint32_t sequence=0;String bootId;bool lost=false;
void setup(){
 Serial.begin(115200);bootId=String((uint32_t)esp_random(),HEX);
 WiFi.begin(WIFI_SSID,WIFI_PASS);configTime(0,0,"pool.ntp.org","time.nist.gov");
 i2s_config_t cfg={};cfg.mode=(i2s_mode_t)(I2S_MODE_MASTER|I2S_MODE_RX);cfg.sample_rate=16000;
 cfg.bits_per_sample=I2S_BITS_PER_SAMPLE_32BIT;cfg.channel_format=I2S_CHANNEL_FMT_ONLY_LEFT;
 cfg.communication_format=I2S_COMM_FORMAT_STAND_I2S;cfg.intr_alloc_flags=0;cfg.dma_buf_count=8;cfg.dma_buf_len=256;cfg.use_apll=false;
 i2s_pin_config_t pins={};pins.bck_io_num=BCLK;pins.ws_io_num=WS;pins.data_out_num=I2S_PIN_NO_CHANGE;pins.data_in_num=DIN;
 if(i2s_driver_install(I2S_NUM_0,&cfg,0,NULL)!=ESP_OK || i2s_set_pin(I2S_NUM_0,&pins)!=ESP_OK){Serial.println("I2S setup failed");while(true)delay(1000);}
}
void loop(){
 int32_t samples[512];size_t bytes=0;double sum=0;int count=0;bool clip=false;pcmCount=0;unsigned long started=millis();
 while(millis()-started<1000){
  if(i2s_read(I2S_NUM_0,samples,sizeof(samples),&bytes,pdMS_TO_TICKS(100))!=ESP_OK)continue;
  for(int i=0;i<bytes/4;i++){double x=(double)(samples[i]>>8)/8388608.0;sum+=x*x;count++;if(fabs(x)>.995)clip=true;if(ENABLE_AUDIO_AI && pcmCount<16000)pcmAudio[pcmCount++]=(int16_t)(constrain(x,-1.0,0.999969)*32768.0);}
 }
 time_t utc=time(NULL);
 if(count && utc>1700000000){
  float index=constrain(sqrt(sum/count)*8.0,0.0,1.0);
  char ts[32];struct tm info;gmtime_r(&utc,&info);strftime(ts,sizeof(ts),"%Y-%m-%dT%H:%M:%SZ",&info);
  if(used==32){head=(head+1)%32;used--;lost=true;}
  int slot=(head+used)%32;captureId=bootId+"-"+String(sequence++);queueBuffer[slot]={captureId,String(ts),index,clip,lost};used++;lost=false;
 }
 if(WiFi.status()!=WL_CONNECTED){WiFi.reconnect();delay(500);return;}
 if(used){
  Message &m=queueBuffer[head];WiFiClientSecure client;client.setCACert(ROOT_CA);HTTPClient http;http.setConnectTimeout(3000);http.setTimeout(3000);
  if(http.begin(client,ENDPOINT)){
   http.addHeader("Content-Type","application/json");http.addHeader("X-Device-Token",DEVICE_TOKEN);
   String flags="[";if(m.clipping)flags+="\"clipping\"";if(m.gap){if(m.clipping)flags+=",";flags+="\"packet_gap\"";}flags+="]";
   String body="{\"device_id\":\""+String(DEVICE_ID)+"\",\"message_id\":\""+m.id+"\",\"timestamp\":\""+m.ts+"\",\"level_index\":"+String(m.value,6)+",\"quality_flags\":"+flags+",\"calibration_version\":\"unvalidated\"}";
   int code=http.POST(body);String sentId=m.id;bool accepted=code>=200&&code<300;
   if(accepted){head=(head+1)%32;used--;}else Serial.printf("Upload failed (%d); retained\n",code);http.end();
   if(accepted && sentId==captureId)uploadAudio(sentId);
  }
 }
 delay(4000);
}
