# Fixed program: paths and attributes are JSON data on stdin, never script source.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  $json = [Console]::In.ReadToEnd()
  if ([System.Text.Encoding]::UTF8.GetByteCount($json) -gt 2000000) { throw 'Attribute request is too large.' }
  $request = $json | ConvertFrom-Json
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Globalization;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class FolderAttributes {
  const uint ReadAttributes=0x80, WriteAttributes=0x100, OpenExisting=3, BackupSemantics=0x02000000, OpenReparsePoint=0x00200000;
  const long Epoch=116444736000000000L;
  [StructLayout(LayoutKind.Sequential)] struct Info { public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation,Access,Write; public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow; }
  [StructLayout(LayoutKind.Sequential)] struct Basic { public long Creation,Access,Write,Change; public uint Attributes; }
  class State { public ulong Id,Size; public uint Volume; public Basic Basic; }
  class Target { public SafeFileHandle Handle; public State Before,After; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle,out Info info);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle handle,int type,out Basic info,uint size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle handle,int type,ref Basic info,uint size);
  static Exception Error(string operation) { return new IOException(operation+" (Windows error "+Marshal.GetLastWin32Error()+")"); }
  static State Read(SafeFileHandle h) {
    Info i; Basic b;
    if(!GetFileInformationByHandle(h,out i)||!GetFileInformationByHandleEx(h,0,out b,(uint)Marshal.SizeOf(typeof(Basic)))) throw Error("Cannot inspect attribute target");
    if((i.Attributes&0x400)!=0)throw new IOException("Reparse points are not allowed.");
    if((i.Attributes&0x10)==0&&i.Links!=1)throw new IOException("Hard-linked files are not supported.");
    return new State {Id=((ulong)i.IndexHigh<<32)|i.IndexLow,Size=(i.Attributes&0x10)!=0?0UL:((ulong)i.SizeHigh<<32)|i.SizeLow,Volume=i.Volume,Basic=b};
  }
  static bool Same(State a,State b) {return a.Id==b.Id&&a.Volume==b.Volume&&a.Size==b.Size&&a.Basic.Creation==b.Basic.Creation&&a.Basic.Access==b.Basic.Access&&a.Basic.Write==b.Basic.Write&&a.Basic.Change==b.Basic.Change&&a.Basic.Attributes==b.Basic.Attributes;}
  static void Component(string s) {
    if(String.IsNullOrEmpty(s)||s=="."||s==".."||s.EndsWith(".")||s.EndsWith(" ")||s.IndexOfAny(new char[]{'\\','/',':','\0','*','?','"','<','>','|'})>=0)throw new IOException("Invalid relative path component.");
    foreach(char c in s)if(c<32)throw new IOException("Invalid path character.");
    string stem=s.Split('.')[0].ToUpperInvariant();
    if(stem=="CON"||stem=="PRN"||stem=="AUX"||stem=="NUL"||System.Text.RegularExpressions.Regex.IsMatch(stem,@"^(COM|LPT)[1-9]$"))throw new IOException("Reserved device names are not allowed.");
  }
  static SafeFileHandle Open(string path,bool target,List<SafeFileHandle> handles,bool write=true) {
    SafeFileHandle h=CreateFileW(path,ReadAttributes|(target&&write?WriteAttributes:0),target?1u:3u,IntPtr.Zero,OpenExisting,BackupSemantics|OpenReparsePoint,IntPtr.Zero);
    if(h.IsInvalid){h.Dispose();throw Error("Cannot exclusively pin attribute path");} handles.Add(h);
    State s=Read(h);if(!target&&(s.Basic.Attributes&0x10)==0)throw new IOException("An ancestor is not a directory.");return h;
  }
  static void Write(SafeFileHandle h,State before,uint attrs) {
    Basic value=before.Basic;value.Attributes=attrs==0?0x80u:attrs;
    if(!SetFileInformationByHandle(h,0,ref value,(uint)Marshal.SizeOf(typeof(Basic))))throw Error("Cannot change file attributes");
  }
  public class Snapshot {public string inode,device,size,mtimeNs,ctimeNs,creation,access,write,change,attributes;}
  public class Entry {public string path;public uint attributes;public Snapshot expected;}
  public class Result {public string platform="win32";public int changed;public Entry[] entries;}
  static Snapshot SnapshotOf(State s){return new Snapshot{inode=s.Id.ToString(CultureInfo.InvariantCulture),device=s.Volume.ToString(CultureInfo.InvariantCulture),size=s.Size.ToString(CultureInfo.InvariantCulture),mtimeNs=(((decimal)s.Basic.Write-Epoch)*100m).ToString(CultureInfo.InvariantCulture),ctimeNs=(((decimal)s.Basic.Change-Epoch)*100m).ToString(CultureInfo.InvariantCulture),creation=s.Basic.Creation.ToString(CultureInfo.InvariantCulture),access=s.Basic.Access.ToString(CultureInfo.InvariantCulture),write=s.Basic.Write.ToString(CultureInfo.InvariantCulture),change=s.Basic.Change.ToString(CultureInfo.InvariantCulture),attributes=s.Basic.Attributes.ToString(CultureInfo.InvariantCulture)};}
  public static Result Run(string root,string rootInode,string rootDevice,string[] paths,string[] ids,string[] devices,string[] sizes,string[] mtimes,string[] ctimes,bool[] directories,bool apply,uint setMask,uint clearMask,string[] expected) {
    if(paths==null||paths.Length<1||paths.Length>1000||ids.Length!=paths.Length||devices.Length!=paths.Length||sizes.Length!=paths.Length||mtimes.Length!=paths.Length||ctimes.Length!=paths.Length||directories.Length!=paths.Length||(apply&&expected.Length!=paths.Length))throw new IOException("Invalid attribute entries.");
    if((setMask&~39u)!=0||(clearMask&~39u)!=0||(setMask&clearMask)!=0)throw new IOException("Invalid attribute masks.");
    if(String.IsNullOrEmpty(root)||!Path.IsPathRooted(root)||root.StartsWith(@"\\?\")||root.StartsWith(@"\\.\"))throw new IOException("Invalid root path.");
    string full=Path.GetFullPath(root),prefix=Path.GetPathRoot(full),current=prefix;
    List<SafeFileHandle> handles=new List<SafeFileHandle>();List<Target> targets=new List<Target>();List<Target> changed=new List<Target>();
    HashSet<string> names=new HashSet<string>(StringComparer.OrdinalIgnoreCase),identities=new HashSet<string>();
    try {
      SafeFileHandle rh=Open(current,false,handles);
      foreach(string part in full.Substring(prefix.Length).Split(new char[]{'\\','/'},StringSplitOptions.RemoveEmptyEntries)){Component(part);current=Path.Combine(current,part);rh=Open(current,false,handles);}
      State rootState=Read(rh);
      if(rootState.Id.ToString(CultureInfo.InvariantCulture)!=rootInode||rootState.Volume.ToString(CultureInfo.InvariantCulture)!=rootDevice)throw new IOException("Selected root changed.");
      for(int n=0;n<paths.Length;n++) {
        if(String.IsNullOrEmpty(paths[n])||!names.Add(paths[n]))throw new IOException("Duplicate or empty target path.");
        string[] parts=paths[n].Split('/');current=full;
        for(int p=0;p<parts.Length;p++){Component(parts[p]);current=Path.Combine(current,parts[p]);if(p<parts.Length-1)Open(current,false,handles);}
        SafeFileHandle h=Open(current,true,handles,apply);State s=Read(h);
        if(!identities.Add(s.Volume+":"+s.Id))throw new IOException("Multiple targets refer to the same file.");
        decimal ns=((decimal)s.Basic.Write-Epoch)*100m;
        decimal changeNs=((decimal)s.Basic.Change-Epoch)*100m;
        if(s.Id.ToString(CultureInfo.InvariantCulture)!=ids[n]||s.Volume.ToString(CultureInfo.InvariantCulture)!=devices[n]||s.Size.ToString(CultureInfo.InvariantCulture)!=sizes[n]||ns.ToString(CultureInfo.InvariantCulture)!=mtimes[n]||changeNs.ToString(CultureInfo.InvariantCulture)!=ctimes[n]||((s.Basic.Attributes&0x10)!=0)!=directories[n])throw new IOException("A selected entry changed before applying its attribute.");
        if(apply&&(s.Basic.Creation+":"+s.Basic.Access+":"+s.Basic.Write+":"+s.Basic.Change+":"+s.Basic.Attributes)!=expected[n])throw new IOException("Attributes changed since preview.");
        targets.Add(new Target {Handle=h,Before=s});
      }
      // Every path is pinned and every preview snapshot checked before any write.
      foreach(Target t in targets)if(!Same(Read(t.Handle),t.Before))throw new IOException("A selected entry changed during preflight.");
      if(apply)foreach(Target t in targets) {
        if(!Same(Read(t.Handle),t.Before))throw new IOException("A selected entry changed before writing.");
        uint attrs=((t.Before.Basic.Attributes&~clearMask)|setMask)&~0x80u;if(attrs==0)attrs=0x80u;
        if(attrs==t.Before.Basic.Attributes)continue;
        Write(t.Handle,t.Before,attrs);changed.Add(t);t.After=Read(t.Handle);
        if(t.After.Id!=t.Before.Id||t.After.Volume!=t.Before.Volume||t.After.Size!=t.Before.Size||t.After.Basic.Creation!=t.Before.Basic.Creation||t.After.Basic.Access!=t.Before.Basic.Access||t.After.Basic.Write!=t.Before.Basic.Write||t.After.Basic.Attributes!=attrs)throw new IOException("The filesystem did not retain the requested attributes and timestamps.");
      }
      Entry[] entries=new Entry[paths.Length];for(int n=0;n<paths.Length;n++){State state=Read(targets[n].Handle);entries[n]=new Entry{path=paths[n],attributes=state.Basic.Attributes,expected=SnapshotOf(state)};}
      return new Result{changed=changed.Count,entries=entries};
    } catch(Exception e) {
      int restored=0,unrestored=0;
      for(int i=changed.Count-1;i>=0;i--) {
        Target t=changed[i];try {
          if(t.After==null||!Same(Read(t.Handle),t.After))throw new IOException("Rollback revision changed.");
          Write(t.Handle,t.Before,t.Before.Basic.Attributes);
          if(!Same(Read(t.Handle),t.Before))throw new IOException("Rollback attribute verification failed.");restored++;
        } catch {unrestored++;}
      }
      throw new IOException(e.Message+" Rollback: "+restored+" restored, "+unrestored+" not restored; "+changed.Count+" writes attempted.",e);
    } finally {for(int i=handles.Count-1;i>=0;i--)handles[i].Dispose();}
  }
}
'@
  if ($null -eq $request.entries -or @($request.entries).Count -lt 1 -or @($request.entries).Count -gt 1000) { throw 'Invalid attribute entries.' }
  $paths = @(); $ids = @(); $devices = @(); $sizes = @(); $mtimes = @(); $ctimes = @(); $directories = @(); $expected = @()
  if ($request.action -ne 'read' -and $request.action -ne 'write') { throw 'Invalid attribute action.' }
  $apply = $request.action -eq 'write'
  foreach ($entry in $request.entries) {
    if ($entry.directory -isnot [bool] -or $entry.relative -isnot [string] -or $entry.inode -isnot [string] -or $entry.device -isnot [string] -or $entry.size -isnot [string] -or $entry.mtimeNs -isnot [string] -or $entry.ctimeNs -isnot [string]) { throw 'Invalid attribute entry types.' }
    $paths += $entry.relative; $ids += $entry.inode; $devices += $entry.device; $sizes += $entry.size; $mtimes += $entry.mtimeNs; $ctimes += $entry.ctimeNs; $directories += $entry.directory
    if ($apply) {
      $parts = @(); foreach ($key in @('creation','access','write','change','attributes')) { if ($entry.expected.$key -isnot [string] -or $entry.expected.$key -notmatch '^\d+$') { throw 'Invalid preview snapshot.' }; $parts += $entry.expected.$key }; $expected += ($parts -join ':')
    }
  }
  if ($request.root -isnot [string] -or $request.rootInode -isnot [string] -or $request.rootDevice -isnot [string]) { throw 'Invalid attribute request types.' }
  $setMask=0; $clearMask=0
  if ($apply) { foreach ($key in @('setMask','clearMask')) { if ($request.changes.$key -isnot [int] -or $request.changes.$key -lt 0 -or $request.changes.$key -gt 39) { throw 'Invalid attribute mask.' } }; $setMask=$request.changes.setMask; $clearMask=$request.changes.clearMask }
  $result = [FolderAttributes]::Run($request.root,$request.rootInode,$request.rootDevice,[string[]]$paths,[string[]]$ids,[string[]]$devices,[string[]]$sizes,[string[]]$mtimes,[string[]]$ctimes,[bool[]]$directories,$apply,[uint32]$setMask,[uint32]$clearMask,[string[]]$expected)
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Depth 6 -Compress))
} catch {
  $message = $_.Exception.Message
  if ($message -notmatch 'Rollback:') { $message += ' Rollback: no attribute writes were made.' }
  [Console]::Error.WriteLine($message)
  exit 1
}
