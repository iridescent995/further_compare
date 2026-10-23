// macOS-only, same-parent directory or regular-file rename with atomic no-replace semantics.
// No fallback to rename(): unsupported filesystems must fail closed.
#define _DARWIN_C_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <errno.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/stat.h>
static int fail(const char *message){fprintf(stderr,"%s (errno %d)\n",message,errno);return 1;}
static int component(const char *s){return s&&*s&&strcmp(s,".")&&strcmp(s,"..")&&!strchr(s,'/')&&!strchr(s,'\\');}
static int open_chain(int fd,char *path){char *save=NULL;for(char *part=strtok_r(path,"/",&save);part;part=strtok_r(NULL,"/",&save)){if(!component(part)){close(fd);errno=EINVAL;return -1;}int next=openat(fd,part,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);close(fd);if(next<0)return -1;fd=next;}return fd;}
int main(int argc,char **argv){
 int file=argc==9&&!strcmp(argv[8],"file");
 if((argc!=8&&!file)||argv[1][0]!='/'||!component(argv[3])){errno=EINVAL;return fail("Invalid rename arguments");}
 char *root=strdup(argv[1]),*relative=strdup(argv[2]);if(!root||!relative)return fail("Allocation failed");
 int fd=open("/",O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);if(fd<0)return fail("Cannot open filesystem root");fd=open_chain(fd,root);free(root);if(fd<0)return fail("Cannot open selected root without following links");
 struct stat selected;if(fstat(fd,&selected)||((uint64_t)selected.st_dev)!=strtoull(argv[4],NULL,10)||((uint64_t)selected.st_ino)!=strtoull(argv[5],NULL,10)){close(fd);errno=ESTALE;return fail("Selected root changed");}
 char *leaf=strrchr(relative,'/');if(leaf){*leaf++=0;fd=open_chain(fd,relative);}else leaf=relative;
 if(fd<0||!component(leaf)){if(fd>=0)close(fd);free(relative);errno=EINVAL;return fail("Invalid source path");}
 struct stat source;if(fstatat(fd,leaf,&source,AT_SYMLINK_NOFOLLOW)||!(file?S_ISREG(source.st_mode):S_ISDIR(source.st_mode))||((uint64_t)source.st_dev)!=strtoull(argv[6],NULL,10)||((uint64_t)source.st_ino)!=strtoull(argv[7],NULL,10)){close(fd);free(relative);errno=ESTALE;return fail("Source entry changed");}
 if(renameatx_np(fd,leaf,fd,argv[3],RENAME_EXCL)){int saved=errno;close(fd);free(relative);errno=saved;return fail("Exclusive rename failed");}
 struct stat renamed;if(fstatat(fd,argv[3],&renamed,AT_SYMLINK_NOFOLLOW)||!(file?S_ISREG(renamed.st_mode):S_ISDIR(renamed.st_mode))||renamed.st_dev!=source.st_dev||renamed.st_ino!=source.st_ino){close(fd);free(relative);errno=ESTALE;return fail("Entry identity changed during rename; refresh the folder");}
 close(fd);free(relative);puts("ok");return 0;
}
