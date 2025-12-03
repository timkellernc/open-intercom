package com.openintercommobile;

import android.Manifest;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.NoiseSuppressor;
import android.util.Base64;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import android.os.Handler;
import android.os.Looper;
import java.util.ArrayList;
import java.util.List;

public class AudioEngineModule extends ReactContextBaseJavaModule {
    private static final String TAG = "AudioEngine";
    private static final int SAMPLE_RATE = 48000;
    private static final int CHANNEL_CONFIG_IN = AudioFormat.CHANNEL_IN_MONO;
    private static final int CHANNEL_CONFIG_OUT = AudioFormat.CHANNEL_OUT_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private static final int BUFFER_SIZE_FACTOR = 2;

    private AudioRecord audioRecord;
    private AudioTrack audioTrack;
    private AcousticEchoCanceler aec;
    private NoiseSuppressor ns;
    
    private Thread recordingThread;
    private AtomicBoolean isRunning = new AtomicBoolean(false);
    private int minBufferSizeIn;
    private int minBufferSizeOut;
    
    private float volume = 2.0f; // Playback volume multiplier (default 2.0x)
    private float micGain = 1.0f; // Microphone gain multiplier (default 1.0x)
    
    private boolean useOpus = true; // Default to Opus
    private int opusBitrate = 32000;
    private OpusCodec opusCodec;
    
    // PCM bit depth control
    private int pcmBitDepth = 16;  // 8, 12, or 16 bits
    
    // Jitter buffer
    private int jitterBufferMs = 100;  // Default 100ms
    private boolean isAutoJitter = true;
    private Queue<AudioPacket> audioQueue = new ConcurrentLinkedQueue<>();
    private Handler jitterHandler = new Handler(Looper.getMainLooper());
    private long lastPlayTime = 0;
    private long lastAdjustTime = System.currentTimeMillis();  // Track when we last adjusted buffer
    private List<Long> packetArrivalTimes = new ArrayList<>();
    private List<Long> packetArrivalTimes = new ArrayList<>();
    private Runnable jitterRunnable;
    private Runnable jitterRunnable;
    private long lastLevelSendTime = 0;
    
    // New Jitter Buffer Logic
    private boolean isBuffering = true;
    private long bufferedDurationMs = 0;
    private long lastUnderrunTime = System.currentTimeMillis();
    private int underrunCount = 0;
    
    private static class AudioPacket {
        byte[] data;
        long arrivalTime;
        
        AudioPacket(byte[] data, long arrivalTime) {
            this.data = data;
            this.arrivalTime = arrivalTime;
        }
    }

