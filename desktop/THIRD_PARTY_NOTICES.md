# Third-party notices

Pixel & Toon Studio uses Electron (MIT), React (MIT), and ONNX Runtime Web (MIT).
Electron and Chromium notices are also shipped with the Electron Framework.

The bundled model directories retain their original README, model metadata and
full license texts in `dist/models/` inside `Contents/Resources/app.asar`:

- LiveAction SPAN ×2: Apache-2.0. See `dist/models/liveaction-span-x2/LICENSE`.
- FFDNet: MIT. See `dist/models/ffdnet-color/LICENSE` and its README for the
  KAIR implementation and pretrained-weight attribution.

React: Copyright (c) Facebook, Inc. and its affiliates.
ONNX Runtime: Copyright (c) Microsoft Corporation. All rights reserved.
Electron: Copyright (c) Electron contributors; Copyright (c) 2013-2020 GitHub Inc.

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

HEIC decoding: heic-to 1.6.7 (Hopper Gee), libheif 1.23.7 and libde265 1.0.16,
LGPL-3.0-or-later. The unmodified CSP decoder, full licenses, exact package and
upstream source links are shipped in dist/licenses/heic-to/ inside app.asar.
