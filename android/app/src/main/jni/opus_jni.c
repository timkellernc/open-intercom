#include "opus.h"
#include <jni.h>
#include <string.h>

#define TAG "OpusJNI"

JNIEXPORT jlong JNICALL Java_com_openintercommobile_OpusCodec_createEncoder(
    JNIEnv *env, jobject obj, jint sampleRate, jint channels) {
  int error;
  OpusEncoder *encoder =
      opus_encoder_create(sampleRate, channels, OPUS_APPLICATION_VOIP, &error);
  if (error != OPUS_OK) {
    return 0;
  }
  opus_encoder_ctl(encoder, OPUS_SET_VBR(1));
  opus_encoder_ctl(encoder, OPUS_SET_COMPLEXITY(10));
  opus_encoder_ctl(encoder, OPUS_SET_SIGNAL(OPUS_SIGNAL_VOICE));
  return (jlong)encoder;
}

JNIEXPORT jlong JNICALL Java_com_openintercommobile_OpusCodec_createDecoder(
    JNIEnv *env, jobject obj, jint sampleRate, jint channels) {
  int error;
  OpusDecoder *decoder = opus_decoder_create(sampleRate, channels, &error);
  if (error != OPUS_OK) {
    return 0;
  }
  return (jlong)decoder;
}

JNIEXPORT jint JNICALL Java_com_openintercommobile_OpusCodec_encode(
    JNIEnv *env, jobject obj, jlong encoderPtr, jshortArray pcm, jint frameSize,
    jbyteArray opus) {
  OpusEncoder *encoder = (OpusEncoder *)encoderPtr;
  jshort *pcmData = (*env)->GetShortArrayElements(env, pcm, NULL);
  jbyte *opusData = (*env)->GetByteArrayElements(env, opus, NULL);
  jsize opusLen = (*env)->GetArrayLength(env, opus);

  int len = opus_encode(encoder, pcmData, frameSize, (unsigned char *)opusData,
                        opusLen);

  (*env)->ReleaseShortArrayElements(env, pcm, pcmData, 0);
  (*env)->ReleaseByteArrayElements(env, opus, opusData, 0);

  return len;
}

JNIEXPORT jint JNICALL Java_com_openintercommobile_OpusCodec_decode(
    JNIEnv *env, jobject obj, jlong decoderPtr, jbyteArray opus,
    jshortArray pcm, jint frameSize) {
  OpusDecoder *decoder = (OpusDecoder *)decoderPtr;
  jbyte *opusData = (*env)->GetByteArrayElements(env, opus, NULL);
  jsize opusLen = (*env)->GetArrayLength(env, opus);
  jshort *pcmData = (*env)->GetShortArrayElements(env, pcm, NULL);

  int samples = opus_decode(decoder, (unsigned char *)opusData, opusLen,
                            pcmData, frameSize, 0);

  (*env)->ReleaseByteArrayElements(env, opus, opusData, 0);
  (*env)->ReleaseShortArrayElements(env, pcm, pcmData, 0);

  return samples;
}

JNIEXPORT void JNICALL Java_com_openintercommobile_OpusCodec_destroyEncoder(
    JNIEnv *env, jobject obj, jlong encoderPtr) {
  OpusEncoder *encoder = (OpusEncoder *)encoderPtr;
  if (encoder) {
    opus_encoder_destroy(encoder);
  }
}

JNIEXPORT void JNICALL Java_com_openintercommobile_OpusCodec_destroyDecoder(
    JNIEnv *env, jobject obj, jlong decoderPtr) {
  OpusDecoder *decoder = (OpusDecoder *)decoderPtr;
  if (decoder) {
    opus_decoder_destroy(decoder);
  }
}

JNIEXPORT void JNICALL Java_com_openintercommobile_OpusCodec_setBitrate(
    JNIEnv *env, jobject obj, jlong encoderPtr, jint bitrate) {
  OpusEncoder *encoder = (OpusEncoder *)encoderPtr;
  if (encoder) {
    opus_encoder_ctl(encoder, OPUS_SET_BITRATE(bitrate));
  }
}
