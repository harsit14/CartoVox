"""Local media preview with byte-range support for browser video seeking."""
import argparse
import functools
import http.server
import os
import re
from pathlib import Path

class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version='HTTP/1.1'

    def end_headers(self):
        self.send_header('Accept-Ranges','bytes')
        self.send_header('Cache-Control','no-store')
        super().end_headers()

    def send_head(self):
        self.remaining=None
        value=self.headers.get('Range','')
        match=re.fullmatch(r'bytes=(\d*)-(\d*)',value)
        path=self.translate_path(self.path)
        if not match or not os.path.isfile(path):return super().send_head()
        handle=open(path,'rb');size=os.fstat(handle.fileno()).st_size
        first,last=match.groups()
        if first:
            start=int(first);end=min(int(last) if last else size-1,size-1)
        elif last:
            start=max(0,size-int(last));end=size-1
        else:
            start=size;end=size-1
        if start>=size or start>end:
            handle.close();self.send_response(416);self.send_header('Content-Range',f'bytes */{size}');self.send_header('Content-Length','0');self.end_headers();return None
        self.remaining=end-start+1;handle.seek(start)
        self.send_response(206);self.send_header('Content-Type',self.guess_type(path));self.send_header('Content-Length',str(self.remaining));self.send_header('Content-Range',f'bytes {start}-{end}/{size}');self.end_headers()
        return handle

    def copyfile(self,source,outputfile):
        try:
            if self.remaining is None:return super().copyfile(source,outputfile)
            while self.remaining:
                chunk=source.read(min(256*1024,self.remaining))
                if not chunk:break
                outputfile.write(chunk);self.remaining-=len(chunk)
        except (BrokenPipeError,ConnectionResetError):pass

    def log_message(self,format,*args):pass

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--directory',type=Path,default=Path.cwd());p.add_argument('--port',type=int,default=8344);a=p.parse_args()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',a.port),functools.partial(Handler,directory=str(a.directory.resolve())))
    print(f'Guide preview: http://127.0.0.1:{a.port}/',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
