#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

@interface RNKeepAliveManager : NSObject <RCTBridgeModule>
@end

@implementation RNKeepAliveManager

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(enable) {
}

RCT_EXPORT_METHOD(disable) {
}

@end
