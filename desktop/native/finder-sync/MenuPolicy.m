#import "MenuPolicy.h"

NSURL *FCFinderContainingHostURL(NSURL *extensionURL, NSString *extensionIdentifier) {
    if (![extensionIdentifier isEqual:@"com.furthercompare.desktop.finder"] ||
        ![extensionURL isKindOfClass:NSURL.class] || !extensionURL.isFileURL ||
        !extensionURL.path.isAbsolutePath || ![extensionURL.pathExtension isEqual:@"appex"]) return nil;
    NSURL *plugins = extensionURL.URLByDeletingLastPathComponent;
    NSURL *contents = plugins.URLByDeletingLastPathComponent;
    NSURL *host = contents.URLByDeletingLastPathComponent;
    if (![plugins.lastPathComponent isEqual:@"PlugIns"] ||
        ![contents.lastPathComponent isEqual:@"Contents"] || ![host.pathExtension isEqual:@"app"]) return nil;
    // Target only the app that physically contains the running principal class.
    // This is structural targeting, not independent signature/identity attestation.
    return host;
}

@interface FCFinderRequestStore ()
@property NSMutableDictionary<NSNumber *, NSDictionary *> *requests;
@property NSMutableArray<NSNumber *> *order;
@property NSInteger nextTag;
@end

@implementation FCFinderRequestStore
- (instancetype)init {
    if ((self = [super init])) {
        _requests = [NSMutableDictionary dictionary];
        _order = [NSMutableArray array];
        _nextTag = 1;
    }
    return self;
}
- (NSInteger)rememberRequest:(NSDictionary *)request {
    @synchronized(self) {
        if (![request isKindOfClass:NSDictionary.class]) return 0;
        NSDictionary *snapshot = FCFinderRequest(request[@"command"], request[@"files"]);
        if (!snapshot || !FCFinderRequestURL(snapshot) || self.nextTag == NSIntegerMax) return 0;
        // Retain up to 128 enabled actions (normally 64 menus). Never reuse a tag:
        // an evicted menu must fail closed instead of dispatching a newer selection.
        while (self.order.count >= 128) {
            NSNumber *oldest = self.order.firstObject;
            [self.requests removeObjectForKey:oldest];
            [self.order removeObjectAtIndex:0];
        }
        NSNumber *tag = @(self.nextTag++);
        self.requests[tag] = snapshot;
        [self.order addObject:tag];
        return tag.integerValue;
    }
}
- (NSDictionary *)takeRequestForTag:(NSInteger)tag {
    @synchronized(self) {
        NSNumber *key = @(tag);
        NSDictionary *request = self.requests[key];
        [self.requests removeObjectForKey:key];
        [self.order removeObject:key];
        return request;
    }
}
@end

NSDictionary *FCFinderValidateLeftState(id value) {
    if (![value isKindOfClass:NSDictionary.class]) return nil;
    NSDictionary *state = value;
    if (![state[@"version"] isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)state[@"version"]) == CFBooleanGetTypeID() || ![state[@"version"] isEqual:@1] ||
        ![state[@"available"] isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)state[@"available"]) != CFBooleanGetTypeID() ||
        ![state[@"name"] isKindOfClass:NSString.class] ||
        ![@[@"file", @"folder"] containsObject:state[@"kind"]]) return nil;
    NSString *name = state[@"name"];
    if (name.length == 0 || name.length > 1024 || [name containsString:@"/"] ||
        [name rangeOfCharacterFromSet:NSCharacterSet.controlCharacterSet].location != NSNotFound) return nil;
    // Cap display length without splitting a composed Unicode character.
    if (name.length > 64) {
        NSRange range = [name rangeOfComposedCharacterSequencesForRange:NSMakeRange(0, 61)];
        name = [[name substringWithRange:range] stringByAppendingString:@"…"];
    }
    return @{@"version": @1, @"available": @([state[@"available"] boolValue]), @"kind": state[@"kind"], @"name": name};
}

static NSDictionary *Item(NSString *title, NSString *command, BOOL enabled) {
    return @{@"title": title, @"command": command, @"enabled": @(enabled)};
}

NSDictionary *FCFinderRequest(NSString *command, NSArray<NSString *> *paths) {
    if (![command isKindOfClass:NSString.class] || ![@[@"--fc-set-left", @"--fc-compare-left", @"--fc-compare-selected"] containsObject:command] ||
        ![paths isKindOfClass:NSArray.class]) return nil;
    NSUInteger expected = [command isEqual:@"--fc-compare-selected"] ? 2 : 1;
    if (paths.count != expected) return nil;
    NSMutableArray *copy = [NSMutableArray arrayWithCapacity:expected];
    for (id path in paths) {
        if (![path isKindOfClass:NSString.class] || ![path isAbsolutePath] || [path length] > 32768 ||
            [path rangeOfString:[NSString stringWithFormat:@"%C", (unichar)0]].location != NSNotFound) return nil;
        [copy addObject:[path copy]];
    }
    return @{@"command": [command copy], @"files": [copy copy]};
}

NSURL *FCFinderRequestURL(NSDictionary *request) {
    if (![request isKindOfClass:NSDictionary.class]) return nil;
    NSDictionary *validated = FCFinderRequest(request[@"command"], request[@"files"]);
    if (!validated) return nil;
    NSData *json = [NSJSONSerialization dataWithJSONObject:validated options:0 error:nil];
    if (!json) return nil;
    NSString *payload = [[[json base64EncodedStringWithOptions:0] stringByReplacingOccurrencesOfString:@"+" withString:@"-"] stringByReplacingOccurrencesOfString:@"/" withString:@"_"];
    payload = [payload stringByReplacingOccurrencesOfString:@"=" withString:@""];
    NSString *encoded = [@"furthercompare://shell/v1?payload=" stringByAppendingString:payload];
    return encoded.length <= 96 * 1024 ? [NSURL URLWithString:encoded] : nil;
}

NSArray<NSDictionary *> *FCFinderMenuPolicy(NSArray<NSString *> *kinds, NSDictionary *leftState) {
    if (kinds.count == 0) return @[];
    if (kinds.count > 2) return @[Item(@"Select one or two items to compare", @"", NO)];
    for (NSString *kind in kinds) {
        if (![@[@"file", @"folder"] containsObject:kind])
            return @[Item(@"Select regular files or folders", @"", NO)];
    }
    if (kinds.count == 2) {
        if (![kinds[0] isEqual:kinds[1]]) return @[Item(@"Select two files or two folders", @"", NO)];
        return @[Item(@"Compare Selected in Further Compare", @"--fc-compare-selected", YES)];
    }
    NSDictionary *left = FCFinderValidateLeftState(leftState);
    // Unknown display state leaves the host authoritative; it will explain missing or stale left files.
    NSString *title = @"Compare with Left in Further Compare";
    BOOL enabled = YES;
    if (left) {
        enabled = [left[@"available"] boolValue] && [left[@"kind"] isEqual:kinds[0]];
        if ([left[@"available"] boolValue]) title = [NSString stringWithFormat:@"Compare with “%@” in Further Compare", left[@"name"]];
    }
    return @[Item(@"Set as Left in Further Compare", @"--fc-set-left", YES), Item(title, @"--fc-compare-left", enabled)];
}
