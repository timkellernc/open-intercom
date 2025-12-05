import { Alert } from 'react-native';

type MessageType = 'login' | 'audio' | 'ping' | 'pong' | 'login_success' | 'login_error' | 'user_list' | 'user_joined' | 'user_left' | 'channel_groups' | 'subscribe_channels' | 'channel_list' | 'channel_activity';

interface WebSocketMessage {
    type: MessageType;
    [key: string]: any;
}

interface AudioPacket {
    t: 'a';
    c: number[];
    d: string; // base64
    k?: string; // codec
}

export interface ChannelGroup {
    id: number;
    name: string;
    channelIds: number[];
}

export interface Channel {
    id: number;
    name: string;
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
    private users: string[] = []; // Cache active users
    private channelGroups: ChannelGroup[] = [];
    private allChannels: Channel[] = [];

    private codec: string = 'pcm';

    connect(url: string, username: string, codec: string = 'pcm') {
        this.url = url;
        this.username = username;
        this.codec = codec;
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.initConnection();
    }

    get isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    getUsers(): string[] {
        return [...this.users];
    }

    getChannelGroups(): ChannelGroup[] {
        return [...this.channelGroups];
    }

    getAllChannels(): Channel[] {
        return [...this.allChannels];
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
                        if (data.t === 'a') {
                            // Audio packet
                            const audioPacket = data as AudioPacket;
                            const binary = this.base64ToArrayBuffer(audioPacket.d);
                            this.emit('audio', {
                                audioData: binary,
                                channelIds: audioPacket.c
                            });
                        } else {
                            this.handleMessage(data);
                        }
                    } catch (e) {
                        console.error('Failed to parse message', e);
                    }
                } else if (event.data instanceof ArrayBuffer) {
                    // Legacy binary support (optional)
                    this.emit('audio', { audioData: event.data, channelIds: [] });
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
            bitDepth: 16,
            codec: this.codec
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
                console.log('WebSocketService: Received user_list', data.users);
                this.users = data.users || [];
                this.emit('user_list', this.users);
                break;
            case 'user_joined':
                console.log('WebSocketService: User joined', data.username);
                if (!this.users.includes(data.username)) {
                    this.users.push(data.username);
                    this.emit('user_joined', data.username);
                    this.emit('user_list', this.users);
                }
                break;
            case 'user_left':
                console.log('WebSocketService: User left', data.username);
                this.users = this.users.filter(u => u !== data.username);
                this.emit('user_left', data.username);
                this.emit('user_list', this.users);
                break;
            case 'pong':
                this.emit('pong', data.timestamp);
                break;
            case 'channel_groups':
                console.log('Received channel groups:', data.groups);
                this.channelGroups = data.groups || [];
                this.emit('channel_groups', this.channelGroups);
                break;
            case 'channel_list':
                console.log('Received channel list:', data.channels);
                this.allChannels = data.channels || [];
                this.emit('channel_list', this.allChannels);
                break;
            case 'channel_activity':
                // Don't log every time to avoid spam
                this.emit('channel_activity', data.activeChannels);
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

    sendAudio(data: ArrayBuffer, channelIds: number[]) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const base64 = this.arrayBufferToBase64(data);
            const packet: AudioPacket = {
                t: 'a',
                c: channelIds,
                d: base64,
                k: this.codec === 'pcm' ? 'pcm' : undefined
            };
            this.ws.send(JSON.stringify(packet));
        }
    }

    sendChannelSubscription(listenChannels: number[], talkChannels: number[]) {
        this.send({
            type: 'subscribe_channels',
            listenChannels,
            talkChannels
        });
    }

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
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
