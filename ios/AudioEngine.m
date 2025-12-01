//
//  AudioEngine.m
//  OpenIntercomMobile
//
//  Created by OpenIntercom on 11/29/25.
//
#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE (AudioEngine, RCTEventEmitter)

RCT_EXTERN_METHOD(start)
RCT_EXTERN_METHOD(stop)
RCT_EXTERN_METHOD(setVolume : (nonnull NSNumber *)volume)
RCT_EXTERN_METHOD(setMicGain : (nonnull NSNumber *)gain)
RCT_EXTERN_METHOD(setCodec : (NSString *)codec)
RCT_EXTERN_METHOD(setOpusBitrate : (nonnull NSNumber *)bitrate)
RCT_EXTERN_METHOD(setPCMBitDepth : (nonnull NSNumber *)bitDepth)
RCT_EXTERN_METHOD(setJitterBuffer : (nonnull NSNumber *)ms)
RCT_EXTERN_METHOD(setAutoJitter : (nonnull NSNumber *)enabled)
RCT_EXTERN_METHOD(queueAudio : (NSString *)base64String)

@end
