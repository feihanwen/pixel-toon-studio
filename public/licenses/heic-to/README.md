# HEIC decoder notices

heic-to 1.6.7, by Hopper Gee, LGPL-3.0-or-later.
https://github.com/hoppergee/heic-to/tree/v1.6.7
Exact published package (includes wrapper and generated decoder source):
https://registry.npmjs.org/heic-to/-/heic-to-1.6.7.tgz

Unmodified CSP build, bundled as a separately loaded JavaScript asset. Contains
libheif 1.23.7 and libde265 1.0.16, both LGPL-3.0-or-later. Full notices and
licenses are in the accompanying LICENSE file. Upstream C/C++ sources:
https://github.com/strukturag/libheif/tree/v1.23.7
https://github.com/strukturag/libde265/tree/v1.0.16

Build instructions for the JavaScript decoder are in the heic-to README:
https://github.com/hoppergee/heic-to#how-to-build-libheifjs-from-libheif
The application loads the CSP decoder with a dynamic import; to replace or
modify it, install your replacement heic-to package and run npm run build.
