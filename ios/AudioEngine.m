//
//  AudioEngine.m
//  OpenIntercomMobile
//
//  Created by OpenIntercom on 11/29/25.
//
#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <opus/opus.h>

@interface OpusHelper : NSObject

@end

@implementation OpusHelper

+ (void *)createEncoder:(int)sampleRate
               channels:(int)channels
            application:(int)application
                  error:(int *)error {
  return opus_encoder_create(sampleRate, channels, application, error);
}

+ (void *)createDecoder:(int)sampleRate
               channels:(int)channels
                  error:(int *)error {
  return opus_decoder_create(sampleRate, channels, error);
}

+ (void)destroyEncoder:(void *)encoder {
  opus_encoder_destroy((OpusEncoder *)encoder);
}

+ (void)destroyDecoder:(void *)decoder {
  opus_decoder_destroy((OpusDecoder *)decoder);
}

+ (void)encoderSetBitrate:(void *)encoder bitrate:(int)bitrate {
  opus_encoder_ctl((OpusEncoder *)encoder, OPUS_SET_BITRATE(bitrate));
}

+ (void)encoderSetVBR:(void *)encoder enabled:(BOOL)enabled {
  opus_encoder_ctl((OpusEncoder *)encoder, OPUS_SET_VBR(enabled ? 1 : 0));
}

+ (void)encoderSetComplexity:(void *)encoder complexity:(int)complexity {
  opus_encoder_ctl((OpusEncoder *)encoder, OPUS_SET_COMPLEXITY(complexity));
}

+ (void)encoderSetSignalVoice:(void *)encoder {
  opus_encoder_ctl((OpusEncoder *)encoder, OPUS_SET_SIGNAL(OPUS_SIGNAL_VOICE));
}

+ (int)encode:(void *)encoder
             pcm:(const int16_t *)pcm
       frameSize:(int)frameSize
            data:(unsigned char *)data
    maxDataBytes:(int)maxDataBytes {
  return opus_encode((OpusEncoder *)encoder, pcm, frameSize, data,
                     maxDataBytes);
}

+ (int)decode:(void *)decoder
         data:(const unsigned char *)data
          len:(int)len
          pcm:(int16_t *)pcm
    frameSize:(int)frameSize
    decodeFec:(int)decodeFec {
  return opus_decode((OpusDecoder *)decoder, data, len, pcm, frameSize,
                     decodeFec);
}

+ (int)opusOK {
  return OPUS_OK;
}

+ (int)opusApplicationVoip {
  return OPUS_APPLICATION_VOIP;
}

@end

@interface RCT_EXTERN_MODULE (AudioEngine, RCTEventEmitter)

RCT_EXTERN_METHOD(start)
RCT_EXTERN_METHOD(stop)
RCT_EXTERN_METHOD(setVolume : (nonnull NSNumber *)volume)
RCT_EXTERN_METHOD(setMicGain : (nonnull NSNumber *)gain)
RCT_EXTERN_METHOD(setCodec : (NSString *)codec)
RCT_EXTERN_METHOD(setOpusBitrate : (nonnull NSNumber *)bitrate)
RCT_EXTERN_METHOD(queueAudio : (NSString *)base64String)

@end
