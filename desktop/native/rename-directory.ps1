# Fixed program. User-controlled paths arrive only as JSON on standard input.
$ErrorActionPreference = 'Stop'
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class ExclusiveDirectoryRename {
  const uint ReadAttributes=0x80, Delete=0x10000, ShareReadWrite=3, OpenExisting=3;
  const uint BackupSemantics=0x02000000, OpenReparsePoint=0x00200000;
  [StructLayout(LayoutKind.Sequential)] struct Info { public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation,Access,Write; public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow; }
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Rename { public byte Replace; public IntPtr Root; public uint Length; public char Name; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string name,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle,out Info info);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle handle,int type,IntPtr info,uint size);
  static Exception Error(string operation) { return new IOException(operation+" (Windows error "+Marshal.GetLastWin32Error()+")"); }
  static void Component(string name) { if(String.IsNullOrEmpty(name)||name=="."||name==".."||name.IndexOfAny(new char[]{'/', '\\', ':', '\0'})>=0)throw new IOException("Invalid relative directory name."); }
  static SafeFileHandle Open(string path,bool source,List<SafeFileHandle> handles,bool file=false) {
    SafeFileHandle handle=CreateFileW(path,ReadAttributes|(source?Delete:0),ShareReadWrite,IntPtr.Zero,OpenExisting,BackupSemantics|OpenReparsePoint,IntPtr.Zero);
    if(handle.IsInvalid){handle.Dispose();throw Error("Cannot pin directory");}handles.Add(handle);
    Info info;if(!GetFileInformationByHandle(handle,out info))throw Error("Cannot inspect directory");
    if((info.Attributes&0x400)!=0||((info.Attributes&0x10)!=0)==file)throw new IOException("Symbolic links, reparse points, and unexpected entry types are not allowed.");return handle;
  }
  public static void Run(string root,string relative,string name,string rootInode,string sourceInode,string kind) {
    if(kind!="directory"&&kind!="file")throw new IOException("Invalid rename kind.");
    Component(name);if(String.IsNullOrEmpty(root)||!Path.IsPathRooted(root)||String.IsNullOrEmpty(relative))throw new IOException("Invalid rename paths.");
    string full=Path.GetFullPath(root),prefix=Path.GetPathRoot(full);List<SafeFileHandle> handles=new List<SafeFileHandle>();IntPtr buffer=IntPtr.Zero;
    try {
      string current=prefix;SafeFileHandle parent=Open(current,false,handles);
      string remaining=full.Substring(prefix.Length);foreach(string part in remaining.Split(new char[]{'\\','/'},StringSplitOptions.RemoveEmptyEntries)){Component(part);current=Path.Combine(current,part);parent=Open(current,false,handles);}
      Info rootInfo;if(!GetFileInformationByHandle(parent,out rootInfo))throw Error("Cannot inspect selected root");
      ulong rootId=((ulong)rootInfo.IndexHigh<<32)|rootInfo.IndexLow;if(rootId.ToString()!=rootInode)throw new IOException("Selected root changed.");
      string[] parts=relative.Split('/');foreach(string part in parts)Component(part);
      for(int i=0;i<parts.Length-1;i++){current=Path.Combine(current,parts[i]);parent=Open(current,false,handles);}
      SafeFileHandle source=Open(Path.Combine(current,parts[parts.Length-1]),true,handles,kind=="file");Info sourceInfo;if(!GetFileInformationByHandle(source,out sourceInfo))throw Error("Cannot inspect source directory");
      ulong sourceId=((ulong)sourceInfo.IndexHigh<<32)|sourceInfo.IndexLow;if(sourceId.ToString()!=sourceInode)throw new IOException("Source directory changed.");
      int nameOffset=Marshal.OffsetOf(typeof(Rename),"Name").ToInt32(),size=Math.Max(Marshal.SizeOf(typeof(Rename)),nameOffset+(name.Length+1)*2);buffer=Marshal.AllocHGlobal(size);for(int i=0;i<size;i++)Marshal.WriteByte(buffer,i,0);
      Marshal.WriteIntPtr(buffer,Marshal.OffsetOf(typeof(Rename),"Root").ToInt32(),parent.DangerousGetHandle());Marshal.WriteInt32(buffer,Marshal.OffsetOf(typeof(Rename),"Length").ToInt32(),name.Length*2);Marshal.Copy(name.ToCharArray(),0,IntPtr.Add(buffer,nameOffset),name.Length);
      if(!SetFileInformationByHandle(source,3,buffer,(uint)size))throw Error("Exclusive directory rename failed");
    } finally {if(buffer!=IntPtr.Zero)Marshal.FreeHGlobal(buffer);for(int i=handles.Count-1;i>=0;i--)handles[i].Dispose();}
  }
}
'@
  $kind = if ($null -eq $request.kind) { 'directory' } else { [string]$request.kind }
  [ExclusiveDirectoryRename]::Run([string]$request.root,[string]$request.relative,[string]$request.name,[string]$request.rootInode,[string]$request.sourceInode,$kind)
  [Console]::Out.WriteLine('ok')
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
