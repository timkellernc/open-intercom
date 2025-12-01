//
//  Use this file to import your target's public headers that you would like to
//  expose to Swift.
//

#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <opus/opus.h>

@interface OpusHelper : NSObject

+ (void *)createEncoder:(int)sampleRate
               channels:(int)channels
            application:(int)application
                  error:(int *)error;
+ (void *)createDecoder:(int)sampleRate
               channels:(int)channels
                  error:(int *)error;
+ (void)destroyEncoder:(void *)encoder;
+ (void)destroyDecoder:(void *)decoder;

+ (void)encoderSetBitrate:(void *)encoder bitrate:(int)bitrate;
+ (void)encoderSetVBR:(void *)encoder enabled:(BOOL)enabled;
+ (void)encoderSetComplexity:(void *)encoder complexity:(int)complexity;
+ (void)encoderSetSignalVoice:(void *)encoder;

+ (int)encode:(void *)encoder
             pcm:(const int16_t *)pcm
       frameSize:(int)frameSize
            data:(unsigned char *)data
    maxDataBytes:(int)maxDataBytes;
+ (int)decode:(void *)decoder
         data:(const unsigned char *)data
          len:(int)len
          pcm:(int16_t *)pcm
    frameSize:(int)frameSize
    decodeFec:(int)decodeFec;

+ (int)opusOK;
+ (int)opusApplicationVoip;

@end
