// Foundation-only harness. Does not register, activate, or launch the extension.
#import <Foundation/Foundation.h>
#import "MenuPolicy.h"
#define CHECK(x) do { if (!(x)) { fprintf(stderr, "Failed line %d: %s\n", __LINE__, #x); return 1; } } while (0)
int main(void) { @autoreleasepool {
    NSString *identifier = @"com.furthercompare.desktop.finder";
    for (NSString *location in @[@"/Applications/Further Compare.app", @"/private/tmp/probe/Further Compare.app", @"/Users/test/é 😀.app"]) {
        NSURL *extension = [NSURL fileURLWithPath:[location stringByAppendingPathComponent:@"Contents/PlugIns/FurtherCompareFinder.appex"]];
        CHECK([FCFinderContainingHostURL(extension, identifier).path.decomposedStringWithCanonicalMapping isEqual:location.decomposedStringWithCanonicalMapping]);
        CHECK(FCFinderContainingHostURL(extension, @"other.identifier") == nil);
    }
    for (NSString *invalid in @[@"/tmp/FurtherCompareFinder.appex", @"/tmp/Host.app/PlugIns/FurtherCompareFinder.appex", @"/tmp/Host.app/Contents/Other/FurtherCompareFinder.appex", @"/tmp/Host.zip/Contents/PlugIns/FurtherCompareFinder.appex", @"/tmp/Host.app/Contents/PlugIns/FurtherCompareFinder.bundle"]) {
        CHECK(FCFinderContainingHostURL([NSURL fileURLWithPath:invalid], identifier) == nil);
    }
    CHECK(FCFinderContainingHostURL([NSURL URLWithString:@"https://example.com/Host.app/Contents/PlugIns/Finder.appex"], identifier) == nil);
    FCFinderRequestStore *store = [[FCFinderRequestStore alloc] init];
    NSMutableString *name = [@"/tmp/original é 😀.txt" mutableCopy];
    NSMutableArray *paths = [NSMutableArray arrayWithObject:name];
    NSMutableDictionary *request = [@{@"command": @"--fc-set-left", @"files": paths} mutableCopy];
    NSInteger first = [store rememberRequest:request];
    [name appendString:@"changed"]; [paths removeAllObjects]; request[@"command"] = @"--fc-compare-left";
    NSInteger second = [store rememberRequest:FCFinderRequest(@"--fc-compare-selected", @[@"/tmp/a", @"/tmp/b"])];
    CHECK(first > 0 && second > first);
    // A reconstructed menu sender needs only its integer tag. Later menus do not
    // replace the captured request for an earlier still-open menu.
    NSDictionary *captured = [store takeRequestForTag:first];
    CHECK([captured[@"command"] isEqual:@"--fc-set-left"]);
    CHECK([captured[@"files"] isEqual:@[@"/tmp/original é 😀.txt"]]);
    CHECK([store takeRequestForTag:first] == nil);
    CHECK([store takeRequestForTag:0] == nil);
    CHECK([store takeRequestForTag:-1] == nil);
    CHECK([store takeRequestForTag:second] != nil);
    CHECK([store rememberRequest:@{}] == 0);
    CHECK(([store rememberRequest:@{@"command": @"--fc-clear-left", @"files": @[]}] == 0));
    NSInteger oldest = [store rememberRequest:FCFinderRequest(@"--fc-set-left", @[@"/tmp/oldest"])];
    NSInteger newest = 0;
    for (NSUInteger i = 0; i < 128; i++) newest = [store rememberRequest:FCFinderRequest(@"--fc-set-left", @[[NSString stringWithFormat:@"/tmp/%lu", (unsigned long)i]])];
    CHECK([store takeRequestForTag:oldest] == nil);
    CHECK(newest > oldest);
    CHECK([[[store takeRequestForTag:newest][@"files"] firstObject] isEqual:@"/tmp/127"]);
    puts("Finder request store passed: immutable snapshots, later-menu isolation, one-shot tags, bounded eviction, invalid requests.");
} return 0; }
