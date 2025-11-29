//
//  AudioEngine.m
//  OpenIntercomMobile
//
//  Created by OpenIntercom on 11/29/25.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(AudioEngine, RCTEventEmitter)

RCT_EXTERN_METHOD(start)
RCT_EXTERN_METHOD(stop)
RCT_EXTERN_METHOD(queueAudio:(NSString *)base64String)

@end
