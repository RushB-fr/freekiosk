# Third-party notices

FreeKiosk's own code is released under the [MIT License](LICENSE). The APK also contains the third-party
software and assets below, each under its own license. This file lists them, with the copyright notices and
license texts those licenses ask us to pass on. It describes the app at the time of writing; when a
dependency is added or removed, update it in the same pull request.

## Files copied into this repository

| Component | Version | Files | License | Copyright |
|---|---|---|---|---|
| [PDF.js](https://github.com/mozilla/pdf.js) | 3.11.174 | `android/app/src/main/assets/pdfjs/pdf.min.js`, `pdf.worker.min.js` | Apache-2.0 | Copyright 2023 Mozilla Foundation |
| [Material Design Icons](https://pictogrammers.com/library/mdi/) font (as packaged by react-native-vector-icons 10.3.0, which builds it from MDI 6.5.95) | 6.5.95 | `MaterialCommunityIcons.ttf`, copied into the APK at build time (`android/app/build.gradle`) | Apache-2.0 (Pictogrammers Free License: the icons and the fonts are Apache-2.0) | Pictogrammers; the font file itself carries no copyright line |
| [BlazeFace short range](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector) face detection model, from MediaPipe | as published by MediaPipe | `android/app/src/main/assets/blaze_face_short_range.tflite` | Apache-2.0 | The MediaPipe authors (Google) |

**PDF.js is not modified.** The two files are byte for byte the ones in the `pdfjs-dist@3.11.174` package
(`build/pdf.min.js` and `build/pdf.worker.min.js`), checked by SHA-256 on 2026-11-17:

```
5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946  pdf.min.js
feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b  pdf.worker.min.js
```

`viewer.html` next to them is FreeKiosk's own page (MIT); it only calls the PDF.js API. PDF.js 3.11.174 is older
than the fix for CVE-2024-4367, so the viewer turns font evaluation off (`isEvalSupported: false`); keep that when
touching it, and read #350 before upgrading PDF.js.

## JavaScript libraries (production dependencies)

All of these are MIT licensed. Each package keeps its own copyright line and license text in its repository and in
its package.

On 2026-11-17 we also read the license of the 600 packages npm lists under the production dependencies (these 17 and
everything they pull in, build tools included): MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, Python-2.0,
CC-BY-4.0 (`caniuse-lite`, a Babel build-time data package) or a choice that includes one of those. None is GPL, LGPL,
AGPL or MPL. `caniuse-lite`, `argparse`, `jsc-safe-url` and `type-fest`, the few that are not plain MIT, are
build-time tools and are not in the JavaScript bundle shipped in the APK (checked by searching the bundle).

| Package | Version | License | Copyright |
|---|---|---|---|
| `@react-native-async-storage/async-storage` | 2.2.0 | MIT | Copyright (c) 2015-present, Facebook, Inc. |
| `@react-native-community/slider` | 5.1.1 | MIT | react-native-community (author field of the package, which ships no license file) |
| `@react-native-cookies/cookies` | 6.2.1 | MIT | Copyright (c) 2020 React Native Community |
| `@react-navigation/native` | 7.1.18 | MIT | Copyright (c) 2017 React Navigation Contributors |
| `@react-navigation/native-stack` | 7.3.28 | MIT | Copyright (c) 2017 React Navigation Contributors |
| `i18next` | 26.4.2 | MIT | Copyright (c) 2011-present i18next |
| `react` | 19.1.1 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `react-i18next` | 17.0.15 | MIT | Copyright (c) 2015-present i18next |
| `react-native` | 0.82.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `react-native-fs` | 2.20.0 | MIT | Copyright (c) 2015 Johannes Lumpe |
| `react-native-keychain` | 10.0.0 | MIT | Copyright (c) 2015 Joel Arvidsson |
| `react-native-paper` | 5.14.5 | MIT | Copyright (c) 2017 Callstack |
| `react-native-safe-area-context` | 5.6.1 | MIT | Copyright (c) 2019 Th3rd Wave |
| `react-native-screens` | 4.16.0 | MIT | Copyright (c) 2018 Software Mansion <swmansion.com> |
| `react-native-vector-icons` | 10.3.0 | MIT | Copyright (c) 2015 Joel Arvidsson |
| `react-native-vision-camera` | 4.7.3 | MIT | Marc Rousavy (author field of the package, which ships no license file) |
| `react-native-webview` | 13.16.0 | MIT | Copyright (c) 2015-present, Facebook, Inc. |

## Android libraries declared in `android/app/build.gradle`

| Library | Version | License | Copyright |
|---|---|---|---|
| `com.facebook.react:react-android`, `hermes-android` | 0.82.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `androidx.mediarouter:mediarouter` | 1.8.1 | Apache-2.0 | The Android Open Source Project |
| `org.nanohttpd:nanohttpd` | 2.3.1 | BSD-3-Clause | Copyright (c) 2012-2013 by Paul S. Hawke, 2001,2005-2013 by Jarno Elonen, 2010 by Konstantinos Togias |
| `com.hivemq:hivemq-mqtt-client` | 1.3.12 | Apache-2.0 | HiveMQ and the HiveMQ Community |
| `io.netty:netty-*` (pulled in by the HiveMQ client) | 4.1.130.Final | Apache-2.0 | The Netty project; see the artifacts |
| `com.google.ai.edge.litert:litert` (runs the BlazeFace model; ARM only) | 1.4.0 | Apache-2.0 | Google; see the artifact |

React Native, AndroidX and the other transitive libraries that Gradle pulls in come with their own licenses,
published with each artifact. On 2026-11-17 we read the license declared by each of the 178 libraries of the release
runtime classpath. 159 declare Apache-2.0, MIT, BSD or MIT-0; 9 declare none in their own POM and are Apache-2.0
(Netty, Guava's `listenablefuture`, through their parent POM) or BSD-3-Clause (NanoHTTPD); the compile-time
`auto-value-annotations` declares none in the POM we have; and 9 are the Google components below. None is GPL, LGPL,
AGPL or MPL.

## Google components that are not open source

The QR code scanner (`src/components/QrScannerModal.tsx`, used to enroll a device in FreeKiosk Cloud) is the
code scanner of react-native-vision-camera, which uses Google ML Kit. These libraries are not under an open source
license; Google publishes them under its own terms, which apply to the people who build and distribute an app with
them:

| Library | Version | Terms declared in its POM |
|---|---|---|
| `com.google.android.gms:play-services-mlkit-barcode-scanning` | 18.3.1 | ML Kit Terms of Service |
| `com.google.mlkit:barcode-scanning-common`, `common`, `vision-common`, `vision-interfaces` | 17.0.0, 18.11.0, 17.3.0, 16.3.0 | ML Kit Terms of Service |
| `com.google.android.gms:play-services-base`, `play-services-basement`, `play-services-tasks` | 18.5.0, 18.4.0, 18.2.0 | Android Software Development Kit License |
| `com.google.android.odml:image` | 1.0.0-beta1 | Android Software Development Kit License |

Anyone who redistributes FreeKiosk builds is bound by those terms for these libraries: [ML Kit terms](https://developers.google.com/ml-kit/terms),
[Android SDK license](https://developer.android.com/studio/terms). They keep FreeKiosk out of stores that accept only open
source dependencies.

## License texts

### MIT License

Each MIT-licensed package above is distributed under this text, with the copyright line given in its row:

```
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of
the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### BSD 3-Clause License (NanoHTTPD)

```
Copyright (c) 2012-2013 by Paul S. Hawke, 2001,2005-2013 by Jarno Elonen, 2010 by Konstantinos Togias
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

* Neither the name of the NanoHttpd organization nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### Apache License 2.0 (PDF.js, Material Design Icons, AndroidX, HiveMQ MQTT Client, LiteRT, the BlazeFace model)

```

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS
```
