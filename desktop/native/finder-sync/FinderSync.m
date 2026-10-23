#import <AppKit/AppKit.h>
#import <FinderSync/FinderSync.h>
#import <fcntl.h>
#import <sys/stat.h>
#import <unistd.h>
#import "MenuPolicy.h"

@interface FCFinderSync : FIFinderSync
@property FCFinderRequestStore *requestStore;
@end

@implementation FCFinderSync
- (instancetype)init {
    if ((self = [super init])) {
        _requestStore = [[FCFinderRequestStore alloc] init];
        // Root registration provides contextual actions, not background scans or badges.
        FIFinderSyncController.defaultController.directoryURLs = [NSSet setWithObject:[NSURL fileURLWithPath:@"/" isDirectory:YES]];
    }
    return self;
}

- (NSDictionary *)leftDisplayState {
    id group = [[NSBundle bundleForClass:FCFinderSync.class] objectForInfoDictionaryKey:@"FCAppGroupIdentifier"];
    if (![group isKindOfClass:NSString.class] || [group length] == 0) return nil;
    NSURL *container = [NSFileManager.defaultManager containerURLForSecurityApplicationGroupIdentifier:group];
    if (!container) return nil;
    NSURL *url = [container URLByAppendingPathComponent:@"finder-left-state.json"];
    int fd = open(url.fileSystemRepresentation, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC);
    if (fd < 0) return nil;
    struct stat st;
    if (fstat(fd, &st) != 0 || !S_ISREG(st.st_mode) || st.st_size < 1 || st.st_size > 8192) { close(fd); return nil; }
    NSMutableData *data = [NSMutableData dataWithLength:(NSUInteger)st.st_size];
    NSUInteger offset = 0;
    while (offset < data.length) {
        ssize_t count = read(fd, (char *)data.mutableBytes + offset, data.length - offset);
        if (count <= 0) { close(fd); return nil; }
        offset += (NSUInteger)count;
    }
    close(fd);
    return FCFinderValidateLeftState([NSJSONSerialization JSONObjectWithData:data options:0 error:nil]);
}

- (NSMenu *)menuForMenuKind:(FIMenuKind)kind {
    if (kind != FIMenuKindContextualMenuForItems) return nil;
    NSArray<NSURL *> *urls = [FIFinderSyncController.defaultController.selectedItemURLs copy];
    if (!urls.count) return nil;
    NSMutableArray *kinds = [NSMutableArray array];
    NSMutableArray *paths = [NSMutableArray array];
    // More than two selections need no filesystem metadata.
    if (urls.count > 2) [kinds addObjectsFromArray:@[@"unsupported", @"unsupported", @"unsupported"]];
    else for (NSURL *url in urls) {
        NSString *path = url.path;
        NSString *itemKind = @"unsupported";
        if (url.isFileURL && path.isAbsolutePath && path.length <= 32768) {
            NSDictionary *values = [url resourceValuesForKeys:@[NSURLIsRegularFileKey, NSURLIsDirectoryKey, NSURLIsSymbolicLinkKey] error:nil];
            if (values && ![values[NSURLIsSymbolicLinkKey] boolValue]) {
                if ([values[NSURLIsDirectoryKey] boolValue]) itemKind = @"folder";
                else if ([values[NSURLIsRegularFileKey] boolValue]) itemKind = @"file";
            }
        }
        [kinds addObject:itemKind];
        [paths addObject:path ?: @""];
    }
    NSMenu *menu = [[NSMenu alloc] initWithTitle:@"Further Compare"];
    menu.autoenablesItems = NO;
    for (NSDictionary *entry in FCFinderMenuPolicy(kinds, [self leftDisplayState])) {
        NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:entry[@"title"] action:@selector(dispatchSelection:) keyEquivalent:@""];
        item.target = self;
        item.enabled = [entry[@"enabled"] boolValue];
        // Finder may reconstruct this item across its process boundary. Retain
        // the snapshot locally and transport only the numeric tag with the item.
        item.tag = item.enabled ? [self.requestStore rememberRequest:FCFinderRequest(entry[@"command"], paths)] : 0;
        item.enabled = item.enabled && item.tag != 0;
        [menu addItem:item];
    }
    return menu;
}

- (NSURL *)hostApplicationURL {
    // The principal class belongs to the extension; mainBundle can identify the
    // framework's process host instead when Finder launches an extension.
    NSBundle *extensionBundle = [NSBundle bundleForClass:FCFinderSync.class];
    NSURL *host = FCFinderContainingHostURL(extensionBundle.bundleURL, extensionBundle.bundleIdentifier);
    if (!host) NSLog(@"Further Compare Finder: principal bundle or containing layout validation failed.");
    // The package validates the host ID. Runtime targets this exact containing
    // app, without a sandbox-denied Info.plist read or registry availability gate.
    return host;
}

- (void)dispatchSelection:(NSMenuItem *)sender {
    NSLog(@"Further Compare Finder: action received.");
    if (![sender respondsToSelector:@selector(tag)]) { NSLog(@"Further Compare Finder: action sender has no tag."); return; }
    NSDictionary *request = [self.requestStore takeRequestForTag:sender.tag];
    NSURL *requestURL = FCFinderRequestURL(request);
    if (!requestURL) { NSLog(@"Further Compare Finder: captured request unavailable."); return; }
    NSURL *host = [self hostApplicationURL];
    if (!host) { NSLog(@"Further Compare: enclosing application could not be verified."); return; }
    NSWorkspaceOpenConfiguration *configuration = NSWorkspaceOpenConfiguration.configuration;
    configuration.activates = YES;
    configuration.allowsRunningApplicationSubstitution = NO;
    // Sandbox ignores command-line arguments. URL requests require host-side review
    // because URL schemes are public and cannot authenticate the sender.
    NSLog(@"Further Compare Finder: opening reviewed request in host.");
    [NSWorkspace.sharedWorkspace openURLs:@[requestURL] withApplicationAtURL:host configuration:configuration completionHandler:^(NSRunningApplication *app, NSError *error) {
        if (error) NSLog(@"Further Compare: could not open the comparison application (%ld).", (long)error.code);
        else NSLog(@"Further Compare Finder: host dispatch completed.");
    }];
}
@end
