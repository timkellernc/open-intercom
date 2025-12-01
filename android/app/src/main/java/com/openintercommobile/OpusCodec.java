package com.openintercommobile;

import java.util.Arrays;

public class OpusCodec {
    static {
        System.loadLibrary("opus_jni");
    }

    private native long createEncoder(int sampleRate, int channels);
    private native long createDecoder(int sampleRate, int channels);
    private native int encode(long encoderPtr, short[] pcm, int frameSize, byte[] opus);
    private native int decode(long decoderPtr, byte[] opus, short[] pcm, int frameSize);
    private native void destroyEncoder(long encoderPtr);
    private native void destroyDecoder(long decoderPtr);
    private native void setBitrate(long encoderPtr, int bitrate);

    private long encoder;
    private long decoder;
    private int sampleRate = 48000;
    private int channels = 1;
    private int frameSize = 960; // 20ms at 48kHz

    public void init() {
        encoder = createEncoder(sampleRate, channels);
        decoder = createDecoder(sampleRate, channels);
    }

    public void destroy() {
        if (encoder != 0) {
            destroyEncoder(encoder);
            encoder = 0;
        }
        if (decoder != 0) {
            destroyDecoder(decoder);
            decoder = 0;
        }
    }

    public void setBitrate(int bitrate) {
        if (encoder != 0) {
            setBitrate(encoder, bitrate);
        }
    }

    public byte[] encodeFrame(short[] pcm) {
        if (encoder == 0) return null;
        byte[] opus = new byte[4000]; // Max packet size
        int len = encode(encoder, pcm, frameSize, opus);
        if (len > 0) {
            return Arrays.copyOf(opus, len);
        }
        return null;
    }

    public short[] decodeFrame(byte[] opus) {
        if (decoder == 0) return null;
        short[] pcm = new short[frameSize];
        int samples = decode(decoder, opus, pcm, frameSize);
        if (samples > 0) {
            return pcm;
        }
        return null;
    }
}
