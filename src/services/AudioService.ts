import { NativeModules, NativeEventEmitter } from 'react-native';
import { webSocketService } from './WebSocketService';

console.log('Available NativeModules:', Object.keys(NativeModules));
const { AudioEngine } = NativeModules;
console.log('AudioEngine module:', AudioEngine);

class AudioService {
    private eventEmitter: NativeEventEmitter | null = null;
    private isRecording = false;

    constructor() {
        if (!AudioEngine) {
            console.error('AudioEngine native module not found!');
            return;
        }
        this.eventEmitter = new NativeEventEmitter(AudioEngine);
        this.setupListeners();
    }

    private setupListeners() {
        console.log('AudioService: Setting up listeners');
        // Listen for audio data from native module
        this.eventEmitter!.addListener('onAudioData', (base64Audio: string) => {
            // console.log('AudioService: Received audio data from native, length:', base64Audio.length, 'isRecording:', this.isRecording);
            if (this.isRecording) {
                // Convert base64 to binary and send via WebSocket
                const binaryData = this.base64ToArrayBuffer(base64Audio);
                console.log('AudioService: Sending audio to WebSocket, bytes:', binaryData.byteLength);
                webSocketService.sendAudio(binaryData);
            }
        });

        // Listen for incoming audio from WebSocket
        webSocketService.on('audio', (audioData: ArrayBuffer) => {
            console.log('AudioService: Received audio from WebSocket, bytes:', audioData.byteLength);
            this.playAudio(audioData);
        });
        console.log('AudioService: Listeners setup complete');
    }

    async startRecording() {
        if (!AudioEngine) return;
        console.log('AudioService: Start recording');
        this.isRecording = true;
        AudioEngine.start();
    }

    async stopRecording() {
        console.log('AudioService: Stop recording');
        this.isRecording = false;
        // Don't stop the engine, just stop sending data
        // This allows playback to continue
    }

    playAudio(audioData: ArrayBuffer) {
        if (!AudioEngine) return;
        console.log('AudioService: playAudio called with', audioData.byteLength, 'bytes');
        // Convert ArrayBuffer to base64 for native module
        const base64Audio = this.arrayBufferToBase64(audioData);
        console.log('AudioService: Converted to base64, length:', base64Audio.length);
        AudioEngine.queueAudio(base64Audio);
        console.log('AudioService: Queued audio to native');
    }

    start() {
        if (!AudioEngine) return;
        console.log('AudioService: Starting audio engine');
        // Start the audio engine (for playback)
        AudioEngine.start();
        console.log('AudioService: Audio engine start() called');
    }

    stop() {
        if (!AudioEngine) return;
        // Stop the audio engine completely
        this.isRecording = false;
        AudioEngine.stop();
    }

    setVolume(volume: number) {
        if (!AudioEngine) return;
        console.log('AudioService: Setting volume to', volume);
        AudioEngine.setVolume(volume);
    }

    setMicGain(gain: number) {
        if (!AudioEngine) return;
        console.log('AudioService: Setting mic gain to', gain);
        AudioEngine.setMicGain(gain);
    }

    setCodec(codec: 'opus' | 'pcm') {
        if (!AudioEngine) return;
        console.log('AudioService: Setting codec to', codec);
        if (AudioEngine.setCodec) {
            AudioEngine.setCodec(codec);
        }
    }

    setOpusBitrate(bitrate: number) {
        if (!AudioEngine) return;
        console.log('AudioService: Setting Opus bitrate to', bitrate);
        if (AudioEngine.setOpusBitrate) {
            AudioEngine.setOpusBitrate(bitrate);
        }
    }

    setJitterBuffer(ms: number) {
        if (!AudioEngine) return;
        console.log('AudioService: Setting jitter buffer to', ms, 'ms');
        if (AudioEngine.setJitterBuffer) {
            AudioEngine.setJitterBuffer(ms);
        }
    }

    setAutoJitter(enabled: boolean) {
        if (!AudioEngine) return;
        console.log('AudioService: Setting auto jitter to', enabled);
        if (AudioEngine.setAutoJitter) {
            AudioEngine.setAutoJitter(enabled);
        }
    }

    setPCMBitDepth(bitDepth: number) {
        if (!AudioEngine) return;
        console.log('AudioService: Setting PCM bit depth to', bitDepth, 'bits');
        if (AudioEngine.setPCMBitDepth) {
            AudioEngine.setPCMBitDepth(bitDepth);
        }
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
}

export const audioService = new AudioService();