    public AudioEngineModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "AudioEngine";
    }

    @ReactMethod
    public void start() {
        if (isRunning.get()) return;

        if (ActivityCompat.checkSelfPermission(getReactApplicationContext(), Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "RECORD_AUDIO permission not granted");
            return;
        }

        try {
            // Initialize AudioRecord
            minBufferSizeIn = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG_IN, AUDIO_FORMAT);
            audioRecord = new AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, SAMPLE_RATE, CHANNEL_CONFIG_IN, AUDIO_FORMAT, minBufferSizeIn * BUFFER_SIZE_FACTOR);

            if (AcousticEchoCanceler.isAvailable()) {
                aec = AcousticEchoCanceler.create(audioRecord.getAudioSessionId());
                if (aec != null) {
                    aec.setEnabled(true);
                    Log.d(TAG, "AEC enabled");
                }
            }

            if (NoiseSuppressor.isAvailable()) {
                ns = NoiseSuppressor.create(audioRecord.getAudioSessionId());
                if (ns != null) {
                    ns.setEnabled(true);
                    Log.d(TAG, "NS enabled");
                }
            }

            // Initialize AudioTrack
            minBufferSizeOut = AudioTrack.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG_OUT, AUDIO_FORMAT);
            audioTrack = new AudioTrack(AudioManager.STREAM_VOICE_CALL, SAMPLE_RATE, CHANNEL_CONFIG_OUT, AUDIO_FORMAT, minBufferSizeOut * BUFFER_SIZE_FACTOR, AudioTrack.MODE_STREAM);

            audioRecord.startRecording();
            audioTrack.play();
            isRunning.set(true);

            // Start foreground service for background audio
            Intent serviceIntent = new Intent(getReactApplicationContext(), AudioForegroundService.class);
            serviceIntent.setAction("START");
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                getReactApplicationContext().startForegroundService(serviceIntent);
            } else {
                getReactApplicationContext().startService(serviceIntent);
            }
            
            // Init Opus if enabled
            if (useOpus) {
                opusCodec = new OpusCodec();
                opusCodec.init();
                opusCodec.setBitrate(opusBitrate);
            }

            startRecordingThread();
            startJitterHandler();
            Log.d(TAG, "AudioEngine started");

        } catch (Exception e) {
            Log.e(TAG, "Error starting AudioEngine", e);
            stop();
        }
    }

    @ReactMethod
    public void stop() {
        isRunning.set(false);
        
        if (recordingThread != null) {
            try {
                recordingThread.join();
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
            recordingThread = null;
        }
        
        if (jitterHandler != null && jitterRunnable != null) {
            jitterHandler.removeCallbacks(jitterRunnable);
            jitterRunnable = null;
        }
        audioQueue.clear();
        packetArrivalTimes.clear();

        if (audioRecord != null) {
            try {
                audioRecord.stop();
                audioRecord.release();
            } catch (Exception e) {
                Log.e(TAG, "Error stopping AudioRecord", e);
            }
            audioRecord = null;
        }

        if (audioTrack != null) {
            try {
                audioTrack.stop();
                audioTrack.release();
            } catch (Exception e) {
                Log.e(TAG, "Error stopping AudioTrack", e);
            }
            audioTrack = null;
        }

        if (aec != null) {
            aec.release();
            aec = null;
        }

        if (ns != null) {
            ns.release();
            ns = null;
        }
        
        if (opusCodec != null) {
            opusCodec.destroy();
            opusCodec = null;
        }
        
        // Stop foreground service
        Intent serviceIntent = new Intent(getReactApplicationContext(), AudioForegroundService.class);
        serviceIntent.setAction("STOP");
        getReactApplicationContext().startService(serviceIntent);
        
        Log.d(TAG, "AudioEngine stopped");
    }

    @ReactMethod
    public void queueAudio(String base64String) {
        if (!isRunning.get() || audioTrack == null) return;

        try {
            byte[] audioData = Base64.decode(base64String, Base64.DEFAULT);
            
            // Add to jitter buffer queue
            long now = System.currentTimeMillis();
            audioQueue.offer(new AudioPacket(audioData, now));
            
            // Track arrival times for auto-adjust
            packetArrivalTimes.add(now);
            if (packetArrivalTimes.size() > 100) {
                packetArrivalTimes.remove(0);
            }
            
            // Start jitter handler if not running (should be running from start(), but safety check)
            // if (jitterRunnable == null) {
            //     startJitterHandler();
            // }
            
            // Process queue immediately
            processAudioQueue();
        } catch (Exception e) {
            Log.e(TAG, "Error queuing audio", e);
        }
    }

    @ReactMethod
    public void setVolume(float vol) {
        this.volume = vol;
        Log.d(TAG, "Volume set to " + vol);
    }

    @ReactMethod
    public void setMicGain(float gain) {
        this.micGain = gain;
        Log.d(TAG, "Mic gain set to " + gain);
    }

    @ReactMethod
    public void setCodec(String codec) {
        boolean wasOpus = useOpus;
        useOpus = "opus".equals(codec);
        Log.d(TAG, "Codec set to " + codec);
        
        if (useOpus && !wasOpus && opusCodec == null) {
            opusCodec = new OpusCodec();
            opusCodec.init();
            opusCodec.setBitrate(opusBitrate);
        }
    }

    @ReactMethod
    public void setOpusBitrate(int bitrate) {
        this.opusBitrate = bitrate;
        Log.d(TAG, "Opus bitrate set to " + bitrate);
        if (opusCodec != null) {
            opusCodec.setBitrate(bitrate);
        }
    }

    @ReactMethod
    public void setPCMBitDepth(int bitDepth) {
        if (bitDepth == 8 || bitDepth == 12 || bitDepth == 16) {
            this.pcmBitDepth = bitDepth;
            Log.d(TAG, "PCM bit depth set to " + bitDepth + "-bit");
        } else {
            Log.e(TAG, "Invalid bit depth " + bitDepth + ", must be 8, 12, or 16");
        Log.d(TAG, "Auto-adjust jitter " + (enabled ? "enabled" : "disabled"));
    }

    private void startJitterHandler() {
        jitterRunnable = new Runnable() {
            @Override
            public void run() {
                processJitterBuffer();
                jitterHandler.postDelayed(this, 20); // Run every 20ms
            }
        };
        jitterHandler.post(jitterRunnable);
    }

    private void processAudioQueue() {
        synchronized (audioQueue) {
            // Calculate current buffered duration
            if (useOpus) {
                // For Opus, assume ~20ms per packet
                bufferedDurationMs = audioQueue.size() * 20;
            } else {
                // For PCM, calculate exact duration based on bytes
                long totalBytes = 0;
                for (AudioPacket packet : audioQueue) {
                    totalBytes += packet.data.length;
                }
                
                int bytesPerSample = pcmBitDepth / 8;
                // 48kHz, 1 channel
                long bytesPerSecond = 48000 * 1 * bytesPerSample;
                bufferedDurationMs = (totalBytes * 1000) / bytesPerSecond;
            }
            
            if (isBuffering) {
                if (bufferedDurationMs >= jitterBufferMs) {
                    Log.d(TAG, "Buffer full (" + bufferedDurationMs + "ms >= " + jitterBufferMs + "ms), starting playback");
                    isBuffering = false;
                    flushQueueToPlayer();
                }
            } else {
                // Not buffering, just play what we have
                flushQueueToPlayer();
            }
        }
    }
    
    private void flushQueueToPlayer() {
        while (!audioQueue.isEmpty()) {
            AudioPacket packet = audioQueue.poll();
            if (packet != null) {
                playAudioPacket(packet);
            }
        }
    }
    
    private void handleUnderrun() {
        synchronized (audioQueue) {
            if (!isBuffering) {
                Log.d(TAG, "Underrun detected! Re-buffering...");
                isBuffering = true;
                underrunCount++;
                lastUnderrunTime = System.currentTimeMillis();
                
                // Auto-adjust: Increase buffer if we hit underrun
                if (isAutoJitter && jitterBufferMs < 500) {
                    jitterBufferMs = Math.min(jitterBufferMs + 50, 500);
                    Log.d(TAG, "Auto-adjust increased buffer to " + jitterBufferMs + "ms due to underrun");
                    sendJitterBufferChangeEvent(jitterBufferMs, true);
                }
            }
        }
    }

    private void playAudioPacket(AudioPacket packet) {
        try {
            byte[] audioData = packet.data;
            
            if (useOpus && opusCodec != null) {
                short[] pcm = opusCodec.decodeFrame(audioData);
                if (pcm != null) {
                    // Convert short[] to byte[]
                    byte[] pcmBytes = new byte[pcm.length * 2];
                    for (int i = 0; i < pcm.length; i++) {
                        pcmBytes[i * 2] = (byte) (pcm[i] & 0xff);
                        pcmBytes[i * 2 + 1] = (byte) ((pcm[i] >> 8) & 0xff);
                    }
                    audioData = pcmBytes;
                } else {
                    Log.w(TAG, "Opus decoding failed");
                    return;
                }
            } else {
                // PCM decoding - expand to 16-bit if needed
                if (pcmBitDepth == 8) {
                    audioData = expandFrom8Bit(audioData);
                } else if (pcmBitDepth == 12) {
                    audioData = expandFrom12Bit(audioData);
                }
                // 16-bit is already in the correct format
            }
            
            // Apply volume if not 1.0
            if (volume != 1.0f) {
                applyVolumeToBuffer(audioData);
            }
            
            if (audioTrack != null) {
                audioTrack.write(audioData, 0, audioData.length);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error playing audio packet", e);
        }
    }

    private void adjustBufferSize() {
        // Only decrease buffer if stable for a long time
        // Increase is handled by handleUnderrun
        
        if (System.currentTimeMillis() - lastUnderrunTime < 30000) return;
        
        // If we haven't had an underrun in 30s, try decreasing buffer slowly
        if (jitterBufferMs > 50) {
            jitterBufferMs = Math.max(jitterBufferMs - 10, 50);
            Log.d(TAG, "Auto-adjust decreased buffer to " + jitterBufferMs + "ms (stable for >30s)");
            lastUnderrunTime = System.currentTimeMillis(); // Reset timer so we don't decrease too fast
            sendJitterBufferChangeEvent(jitterBufferMs, true);
        }
    }

    private void sendJitterBufferChangeEvent(int bufferMs, boolean auto) {
        if (getReactApplicationContext().hasActiveCatalystInstance()) {
            WritableMap params = Arguments.createMap();
            params.putInt("bufferMs", bufferMs);
            params.putBoolean("auto", auto);
            getReactApplicationContext()
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("onJitterBufferChange", params);
        }
    }

    private void applyVolumeToBuffer(byte[] buffer) {
        // Convert byte array to short array (16-bit PCM)
        for (int i = 0; i < buffer.length - 1; i += 2) {
            short sample = (short) ((buffer[i + 1] << 8) | (buffer[i] & 0xFF));
            float amplified = sample * volume;
            // Clamp to prevent clipping
            sample = (short) Math.max(-32768, Math.min(32767, amplified));
            buffer[i] = (byte) (sample & 0xFF);
            buffer[i + 1] = (byte) ((sample >> 8) & 0xFF);
        }
    }

    private void applyMicGainToBuffer(byte[] buffer) {
        // Convert byte array to short array (16-bit PCM)
        for (int i = 0; i < buffer.length - 1; i += 2) {
            short sample = (short) ((buffer[i + 1] << 8) | (buffer[i] & 0xFF));
            float amplified = sample * micGain;
            // Clamp to prevent clipping
            sample = (short) Math.max(-32768, Math.min(32767, amplified));
            buffer[i] = (byte) (sample & 0xFF);
            buffer[i + 1] = (byte) ((sample >> 8) & 0xFF);
        }
    }

    private void startRecordingThread() {
        recordingThread = new Thread(new Runnable() {
            @Override
            public void run() {
                byte[] buffer = new byte[minBufferSizeIn];
                while (isRunning.get()) {
                    int read = audioRecord.read(buffer, 0, minBufferSizeIn);
                    if (read > 0) {
                        byte[] processBuffer;
                        if (micGain != 1.0f) {
                            processBuffer = new byte[read];
                            System.arraycopy(buffer, 0, processBuffer, 0, read);
                            applyMicGainToBuffer(processBuffer);
                        } else {
                            processBuffer = new byte[read];
                            System.arraycopy(buffer, 0, processBuffer, 0, read);
                        }
                        
                        // Calculate and send audio level (throttled)
                        long now = System.currentTimeMillis();
                        if (now - lastLevelSendTime >= 100) { // 100ms throttle
                            int maxAmp = 0;
                            // processBuffer is byte[], need to treat as short[]
                            for (int i = 0; i < read - 1; i += 2) {
                                int sample = (processBuffer[i + 1] << 8) | (processBuffer[i] & 0xFF);
                                int absSample = Math.abs(sample);
                                if (absSample > maxAmp) {
                                    maxAmp = absSample;
                                }
                            }
                            // Normalize to 0.0 - 1.0
                            double level = (double) maxAmp / 32768.0;
                            sendEvent("onAudioLevel", String.valueOf(level)); // Sending as string to avoid type issues, or could send double if supported
                            lastLevelSendTime = now;
                        }
                        
                        if (useOpus && opusCodec != null) {
                            // Convert byte[] to short[]
                            short[] pcm = new short[read / 2];
                            for (int i = 0; i < pcm.length; i++) {
                                pcm[i] = (short) ((processBuffer[i * 2 + 1] << 8) | (processBuffer[i * 2] & 0xFF));
                            }
                            
                            byte[] opusData = opusCodec.encodeFrame(pcm);
                            if (opusData != null) {
                                String base64Data = Base64.encodeToString(opusData, Base64.NO_WRAP);
                                sendEvent("onAudioData", base64Data);
                            }
                        } else {
                            // PCM encoding - reduce bit depth if needed
                            byte[] finalData;
                            if (pcmBitDepth == 16) {
                                finalData = processBuffer;
                            } else if (pcmBitDepth == 12) {
                                finalData = reduceTo12Bit(processBuffer);
                            } else { // 8-bit
                                finalData = reduceTo8Bit(processBuffer);
                            }
                            
                            String base64Data = Base64.encodeToString(finalData, Base64.NO_WRAP);
                            sendEvent("onAudioData", base64Data);
                        }
                    }
                }
            }
        });
        recordingThread.start();
    }

    private void sendEvent(String eventName, String data) {
        if (getReactApplicationContext().hasActiveCatalystInstance()) {
            getReactApplicationContext()
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(eventName, data);
        }
    }

    private byte[] reduceTo8Bit(byte[] buffer) {
        int sampleCount = buffer.length / 2;
        byte[] result = new byte[sampleCount];
        
        for (int i = 0; i < sampleCount; i++) {
            // Little endian
            int low = buffer[i * 2] & 0xFF;
            int high = buffer[i * 2 + 1]; // signed byte
            int sample = (high << 8) | low; // 16-bit signed
            
            // Convert to 8-bit unsigned: (sample >> 8) + 128
            int val = (sample >> 8) + 128;
            result[i] = (byte) (val & 0xFF);
        }
        return result;
    }

    private byte[] reduceTo12Bit(byte[] buffer) {
        int sampleCount = buffer.length / 2;
        // 3 bytes for every 2 samples
        int resultLen = (sampleCount * 3) / 2;
        byte[] result = new byte[resultLen];
        
        int resultIdx = 0;
        for (int i = 0; i < sampleCount - 1; i += 2) {
            // Sample 1
            int low1 = buffer[i * 2] & 0xFF;
            int high1 = buffer[i * 2 + 1];
            int sample1 = (high1 << 8) | low1;
            
            // Sample 2
            int low2 = buffer[(i + 1) * 2] & 0xFF;
            int high2 = buffer[(i + 1) * 2 + 1];
            int sample2 = (high2 << 8) | low2;
            
            // 12-bit conversion (shift right 4)
            int val1 = (sample1 >> 4) & 0xFFF;
            int val2 = (sample2 >> 4) & 0xFFF;
            
            // Pack: [AAAA AAAA][AAAA BBBB][BBBB BBBB]
            result[resultIdx++] = (byte) (val1 & 0xFF); // Lower 8 of val1
            result[resultIdx++] = (byte) (((val1 >> 8) & 0x0F) | ((val2 & 0x0F) << 4)); // Upper 4 of val1 | Lower 4 of val2
            result[resultIdx++] = (byte) ((val2 >> 4) & 0xFF); // Upper 8 of val2
        }
        return result;
    }

    private byte[] expandFrom8Bit(byte[] buffer) {
        int sampleCount = buffer.length;
        byte[] result = new byte[sampleCount * 2];
        
        for (int i = 0; i < sampleCount; i++) {
            int val = buffer[i] & 0xFF; // Unsigned 8-bit
            // Convert back to 16-bit signed: (val - 128) << 8
            int sample = (val - 128) << 8;
            
            result[i * 2] = (byte) (sample & 0xFF);
            result[i * 2 + 1] = (byte) ((sample >> 8) & 0xFF);
        }
        return result;
    }

    private byte[] expandFrom12Bit(byte[] buffer) {
        // 3 bytes -> 2 samples
        int sampleCount = (buffer.length * 2) / 3;
        byte[] result = new byte[sampleCount * 2];
        
        int resultIdx = 0;
        for (int i = 0; i < buffer.length - 2; i += 3) {
            int b1 = buffer[i] & 0xFF;
            int b2 = buffer[i + 1] & 0xFF;
            int b3 = buffer[i + 2] & 0xFF;
            
            // Unpack
            // val1: [b2_low4][b1]
            // val2: [b3][b2_high4]
            
            int val1 = b1 | ((b2 & 0x0F) << 8);
            int val2 = ((b2 & 0xF0) >> 4) | (b3 << 4);
            
            // Convert to 16-bit (shift left 4)
            // Sign extension? 12-bit is signed.
            // If bit 11 is set, it's negative.
            if ((val1 & 0x800) != 0) val1 |= 0xF000;
            if ((val2 & 0x800) != 0) val2 |= 0xF000;
            
            short sample1 = (short) (val1 << 4);
            short sample2 = (short) (val2 << 4);
            
            result[resultIdx++] = (byte) (sample1 & 0xFF);
            result[resultIdx++] = (byte) ((sample1 >> 8) & 0xFF);
            
            result[resultIdx++] = (byte) (sample2 & 0xFF);
            result[resultIdx++] = (byte) ((sample2 >> 8) & 0xFF);
        }
        return result;
    }
}
