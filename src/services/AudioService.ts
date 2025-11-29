import { webSocketService } from './WebSocketService';

class AudioService {
    private isRecording: boolean = false;
    private isPlaying: boolean = false;

    constructor() {
        this.setupListeners();
    }

    private setupListeners() {
        webSocketService.on('audio', (data: ArrayBuffer) => {
            this.playAudio(data);
        });
    }

    async startRecording() {
        if (this.isRecording) return;
        console.log('Starting recording...');
        this.isRecording = true;

        // TODO: Implement actual audio capture
        // For now, simulate sending audio
        /*
        this.recordingInterval = setInterval(() => {
          const mockAudio = new ArrayBuffer(1024);
          webSocketService.sendAudio(mockAudio);
        }, 100);
        */
    }

    async stopRecording() {
        if (!this.isRecording) return;
        console.log('Stopping recording...');
        this.isRecording = false;

        // TODO: Stop audio capture
    }

    private playAudio(data: ArrayBuffer) {
        if (!this.isPlaying) {
            // console.log('Received audio chunk', data.byteLength);
        }
        // TODO: Implement actual audio playback
        // Enqueue buffer to native player
    }
}

export const audioService = new AudioService();
