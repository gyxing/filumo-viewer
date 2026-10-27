# Archive third-party notices

`@filumo/archive` contains a lazy integration of `libarchive-wasm` 1.2.0. The wrapper is Copyright (c) 2021 ofk, MIT. Its published build configuration identifies these compiled components:

- libarchive 3.7.7: https://github.com/libarchive/libarchive/tree/v3.7.7
- zlib 1.3.1: https://github.com/madler/zlib/tree/v1.3.1
- bzip2 1.0.8: https://sourceware.org/bzip2/
- XZ/liblzma 5.6.4: https://github.com/tukaani-project/xz/tree/v5.6.4
- OpenSSL 3.4.1: https://github.com/openssl/openssl/tree/openssl-3.4.1

The original notices are distributed in `generated/licenses` alongside the WASM asset. The MIT license of the wrapper does not replace component licenses. Build references: https://github.com/ofk/libarchive-wasm/blob/main/lib/Dockerfile and https://github.com/ofk/libarchive-wasm/blob/main/lib/build.bash.

ZIP uses the separately declared `@zip.js/zip.js` dependency and its upstream license. No archive engine is loaded from a default CDN.

归档包将上述原始许可与 WASM 一并分发。宿主安装后不需要单独复制资源目录；这些声明不表示未经样本验证的格式已被支持。
