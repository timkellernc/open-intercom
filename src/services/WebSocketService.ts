import { Alert } from 'react-native';

type MessageType = 'login' | 'audio' | 'ping' | 'pong' | 'login_success' | 'login_error' | 'user_list' | 'user_joined' | 'user_left';

interface WebSocketMessage {
    type: MessageType;
    [key: string]: any;
}

class WebSocketService {
    private ws: WebSocket | null = null;
    private url: string = '';
    private username: string = '';
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;
    private isReconnecting: boolean = false;
    private listeners: { [key: string]: Function[] } = {};
    private pingInterval: NodeJS.Timeout | null = null;

    connect(url: string, username: string) {
        this.url = url;
        this.username = username;
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.initConnection();
    }

    private initConnection() {
        if (this.ws) {
            this.ws.onclose = null; // Prevent old socket from triggering reconnect
            this.ws.close();
        }

        try {
            console.log(`Connecting to ${this.url}`);
            this.ws = new WebSocket(this.url);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => {
                console.log('WebSocket Connected');
                this.reconnectAttempts = 0;
                this.isReconnecting = false;
                this.login();
                this.startPing();
                // Don't emit 'connected' yet, wait for login_success
            };

            this.ws.onmessage = (event) => {
                if (typeof event.data === 'string') {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (e) {
                        console.error('Failed to parse message', e);
                    }
                } else if (event.data instanceof ArrayBuffer) {
                    this.emit('audio', event.data);
                }
            };

            this.ws.onclose = (event) => {
                console.log(`WebSocket Closed. Code: ${event.code}, Reason: ${event.reason}`);
                this.stopPing();
                this.emit('disconnected');
                if (!this.isReconnecting) {
                    this.attemptReconnect();
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket Error', error);
                this.emit('error', error);
            };

        } catch (e) {
            console.error('Connection failed', e);
            this.attemptReconnect();
        }
    }

    private login() {
        this.send({
            type: 'login',
            username: this.username,
            // TODO: Send audio settings (sampleRate, bitDepth)
            sampleRate: 48000,
            bitDepth: 16
        });
    }

    private handleMessage(data: WebSocketMessage) {
        switch (data.type) {
            case 'login_success':
                console.log('Login Successful');
                this.emit('login_success', data);
                this.emit('connected'); // Now we are truly connected and logged in
                break;
            case 'login_error':
                console.error('Login Error:', data.message);
                this.emit('login_error', data);
                Alert.alert('Login Error', data.message);
                this.disconnect(); // Disconnect if login fails to prevent zombie connection
                break;
            case 'user_list':
                this.emit('user_list', data.users);
                break;
            case 'user_joined':
                this.emit('user_joined', data.username);
                break;
            case 'user_left':
                this.emit('user_left', data.username);
                break;
            case 'pong':
                this.emit('pong', data.timestamp);
                break;
            default:
                console.log('Unhandled message type:', data.type);
        }
    }

    private attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.emit('connection_lost');
            return;
        }

        this.isReconnecting = true;
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);

        console.log(`Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts})`);
        this.emit('reconnecting', this.reconnectAttempts);

        setTimeout(() => {
            this.initConnection();
        }, delay);
    }

    send(data: WebSocketMessage) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    sendAudio(data: ArrayBuffer) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        }
    }

    disconnect() {
        this.isReconnecting = true; // Prevent auto-reconnect
        this.stopPing();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    private startPing() {
        this.stopPing();
        this.pingInterval = setInterval(() => {
            this.send({ type: 'ping', timestamp: Date.now() });
        }, 5000);
    }

    private stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    // Event Emitter logic
    on(event: string, callback: Function) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    off(event: string, callback: Function) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    private emit(event: string, ...args: any[]) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(...args));
        }
    }
}

export const webSocketService = new WebSocketService();
