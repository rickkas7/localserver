#include "Particle.h"

SYSTEM_THREAD(ENABLED);

int devicesHandler(String data); // forward declaration
void sendData(void);

const unsigned long REQUEST_WAIT_MS = 10000;
const unsigned long RETRY_WAIT_MS = 30000;
const unsigned long SEND_WAIT_MS = 20;


enum State { STATE_REQUEST, STATE_REQUEST_WAIT, STATE_CONNECT, STATE_SEND_DATA, STATE_RETRY_WAIT };
State state = STATE_REQUEST;
unsigned long stateTime = 0;
IPAddress serverAddr;
int serverPort;
char nonce[34];
TCPClient client;

void setup() {
	Serial.begin(9600);
	Particle.function("devices", devicesHandler);
}

void loop() {

	switch(state) {
	case STATE_REQUEST:
		if (Particle.connected()) {
			Serial.println("sending devicesRequest");
			Particle.publish("devicesRequest", WiFi.localIP().toString().c_str(), 10, PRIVATE);
			state = STATE_REQUEST_WAIT;
			stateTime = millis();
		}
		break;

	case STATE_REQUEST_WAIT:
		if (millis() - stateTime >= REQUEST_WAIT_MS) {
			state = STATE_RETRY_WAIT;
			stateTime = millis();
		}
		break;

	case STATE_CONNECT:
		if (client.connect(serverAddr, serverPort)) {
			client.println("POST /devices HTTP/1.0");
			client.printlnf("Authorization: %s", nonce);
			client.printlnf("Content-Length: 99999999");
		    client.println();
		    state = STATE_SEND_DATA;
		}
		else {
			state = STATE_RETRY_WAIT;
			stateTime = millis();
		}
		break;

	case STATE_SEND_DATA:
		// In this state, we send data until we lose the connection to the server for whatever
		// reason. We'll to the server again.
		if (!client.connected()) {
			Serial.println("server disconnected");
			client.stop();
			state = STATE_RETRY_WAIT;
			stateTime = millis();
			break;
		}

		if (millis() - stateTime >= SEND_WAIT_MS) {
			stateTime = millis();

			sendData();
		}
		break;

	case STATE_RETRY_WAIT:
		if (millis() - stateTime >= RETRY_WAIT_MS) {
			state = STATE_REQUEST;
		}
		break;
	}
}

void sendData(void) {
	// Called periodically when connected via TCP to the server to update data.
	// Unlike Particle.publish you can push a very large amount of data through this connection,
	// theoretically up to about 800 Kbytes/sec, but really you should probably shoot for something
	// lower than that, especially with the way connection is being served in the node.js server.

	// In this simple example, we just send the value of A0. It's connected to the center terminal
	// of a potentiometer whose outer terminals are connected to GND and 3V3.
	int value = analogRead(A0);

	// Use printf and manually added a \n here. The server code splits on LF only, and using println/
	// printlnf adds both a CR and LF. It's easier to parse with LF only, and it saves a byte when
	// transmitting.
	client.printf("%d\n", value);
}

// This is the handler for the Particle.function "devices"
// The server makes this function call after this device publishes a devicesRequest event.
// The server responds with an IP address and port of the server, and a nonce (number used once) for authentication.
int devicesHandler(String data) {
	Serial.printlnf("devicesHandler data=%s", data.c_str());
	int addr[4];

	if (sscanf(data, "%u.%u.%u.%u,%u,%32s", &addr[0], &addr[1], &addr[2], &addr[3], &serverPort, nonce) == 6) {
		serverAddr = IPAddress(addr[0], addr[1], addr[2], addr[3]);
		Serial.printlnf("serverAddr=%s serverPort=%u nonce=%s", serverAddr.toString().c_str(), serverPort, nonce);
		state = STATE_CONNECT;
	}
	return 0;
}
