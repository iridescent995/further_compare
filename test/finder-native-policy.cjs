// Opt-in real Foundation harness; compiles production policy, never launches Finder.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
if(process.platform!=='darwin'){console.log('Finder native policy requires macOS.');process.exit(0);}
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'fc-finder-policy-'));
const harness=`
#import <Foundation/Foundation.h>
#import "MenuPolicy.h"
#define CHECK(x) do { if(!(x)){fprintf(stderr,"Assertion failed at line %d: %s\\n",__LINE__,#x);exit(1);} }while(0)
int main(void){@autoreleasepool{
 CHECK(FCFinderMenuPolicy(@[],nil).count==0);
 NSArray *single=FCFinderMenuPolicy(@[@"file"],nil);
 CHECK(single.count==2);CHECK([single[0][@"command"] isEqual:@"--fc-set-left"]);
 CHECK([single[1][@"enabled"] boolValue]);
 NSDictionary *left=@{@"version":@1,@"available":@YES,@"kind":@"file",@"name":@"example.java"};
 CHECK([FCFinderMenuPolicy(@[@"file"],left)[1][@"title"] containsString:@"example.java"]);
 CHECK(![FCFinderMenuPolicy(@[@"folder"],left)[1][@"enabled"] boolValue]);
 NSMutableDictionary *missing=[left mutableCopy];missing[@"available"]=@NO;
 CHECK(![FCFinderMenuPolicy(@[@"file"],missing)[1][@"enabled"] boolValue]);
 CHECK([FCFinderMenuPolicy(@[@"file",@"file"],nil)[0][@"command"] isEqual:@"--fc-compare-selected"]);
 CHECK(![FCFinderMenuPolicy(@[@"file",@"folder"],nil)[0][@"enabled"] boolValue]);
 CHECK(![FCFinderMenuPolicy(@[@"unsupported"],nil)[0][@"enabled"] boolValue]);
 CHECK(![FCFinderMenuPolicy(@[@"file",@"file",@"file"],nil)[0][@"enabled"] boolValue]);
 for(id bad in @[@{},@{@"version":@2},@{@"version":@1,@"available":@YES,@"kind":@"file",@"name":@"bad/name"},@{@"version":@1,@"available":@YES,@"kind":@"file",@"name":@"bad\\nname"}])CHECK(FCFinderValidateLeftState(bad)==nil);
 NSMutableDictionary *longName=[left mutableCopy];longName[@"name"]=[@"😀" stringByPaddingToLength:120 withString:@"😀" startingAtIndex:0];
 NSString *display=FCFinderValidateLeftState(longName)[@"name"];
 CHECK([display hasSuffix:@"…"]);CHECK([display dataUsingEncoding:NSUTF8StringEncoding]!=nil);CHECK(display.length<120);
 NSMutableString *filename=[@"/tmp/space & ? # é 😀.txt" mutableCopy];
 NSMutableArray *selection=[NSMutableArray arrayWithObject:filename];
 NSDictionary *request=FCFinderRequest(@"--fc-set-left",selection);
 [filename appendString:@"changed"];[selection removeAllObjects];
 CHECK([request[@"files"][0] isEqual:@"/tmp/space & ? # é 😀.txt"]);
 NSURL *url=FCFinderRequestURL(request);CHECK(url!=nil);
 NSURLComponents *parts=[NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO];
 CHECK([parts.scheme isEqual:@"furthercompare"]);CHECK([parts.host isEqual:@"shell"]);CHECK([parts.path isEqual:@"/v1"]);CHECK(parts.queryItems.count==1);
 NSString *base=parts.queryItems[0].value;CHECK(![base containsString:@"="]);
 base=[[base stringByReplacingOccurrencesOfString:@"-" withString:@"+"] stringByReplacingOccurrencesOfString:@"_" withString:@"/"];
 while(base.length%4)base=[base stringByAppendingString:@"="];
 NSData *decoded=[[NSData alloc] initWithBase64EncodedString:base options:0];
 CHECK([[NSJSONSerialization JSONObjectWithData:decoded options:0 error:NULL] isEqual:request]);
 CHECK(FCFinderRequest(@"--bad",@[@"/tmp/a"])==nil);
 CHECK(FCFinderRequest(@"--fc-set-left",@[@"relative"])==nil);
 CHECK(FCFinderRequest(@"--fc-set-left",@[@"/a",@"/b"])==nil);
 CHECK(FCFinderRequest(@"--fc-compare-selected",@[@"/a"])==nil);
 CHECK(FCFinderRequest(@"--fc-compare-selected",@[@"/a",@"/b"])!=nil);
 CHECK(FCFinderRequestURL(@{@"command":@"--fc-set-left",@"files":@[@"bad"]})==nil);
 puts("Finder native policy passed: conditional menus, display safety, captured selection, exact URL payload, invalid request rejection.");
}return 0;}
`;
try{
 const source=path.join(tmp,'main.m'),exe=path.join(tmp,'policy');fs.writeFileSync(source,harness);
 const sdk=execFileSync('/usr/bin/xcrun',['--show-sdk-path'],{encoding:'utf8'}).trim();
 execFileSync('/usr/bin/clang',['-isysroot',sdk,'-fobjc-arc','-Wall','-Wextra','-Werror','-mmacosx-version-min=11.0','-framework','Foundation','-I',path.join(root,'desktop/native/finder-sync'),source,path.join(root,'desktop/native/finder-sync/MenuPolicy.m'),'-o',exe],{stdio:'inherit'});
 execFileSync(exe,[],{stdio:'inherit'});
 const storeExe=path.join(tmp,'request-store');
 execFileSync('/usr/bin/clang',['-isysroot',sdk,'-fobjc-arc','-Wall','-Wextra','-Werror','-mmacosx-version-min=11.0','-framework','Foundation','-I',path.join(root,'desktop/native/finder-sync'),path.join(root,'desktop/native/finder-sync/RequestStoreTests.m'),path.join(root,'desktop/native/finder-sync/MenuPolicy.m'),'-o',storeExe],{stdio:'inherit'});
 execFileSync(storeExe,[],{stdio:'inherit'});
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
