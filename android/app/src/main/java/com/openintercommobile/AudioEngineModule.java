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
    
    // Jitter buffer
    private int jitterBufferMs = 100;  // Default 100ms
    private boolean isAutoJitter = true;
    private Queue<AudioPacket> audioQueue = new ConcurrentLinkedQueue<>();
    private Handler jitterHandler = new Handler(Looper.getMainLooper());
    private long lastPlayTime = 0;
    private long lastAdjustTime = System.currentTimeMillis();  // Track when we last adjusted buffer
    private List<Long> packetArrivalTimes = new ArrayList<>();
    private Runnable jitterRunnable;
    
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
            if (jitterRunnable == null) {
                startJitterHandler();
            }
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
    public void setJitterBuffer(int ms) {
        this.jitterBufferMs = ms;
        Log.d(TAG, "Jitter buffer set to " + ms + "ms");
    }

    @ReactMethod
    public void setAutoJitter(boolean enabled) {
        this.isAutoJitter = enabled;
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

    private void processJitterBuffer() {
        if (audioQueue.isEmpty()) return;

        AudioPacket packet = audioQueue.peek();
        if (packet == null) return;

        long now = System.currentTimeMillis();
        if (now - packet.arrivalTime >= jitterBufferMs) {
            audioQueue.poll(); // Remove from queue
            playAudioPacket(packet);
            lastPlayTime = now;

            if (isAutoJitter) {
                adjustBufferSize();
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
        // Only adjust every 2 seconds
        if (System.currentTimeMillis() - lastAdjustTime < 2000) return;

        if (packetArrivalTimes.size() < 10) return;

        List<Long> intervals = new ArrayList<>();
        for (int i = 1; i < packetArrivalTimes.size(); i++) {
            intervals.add(packetArrivalTimes.get(i) - packetArrivalTimes.get(i - 1));
        }

        double sum = 0;
        for (Long interval : intervals) {
            sum += interval;
        }
        double avg = sum / intervals.size();

        double variance = 0;
        for (Long interval : intervals) {
            variance += Math.pow(interval - avg, 2);
        }
        variance /= intervals.size();
        double jitter = Math.sqrt(variance);

        // Adjust buffer based on jitter
        if (jitter < 15 && jitterBufferMs > 50) {
            // Low jitter - decrease buffer
            jitterBufferMs = Math.max(jitterBufferMs - 10, 50);
            Log.d(TAG, "Auto-adjust decreased buffer to " + jitterBufferMs + "ms (jitter: " + (int)jitter + "ms)");
            lastAdjustTime = System.currentTimeMillis();
            sendJitterBufferChangeEvent(jitterBufferMs, true);
        } else if (jitter > 30 && jitterBufferMs < 500) {
            // High jitter - increase buffer
            jitterBufferMs = Math.min(jitterBufferMs + 20, 500);
            Log.d(TAG, "Auto-adjust increased buffer to " + jitterBufferMs + "ms (jitter: " + (int)jitter + "ms)");
            lastAdjustTime = System.currentTimeMillis();
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
                            String base64Data = Base64.encodeToString(processBuffer, Base64.NO_WRAP);
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
}
