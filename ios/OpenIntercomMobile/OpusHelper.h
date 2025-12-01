#import <Foundation/Foundation.h>

@interface OpusHelper : NSObject

+ (void)encoderSetBitrate:(void *)encoder bitrate:(int)bitrate;
+ (void)encoderSetVBR:(void *)encoder enabled:(BOOL)enabled;
+ (void)encoderSetComplexity:(void *)encoder complexity:(int)complexity;
+ (void)encoderSetSignalVoice:(void *)encoder;

@end
