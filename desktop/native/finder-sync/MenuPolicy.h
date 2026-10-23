#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN
// Pure policy: input kinds are file, folder, or unsupported. No filesystem IO.
NSArray<NSDictionary *> *FCFinderMenuPolicy(NSArray<NSString *> *kinds, NSDictionary * _Nullable leftState);
// Display only. This value must never grant access or supply a comparison path.
NSDictionary * _Nullable FCFinderValidateLeftState(id _Nullable value);
NSDictionary * _Nullable FCFinderRequest(NSString *command, NSArray<NSString *> *paths);
NSURL * _Nullable FCFinderRequestURL(NSDictionary *request);
NSURL * _Nullable FCFinderContainingHostURL(NSURL *extensionURL, NSString *extensionIdentifier);
// Finder serializes menu items across processes; only the numeric tag identifies
// the immutable request kept here, never a reconstructed sender's representedObject.
@interface FCFinderRequestStore : NSObject
- (NSInteger)rememberRequest:(NSDictionary *)request;
- (nullable NSDictionary *)takeRequestForTag:(NSInteger)tag;
@end
NS_ASSUME_NONNULL_END
